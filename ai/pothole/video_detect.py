import time
from datetime import datetime, timezone
from pathlib import Path
import cv2
import requests
from ultralytics import YOLO

# ---- CONFIG ----
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"
VIDEO_PATH = BASE_DIR / "bus_camera.mp4.mp4"
EVIDENCE_DIR = BASE_DIR / "evidence"

CONFIDENCE_THRESHOLD = 0.15
COOLDOWN_SECONDS = 3
FRAME_SKIP = 2

API_URL = "http://127.0.0.1:5000/api/events"

BUS_ID = "BUS-102"
ROUTE_ID = "ROUTE-18"
CAMERA_ID = "CAM-01"
GPS_LAT = 19.0760
GPS_LNG = 72.8777

model = YOLO(str(MODEL_PATH))
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)


def severity_from_confidence(conf):
    if conf >= 0.75:
        return "HIGH"
    elif conf >= 0.5:
        return "MEDIUM"
    return "LOW"


def send_event(payload):
    try:
        response = requests.post(API_URL, json=payload, timeout=10)
        response.raise_for_status()
        created_event = response.json()
        print(f"Event created — ID: {created_event.get('id')}")
    except requests.exceptions.ConnectionError:
        print(f"Backend unreachable at {API_URL} — is 'python backend/app.py' running?")
    except requests.exceptions.HTTPError as err:
        print(f"HTTP Error: {err} — Details: {response.text}")


def process_video(video_path):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open video: {video_path}")

    frame_idx = 0
    last_event_time = 0
    event_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1
        if frame_idx % FRAME_SKIP != 0:
            continue

        results = model.predict(source=frame, conf=CONFIDENCE_THRESHOLD, verbose=False)

        for result in results:
            if result.boxes is None or len(result.boxes) == 0:
                continue

            now = time.time()
            if now - last_event_time < COOLDOWN_SECONDS:
                continue

            best_box = max(result.boxes, key=lambda b: float(b.conf[0]))
            score = float(best_box.conf[0])
            x1, y1, x2, y2 = best_box.xyxy[0].tolist()

            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            evidence_file = EVIDENCE_DIR / f"pothole_{timestamp_str}.jpg"
            annotated_frame = result.plot()
            cv2.imwrite(str(evidence_file), annotated_frame)

            payload = {
                "event_type": "pothole",
                "confidence": round(score, 3),
                "latitude": GPS_LAT,
                "longitude": GPS_LNG,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "bus_id": BUS_ID,
                "image_base64": None,
                "extra": {
                    "severity": severity_from_confidence(score),
                    "route_id": ROUTE_ID,
                    "camera_id": CAMERA_ID,
                    "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                    "detection_count": len(result.boxes),
                    "evidence_image": str(evidence_file)
                }
            }

            event_count += 1
            print(f"\nPothole #{event_count} detected — confidence {score:.2f}")
            send_event(payload)
            last_event_time = now

    cap.release()
    print(f"\nDone. {event_count} event(s) sent.")


if __name__ == "__main__":
    process_video(VIDEO_PATH)