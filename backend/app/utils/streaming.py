"""Vercel AI SDK UI Message Stream 协议工具函数"""

import json
import logging
import uuid
from typing import AsyncGenerator, Any

from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)


def ui_stream_response(
    event_stream: AsyncGenerator[dict[str, Any], None],
    on_complete: Any = None,
) -> StreamingResponse:
    """将 RAG 事件流包装为 Vercel AI SDK UI Message Stream 格式的 StreamingResponse

    Args:
        on_complete: async callable(str) — 流结束后以完整文本调用，用于存储消息
    """

    msg_id = f"msg_{uuid.uuid4().hex[:12]}"
    txt_id = "txt_1"

    async def generate():
        started = False
        tool_id = ""
        full_text = ""

        try:
            async for event in event_stream:
                event_type = event.get("type")

                if event_type == "error":
                    if not started:
                        yield f'data: {{"type":"start","messageId":"{msg_id}"}}\n\n'
                        started = True
                    err = json.dumps(event["data"], ensure_ascii=False)
                    yield f'data: {{"type":"error","errorText":{err}}}\n\n'
                    break

                elif event_type == "text":
                    if not started:
                        yield f'data: {{"type":"start","messageId":"{msg_id}"}}\n\n'
                        yield 'data: {"type":"start-step"}\n\n'
                        yield f'data: {{"type":"text-start","id":"{txt_id}"}}\n\n'
                        started = True
                    delta_text = event["data"]
                    full_text += delta_text
                    delta = json.dumps(delta_text, ensure_ascii=False)
                    yield f'data: {{"type":"text-delta","id":"{txt_id}","delta":{delta}}}\n\n'

                elif event_type == "tool_start":
                    tool_id = f"call_{uuid.uuid4().hex[:8]}"
                    tool_name = json.dumps(event["name"], ensure_ascii=False)
                    yield f'data: {{"type":"tool-input-start","toolCallId":"{tool_id}","toolName":{tool_name}}}\n\n'

                elif event_type == "tool_result":
                    tool_name = json.dumps(event["name"], ensure_ascii=False)
                    tool_output = json.dumps(event["data"], ensure_ascii=False)
                    yield f'data: {{"type":"tool-input-available","toolCallId":"{tool_id}","toolName":{tool_name},"input":{{}}}}\n\n'
                    yield f'data: {{"type":"tool-output-available","toolCallId":"{tool_id}","output":{tool_output}}}\n\n'

        except Exception:
            logger.exception("RAG问答流异常")
            if not started:
                yield f'data: {{"type":"start","messageId":"{msg_id}"}}\n\n'
            yield 'data: {"type":"error","errorText":"服务内部错误"}\n\n'

        # 关闭文本块（只有在有文本输出时）
        if started:
            yield f'data: {{"type":"text-end","id":"{txt_id}"}}\n\n'
            yield 'data: {"type":"finish-step"}\n\n'
            yield 'data: {"type":"finish"}\n\n'
        yield 'data: [DONE]\n\n'

        # 流结束后异步保存消息
        if on_complete and full_text:
            try:
                await on_complete(full_text)
            except Exception:
                logger.exception("on_complete callback failed")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "x-vercel-ai-ui-message-stream": "v1",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
