"""
Vehicle Detection, Classification & Counting Module
=====================================================
Uses pretrained YOLOv8 COCO model to detect cars, motorcycles, buses, and trucks.
Emits structured vehicle_count and congestion event payloads.
"""
import sys
import base64
from datetime import datetime, timezone
from pathlib import Path
import cv2
import requests
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent

# COCO class mapping for vehicle types:
# 2: car, 3: motorcycle, 5: bus, 7: truck
VEHICLE_CLASSES = {
    2: "car",
    3: "bike",
    5: "bus",
    7: "truck"
}

# Pretrained YOLOv8 model (auto-downloads yolov8n.pt if not present)
model = YOLO("yolov8n.pt")


def detect_vehicles(frame_or_image_path, conf_threshold=0.25):
    """
    Detect and classify vehicles in an image or video frame.

    Parameters
    ----------
    frame_or_image_path : str, Path, or numpy.ndarray
        Image path or loaded OpenCV frame image matrix.
    conf_threshold : float
        Detection confidence threshold.

    Returns
    -------
    dict
        Detection results including breakdown counts, total count, density level,
        annotated frame, and event payloads.
    """
    if isinstance(frame_or_image_path, (str, Path)):
        img_path = Path(frame_or_image_path)
        if not img_path.exists():
            raise FileNotFoundError(f"Image not found: {img_path}")
        source = str(img_path)
    else:
        source = frame_or_image_path

    results = model.predict(
        source=source,
        classes=list(VEHICLE_CLASSES.keys()),
        conf=conf_threshold,
        verbose=False
    )

    breakdown = {"car": 0, "bike": 0, "bus": 0, "truck": 0}
    detections = []
    annotated_frame = None

    for result in results:
        annotated_frame = result.plot()
        if result.boxes is None:
            continue

        for box in result.boxes:
            class_id = int(box.cls[0])
            score = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            vtype = VEHICLE_CLASSES.get(class_id, "car")

            if vtype in breakdown:
                breakdown[vtype] += 1

            detections.append({
                "vehicle_class": vtype,
                "confidence": round(score, 3),
                "bbox": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)]
            })

    total_count = sum(breakdown.values())

    # Density categorisation
    if total_count >= 12:
        density = "HIGH"
    elif total_count >= 5:
        density = "MEDIUM"
    else:
        density = "LOW"

    # Primary class detected
    primary_class = max(breakdown, key=breakdown.get) if total_count > 0 else "car"
    avg_conf = round(sum(d["confidence"] for d in detections) / len(detections), 2) if detections else 0.85

    return {
        "total_count": total_count,
        "breakdown": breakdown,
        "density": density,
        "primary_class": primary_class,
        "confidence": avg_conf,
        "detections": detections,
        "annotated_frame": annotated_frame
    }


def make_vehicle_payload(
    detect_res,
    bus_id="BUS-102",
    route_id="ROUTE-18",
    lat=19.0760,
    lng=72.8777
):
    """
    Build standard API contract payload for vehicle count event.

    The YOLO annotated frame is converted to JPEG + Base64 so the
    frontend can display the actual vehicle-detection evidence image.
    """
    now = datetime.now(timezone.utc).isoformat()

    image_base64 = None

    # Convert YOLO annotated frame into Base64 JPEG
    annotated_frame = detect_res.get("annotated_frame")

    if annotated_frame is not None:
        success, buffer = cv2.imencode(
            ".jpg",
            annotated_frame,
            [cv2.IMWRITE_JPEG_QUALITY, 85]
        )

        if success:
            image_base64 = base64.b64encode(
                buffer.tobytes()
            ).decode("utf-8")

    return {
        "event_type": "vehicle_count",
        "confidence": detect_res["confidence"],
        "latitude": lat,
        "longitude": lng,
        "timestamp": now,
        "bus_id": bus_id,

        # Actual YOLO annotated evidence image
        "image_base64": image_base64,

        "extra": {
            "vehicle_class": detect_res["primary_class"],
            "count": detect_res["total_count"],
            "breakdown": detect_res["breakdown"],
            "density": detect_res["density"],
            "route_id": route_id
        }
    }


def make_congestion_payload(
    detect_res,
    bus_id="BUS-102",
    route_id="ROUTE-18",
    lat=19.0760,
    lng=72.8777
):
    """
    Build standard API contract payload for congestion event
    with the actual YOLO annotated evidence image.
    """
    now = datetime.now(timezone.utc).isoformat()
    severity = "HIGH" if detect_res["total_count"] >= 15 else "MEDIUM"

    image_base64 = None

    # Reuse the same YOLO annotated frame
    annotated_frame = detect_res.get("annotated_frame")

    if annotated_frame is not None:
        success, buffer = cv2.imencode(
            ".jpg",
            annotated_frame,
            [cv2.IMWRITE_JPEG_QUALITY, 85]
        )

        if success:
            image_base64 = base64.b64encode(
                buffer.tobytes()
            ).decode("utf-8")

    return {
        "event_type": "congestion",
        "confidence": detect_res["confidence"],
        "latitude": lat,
        "longitude": lng,
        "timestamp": now,
        "bus_id": bus_id,

        # Actual YOLO annotated evidence image
        "image_base64": image_base64,

        "extra": {
            "severity": severity,
            "density": detect_res["density"],
            "vehicle_count": detect_res["total_count"],
            "route_id": route_id
        }
    }


def process_video(
    video_path,
    backend_url="http://127.0.0.1:5000/api/events",
    bus_id="BUS-102",
    lat=19.0760,
    lng=72.8777
):
    """Process a video file, detect vehicles at intervals, and POST events to backend."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"ERROR: Could not open video: {video_path}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    check_every_n_frames = max(1, int(fps * 4))
    frame_number = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_number % check_every_n_frames == 0:
            res = detect_vehicles(frame)
            timestamp_sec = frame_number / fps
            print(f"--- Checkpoint at {timestamp_sec:.1f}s (frame {frame_number}) ---")
            print(f"Total: {res['total_count']}, Density: {res['density']}")
            print(f"Breakdown: {res['breakdown']}")

            payload = make_vehicle_payload(res, bus_id=bus_id, lat=lat, lng=lng)
            try:
                response = requests.post(backend_url, json=payload, timeout=3)
                print(f"  Sent vehicle event -> status {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"  Failed to send vehicle event: {e}")

        frame_number += 1

    cap.release()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
        ext = Path(target).suffix.lower()
        if ext in [".mp4", ".avi", ".mov", ".mkv"]:
            process_video(target)
        else:
            res = detect_vehicles(target)
            print("Vehicle Detection Result:")
            print(f"Total Vehicles: {res['total_count']}")
            print(f"Breakdown     : {res['breakdown']}")
            print(f"Density       : {res['density']}")
    else:
        sample_video = "sample_videos/15125831_1920_1080_30fps.mp4"
        if Path(sample_video).exists():
            process_video(sample_video)
        else:
            print("Usage: python detect.py <image_or_video_path>")
