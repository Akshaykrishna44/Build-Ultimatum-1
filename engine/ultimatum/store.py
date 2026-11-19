"""SQLite storage for projects and the knowledge library (stdlib only; swap for PostgreSQL later)."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Optional

from .schemas import KnowledgeMap, Project


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def product_key(product: str) -> str:
    """Normalise a product description into a lookup key, e.g. "Men's Leather Shoes!" -> "leather men shoes"."""
    words = re.findall(r"[a-z0-9]+", product.lower())
    stop = {"a", "an", "the", "for", "of", "and", "to", "in", "with", "s", "my", "we", "need", "want", "make"}
    return " ".join(sorted({w for w in words if w not in stop}))


class Store:
    def __init__(self, path: str | None = None):
        self.path = path or os.environ.get("ULTIMATUM_DB", "ultimatum.db")
        self._lock = threading.Lock()
        # Load-test fix (2026-11-19): one SQLite connection shared by all server threads failed under concurrent
        # users ("bad parameter or other API misuse", empty reads). Each thread now gets its own connection;
        # WAL mode lets readers and a writer work at the same time; busy_timeout waits instead of failing.
        self._local = threading.local()
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS knowledge (
            id TEXT PRIMARY KEY, product_key TEXT NOT NULL, domain TEXT, product_title TEXT,
            map TEXT NOT NULL, verified INTEGER DEFAULT 0, uses INTEGER DEFAULT 0,
            created_at TEXT NOT NULL, verified_by TEXT);
        CREATE INDEX IF NOT EXISTS ix_knowledge_key ON knowledge(product_key);
        """)

    @property
    def db(self) -> sqlite3.Connection:
        c = getattr(self._local, "conn", None)
        if c is None:
            c = sqlite3.connect(self.path, timeout=30)
            c.row_factory = sqlite3.Row
            if self.path != ":memory:":
                c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA busy_timeout=30000")
            self._local.conn = c
        return c

    # projects
    def save_project(self, p: Project) -> Project:
        p.updated_at = now()
        with self._lock:
            self.db.execute("INSERT OR REPLACE INTO projects VALUES (?,?,?)", (p.id, p.model_dump_json(), p.updated_at))
            self.db.commit()
        return p

    def get_project(self, pid: str) -> Optional[Project]:
        row = self.db.execute("SELECT data FROM projects WHERE id=?", (pid,)).fetchone()
        return Project.model_validate_json(row["data"]) if row else None

    def list_projects(self, limit: int = 50) -> list[dict]:
        rows = self.db.execute("SELECT data FROM projects ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        out = []
        for r in rows:
            d = json.loads(r["data"])
            out.append({"id": d["id"], "product": d["request"]["product"], "qty": d["request"]["qty"],
                        "unit": d["request"]["unit"], "updated_at": d["updated_at"], "has_estimate": d.get("estimate") is not None})
        return out

    def delete_project(self, pid: str) -> bool:
        with self._lock:
            cur = self.db.execute("DELETE FROM projects WHERE id=?", (pid,))
            self.db.commit()
        return cur.rowcount > 0

    # knowledge library
    def save_knowledge(self, kid: str, product: str, m: KnowledgeMap) -> None:
        with self._lock:
            self.db.execute(
                "INSERT OR REPLACE INTO knowledge (id, product_key, domain, product_title, map, created_at) VALUES (?,?,?,?,?,?)",
                (kid, product_key(product), m.domain, m.product_title, m.model_dump_json(), now()))
            self.db.commit()

    def find_verified(self, product: str) -> Optional[tuple[str, KnowledgeMap]]:
        row = self.db.execute(
            "SELECT id, map FROM knowledge WHERE product_key=? AND verified=1 ORDER BY uses DESC LIMIT 1",
            (product_key(product),)).fetchone()
        if not row:
            return None
        with self._lock:
            self.db.execute("UPDATE knowledge SET uses = uses + 1 WHERE id=?", (row["id"],))
            self.db.commit()
        return row["id"], KnowledgeMap.model_validate_json(row["map"])

    def verify_knowledge(self, kid: str, by: str = "expert", m: KnowledgeMap | None = None) -> bool:
        with self._lock:
            if m is not None:
                cur = self.db.execute("UPDATE knowledge SET verified=1, verified_by=?, map=? WHERE id=?", (by, m.model_dump_json(), kid))
            else:
                cur = self.db.execute("UPDATE knowledge SET verified=1, verified_by=? WHERE id=?", (by, kid))
            self.db.commit()
        return cur.rowcount > 0

    def list_knowledge(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT id, product_key, domain, product_title, verified, uses, created_at, verified_by FROM knowledge ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_knowledge(self, kid: str) -> Optional[KnowledgeMap]:
        row = self.db.execute("SELECT map FROM knowledge WHERE id=?", (kid,)).fetchone()
        return KnowledgeMap.model_validate_json(row["map"]) if row else None
