"""RAG问答引擎··基于混合检索增强生成，支持工具调用"""

import json
import logging
import re
from typing import AsyncGenerator, Any

from app.config import settings
from app.services.llm_client import get_llm_client
from app.services.embedding import get_embedding
from app.services.vectorstore import query
from app.services import hybrid_retriever
from app.services.tools import get_enabled_tools, execute_tool
from app.services.audit import log_llm_call

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f'''你是一个财经观点分析助手。你的任务是根据{settings.author_name or '星主'}在知乎和知识星球上的真实发言记录，回答用户的问题。

规则:
1. 只基于提供的参考资料回答，不要编造信息
2. 如果参考资料不足以回答问题，明确说明
3. 回答中引用原文时，用markdown链接标注来源，格式为 [来源标题](URL)
4. 如果参考资料中提供了原文链接(URL)，必须在引用时附上该链接，方便用户点击查看原文
5. 支持多轮对话，结合上下文理解用户意图
6. 优先使用编号靠前的参考资料（相关性更高），但要综合所有片段给出完整答案
7. 当问题涉及"推荐""列举""有哪些"时，务必汇总所有相关片段中的信息，不要只看前几个
8. **观点时效性规则（最重要）**：参考资料中每条都有发布日期。当同一话题出现新旧观点矛盾时（如早期推荐某标的、近期又看空或减仓），必须以**最新日期的观点为准**，并在回答中明确标注"最新观点已更新"。严禁引用旧观点作为当前推荐。
9. **作者归属规则（最重要）**：参考资料中可能包含{settings.author_name or '星主'}和其他人（嘉宾、球友、提问者）的观点。你只能将**"回答者: {settings.author_name or '星主'}"或"回答者: DeepVan"后面的回答内容**归为{settings.author_name or '星主'}的观点。标注了"提问者: XXX"的内容是提问者的言论，**不代表星主的观点**，不要将其当作星主的推荐。如果参考资料中没有星主的明确回答，则说明"星主未对此问题发表明确观点"。

格式要求（严格遵守）：
- 列表一律使用减号 - 开头，禁止使用星号 * 开头（避免与加粗语法冲突）
- 需要强调的内容用加粗，但不要在列表项内部嵌套加粗
- 多个同类标的（股票/ETF等）用表格展示，表头如：| 标的 | 说明 | 来源 |
- 来源链接单独放在列表末尾或表格最后一列，不要嵌在正文中
- 段落之间用空行分隔，保持层次清晰
- 不要在一行内混合使用多种markdown语法（如加粗+链接+列表标记）'''

TOOL_USAGE_PROMPT = """你可以使用工具获取实时信息。当用户问题涉及以下场景时，请调用工具：
- 涉及"今天""最新""现在""近期"等时效性内容
- 需要查询股票/ETF/指数的实时行情
- 需要搜索最新的市场新闻或分析

使用工具后，基于工具返回的实时数据和参考资料一起回答用户。"""

RAG_PROMPT_TEMPLATE = """参考资料:
{context}

用户问题: {question}

请基于以上参考资料回答用户的问题。每条引用都附上原文链接（参考资料中的URL）。"""

# 匹配模型输出的工具调用文本
_TOOL_CALL_RE = re.compile(
    r"<tool_call>\s*<function=(\w+)>(.*?)</function>\s*(?:<parameter=(\w+)>(.*?)</parameter>\s*)*</tool_call>",
    re.DOTALL,
)


def _strip_text_tool_calls(text: str) -> str:
    """从文本中移除工具调用标记"""
    return _TOOL_CALL_RE.sub("", text).strip()


def _parse_text_tool_calls(text: str) -> list[dict]:
    """从模型输出的文本中解析工具调用"""
    results = []
    for m in _TOOL_CALL_RE.finditer(text):
        func_name = m.group(1)
        body = m.group(2)
        args: dict[str, str] = {}
        for pm in re.finditer(r"<parameter=(\w+)>(.*?)</parameter>", body, re.DOTALL):
            args[pm.group(1)] = pm.group(2).strip()
        results.append({"name": func_name, "arguments": args})
    return results


async def rag_query_stream(
    question: str,
    filters: dict | None = None,
    top_k: int = 12,
    history: list[dict] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """RAG问答 - 流式返回结构化事件。

    Yields:
        {"type": "text", "data": "..."}         — 文本片段
        {"type": "tool_start", "name": "..."}    — 工具开始执行
        {"type": "tool_result", "name": "...", "data": "..."} — 工具执行完成
    """
    try:
        question_embedding = await get_embedding(question)
    except Exception:
        logger.exception("Embedding生成失败")
        yield {"type": "error", "data": "Embedding服务异常，请稍后重试"}
        return

    # ── Dense 向量检索 ──
    try:
        dense_raw = query(
            query_embedding=question_embedding,
            n_results=top_k * 3,
        )
    except Exception:
        logger.exception("向量检索失败")
        yield {"type": "error", "data": "检索服务异常，请稍后重试"}
        return
    dense_metas = dense_raw.get("metadatas", [[]])[0]
    dense_docs = dense_raw.get("documents", [[]])[0]
    dense_distances = dense_raw.get("distances", [[]])[0]

    dense_results = []
    for i in range(len(dense_docs)):
        if filters:
            skip = False
            for k, v in filters.items():
                if dense_metas[i].get(k) != v:
                    skip = True
                    break
            if skip:
                continue
        dense_results.append({
            "id": dense_raw["ids"][0][i],
            "document": dense_docs[i],
            "distance": dense_distances[i],
            "metadata": dense_metas[i] if i < len(dense_metas) else {},
        })

    # ── BM25 稀疏检索 ──
    bm25_results = []
    if settings.enable_bm25:
        try:
            bm25_results = hybrid_retriever.bm25_search(question, top_k=top_k * 3)
        except Exception:
            logger.exception("BM25检索失败，回退到纯向量检索")
        if filters:
            bm25_results = [
                r for r in bm25_results
                if all(r['metadata'].get(k) == v for k, v in filters.items())
            ]

    # ── RRF 融合排序 ──
    if bm25_results:
        final_results = hybrid_retriever.reciprocal_rank_fusion(
            dense_results, bm25_results, k=60, top_k=top_k
        )
        logger.info(f"Hybrid RAG: dense={len(dense_results)}, bm25={len(bm25_results)}, fused={len(final_results)}")
    else:
        final_results = dense_results[:top_k]
        logger.info(f"Dense-only RAG: {len(final_results)} results")

    # ── 时效性 + 精华加权 ──
    final_results = hybrid_retriever.apply_boost(final_results)

    # ── 构建上下文 ──
    context_parts: list[str] = []
    for i, item in enumerate(final_results):
        meta = item.get("metadata", {})
        doc = item.get("document", "")
        platform = {"zhihu": "知乎", "zsxq": "知识星球"}.get(meta.get("platform", ""), meta.get("platform", ""))
        content_type = meta.get("content_type", "")
        title = meta.get("topic_title", "")
        url = meta.get("url", "")
        published_at = meta.get("published_at", "")

        header = f"[{platform} | {content_type}]"
        if title:
            header += f" {title}"
        if published_at:
            header += f" ({published_at[:10]})"
        if url:
            header += f"\n原文链接: {url}"

        context_parts.append(f"--- 片段{i+1} {header} ---\n{doc}")

    context = "\n\n".join(context_parts)
    prompt = RAG_PROMPT_TEMPLATE.format(context=context, question=question)

    # ── 组装消息 ──
    system_content = SYSTEM_PROMPT
    tools = get_enabled_tools()
    if tools:
        system_content += "\n\n" + TOOL_USAGE_PROMPT

    messages: list[dict] = [{"role": "system", "content": system_content}]

    if history:
        for msg in history[-12:]:
            if msg.get("role") in ("user", "assistant") and msg.get("content"):
                messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": prompt})

    # ── LLM 生成（第一次调用） ──
    client = get_llm_client()

    create_kwargs: dict = {
        "model": settings.openai_model,
        "messages": messages,
        "temperature": 0.3,
        "stream": True,
    }
    if tools:
        create_kwargs["tools"] = tools
        create_kwargs["tool_choice"] = "auto"

    try:
        response = await client.chat.completions.create(**create_kwargs)
    except Exception:
        logger.exception("LLM第一次调用失败")
        yield {"type": "error", "data": "模型服务异常，请稍后重试"}
        return

    # ── 收集第一次响应 ──
    full_text = ""
    tool_calls_map: dict[int, dict] = {}
    first_finish_reason = None

    async for chunk in response:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        finish_reason = chunk.choices[0].finish_reason

        if delta.content:
            full_text += delta.content

        if delta.tool_calls:
            for tc in delta.tool_calls:
                idx = tc.index
                if idx not in tool_calls_map:
                    tool_calls_map[idx] = {"id": tc.id or "", "name": "", "arguments": ""}
                if tc.id:
                    tool_calls_map[idx]["id"] = tc.id
                if tc.function and tc.function.name:
                    tool_calls_map[idx]["name"] = tc.function.name
                if tc.function and tc.function.arguments:
                    tool_calls_map[idx]["arguments"] += tc.function.arguments

        if finish_reason:
            first_finish_reason = finish_reason

    # 审计: 第一次 LLM 调用
    log_llm_call(
        model=settings.openai_model,
        messages=messages,
        response_text=full_text,
        tool_calls=[tc for tc in tool_calls_map.values()] if tool_calls_map else None,
        finish_reason=first_finish_reason,
    )

    has_native_tools = first_finish_reason == "tool_calls" and tool_calls_map
    text_tool_calls = _parse_text_tool_calls(full_text) if not has_native_tools and tools else []
    has_text_tools = len(text_tool_calls) > 0
    # 宽松检测：即使正则没匹配，只要文本含 <tool_call> 就视为工具调用意图
    has_malformed_tools = not has_native_tools and not has_text_tools and bool(_HAS_TOOL_CALL_TAG.search(full_text)) if tools else False

    if has_native_tools:
        logger.info(f"Native tool calls: {[tc['name'] for tc in tool_calls_map.values()]}")
    elif has_text_tools:
        logger.info(f"Text-parsed tool calls: {[tc['name'] for tc in text_tool_calls]}")
        clean_text = _strip_text_tool_calls(full_text)
        if clean_text:
            yield {"type": "text", "data": clean_text}
    elif has_malformed_tools:
        # 畸形 <tool_call> — 不返回原始 XML，由 followup 调用兜底
        clean_text = _strip_text_tool_calls(full_text)
        if clean_text:
            yield {"type": "text", "data": clean_text}
        logger.warning(f"检测到畸形 <tool_call>（正则未匹配），已过滤。raw={full_text[:300]}")
    else:
        if full_text:
            yield {"type": "text", "data": full_text}

    # ── 辅助: 第二次 LLM 调用（流式） ──
    async def _stream_followup(messages: list[dict], label: str):
        """执行 followup LLM 调用，流式 yield 事件"""
        try:
            resp = await client.chat.completions.create(
                model=settings.openai_model,
                messages=messages,
                temperature=0.3,
                stream=True,
            )
        except Exception:
            logger.exception(f"LLM第二次调用失败（{label}）")
            yield {"type": "error", "data": "模型服务异常，请稍后重试"}
            return

        full = ""
        async for chunk in resp:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                full += delta.content
                yield {"type": "text", "data": delta.content}

        log_llm_call(
            model=settings.openai_model,
            messages=messages,
            response_text=full,
            extra={"call": f"followup_{label}"},
        )

    # ── 处理工具调用 ──
    if has_native_tools:
        assistant_tool_calls = [
            {
                "id": tc["id"],
                "type": "function",
                "function": {"name": tc["name"], "arguments": tc["arguments"]},
            }
            for tc in tool_calls_map.values()
        ]
        messages.append({"role": "assistant", "tool_calls": assistant_tool_calls})

        for tc in tool_calls_map.values():
            tool_name = tc["name"]
            tool_args_str = tc["arguments"]

            yield {"type": "tool_start", "name": tool_name}

            try:
                tool_args = json.loads(tool_args_str) if tool_args_str else {}
            except json.JSONDecodeError:
                logger.warning(f"工具参数JSON解析失败: {tool_name}, raw={tool_args_str[:200]}")
                tool_args = {}

            try:
                result = await execute_tool(tool_name, tool_args)
            except Exception:
                logger.exception(f"工具执行异常: {tool_name}, args={tool_args}")
                result = f"工具 {tool_name} 执行失败"
            yield {"type": "tool_result", "name": tool_name, "data": result}

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

        async for event in _stream_followup(messages, "native_tools"):
            yield event

    elif has_text_tools:
        # 只执行已注册的工具，忽略模型幻觉出的工具
        enabled_names = {t["function"]["name"] for t in tools}
        valid_calls = [tc for tc in text_tool_calls if tc["name"] in enabled_names]

        if valid_calls:
            messages.append({"role": "assistant", "content": full_text})

            for tc in valid_calls:
                tool_name = tc["name"]
                tool_args = tc["arguments"]

                yield {"type": "tool_start", "name": tool_name}

                try:
                    result = await execute_tool(tool_name, tool_args)
                except Exception:
                    logger.exception(f"工具执行异常(text path): {tool_name}, args={tool_args}")
                    result = f"工具 {tool_name} 执行失败"
                yield {"type": "tool_result", "name": tool_name, "data": result}

                messages.append({
                    "role": "user",
                    "content": f"工具 {tool_name} 返回结果:\n{result}\n\n请基于以上工具结果和参考资料直接回答用户的问题。",
                })

            # 移除系统提示中的工具使用说明，避免模型再次调用工具
            messages[0] = {
                "role": "system",
                "content": messages[0]["content"].replace("\n\n" + TOOL_USAGE_PROMPT, ""),
            }

            async for event in _stream_followup(messages, "text_tools"):
                yield event

    elif has_malformed_tools:
        # 畸形工具调用：移除工具说明后让模型重新回答（不带工具），防止再次触发工具调用
        messages[0] = {
            "role": "system",
            "content": messages[0]["content"].replace("\n\n" + TOOL_USAGE_PROMPT, ""),
        }
        messages.append({
            "role": "user",
            "content": "请基于参考资料直接回答用户的问题，不要调用任何工具。",
        })
        async for event in _stream_followup(messages, "malformed_tools_fallback"):
            yield event
