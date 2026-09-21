"""
Urban Intelligence Platform - Backend API
With Redis Caching & Celery Integration
Run: python app.py
Serves on http://localhost:5000
"""
import os
import logging
from flask import Flask, request, jsonify, make_response
from datetime import datetime, timezone

try:
    from flask_cors import CORS
    has_cors = True
except ImportError:
    has_cors = False

from database.db import (
    init_db,
    init_mongo,
    insert_event,
    get_events,
    get_heatmap_points,
    get_stats,
    create_ticket,
    get_tickets,
    update_ticket,
    get_buses,
    get_impact,
    get_road_health,
    MongoUnavailableError,
)

from database.redis_cache import (
    redis_cache,
    cache_event, get_cached_event, cache_events_list, get_cached_events_list,
    cache_stats, get_cached_stats, cache_tickets_list, get_cached_tickets_list,
    cache_buses, get_cached_buses, cache_heatmap, get_cached_heatmap,
    cache_impact, get_cached_impact, cache_road_health, get_cached_road_health,
    invalidate_events_cache, invalidate_tickets_cache, invalidate_analytics_cache
)

# ============================================================================
# Setup Logging
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Flask App Setup
# ============================================================================

app = Flask(__name__)
if has_cors:
    CORS(app, resources={r"/api/*": {"origins": "*"}})

init_db()
init_mongo()

logger.info("[App] Initializing Urban Intelligence Platform Backend")


# ============================================================================
# CORS Handlers
# ============================================================================

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        return response, 200


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    return response


# ============================================================================
# Error Handlers
# ============================================================================

@app.errorhandler(MongoUnavailableError)
def handle_mongo_unavailable(e):
    return jsonify({"error": "MongoDB is unavailable"}), 503


@app.errorhandler(ValueError)
def handle_value_error(e):
    return jsonify({"error": str(e)}), 400


@app.errorhandler(Exception)
def handle_error(e):
    logger.error(f"[Error] {e}")
    return jsonify({"error": "Internal server error"}), 500


# ============================================================================
# Root & Health Endpoints
# ============================================================================

@app.route("/", methods=["GET"])
def root():
    return jsonify({
        "status": "online",
        "service": "Urban Intelligence Platform API",
        "version": "2.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "redis": redis_cache.get_stats(),
        "endpoints": {
            "health": "/api/health",
            "events": "/api/events",
            "heatmap": "/api/events/heatmap",
            "stats": "/api/stats",
            "tickets": "/api/tickets",
            "buses": "/api/buses",
            "impact": "/api/impact",
            "road_health": "/api/road-health",
            "cache_stats": "/api/cache/stats",
            "cache_clear": "/api/cache/clear"
        }
    })


@app.route("/api/health", methods=["GET"])
def health():
    """Health check with cache status"""
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "redis": redis_cache.is_connected(),
        "cache": redis_cache.get_stats()
    }), 200


# ============================================================================
# EVENT ENDPOINTS
# ============================================================================

@app.route("/api/events", methods=["POST"])
def create_event():
    """
    Create event from Edge Device
    Triggers: Redis cache invalidation
    """
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400

        required = ["event_type", "confidence", "latitude", "longitude", "timestamp", "bus_id"]
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({"error": f"missing fields: {missing}"}), 400

        # Insert into database
        event_id = insert_event(data)
        
        # Cache the event
        data["id"] = event_id
        cache_event(event_id, data)
        
        # Invalidate events list cache - IMPORTANT!
        invalidate_events_cache()
        logger.info(f"[Cache] Invalidated events cache after new event {event_id}")
        
        logger.info(f"[Event] Created event {event_id} - Type: {data['event_type']}")
        
        return jsonify({
            "id": event_id,
            "status": "queued_for_processing",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }), 201
    except ValueError as e:
        logger.error(f"[Event] Validation error: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"[Event] Error: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/events", methods=["GET"])
def list_events():
    """Get events with intelligent caching"""
    try:
        event_type = request.args.get("event_type")
        bus_id = request.args.get("bus_id")
        
        cache_key = f"events:list"
        if event_type:
            cache_key += f":type:{event_type}"
        if bus_id:
            cache_key += f":bus:{bus_id}"
        
        # Try cache first
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Events list ({cache_key})")
            return jsonify({
                "total": len(cached),
                "events": cached,
                "source": "cache"
            }), 200
        
        # Fetch from database if cache miss
        logger.info(f"[Cache] MISS - Events list, fetching from DB")
        events = get_events(event_type=event_type, bus_id=bus_id)
        
        # Cache for 10 minutes
        redis_cache.set(cache_key, events, timeout=600)
        logger.info(f"[Cache] SET - Events cached with key {cache_key}")
        
        return jsonify({
            "total": len(events),
            "events": events,
            "source": "database"
        }), 200
    except Exception as e:
        logger.error(f"[Event] List error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/events/heatmap", methods=["GET"])
def heatmap():
    """Get heatmap data with caching"""
    try:
        cache_key = "heatmap:points"
        
        # Try cache first
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Heatmap")
            return jsonify({
                "points": cached,
                "source": "cache"
            }), 200
        
        logger.info("[Cache] MISS - Heatmap, fetching from DB")
        points = get_heatmap_points()
        
        # Cache for 10 minutes
        redis_cache.set(cache_key, points, timeout=600)
        logger.info(f"[Cache] SET - Heatmap cached")
        
        return jsonify({
            "points": points,
            "source": "database"
        }), 200
    except Exception as e:
        logger.error(f"[Heatmap] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
def stats():
    """Get stats with caching"""
    try:
        cache_key = "stats:all"
        
        # Try cache first
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Stats")
            return jsonify({
                **cached,
                "source": "cache"
            }), 200
        
        logger.info("[Cache] MISS - Stats, fetching from DB")
        stats_data = get_stats()
        
        # Cache for 30 minutes
        redis_cache.set(cache_key, stats_data, timeout=1800)
        logger.info(f"[Cache] SET - Stats cached")
        
        return jsonify({
            **stats_data,
            "source": "database"
        }), 200
    except Exception as e:
        logger.error(f"[Stats] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================================
# TICKET ENDPOINTS
# ============================================================================

@app.route("/api/tickets", methods=["POST"])
def create_ticket_route():
    """
    Create ticket from event
    Triggers: Cache invalidation
    """
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400
        
        if not data.get("event_id"):
            return jsonify({"error": "event_id is required"}), 400
        
        # Create ticket
        ticket = create_ticket(data)
        
        # Invalidate tickets cache - IMPORTANT!
        invalidate_tickets_cache()
        logger.info(f"[Cache] Invalidated tickets cache after new ticket")
        
        logger.info(f"[Ticket] Created {ticket['ticket_id']} for event {data['event_id']}")
        
        return jsonify(ticket), 201
    except ValueError as e:
        logger.error(f"[Ticket] Error: {e}")
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.error(f"[Ticket] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/tickets", methods=["GET"])
def get_tickets_route():
    """Get tickets with caching"""
    try:
        status = request.args.get("status")
        department = request.args.get("department")
        
        cache_key = "tickets:list"
        if status:
            cache_key += f":status:{status}"
        if department:
            cache_key += f":dept:{department}"
        
        # Try cache
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Tickets list")
            return jsonify({
                "total": len(cached),
                "tickets": cached,
                "source": "cache"
            }), 200
        
        logger.info("[Cache] MISS - Tickets list, fetching from DB")
        tickets = get_tickets(status=status, department=department)
        
        # Cache for 5 minutes
        redis_cache.set(cache_key, tickets, timeout=300)
        logger.info(f"[Cache] SET - Tickets cached")
        
        return jsonify({
            "total": len(tickets),
            "tickets": tickets,
            "source": "database"
        }), 200
    except Exception as e:
        logger.error(f"[Ticket] List error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/tickets/<ticket_id>", methods=["PATCH"])
def update_ticket_route(ticket_id):
    """Update ticket and invalidate cache"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400
        
        ticket = update_ticket(ticket_id, data)
        
        # Invalidate cache - IMPORTANT!
        invalidate_tickets_cache()
        logger.info(f"[Cache] Invalidated tickets cache after update")
        
        logger.info(f"[Ticket] Updated {ticket_id}")
        
        return jsonify(ticket), 200
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.error(f"[Ticket] Update error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================================
# ANALYTICS ENDPOINTS
# ============================================================================

@app.route("/api/buses", methods=["GET"])
def get_buses_route():
    """Get buses with caching"""
    try:
        cache_key = "buses:list"
        
        # Try cache
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Buses")
            return jsonify({
                "buses": cached,
                "source": "cache"
            }), 200
        
        logger.info("[Cache] MISS - Buses, fetching from DB")
        buses = get_buses()
        
        # Cache for 2 minutes
        redis_cache.set(cache_key, buses, timeout=120)
        logger.info(f"[Cache] SET - Buses cached")
        
        return jsonify({
            "buses": buses,
            "source": "database"
        }), 200
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


@app.route("/api/impact", methods=["GET"])
def get_impact_route():
    """Get impact metrics with caching"""
    try:
        cache_key = "analytics:impact"
        
        # Try cache
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Impact")
            return jsonify({
                **cached,
                "source": "cache"
            }), 200
        
        logger.info("[Cache] MISS - Impact, fetching from DB")
        impact = get_impact()
        
        # Cache for 30 minutes
        redis_cache.set(cache_key, impact, timeout=1800)
        logger.info(f"[Cache] SET - Impact cached")
        
        return jsonify({
            **impact,
            "source": "database"
        }), 200
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


@app.route("/api/road-health", methods=["GET"])
def get_road_health_route():
    """Get road health with caching"""
    try:
        cache_key = "analytics:road_health"
        
        # Try cache
        logger.debug(f"[Cache] Checking cache for {cache_key}")
        cached = redis_cache.get(cache_key)
        
        if cached:
            logger.info(f"[Cache] HIT - Road Health")
            return jsonify({
                **cached,
                "source": "cache"
            }), 200
        
        logger.info("[Cache] MISS - Road Health, fetching from DB")
        health = get_road_health()
        
        # Cache for 30 minutes
        redis_cache.set(cache_key, health, timeout=1800)
        logger.info(f"[Cache] SET - Road Health cached")
        
        return jsonify({
            **health,
            "source": "database"
        }), 200
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


# ============================================================================
# CACHE MANAGEMENT ENDPOINTS
# ============================================================================

@app.route("/api/cache/stats", methods=["GET"])
def cache_stats_route():
    """Get Redis cache statistics"""
    try:
        stats = redis_cache.get_stats()
        return jsonify(stats), 200
    except Exception as e:
        logger.error(f"[Cache] Stats error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/cache/clear", methods=["POST"])
def cache_clear_route():
    """Clear cache"""
    try:
        pattern = request.json.get("pattern", "*") if request.json else "*"
        cleared = redis_cache.clear_pattern(pattern)
        
        logger.warning(f"[Cache] Cleared {cleared} keys matching pattern: {pattern}")
        
        return jsonify({
            "status": "cleared",
            "pattern": pattern,
            "count": cleared
        }), 200
    except Exception as e:
        logger.error(f"[Cache] Clear error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("true", "1", "yes")
    
    logger.info(f"\n[*] Starting Urban Intelligence Platform Backend")
    logger.info(f"[*] Port: {port}")
    logger.info(f"[*] Debug: {debug}")
    logger.info(f"[*] Redis: {redis_cache.is_connected()}")
    logger.info(f"[*] URL: http://localhost:{port}\n")
    
    app.run(host="0.0.0.0", port=port, debug=debug)