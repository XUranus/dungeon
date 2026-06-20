"""工具注册与执行 — OpenAI Function Calling 支持"""

import json
import logging
from datetime import datetime

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 工具 Schema 定义 (OpenAI tools format)
# ──────────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "搜索互联网获取实时信息，如最新新闻、市场动态、财经分析、政策解读等。"
                "当用户问题涉及'今天''最新''现在''近期'等时效性内容时优先使用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索关键词，建议使用中文，简洁明确",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_quote",
            "description": (
                "查询股票、ETF、指数的最新行情价格。"
                "支持 A 股 (如 601398.SS)、港股 (如 0700.HK)、美股 (如 AAPL)。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": (
                            "股票代码。A股: 6位数字+.SS/.SZ (如 601398.SS, 000001.SZ)；"
                            "港股: 数字+.HK (如 0700.HK)；美股: 代码 (如 AAPL, TSLA)"
                        ),
                    }
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_overview",
            "description": "获取今日主要股票市场指数的最新行情概览（上证、深证、恒生、纳斯达克、标普500）",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


def get_enabled_tools() -> list[dict]:
    """返回当前启用的工具列表"""
    if not settings.enable_tools:
        return []
    enabled = []
    for tool in TOOLS:
        name = tool["function"]["name"]
        if name == "web_search" and not settings.tavily_api_key:
            logger.debug("web_search 工具未启用: 缺少 tavily_api_key")
            continue
        enabled.append(tool)
    return enabled


# ──────────────────────────────────────────────
# 工具执行器
# ──────────────────────────────────────────────


async def execute_tool(name: str, arguments: dict) -> str:
    """执行工具调用，返回纯文本结果（传给 LLM 的 tool message）"""
    logger.info(f"执行工具: {name}({arguments})")
    try:
        if name == "web_search":
            return await _web_search(arguments.get("query", ""))
        elif name == "get_stock_quote":
            return await _get_stock_quote(arguments.get("symbol", ""))
        elif name == "get_market_overview":
            return await _get_market_overview()
        else:
            return f"未知工具: {name}"
    except Exception as e:
        logger.error(f"工具执行失败 {name}: {e}", exc_info=True)
        return f"工具执行出错: {e}"


async def _web_search(query: str) -> str:
    """通过 Tavily Search API 搜索网络"""
    api_key = settings.tavily_api_key
    if not api_key:
        return "搜索功能未配置（缺少 Tavily API Key）"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 5,
                "include_answer": True,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    parts: list[str] = []

    # Tavily 的直接回答
    answer = data.get("answer")
    if answer:
        parts.append(f"**综合回答**: {answer}\n")

    # 搜索结果
    for i, result in enumerate(data.get("results", []), 1):
        title = result.get("title", "")
        snippet = result.get("content", "")
        url = result.get("url", "")
        parts.append(f"{i}. **{title}**\n   {snippet}\n   来源: {url}")

    if not parts:
        return f"未找到与'{query}'相关的结果"

    return "\n\n".join(parts)


async def _get_stock_quote(symbol: str) -> str:
    """通过 yfinance 获取股票行情"""
    if not symbol:
        return "请提供股票代码"

    # 延迟导入，避免未安装时阻塞
    try:
        import yfinance as yf
    except ImportError:
        return "yfinance 未安装，请运行 pip install yfinance"

    ticker = yf.Ticker(symbol)
    info = ticker.info

    if not info or info.get("regularMarketPrice") is None:
        # 尝试 fast_info
        try:
            fast = ticker.fast_info
            price = fast.get("lastPrice") or fast.get("previousClose")
            if price:
                return _format_stock_from_fast(symbol, fast)
        except Exception:
            pass
        return f"无法获取 {symbol} 的行情数据，请检查股票代码是否正确"

    name = info.get("shortName") or info.get("longName") or symbol
    price = info.get("regularMarketPrice", 0)
    prev_close = info.get("regularMarketPreviousClose", 0)
    change = price - prev_close if prev_close else 0
    change_pct = (change / prev_close * 100) if prev_close else 0
    volume = info.get("regularMarketVolume", 0)
    currency = info.get("currency", "")

    arrow = "↑" if change >= 0 else "↓"
    sign = "+" if change >= 0 else ""

    return (
        f"**{name}** ({symbol})\n"
        f"- 最新价: {price} {currency}\n"
        f"- 涨跌: {sign}{change:.2f} ({arrow}{sign}{change_pct:.2f}%)\n"
        f"- 成交量: {volume:,.0f}\n"
        f"- 数据时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )


def _format_stock_from_fast(symbol: str, fast) -> str:
    """从 fast_info 格式化股票信息"""
    try:
        price = fast.get("lastPrice") or 0
        prev = fast.get("previousClose") or 0
        change = price - prev if prev else 0
        change_pct = (change / prev * 100) if prev else 0
        volume = fast.get("lastVolume") or 0
        arrow = "↑" if change >= 0 else "↓"
        sign = "+" if change >= 0 else ""
        return (
            f"**{symbol}**\n"
            f"- 最新价: {price:.2f}\n"
            f"- 涨跌: {sign}{change:.2f} ({arrow}{sign}{change_pct:.2f}%)\n"
            f"- 成交量: {volume:,.0f}\n"
            f"- 数据时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )
    except Exception as e:
        return f"格式化 {symbol} 行情数据失败: {e}"


async def _get_market_overview() -> str:
    """获取主要市场指数行情"""
    try:
        import yfinance as yf
    except ImportError:
        return "yfinance 未安装，请运行 pip install yfinance"

    indices = [
        ("上证指数", "000001.SS"),
        ("深证成指", "399001.SZ"),
        ("恒生指数", "^HSI"),
        ("纳斯达克", "^IXIC"),
        ("标普500", "^GSPC"),
    ]

    parts: list[str] = []
    for name, symbol in indices:
        try:
            ticker = yf.Ticker(symbol)
            fast = ticker.fast_info
            price = fast.get("lastPrice") or fast.get("previousClose") or 0
            prev = fast.get("previousClose") or 0
            change = price - prev if prev else 0
            change_pct = (change / prev * 100) if prev else 0
            arrow = "↑" if change >= 0 else "↓"
            sign = "+" if change >= 0 else ""
            parts.append(
                f"- **{name}**: {price:,.2f}  {arrow}{sign}{change_pct:.2f}%"
            )
        except Exception as e:
            parts.append(f"- **{name}**: 获取失败 ({e})")

    return f"**主要市场指数** ({datetime.now().strftime('%Y-%m-%d %H:%M')})\n\n" + "\n".join(parts)
