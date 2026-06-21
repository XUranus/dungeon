"""迁移脚本: 将已有 zsxq 内容中的 <e> XML 标签转换为标准 HTML

用法:
  cd backend
  .venv/bin/python scripts/migrate_zsxq_xml.py
"""

import sys
import os
import sqlite3
import re
from urllib.parse import unquote

# 复用 crawler 中的转换函数
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.crawlers.zsxq import zsxq_xml_to_html

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "app.db")


def migrate():
    db_path = os.path.abspath(DB_PATH)
    if not os.path.exists(db_path):
        print(f"数据库不存在: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # ── 迁移 topics ──
    rows = cur.execute(
        "SELECT id, content FROM topics WHERE platform='zsxq' AND content LIKE '%<e type%'"
    ).fetchall()
    print(f"topics 含 <e> 标签: {len(rows)} 条")
    updated = 0
    for row_id, content in rows:
        new_content = zsxq_xml_to_html(content)
        if new_content != content:
            cur.execute("UPDATE topics SET content=? WHERE id=?", (new_content, row_id))
            updated += 1
    print(f"topics 已更新: {updated} 条")

    # ── 迁移 comments ──
    rows = cur.execute(
        "SELECT id, content FROM comments WHERE platform='zsxq' AND content LIKE '%<e type%'"
    ).fetchall()
    print(f"comments 含 <e> 标签: {len(rows)} 条")
    updated_c = 0
    for row_id, content in rows:
        new_content = zsxq_xml_to_html(content)
        if new_content != content:
            cur.execute("UPDATE comments SET content=? WHERE id=?", (new_content, row_id))
            updated_c += 1
    print(f"comments 已更新: {updated_c} 条")

    conn.commit()
    conn.close()
    print("迁移完成")


if __name__ == "__main__":
    migrate()
