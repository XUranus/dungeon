"""EventBus — plugin event hooking and emission."""

import logging
import time
import traceback
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

MAX_LOG_SIZE = 1000


@dataclass
class EventLogEntry:
    event: str
    plugin_id: str
    status: str          # "ok" | "error" | "skipped"
    message: str = ""
    duration_ms: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


class EventBus:
    """Central event bus for plugin hooks.

    Plugins register handlers via on().
    Main system emits events via emit().
    All executions are logged.
    """

    def __init__(self):
        # event_name -> list of (plugin_id, handler)
        self._hooks: dict[str, list[tuple[str, Callable]]] = defaultdict(list)
        self._log: deque[EventLogEntry] = deque(maxlen=MAX_LOG_SIZE)

    def on(self, event: str, plugin_id: str, handler: Callable):
        """Register a plugin handler for an event."""
        self._hooks[event].append((plugin_id, handler))
        logger.info("EventBus: plugin '%s' hooked '%s'", plugin_id, event)

    def get_hooks(self, event: str) -> list[tuple[str, Callable]]:
        return list(self._hooks.get(event, []))

    def emit_sync(self, event: str, **kwargs) -> list[EventLogEntry]:
        """Emit an event, run all hooks synchronously, return log entries."""
        results = []
        hooks = self._hooks.get(event, [])
        if not hooks:
            return results

        for plugin_id, handler in hooks:
            entry = self._run_handler(event, plugin_id, handler, kwargs)
            results.append(entry)
            self._log.appendleft(entry)

        return results

    async def emit(self, event: str, **kwargs) -> list[EventLogEntry]:
        """Emit an event, run all hooks (sync or async), return log entries."""
        results = []
        hooks = self._hooks.get(event, [])
        if not hooks:
            return results

        for plugin_id, handler in hooks:
            if _is_coroutine(handler):
                entry = await self._run_handler_async(event, plugin_id, handler, kwargs)
            else:
                entry = self._run_handler(event, plugin_id, handler, kwargs)
            results.append(entry)
            self._log.appendleft(entry)

        return results

    def _run_handler(self, event: str, plugin_id: str, handler: Callable, kwargs: dict) -> EventLogEntry:
        start = time.time()
        try:
            result = handler(**kwargs)
            duration = int((time.time() - start) * 1000)
            msg = str(result)[:200] if result else ""
            return EventLogEntry(event=event, plugin_id=plugin_id, status="ok", message=msg, duration_ms=duration)
        except Exception as e:
            duration = int((time.time() - start) * 1000)
            logger.error("EventBus: plugin '%s' handler for '%s' failed: %s", plugin_id, event, e)
            return EventLogEntry(event=event, plugin_id=plugin_id, status="error", message=str(e)[:200], duration_ms=duration)

    async def _run_handler_async(self, event: str, plugin_id: str, handler: Callable, kwargs: dict) -> EventLogEntry:
        start = time.time()
        try:
            result = await handler(**kwargs)
            duration = int((time.time() - start) * 1000)
            msg = str(result)[:200] if result else ""
            return EventLogEntry(event=event, plugin_id=plugin_id, status="ok", message=msg, duration_ms=duration)
        except Exception as e:
            duration = int((time.time() - start) * 1000)
            logger.error("EventBus: plugin '%s' async handler for '%s' failed: %s", plugin_id, event, e)
            return EventLogEntry(event=event, plugin_id=plugin_id, status="error", message=str(e)[:200], duration_ms=duration)

    def get_log(self, plugin_id: str | None = None, event: str | None = None, limit: int = 100) -> list[dict]:
        entries = list(self._log)
        if plugin_id:
            entries = [e for e in entries if e.plugin_id == plugin_id]
        if event:
            entries = [e for e in entries if e.event == event]
        return [e.to_dict() for e in entries[:limit]]

    def report(self, plugin_id: str, event: str, status: str = "ok", message: str = ""):
        """Plugin manually reports an event execution."""
        entry = EventLogEntry(event=event, plugin_id=plugin_id, status=status, message=message)
        self._log.appendleft(entry)
        logger.info("EventBus: plugin '%s' reported '%s' [%s]", plugin_id, event, status)


def _is_coroutine(fn: Callable) -> bool:
    import asyncio
    return asyncio.iscoroutinefunction(fn)


# Global singleton
event_bus = EventBus()
