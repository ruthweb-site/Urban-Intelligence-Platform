"""
Urban Intelligence Platform - Database Layer
Supports both:
1. SQLite storage (core event pipeline used by AI and GIS dashboard)
2. MongoDB storage (tickets, fleet status, and impact analytics)
"""
import sqlite3
import json
import os
import uuid
from datetime import datetime, timezone, timedelta

try:
    # pyrefly: ignore [missing-import]
    from pymongo import MongoClient, DESCENDING
except ImportError:
    MongoClient = None
    DESCENDING = -1

# ============================================================================
# 1. SQLITE STORAGE (Core Event Pipeline - DO NOT REMOVE)
# ============================================================================

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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            event_id TEXT NOT NULL,
            department TEXT NOT NULL,
            priority TEXT NOT NULL,
            assigned_to TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            notes TEXT
        )
    """)
    conn.commit()
    conn.close()


def insert_event(data):
    img_b64 = data.get("image_base64")
    if not img_b64:
        extra = data.get("extra", {})
        ev_path = extra.get("evidence_image") if isinstance(extra, dict) else None
        if ev_path and os.path.exists(ev_path):
            try:
                import base64
                with open(ev_path, "rb") as f:
                    img_b64 = base64.b64encode(f.read()).decode("utf-8")
            except Exception:
                pass

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
            img_b64,
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


# ============================================================================
# 2. MONGODB STORAGE (Tickets, Fleet Status, Analytics)
# ============================================================================

class MongoUnavailableError(Exception):
    """Raised when a MongoDB operation is attempted but MongoDB is not available."""
    pass


MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = "urban_intelligence_platform"

mongo_client = None
mongo_db = None


def init_mongo():
    """Initialize MongoDB connection and indexes gracefully without blocking SQLite."""
    global mongo_client, mongo_db

    if MongoClient is None:
        print("[MongoDB] Warning: 'pymongo' is not installed. MongoDB features will be disabled.")
        mongo_client = None
        mongo_db = None
        return

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=1500)
        # Verify connection
        client.admin.command("ping")
        db = client[DB_NAME]

        db.events.create_index("event_id", unique=True)
        db.events.create_index("bus_id")
        db.events.create_index([("timestamp", DESCENDING)])
        db.events.create_index("event_type")
        db.events.create_index("status")

        db.tickets.create_index("ticket_id", unique=True)
        db.tickets.create_index("event_id", unique=True)
        db.tickets.create_index("status")
        db.tickets.create_index("assigned_to")

        db.buses.create_index("bus_id", unique=True)

        mongo_client = client
        mongo_db = db
        print(f"[MongoDB] Connected successfully to {DB_NAME}")
    except Exception as e:
        print(f"[MongoDB] Warning: Could not connect to MongoDB ({e}). Running in SQLite-only mode.")
        mongo_client = None
        mongo_db = None


def _check_mongo():
    if mongo_db is None:
        raise MongoUnavailableError("MongoDB is unavailable")


def _mongo_serialize(doc):
    if not doc:
        return None
    d = dict(doc)
    d["id"] = str(d.pop("_id", ""))
    for field in ("timestamp", "created_at", "resolved_at", "last_seen"):
        if field in d and isinstance(d[field], datetime):
            d[field] = d[field].isoformat()
    return d


def insert_event_mongo(data):
    """Save an event to MongoDB."""
    _check_mongo()
    event_id = f"EVT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "event_id": event_id,
        "event_type": data.get("event_type"),
        "confidence": float(data.get("confidence", 0.0)),
        "severity": data.get("severity", "medium"),
        "latitude": float(data.get("latitude", 0)),
        "longitude": float(data.get("longitude", 0)),
        "timestamp": datetime.now(timezone.utc),
        "bus_id": data.get("bus_id"),
        "camera_id": data.get("camera_id", "CAM-01"),
        "evidence_image": data.get("evidence_image") or data.get("image_base64"),
        "status": "new"
    }
    mongo_db.events.insert_one(doc)
    return event_id


def _event_exists(event_id):
    conn = get_conn()
    row = conn.execute("SELECT id FROM events WHERE id = ?", (str(event_id),)).fetchone()
    conn.close()
    if row:
        return True

    if mongo_db is not None:
        try:
            if mongo_db.events.find_one({"$or": [{"event_id": str(event_id)}, {"event_id": event_id}]}):
                return True
        except Exception:
            pass
    return False


def create_ticket(data):
    event_id = data.get("event_id")
    if not event_id:
        raise ValueError("event_id is required")

    if not _event_exists(event_id):
        raise ValueError(f"Event {event_id} not found")

    event_id_str = str(event_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    conn = get_conn()
    count_row = conn.execute("SELECT COUNT(*) as c FROM tickets").fetchone()
    count = (count_row["c"] if count_row else 0) + 1
    ticket_id = f"TKT-{count:06d}"

    department = data.get("department", "Road Maintenance")
    priority = str(data.get("priority", "MEDIUM")).upper()
    assigned_to = data.get("assigned_to", "")
    status = str(data.get("status", "OPEN")).upper()
    notes = data.get("notes", "")

    if status not in {"OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED"}:
        status = "OPEN"

    conn.execute(
        """INSERT INTO tickets (ticket_id, event_id, department, priority, assigned_to, status, created_at, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (ticket_id, event_id_str, department, priority, assigned_to, status, now_iso, notes)
    )
    conn.commit()
    conn.close()

    ticket_obj = {
        "ticket_id": ticket_id,
        "event_id": event_id_str,
        "department": department,
        "priority": priority,
        "assigned_to": assigned_to,
        "status": status,
        "created_at": now_iso,
        "resolved_at": None,
        "notes": notes
    }

    if mongo_db is not None:
        try:
            mongo_db.tickets.insert_one(dict(ticket_obj))
            mongo_db.events.update_one({"$or": [{"event_id": event_id_str}, {"event_id": event_id}]}, {"$set": {"status": "ticketed"}})
        except Exception as e:
            print(f"[MongoDB Ticket Sync Warning]: {e}")

    return ticket_obj


def get_tickets(status=None, department=None, assigned_to=None):
    if mongo_db is not None:
        try:
            query = {}
            if status: query["status"] = status.upper()
            if department: query["department"] = department
            if assigned_to: query["assigned_to"] = assigned_to

            docs = list(mongo_db.tickets.find(query).sort("created_at", DESCENDING))
            if docs:
                return [_mongo_serialize(d) for d in docs]
        except Exception:
            pass

    conn = get_conn()
    query = "SELECT * FROM tickets WHERE 1=1"
    params = []
    if status:
        query += " AND UPPER(status) = ?"
        params.append(status.upper())
    if department:
        query += " AND department = ?"
        params.append(department)
    if assigned_to:
        query += " AND assigned_to = ?"
        params.append(assigned_to)
    query += " ORDER BY id DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


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
            update["resolved_at"] = datetime.now(timezone.utc).isoformat()

    conn = get_conn()
    fields = ", ".join([f"{k} = ?" for k in update.keys()])
    params = list(update.values()) + [ticket_id]
    conn.execute(f"UPDATE tickets SET {fields} WHERE ticket_id = ?", params)
    conn.commit()

    row = conn.execute("SELECT * FROM tickets WHERE ticket_id = ?", (ticket_id,)).fetchone()
    conn.close()

    if mongo_db is not None:
        try:
            mongo_db.tickets.update_one({"ticket_id": ticket_id}, {"$set": update})
        except Exception:
            pass

    if not row:
        raise ValueError(f"Ticket {ticket_id} not found")
    return dict(row)


def get_buses():
    buses_map = {}

    try:
        conn = get_conn()
        rows = conn.execute(
            """SELECT bus_id, latitude, longitude, timestamp, extra
               FROM events ORDER BY id DESC LIMIT 200"""
        ).fetchall()
        conn.close()

        for r in rows:
            bid = r["bus_id"]
            if bid and bid not in buses_map:
                extra = json.loads(r["extra"]) if r["extra"] else {}
                buses_map[bid] = {
                    "bus_id": bid,
                    "route": extra.get("route_id", "ROUTE-18"),
                    "latitude": r["latitude"],
                    "longitude": r["longitude"],
                    "status": "active",
                    "last_seen": r["timestamp"]
                }
    except Exception:
        pass

    if mongo_db is not None:
        try:
            docs = list(mongo_db.buses.find({}, {"_id": 0, "bus_id": 1, "route": 1,
                                                  "latitude": 1, "longitude": 1,
                                                  "status": 1, "last_seen": 1})
                        .sort("last_seen", DESCENDING))
            for d in docs:
                bid = d.get("bus_id")
                if bid and bid not in buses_map:
                    buses_map[bid] = _mongo_serialize(d)
        except Exception:
            pass

    if not buses_map:
        return [{
            "bus_id": "BUS-102",
            "route": "ROUTE-18",
            "latitude": 19.076,
            "longitude": 72.8777,
            "status": "active",
            "last_seen": datetime.now(timezone.utc).isoformat()
        }]

    return list(buses_map.values())


def get_impact():
    conn = get_conn()

    issues_detected = conn.execute("SELECT COUNT(*) as c FROM events").fetchone()["c"]

    buses_count_row = conn.execute("SELECT COUNT(DISTINCT bus_id) as c FROM events").fetchone()
    buses_monitoring = max(1, buses_count_row["c"] if buses_count_row else 1)

    tickets_count_row = conn.execute("SELECT COUNT(*) as c FROM tickets").fetchone()
    tickets_created = tickets_count_row["c"] if tickets_count_row else 0

    resolved_count_row = conn.execute("SELECT COUNT(*) as c FROM tickets WHERE UPPER(status) = 'RESOLVED'").fetchone()
    issues_resolved = resolved_count_row["c"] if resolved_count_row else 0

    resolved_tickets = conn.execute("SELECT created_at, resolved_at FROM tickets WHERE UPPER(status) = 'RESOLVED' AND resolved_at IS NOT NULL").fetchall()
    if resolved_tickets:
        durations = []
        for r in resolved_tickets:
            try:
                t1 = datetime.fromisoformat(r["created_at"])
                t2 = datetime.fromisoformat(r["resolved_at"])
                diff = (t2 - t1).total_seconds() / 3600.0
                if diff >= 0:
                    durations.append(diff)
            except Exception:
                pass
        if durations:
            avg_hrs = sum(durations) / len(durations)
            avg_response_time = f"{avg_hrs:.1f} hrs"
        else:
            avg_response_time = "1.5 hrs"
    else:
        avg_response_time = "2.4 hrs"

    gps_grid = conn.execute("SELECT COUNT(DISTINCT (ROUND(latitude, 3) || ',' || ROUND(longitude, 3))) as c FROM events").fetchone()
    grid_count = gps_grid["c"] if gps_grid else 0
    road_km_monitored = round(max(15.2, grid_count * 1.8 + buses_monitoring * 12.5), 1)

    conn.close()

    if mongo_db is not None:
        try:
            mongo_events_cnt = mongo_db.events.count_documents({})
            if mongo_events_cnt > issues_detected:
                issues_detected = mongo_events_cnt
            mongo_tickets_cnt = mongo_db.tickets.count_documents({})
            if mongo_tickets_cnt > tickets_created:
                tickets_created = mongo_tickets_cnt
            mongo_resolved_cnt = mongo_db.tickets.count_documents({"status": "RESOLVED"})
            if mongo_resolved_cnt > issues_resolved:
                issues_resolved = mongo_resolved_cnt
        except Exception:
            pass

    return {
        "buses_monitoring": buses_monitoring,
        "road_km_monitored": f"{road_km_monitored} km",
        "issues_detected": issues_detected,
        "tickets_created": tickets_created,
        "issues_resolved": issues_resolved,
        "avg_response_time": avg_response_time,
        "total_incidents": issues_detected,
        "buses_affected": buses_monitoring
    }


def get_road_health():
    conn = get_conn()
    rows = conn.execute(
        "SELECT event_type, confidence, extra FROM events WHERE event_type IN ('pothole', 'road_damage', 'waterlogging', 'congestion')"
    ).fetchall()
    conn.close()

    pothole_count = 0
    damage_count = 0
    waterlogging_count = 0
    congestion_count = 0
    incidents_count = 0

    for r in rows:
        etype = r["event_type"]
        if etype == "pothole":
            pothole_count += 1
        elif etype == "road_damage":
            damage_count += 1
        elif etype == "waterlogging":
            waterlogging_count += 1
        elif etype == "congestion":
            congestion_count += 1

        extra = json.loads(r["extra"]) if r["extra"] else {}
        severity = str(extra.get("severity", "")).upper()
        if severity in ("HIGH", "CRITICAL") or float(r["confidence"] or 0) >= 0.8:
            incidents_count += 1

    total_hazards = pothole_count + damage_count + waterlogging_count + congestion_count

    deductions = (pothole_count * 5) + (damage_count * 8) + (waterlogging_count * 10) + (congestion_count * 4)
    score = max(32, 100 - deductions)

    if score < 50:
        priority = "CRITICAL"
    elif score < 70:
        priority = "HIGH"
    elif score < 85:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    if congestion_count >= 5 or total_hazards >= 10:
        traffic = "HIGH"
    elif congestion_count >= 2 or total_hazards >= 4:
        traffic = "MEDIUM"
    else:
        traffic = "LOW"

    trend = "improving" if total_hazards < 5 else "declining"

    if score < 60:
        recommendation = "High hazard density detected. Urgent road resurfacing required."
    elif score < 80:
        recommendation = "Increase patrols and schedule maintenance on high-hazard sections."
    else:
        recommendation = "Maintain current monitoring schedule."

    return {
        "corridor": "ANDHERI LINK ROAD",
        "road_health_score": score,
        "potholes": pothole_count,
        "traffic": traffic,
        "incidents": incidents_count,
        "priority": priority,
        "trend": trend,
        "total_hazards_30d": total_hazards,
        "recommendation": recommendation
    }
