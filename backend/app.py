"""
Urban Intelligence Platform - Backend API
Run: python app.py
Serves on http://localhost:5000
"""
from flask import Flask, request, jsonify
from database.db import (
    init_db,
    init_mongo,
    insert_event,
    get_events,
    get_heatmap_points,
    get_stats,
    insert_event_mongo,
    create_ticket,
    get_tickets,
    update_ticket,
    get_buses,
    get_impact,
    get_road_health,
    MongoUnavailableError,
)

app = Flask(__name__)
init_db()
init_mongo()


@app.after_request
def add_cors_headers(response):
    # Manual CORS (avoids needing the flask-cors package) so the frontend,
    # served on a different port, can call this API.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
    return response


@app.errorhandler(MongoUnavailableError)
def handle_mongo_unavailable(e):
    return jsonify({"error": "MongoDB is unavailable"}), 503


# ============================================================================
#  CORE EVENT ENDPOINTS (SQLite) - Preserved for AI Pipeline & GIS Dashboard
# ============================================================================

@app.route("/api/events", methods=["POST"])
def create_event():
    data = request.get_json(force=True)

    required = ["event_type", "confidence", "latitude", "longitude", "timestamp", "bus_id"]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"missing fields: {missing}"}), 400

    event_id = insert_event(data)
    data["id"] = event_id
    return jsonify(data), 201


@app.route("/api/events", methods=["GET"])
def list_events():
    event_type = request.args.get("event_type")
    bus_id = request.args.get("bus_id")
    events = get_events(event_type=event_type, bus_id=bus_id)
    return jsonify(events)


@app.route("/api/events/heatmap", methods=["GET"])
def heatmap():
    return jsonify(get_heatmap_points())


@app.route("/api/stats", methods=["GET"])
def stats():
    return jsonify(get_stats())


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ============================================================================
#  NEW ENDPOINTS (Tickets, Fleet Status, Analytics)
# ============================================================================

@app.route("/api/tickets", methods=["POST"])
def create_ticket_route():
    data = request.get_json(force=True)
    if not data or not data.get("event_id"):
        return jsonify({"error": "event_id is required"}), 400
    try:
        ticket = create_ticket(data)
        return jsonify(ticket), 201
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/tickets", methods=["GET"])
def get_tickets_route():
    try:
        tickets = get_tickets(
            status=request.args.get("status"),
            department=request.args.get("department"),
            assigned_to=request.args.get("assigned_to")
        )
        return jsonify(tickets)
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


@app.route("/api/tickets/<ticket_id>", methods=["PATCH"])
def update_ticket_route(ticket_id):
    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "No data provided"}), 400
    try:
        ticket = update_ticket(ticket_id, data)
        return jsonify(ticket), 200
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/buses", methods=["GET"])
def get_buses_route():
    try:
        return jsonify(get_buses())
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


@app.route("/api/impact", methods=["GET"])
def get_impact_route():
    try:
        return jsonify(get_impact())
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


@app.route("/api/road-health", methods=["GET"])
def get_road_health_route():
    try:
        return jsonify(get_road_health())
    except MongoUnavailableError:
        return jsonify({"error": "MongoDB is unavailable"}), 503


if __name__ == "__main__":
    app.run(debug=True, port=5000)
