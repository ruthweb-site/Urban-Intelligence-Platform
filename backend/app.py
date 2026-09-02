"""
Urban Intelligence Platform - Backend API
Run: python app.py
Serves on http://localhost:5000
"""
from flask import Flask, request, jsonify
from database.db import init_db, insert_event, get_events, get_heatmap_points, get_stats

app = Flask(__name__)
init_db()


@app.after_request
def add_cors_headers(response):
    # Manual CORS (avoids needing the flask-cors package) so the frontend,
    # served on a different port, can call this API.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
