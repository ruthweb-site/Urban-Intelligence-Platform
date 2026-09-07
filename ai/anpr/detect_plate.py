import cv2
import requests
import easyocr
from datetime import datetime, timezone
from ultralytics import YOLO

VIDEO_PATH = "sample_videos/20728367-hd_720_1280_60fps.mp4"
BACKEND_URL = "http://127.0.0.1:5050/api/events"
BUS_ID = "BUS-001"
LATITUDE = 19.0760
LONGITUDE = 72.8777

plate_model = YOLO("license_plate_detector.pt")
ocr_reader = easyocr.Reader(['en'])

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print("ERROR: Could not open video.")
    exit()

total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS)
check_every_n_frames = int(fps * 2)  # check every 2 seconds

frame_number = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    if frame_number % check_every_n_frames == 0:
        results = plate_model(frame, verbose=False)
        boxes = results[0].boxes

        for box in boxes:
            detect_confidence = box.conf[0].item()
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            cropped_plate = frame[y1:y2, x1:x2]

            if cropped_plate.size == 0:
                continue  # skip invalid/empty crops

            ocr_results = ocr_reader.readtext(cropped_plate)

            if len(ocr_results) == 0:
                continue  # nothing readable in this crop

            # Combine all detected text pieces (handles multi-line plates)
            plate_text = " ".join([text for (_, text, _) in ocr_results])
            avg_ocr_confidence = sum([conf for (_, _, conf) in ocr_results]) / len(ocr_results)

            print(f"Frame {frame_number}: plate='{plate_text}' "
                  f"detect_conf={detect_confidence:.2f} ocr_conf={avg_ocr_confidence:.2f}")

            payload = {
                "event_type": "anpr_alert",
                "confidence": round(avg_ocr_confidence, 2),
                "latitude": LATITUDE,
                "longitude": LONGITUDE,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "bus_id": BUS_ID,
                "extra": {
                    "plate_number": plate_text,
                    "vehicle_class": "car"
                }
            }
            try:
                response = requests.post(BACKEND_URL, json=payload, timeout=3)
                print(f"  Sent -> status {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"  Failed to send: {e}")

    frame_number += 1

cap.release()