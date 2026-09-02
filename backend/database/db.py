"""
SQLite storage for events. Simple on purpose — this is a hackathon demo,
not a production data layer. Swap for Postgres/Mongo later only if you
have spare time.
"""
import sqlite3
import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "events.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            confidence REAL NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            timestamp TEXT NOT NULL,
            bus_id TEXT NOT NULL,
            image_base64 TEXT,
            extra TEXT,
            received_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def insert_event(data):
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO events
           (event_type, confidence, latitude, longitude, timestamp, bus_id, image_base64, extra, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data["event_type"],
            data["confidence"],
            data["latitude"],
            data["longitude"],
            data["timestamp"],
            data["bus_id"],
            data.get("image_base64"),
            json.dumps(data.get("extra", {})),
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return event_id


def get_events(event_type=None, bus_id=None):
    conn = get_conn()
    query = "SELECT * FROM events WHERE 1=1"
    params = []
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
    if bus_id:
        query += " AND bus_id = ?"
        params.append(bus_id)
    query += " ORDER BY id DESC LIMIT 500"
    rows = conn.execute(query, params).fetchall()
    conn.close()

    result = []
    for row in rows:
        d = dict(row)
        d["extra"] = json.loads(d["extra"]) if d["extra"] else {}
        result.append(d)
    return result


def get_heatmap_points():
    conn = get_conn()
    rows = conn.execute("SELECT latitude, longitude, confidence FROM events").fetchall()
    conn.close()
    return [{"latitude": r["latitude"], "longitude": r["longitude"], "weight": r["confidence"]} for r in rows]


def get_stats():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) as c FROM events").fetchone()["c"]
    by_type_rows = conn.execute(
        "SELECT event_type, COUNT(*) as c FROM events GROUP BY event_type"
    ).fetchall()
    conn.close()
    return {
        "total_events": total,
        "by_type": {r["event_type"]: r["c"] for r in by_type_rows},
    }
