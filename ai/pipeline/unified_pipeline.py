"""
Unified Mobile Urban Intelligence Video Pipeline
=================================================
Runs Pothole Detection, Vehicle Counting / Congestion Density, and ANPR OCR
concurrently across bus camera video streams, posting standard JSON events to the backend.

Usage:
    python ai/pipeline/unified_pipeline.py [video_path]
"""
import sys
import os
import time
import base64
from datetime import datetime, timezone
from pathlib import Path
import cv2
import requests

PIPELINE_DIR = Path(__file__).resolve().parent
AI_DIR = PIPELINE_DIR.parent
PROJECT_ROOT = AI_DIR.parent


# -------------------------------------------------------------
# Load detector modules explicitly.
# Each detector folder contains a file named detect.py, so we
# must load them by their actual file path to avoid module-name
# conflicts.
# -------------------------------------------------------------
import importlib.util


def load_detector_module(module_name, file_path):
    spec = importlib.util.spec_from_file_location(
        module_name,
        str(file_path)
    )

    if spec is None or spec.loader is None:
        raise ImportError(
            f"Could not load detector module: {file_path}"
        )

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


POTHOLE_DETECTOR = load_detector_module(
    "pothole_detector",
    AI_DIR / "pothole" / "detect.py"
)

VEHICLE_DETECTOR = load_detector_module(
    "vehicle_detector",
    AI_DIR / "vehicle" / "detect.py"
)

ANPR_DETECTOR = load_detector_module(
    "anpr_detector",
    AI_DIR / "anpr" / "detect.py"
)


# Pothole functions
detect_potholes = POTHOLE_DETECTOR.detect_potholes


# Vehicle functions
detect_vehicles = VEHICLE_DETECTOR.detect_vehicles
make_vehicle_payload = VEHICLE_DETECTOR.make_vehicle_payload
make_congestion_payload = VEHICLE_DETECTOR.make_congestion_payload


# ANPR functions
detect_anpr = ANPR_DETECTOR.detect_anpr
make_anpr_payload = ANPR_DETECTOR.make_anpr_payload

API_URL = os.environ.get("API_URL", "http://127.0.0.1:5000/api/events")
BUS_ID = "BUS-102"
ROUTE_ID = "ROUTE-18"
DEFAULT_LAT = 19.0760
DEFAULT_LNG = 72.8777

COOLDOWN_POTHOLE = 3.0
COOLDOWN_VEHICLE = 5.0
COOLDOWN_ANPR = 8.0

FRAME_SKIP = 2


def send_event_to_backend(payload, api_url=API_URL):
    try:
        res = requests.post(api_url, json=payload, timeout=5)
        res.raise_for_status()
        data = res.json()
        print(f"  [API] Event POSTed ({payload['event_type']}) -> ID: {data.get('id')}")
        return data.get("id")
    except requests.exceptions.ConnectionError:
        print(f"  [API Warning] Backend unreachable at {api_url}")
    except Exception as e:
        print(f"  [API Error] {e}")
    return None


def run_unified_pipeline(video_path=None, api_url=API_URL, max_frames=300):
    print("=" * 60)
    print("  URBAN INTELLIGENCE PLATFORM -- UNIFIED AI VIDEO PIPELINE")
    print("=" * 60)

    cap = None
    if video_path and Path(video_path).exists():
        cap = cv2.VideoCapture(str(video_path))
        print(f"  Processing Video: {video_path}")
    else:
        print("  No video file provided or found. Running simulated stream...")

    last_pothole_time = 0
    last_vehicle_time = 0
    last_anpr_time = 0

    frame_count = 0
    events_sent = 0

    while frame_count < max_frames:
        if cap and cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
        else:
            # Generate simulated frame
            import numpy as np
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "SIMULATED BUS CAMERA FEED", (50, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            time.sleep(0.1)

        frame_count += 1
        if frame_count % FRAME_SKIP != 0:
            continue

        now = time.time()

        # -------------------------------------------------------------
        # 1. POTHOLE DETECTION
        # -------------------------------------------------------------
        if now - last_pothole_time >= COOLDOWN_POTHOLE:
            try:
                p_res = detect_potholes(frame)
                if p_res and p_res.get("detection_count", 0) > 0:
                    for det in p_res["detections"]:
                        conf = det["confidence"]
                        sev = "HIGH" if conf >= 0.85 else ("MEDIUM" if conf >= 0.65 else "LOW")
                        
                        img_b64 = None
                        if p_res.get("evidence_image") and Path(p_res["evidence_image"]).exists():
                            with open(p_res["evidence_image"], "rb") as f:
                                img_b64 = base64.b64encode(f.read()).decode("utf-8")

                        payload = {
                            "event_type": "pothole",
                            "confidence": conf,
                            "latitude": DEFAULT_LAT,
                            "longitude": DEFAULT_LNG,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "bus_id": BUS_ID,
                            "image_base64": img_b64,
                            "extra": {
                                "severity": sev,
                                "route_id": ROUTE_ID,
                                "bbox": det["bbox"]
                            }
                        }
                        send_event_to_backend(payload, api_url)
                        events_sent += 1
                    last_pothole_time = now
            except Exception as e:
                pass

        # -------------------------------------------------------------
        # 2. VEHICLE & TRAFFIC DENSITY DETECTION
        # -------------------------------------------------------------
        if now - last_vehicle_time >= COOLDOWN_VEHICLE:
            try:
                v_res = detect_vehicles(frame)
                if v_res["density"] == "HIGH":
                    c_payload = make_congestion_payload( v_res,bus_id=BUS_ID,route_id=ROUTE_ID,lat=DEFAULT_LAT, lng=DEFAULT_LNG)
                    send_event_to_backend(c_payload, api_url)
                    events_sent += 1

                    if v_res["density"] == "HIGH":
                        c_payload = make_congestion_payload(v_res, bus_id=BUS_ID, route_id=ROUTE_ID, lat=DEFAULT_LAT, lng=DEFAULT_LNG)
                        send_event_to_backend(c_payload, api_url)
                        events_sent += 1

                    last_vehicle_time = now
            except Exception as e:
                pass

        # -------------------------------------------------------------
        # 3. ANPR LICENSE PLATE DETECTION
        # -------------------------------------------------------------
        if now - last_anpr_time >= COOLDOWN_ANPR:
            try:
                a_res = detect_anpr(frame)
                if a_res:
                    a_payload = make_anpr_payload(a_res, bus_id=BUS_ID, lat=DEFAULT_LAT, lng=DEFAULT_LNG)
                    send_event_to_backend(a_payload, api_url)
                    events_sent += 1
                    last_anpr_time = now
            except Exception as e:
                pass

    if cap:
        cap.release()

    print()
    print(f"  Pipeline Finished. Frames Processed: {frame_count}, Events Sent: {events_sent}")
    print("=" * 60)


if __name__ == "__main__":
    v_path = sys.argv[1] if len(sys.argv) > 1 else None
    run_unified_pipeline(v_path)
