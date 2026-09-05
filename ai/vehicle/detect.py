import cv2
import requests
from datetime import datetime, timezone
from ultralytics import YOLO
from collections import Counter

VIDEO_PATH = "sample_videos/15125831_1920_1080_30fps.mp4"
VEHICLE_CLASSES = [2, 3, 5, 7]  # car, motorcycle, bus, truck
BACKEND_URL = "http://127.0.0.1:5000/api/events"
BUS_ID = "BUS-001"
# Placeholder GPS coords — replace later with real/simulated route data
LATITUDE = 19.0760
LONGITUDE = 72.8777

model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print("ERROR: Could not open video.")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
check_every_n_frames = int(fps * 4)

frame_number = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    if frame_number % check_every_n_frames == 0:
        results = model(frame, classes=VEHICLE_CLASSES)
        detected_ids = results[0].boxes.cls.tolist()
        detected_names = [model.names[int(cls_id)] for cls_id in detected_ids]

        counts = Counter(detected_names)
        total = sum(counts.values())

        if total <= 10:
            density = "LOW"
        elif total <= 20:
            density = "MEDIUM"
        else:
            density = "HIGH"

        timestamp_sec = frame_number / fps
        print(f"--- Checkpoint at {timestamp_sec:.1f}s (frame {frame_number}) ---")
        print(f"Cars: {counts.get('car', 0)}")
        print(f"Motorcycles: {counts.get('motorcycle', 0)}")
        print(f"Buses: {counts.get('bus', 0)}")
        print(f"Trucks: {counts.get('truck', 0)}")
        print(f"Total: {total}")
        print(f"Traffic Density: {density}")

        now_iso = datetime.now(timezone.utc).isoformat()
        for vehicle_class, count in counts.items():
            payload = {
                "event_type": "vehicle_count",
                "confidence": 0.9,
                "latitude": LATITUDE,
                "longitude": LONGITUDE,
                "timestamp": now_iso,
                "bus_id": BUS_ID,
                "extra": {
                    "vehicle_class": vehicle_class,
                    "count": count,
                    "traffic_density": density
                }
            }
            try:
                response = requests.post(BACKEND_URL, json=payload, timeout=3)
                print(f"  Sent {vehicle_class} event -> status {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"  Failed to send {vehicle_class} event: {e}")

        print()

    frame_number += 1

cap.release()