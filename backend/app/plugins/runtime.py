"""PluginRuntime — central plugin management.

Responsibilities:
- Scan plugin directories and read manifests
- Manage per-plugin JSON config (read/write/defaults)
- Manage per-plugin data storage (data/plugins/<id>/)
- Wire event hooks from manifests to EventBus
- Provide access to main system data for plugins
"""

import json
import logging
import os
from pathlib import Path
from typing import Any

from app.config import PROJECT_ROOT, settings
from app.plugins.events import event_bus

logger = logging.getLogger(__name__)

# Paths
PLUGINS_SRC_DIR = PROJECT_ROOT / "frontend" / "src" / "plugins"
PLUGINS_DATA_DIR = PROJECT_ROOT / "data" / "plugins"


class PluginRuntime:
    """Singleton runtime managing all plugins."""

    def __init__(self):
        self.plugins: dict[str, dict] = {}       # id -> manifest dict
        self._configs: dict[str, dict] = {}       # id -> current config
        self._config_defaults: dict[str, dict] = {}  # id -> default config
        self._initialized = False

    def init(self):
        """Scan plugins, setup storage, load configs, wire event hooks."""
        if self._initialized:
            return
        self._initialized = True

        self._scan_plugins()
        self._setup_storage()
        self._load_configs()
        self._wire_event_hooks()

        logger.info("PluginRuntime initialized: %d plugins loaded", len(self.plugins))

    def _scan_plugins(self):
        """Scan frontend/src/plugins/*/manifest.json."""
        if not PLUGINS_SRC_DIR.is_dir():
            logger.warning("Plugin directory not found: %s", PLUGINS_SRC_DIR)
            return

        for entry in sorted(PLUGINS_SRC_DIR.iterdir()):
            if not entry.is_dir():
                continue
            manifest_path = entry / "manifest.json"
            if not manifest_path.exists():
                continue
            try:
                data = json.loads(manifest_path.read_text("utf-8"))
                required = ("id", "name", "icon", "description", "order")
                if not all(k in data for k in required):
                    logger.warning("Plugin manifest missing required fields: %s", manifest_path)
                    continue
                self.plugins[data["id"]] = data
            except Exception as e:
                logger.error("Failed to read plugin manifest %s: %s", manifest_path, e)

        logger.info("Scanned %d plugins: %s", len(self.plugins), list(self.plugins.keys()))

    def _setup_storage(self):
        """Ensure data/plugins/<id>/ directories exist."""
        os.makedirs(PLUGINS_DATA_DIR, exist_ok=True)
        for plugin_id in self.plugins:
            plugin_dir = PLUGINS_DATA_DIR / plugin_id
            os.makedirs(plugin_dir, exist_ok=True)

    def _load_configs(self):
        """Load per-plugin config.json, falling back to manifest defaults."""
        for plugin_id, manifest in self.plugins.items():
            defaults = manifest.get("config_defaults", {})
            self._config_defaults[plugin_id] = defaults

            config_path = self._get_config_path(plugin_id)
            if config_path.exists():
                try:
                    self._configs[plugin_id] = json.loads(config_path.read_text("utf-8"))
                except Exception as e:
                    logger.error("Failed to load config for plugin '%s': %s", plugin_id, e)
                    self._configs[plugin_id] = dict(defaults)
            else:
                self._configs[plugin_id] = dict(defaults)
                self._save_config(plugin_id)

    def _wire_event_hooks(self):
        """Register event hooks declared in manifests."""
        for plugin_id, manifest in self.plugins.items():
            hooks = manifest.get("hooks", {})
            for event_name, handler_desc in hooks.items():
                # handler_desc can be a string description for now
                # Actual handler registration happens when plugin Python code loads
                logger.info("Plugin '%s' declares hook for '%s': %s", plugin_id, event_name, handler_desc)

    def _get_config_path(self, plugin_id: str) -> Path:
        return PLUGINS_DATA_DIR / plugin_id / "config.json"

    def _save_config(self, plugin_id: str):
        config_path = self._get_config_path(plugin_id)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps(self._configs.get(plugin_id, {}), ensure_ascii=False, indent=2), "utf-8")

    # ── Public API ──

    def get_plugin(self, plugin_id: str) -> dict | None:
        return self.plugins.get(plugin_id)

    def get_all_plugins(self) -> list[dict]:
        return sorted(self.plugins.values(), key=lambda p: p["order"])

    def get_enabled_plugins(self) -> list[dict]:
        enabled = set(settings.enabled_public_plugins)
        return [p for p in self.get_all_plugins() if p["id"] in enabled]

    def get_config(self, plugin_id: str) -> dict:
        return dict(self._configs.get(plugin_id, {}))

    def get_config_defaults(self, plugin_id: str) -> dict:
        return dict(self._config_defaults.get(plugin_id, {}))

    def update_config(self, plugin_id: str, patch: dict) -> dict:
        """Merge-patch plugin config and persist."""
        if plugin_id not in self.plugins:
            raise ValueError(f"Unknown plugin: {plugin_id}")
        current = self._configs.get(plugin_id, {})
        current.update(patch)
        self._configs[plugin_id] = current
        self._save_config(plugin_id)
        logger.info("Config updated for plugin '%s': %s", plugin_id, list(patch.keys()))
        return dict(current)

    def get_data_dir(self, plugin_id: str) -> Path:
        """Return plugin's data directory, creating if needed."""
        d = PLUGINS_DATA_DIR / plugin_id
        os.makedirs(d, exist_ok=True)
        return d

    def read_data(self, plugin_id: str, rel_path: str) -> str | None:
        """Read a file from plugin's data directory."""
        filepath = self.get_data_dir(plugin_id) / rel_path
        if not filepath.exists():
            return None
        # Security: prevent path traversal
        if not filepath.resolve().is_relative_to(self.get_data_dir(plugin_id).resolve()):
            raise ValueError("Path traversal blocked")
        return filepath.read_text("utf-8")

    def write_data(self, plugin_id: str, rel_path: str, content: str):
        """Write a file to plugin's data directory."""
        filepath = self.get_data_dir(plugin_id) / rel_path
        if not filepath.resolve().is_relative_to(self.get_data_dir(plugin_id).resolve()):
            raise ValueError("Path traversal blocked")
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(content, "utf-8")

    def get_event_log(self, plugin_id: str | None = None, event: str | None = None, limit: int = 100) -> list[dict]:
        return event_bus.get_log(plugin_id=plugin_id, event=event, limit=limit)

    def report_event(self, plugin_id: str, event: str, status: str = "ok", message: str = ""):
        event_bus.report(plugin_id, event, status, message)

    def emit_event(self, event: str, **kwargs):
        """Emit an event through the EventBus."""
        return event_bus.emit_sync(event, **kwargs)


# Global singleton
runtime = PluginRuntime()
