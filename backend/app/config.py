"""统一配置管理 — 基于 config.json，支持热更新"""

import json
import logging
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

# 项目根目录 (backend/ 的上一级)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# 配置文件路径
_CONFIG_PATH = PROJECT_ROOT / "backend" / "config.json"
_EXAMPLE_PATH = PROJECT_ROOT / "backend" / "config.example.json"

# 如果 backend/ 下没有，尝试项目根目录
if not _CONFIG_PATH.exists():
    _CONFIG_PATH = PROJECT_ROOT / "config.json"
if not _EXAMPLE_PATH.exists():
    _EXAMPLE_PATH = PROJECT_ROOT / "config.example.json"

# 默认值（当 config.json 缺失字段时回退）
# 计算字段（不写入 config.json，始终从 PROJECT_ROOT 派生）
_COMPUTED: dict = {
    "database_url": f"sqlite+aiosqlite:///{PROJECT_ROOT / 'data' / 'app.db'}",
    "chroma_persist_dir": str(PROJECT_ROOT / "data" / "chroma"),
}

_DEFAULTS: dict = {
    "system_title": "大V观点分析",
    "system_subtitle": "财经大V最新观点与 AI 智能问答",
    "openai_api_key": "",
    "openai_base_url": "",
    "openai_model": "gpt-4o",
    "embedding_provider": "openai",
    "embedding_model": "text-embedding-3-small",
    "hf_mirror_url": "https://hf-mirror.com",
    "author_name": "",
    "zsxq_cookie": "",
    "zsxq_group_id": "",
    "zhihu_cookie": "",
    "zhihu_url_token": "",
    "zhihu_sign_server": "http://localhost:17007",
    "crawl_schedule": "",
    "crawl_interval_minutes": 0,
    "api_key": "deepdarkfantasy",
    "public_chat_daily_limit": 10,
    "vision_model": "",
    "enable_bm25": True,
    "chunk_size": 500,
    "chunk_overlap": 80,
    "api_host": "0.0.0.0",
    "api_port": 8000,
    "tavily_api_key": "",
    "enable_tools": True,
    "cors_origins": ["*"],
    "professor_index_interval_days": 7,
    "system_avatar_url": "",
    "system_owner_name": "",
    "enabled_public_plugins": ["professor-index", "recent-insights"],
    "insight_report_interval_minutes": 480,
    "insight_report_ndays": 3,
    "notifyhub_key": "",
    "notifyhub_url": "",
    "notifyhub_to": "*",
}


class _Settings:
    """配置单例，从 config.json 加载，支持 save/reload 热更新。"""

    def __init__(self):
        self._data: dict = {}
        self._lock = Lock()
        self.reload()

    # ── 读取 ──
    def __getattr__(self, key: str):
        if key.startswith("_"):
            raise AttributeError(key)
        # 1. config.json 中的值
        if key in self._data:
            return self._data[key]
        # 2. 计算字段（database_url, chroma_persist_dir）
        if key in _COMPUTED:
            return _COMPUTED[key]
        # 3. 默认值
        if key in _DEFAULTS:
            return _DEFAULTS[key]
        raise AttributeError(f"配置项不存在: {key}")

    def get(self, key: str, default=None):
        return self._data.get(key, default)

    def to_dict(self) -> dict:
        """返回当前配置的副本（不含注释）"""
        return {k: v for k, v in self._data.items() if not k.startswith("//")}

    # ── 写入 ──
    def update(self, patch: dict):
        """合并更新并持久化到 config.json"""
        with self._lock:
            self._data.update(patch)
            self._save()

    def save(self):
        """手动触发持久化"""
        with self._lock:
            self._save()

    # ── 文件 I/O ──
    def reload(self):
        """从 config.json 重新加载"""
        with self._lock:
            self._data = self._load()

    def _load(self) -> dict:
        if _CONFIG_PATH.exists():
            try:
                data = json.loads(_CONFIG_PATH.read_text("utf-8"))
                logger.info(f"配置已加载: {_CONFIG_PATH}")
                return data
            except Exception as e:
                logger.error(f"config.json 解析失败: {e}，使用默认值")

        # 首次运行：从 example 复制
        if _EXAMPLE_PATH.exists():
            try:
                example = json.loads(_EXAMPLE_PATH.read_text("utf-8"))
                # 去掉注释字段
                example = {k: v for k, v in example.items() if not k.startswith("//")}
                _CONFIG_PATH.write_text(json.dumps(example, ensure_ascii=False, indent=2), "utf-8")
                logger.info(f"已从 config.example.json 创建 config.json")
                return example
            except Exception as e:
                logger.error(f"从 example 创建 config.json 失败: {e}")

        logger.warning("config.json 和 config.example.json 均不存在，使用内置默认值")
        return dict(_DEFAULTS)

    def _save(self):
        """写入 config.json（兼容 Docker bind mount）"""
        _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        content = json.dumps(self._data, ensure_ascii=False, indent=2)
        tmp = _CONFIG_PATH.with_suffix(".tmp")
        try:
            tmp.write_text(content, "utf-8")
            tmp.replace(_CONFIG_PATH)
        except OSError:
            # Docker bind mount 无法原子替换，回退为直接写入
            _CONFIG_PATH.write_text(content, "utf-8")
            if tmp.exists():
                tmp.unlink()
        except Exception:
            if tmp.exists():
                tmp.unlink()
            raise
        logger.debug("config.json 已保存")


# 全局单例
settings = _Settings()
