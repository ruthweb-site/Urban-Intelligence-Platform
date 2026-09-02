"""
Fake event generator — stands in for `ai/pipeline` until real detectors are ready.

Simulates a bus driving along `mock_route.json`, occasionally "detecting"
something, and POSTing an event to the backend in the exact shape defined
in docs/api_contract.md.

Run: python fake_event_generator.py
(Backend must already be running on http://localhost:5000)
"""
import json
import random
import time
from datetime import datetime, timezone
import os

import requests

API_URL = "http://localhost:5000/api/events"
BUS_ID = "BUS-001"

HERE = os.path.dirname(__file__)
with open(os.path.join(HERE, "mock_route.json")) as f:
    ROUTE = json.load(f)

EVENT_TYPES = [
    ("pothole", {}),
    ("road_damage", {}),
    ("waterlogging", {}),
    ("vehicle_count", {"vehicle_class": random.choice(["car", "bus", "truck", "bike"])}),
    ("congestion", {}),
    ("anpr_alert", {"plate_number": "MH04AB1234"}),
]


def make_event(point):
    event_type, extra = random.choice(EVENT_TYPES)
    return {
        "event_type": event_type,
        "confidence": round(random.uniform(0.65, 0.98), 2),
        "latitude": point["latitude"],
        "longitude": point["longitude"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "bus_id": BUS_ID,
        "extra": extra,
    }


def main():
    print(f"Simulating {BUS_ID} driving along {len(ROUTE)} GPS points...")
    print("Sending an event every 3 seconds. Ctrl+C to stop.\n")
    i = 0
    while True:
        point = ROUTE[i % len(ROUTE)]
        event = make_event(point)
        try:
            res = requests.post(API_URL, json=event, timeout=5)
            print(f"Sent {event['event_type']} ({event['confidence']}) -> status {res.status_code}")
        except requests.exceptions.ConnectionError:
            print("Could not reach backend — is `python app.py` running in backend/?")
        i += 1
        time.sleep(3)


if __name__ == "__main__":
    main()
