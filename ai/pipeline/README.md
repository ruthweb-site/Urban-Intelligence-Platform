# Pipeline — Ties Everything Together

## Goal
This replaces `simulation/fake_event_generator.py` once the real detectors are ready. It is the actual "onboard edge software" for the demo.

## What it does
1. Reads a pre-recorded video file frame-by-frame (`cv2.VideoCapture`).
2. Samples 1 frame every N seconds (don't process every frame — too slow, and real bus hardware wouldn't either).
3. Runs each frame through:
   - `ai/pothole/detect.py`
   - `ai/vehicle/detect.py`
   - `ai/anpr/detect.py`
4. For each detection above the confidence threshold, builds an event JSON per `docs/api_contract.md`, using the **next point** from `simulation/mock_route.json` as the mock GPS (step through the route as the video plays, to simulate the bus moving).
5. POSTs the event to `http://localhost:5000/api/events`.

## Suggested skeleton
```python
import cv2, time, requests
from datetime import datetime, timezone

cap = cv2.VideoCapture("sample_video.mp4")
route = [...]  # load from simulation/mock_route.json
route_idx = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    # sample every ~2 seconds of video instead of every frame
    detections = []
    detections += pothole_detect(frame)
    detections += vehicle_detect(frame)
    detections += anpr_detect(frame)

    for det in detections:
        event = {
            **det,
            "latitude": route[route_idx % len(route)]["latitude"],
            "longitude": route[route_idx % len(route)]["longitude"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "bus_id": "BUS-001",
        }
        requests.post("http://localhost:5000/api/events", json=event)
    route_idx += 1
```

Build this last, once at least one detector is ready — don't block on it.
