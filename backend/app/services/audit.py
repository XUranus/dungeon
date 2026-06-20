"""LLM 请求审计 — 记录所有请求和响应到 JSONL 文件"""

import json
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "audit"


def _ensure_dir():
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)


def log_llm_call(
    *,
    model: str,
    messages: list[dict],
    response_text: str = "",
    tool_calls: list[dict] | None = None,
    finish_reason: str | None = None,
    error: str | None = None,
    extra: dict | None = None,
):
    """记录一次 LLM 调用（请求 + 响应）到 JSONL 文件。

    文件按天分片: data/audit/llm_2026-06-17.jsonl
    """
    _ensure_dir()
    ts = time.time()
    date_str = time.strftime("%Y-%m-%d", time.localtime(ts))
    path = AUDIT_DIR / f"llm_{date_str}.jsonl"

    record = {
        "ts": ts,
        "model": model,
        "messages": messages,
        "response_text": response_text,
        "finish_reason": finish_reason,
    }
    if tool_calls:
        record["tool_calls"] = tool_calls
    if error:
        record["error"] = error
    if extra:
        record["extra"] = extra

    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        logger.exception("审计日志写入失败")
