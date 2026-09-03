"""
SQLite storage for events. Simple on purpose — this is a hackathon demo,
not a production data layer. Swap for Postgres/Mongo later only if you
have spare time.
"""
import sqlite3
import json
import os
from datetime import datetime, timezone
from pymongo import MongoClient, DESCENDING
from datetime import timedelta
import uuid

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

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = "urban_intelligence_platform"

mongo_client = None
mongo_db = None


def init_mongo():
    """Initialize MongoDB connection and indexes (call this once at startup)."""
    global mongo_client, mongo_db
    mongo_client = MongoClient(MONGO_URI)
    mongo_db = mongo_client[DB_NAME]
    mongo_client.admin.command("ping")

    mongo_db.events.create_index("event_id", unique=True)
    mongo_db.events.create_index("bus_id")
    mongo_db.events.create_index([("timestamp", DESCENDING)])
    mongo_db.events.create_index("event_type")
    mongo_db.events.create_index("status")

    mongo_db.tickets.create_index("ticket_id", unique=True)
    mongo_db.tickets.create_index("event_id", unique=True)
    mongo_db.tickets.create_index("status")
    mongo_db.tickets.create_index("assigned_to")

    mongo_db.buses.create_index("bus_id", unique=True)
    print(f"[MongoDB] Connected to {DB_NAME}")


def _mongo_serialize(doc):
    if not doc:
        return None
    d = dict(doc)
    d["id"] = str(d.pop("_id", ""))
    for field in ("timestamp", "created_at", "resolved_at", "last_seen"):
        if field in d and isinstance(d[field], datetime):
            d[field] = d[field].isoformat()
    return d


# Also save events to MongoDB with the full required fields (called from create_event)
def insert_event_mongo(data):
    event_id = f"EVT-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "event_id": event_id,
        "event_type": data.get("event_type"),
        "confidence": float(data.get("confidence", 0.0)),
        "severity": data.get("severity", "medium"),
        "latitude": float(data.get("latitude", 0)),
        "longitude": float(data.get("longitude", 0)),
        "timestamp": datetime.utcnow(),
        "bus_id": data.get("bus_id"),
        "camera_id": data.get("camera_id", "CAM-01"),
        "evidence_image": data.get("evidence_image") or data.get("image_base64"),
        "status": "new"
    }
    mongo_db.events.insert_one(doc)
    return event_id


# ====================== NEW: TICKET, BUS & ANALYTICS (MongoDB) ======================

def create_ticket(data):
    event_id = data.get("event_id")
    if not mongo_db.events.find_one({"event_id": event_id}):
        raise ValueError(f"Event {event_id} not found")

    count = mongo_db.tickets.count_documents({}) + 1
    ticket_id = f"TKT-{count:06d}"

    ticket = {
        "ticket_id": ticket_id,
        "event_id": event_id,
        "department": data.get("department", "safety"),
        "priority": data.get("priority", "medium"),
        "assigned_to": data.get("assigned_to"),
        "status": data.get("status", "OPEN").upper(),
        "created_at": datetime.utcnow(),
        "resolved_at": None,
        "notes": data.get("notes")
    }

    if ticket["status"] not in {"OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED"}:
        ticket["status"] = "OPEN"

    mongo_db.tickets.insert_one(ticket)
    mongo_db.events.update_one({"event_id": event_id}, {"$set": {"status": "ticketed"}})
    return _mongo_serialize(ticket)


def get_tickets(status=None, department=None, assigned_to=None):
    query = {}
    if status: query["status"] = status.upper()
    if department: query["department"] = department
    if assigned_to: query["assigned_to"] = assigned_to

    docs = list(mongo_db.tickets.find(query).sort("created_at", DESCENDING))
    return [_mongo_serialize(d) for d in docs]


def update_ticket(ticket_id, data):
    update = {k: v for k, v in data.items() if k in ("status", "assigned_to", "department", "priority", "notes")}
    if not update:
        raise ValueError("No valid fields to update")

    if "status" in update:
        status_val = update["status"].upper()
        if status_val not in {"OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED"}:
            raise ValueError("Invalid status")
        update["status"] = status_val
        if status_val == "RESOLVED":
            update["resolved_at"] = datetime.utcnow()

    result = mongo_db.tickets.update_one({"ticket_id": ticket_id}, {"$set": update})
    if result.matched_count == 0:
        raise ValueError(f"Ticket {ticket_id} not found")
    return _mongo_serialize(mongo_db.tickets.find_one({"ticket_id": ticket_id}))


def get_buses():
    docs = list(mongo_db.buses.find({}, {"_id": 0, "bus_id": 1, "route": 1,
                                          "latitude": 1, "longitude": 1,
                                          "status": 1, "last_seen": 1})
                .sort("last_seen", DESCENDING))
    if not docs:
        return [{"bus_id": "BUS-045", "route": "Route 12", "latitude": 40.7128,
                 "longitude": -74.0060, "status": "active", "last_seen": datetime.utcnow().isoformat()}]
    return [_mongo_serialize(d) for d in docs]


def get_impact():
    pipeline = [{
        "$group": {
            "_id": None,
            "total": {"$sum": 1},
            "high": {"$sum": {"$cond": [{"$eq": ["$severity", "high"]}, 1, 0]}},
            "critical": {"$sum": {"$cond": [{"$eq": ["$severity", "critical"]}, 1, 0]}},
            "avg_confidence": {"$avg": "$confidence"}
        }
    }]
    result = next(mongo_db.events.aggregate(pipeline), {})
    high = result.get("high", 0)
    critical = result.get("critical", 0)
    return {
        "total_incidents": result.get("total", 0),
        "high_severity_incidents": high,
        "critical_incidents": critical,
        "avg_detection_confidence": round(result.get("avg_confidence", 0), 3),
        "buses_affected": len(mongo_db.events.distinct("bus_id")),
        "estimated_cost_impact": high * 1250 + critical * 4500,
        "period": "all_time"
    }


def get_road_health():
    since = datetime.utcnow() - timedelta(days=30)
    pipeline = [
        {"$match": {"event_type": "road_hazard", "timestamp": {"$gte": since}}},
        {"$group": {"_id": None, "hazard_count": {"$sum": 1}}}
    ]
    result = next(mongo_db.events.aggregate(pipeline), {})
    count = result.get("hazard_count", 0)
    score = max(35, 100 - count * 8)
    return {
        "road_health_score": score,
        "trend": "improving" if count < 15 else "declining",
        "total_hazards_30d": count,
        "recommendation": "Increase patrols on high-hazard routes" if count > 12 else "Maintain current monitoring"
    }
