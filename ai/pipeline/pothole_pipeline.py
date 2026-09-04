"""
Pothole AI Event Pipeline
=========================
Bridges the pothole detector (ai/pothole/detect.py) to the backend API.

Takes a detection result, attaches bus/route/GPS metadata, calculates a
prototype severity score, and POSTs the event to the backend.

Usage:
    python ai/pipeline/pothole_pipeline.py <image_path>

The backend (python backend/app.py) must be running on the configured URL.
"""
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Resolve project paths so we can import the pothole detector regardless of
# which directory the script is invoked from.
# ---------------------------------------------------------------------------
PIPELINE_DIR = Path(__file__).resolve().parent          # ai/pipeline/
AI_DIR = PIPELINE_DIR.parent                            # ai/
PROJECT_ROOT = AI_DIR.parent                            # project root
POTHOLE_DIR = AI_DIR / "pothole"

# Add ai/pothole/ to sys.path so we can "from detect import detect_potholes"
if str(POTHOLE_DIR) not in sys.path:
    sys.path.insert(0, str(POTHOLE_DIR))

from detect import detect_potholes  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
API_URL = "http://127.0.0.1:5000/api/events"


# ---------------------------------------------------------------------------
# Severity calculation (prototype)
# ---------------------------------------------------------------------------
def calculate_severity(confidence):
    """
    Prototype severity rule based on detection confidence.

    NOTE: This is a simplified heuristic for the SIH 2026 demo,
    NOT an official municipal road-assessment standard. A production
    system would incorporate pothole dimensions, depth estimation,
    road class, and traffic volume.

    Thresholds:
        confidence >= 0.85  ->  HIGH
        confidence >= 0.65  ->  MEDIUM
        otherwise           ->  LOW
    """
    if confidence >= 0.85:
        return "HIGH"
    elif confidence >= 0.65:
        return "MEDIUM"
    else:
        return "LOW"


# ---------------------------------------------------------------------------
# Main pipeline function
# ---------------------------------------------------------------------------
def process_pothole_frame(
    image_path,
    bus_id="BUS-102",
    route_id="ROUTE-18",
    camera_id="CAM-01",
    latitude=19.0760,
    longitude=72.8777,
    api_url=API_URL,
):
    """
    End-to-end pothole event pipeline.

    1. Runs the YOLO pothole detector on the given image.
    2. For each detection, builds an event payload that conforms to the
       existing API contract (required fields + extra JSON).
    3. POSTs each event to the backend.

    Parameters
    ----------
    image_path : str or Path
        Path to the image file to analyse.
    bus_id, route_id, camera_id : str
        Fleet metadata attached at the pipeline layer.
    latitude, longitude : float
        GPS coordinates (simulated for prototype).
    api_url : str
        Backend endpoint for event creation.

    Returns
    -------
    dict
        Summary with keys: processed, events_created, events, errors.
    """
    result = {
        "processed": True,
        "image": str(image_path),
        "events_created": 0,
        "events": [],
        "errors": [],
    }

    # ------------------------------------------------------------------
    # Step 1: Run pothole detection
    # ------------------------------------------------------------------
    try:
        detection_result = detect_potholes(image_path)
    except FileNotFoundError as e:
        result["processed"] = False
        result["errors"].append(f"Image error: {e}")
        return result
    except Exception as e:
        result["processed"] = False
        result["errors"].append(f"Model error: {e}")
        return result

    detections = detection_result["detections"]
    detection_count = detection_result["detection_count"]
    evidence_image = detection_result["evidence_image"]

    # ------------------------------------------------------------------
    # Step 2: No potholes — nothing to send
    # ------------------------------------------------------------------
    if detection_count == 0:
        return result

    # ------------------------------------------------------------------
    # Step 3: Build and send one event per detection
    # ------------------------------------------------------------------
    now = datetime.now(timezone.utc).isoformat()

    # Extract just the filename from the evidence path for portability
    evidence_filename = Path(evidence_image).name if evidence_image else None

    for detection in detections:
        confidence = detection["confidence"]
        severity = calculate_severity(confidence)

        event_payload = {
            # --- 6 required fields (API contract) ---
            "event_type": "pothole",
            "confidence": confidence,
            "latitude": latitude,
            "longitude": longitude,
            "timestamp": now,
            "bus_id": bus_id,
            # --- extended metadata via extra ---
            "extra": {
                "severity": severity,
                "route_id": route_id,
                "camera_id": camera_id,
                "evidence_image": evidence_filename,
                "status": "OPEN",
                "source": "ai_pipeline",
                "detection_count": detection_count,
                "bbox": detection["bbox"],
            },
        }

        # POST to backend
        try:
            response = requests.post(api_url, json=event_payload, timeout=10)
            response.raise_for_status()
            resp_data = response.json()
            event_id = resp_data.get("id", "unknown")
            result["events"].append({
                "event_id": event_id,
                "severity": severity,
                "confidence": confidence,
                "status_code": response.status_code,
            })
            result["events_created"] += 1

        except requests.exceptions.ConnectionError:
            result["errors"].append(
                f"Backend unreachable at {api_url} -- is 'python app.py' running?"
            )
            break
        except requests.exceptions.Timeout:
            result["errors"].append(f"Request to {api_url} timed out.")
        except requests.exceptions.HTTPError as e:
            result["errors"].append(f"HTTP error: {e} -- Response: {response.text}")
        except Exception as e:
            result["errors"].append(f"Unexpected error sending event: {e}")

    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python ai/pipeline/pothole_pipeline.py <image_path>")
        print()
        print("Example:")
        print("  python ai/pipeline/pothole_pipeline.py ai/pothole/test_images/pothole.jpg")
        sys.exit(1)

    image_path = sys.argv[1]

    # --- DEMO / SIMULATED metadata ---
    # In production these would come from the bus's onboard systems (GPS,
    # fleet management, camera registry). For the prototype they are
    # hard-coded demo values.
    DEMO_BUS_ID = "BUS-102"
    DEMO_ROUTE_ID = "ROUTE-18"
    DEMO_CAMERA_ID = "CAM-01"
    DEMO_LATITUDE = 19.0760      # Mumbai (simulated)
    DEMO_LONGITUDE = 72.8777     # Mumbai (simulated)

    print("=" * 45)
    print("  POTHOLE AI EVENT PIPELINE")
    print("=" * 45)
    print()
    print(f"  Image   : {image_path}")
    print(f"  Bus     : {DEMO_BUS_ID}  [SIMULATED]")
    print(f"  Route   : {DEMO_ROUTE_ID}  [SIMULATED]")
    print(f"  Camera  : {DEMO_CAMERA_ID}")
    print(f"  GPS     : {DEMO_LATITUDE}, {DEMO_LONGITUDE}  [SIMULATED]")
    print()
    print("  Running pothole detection...")
    print()

    result = process_pothole_frame(
        image_path=image_path,
        bus_id=DEMO_BUS_ID,
        route_id=DEMO_ROUTE_ID,
        camera_id=DEMO_CAMERA_ID,
        latitude=DEMO_LATITUDE,
        longitude=DEMO_LONGITUDE,
    )

    if not result["processed"]:
        print("  Detection FAILED:")
        for err in result["errors"]:
            print(f"    x {err}")
        sys.exit(1)

    print(f"  Potholes detected: {result['events_created']}")
    print()

    for ev in result["events"]:
        print(f"  Confidence : {ev['confidence']:.2f}")
        print(f"  Severity   : {ev['severity']}")
        print(f"  Event ID   : {ev['event_id']}")
        print(f"  HTTP Status: {ev['status_code']}")
        print()

    if result["errors"]:
        print("  Errors:")
        for err in result["errors"]:
            print(f"    x {err}")
        print()

    if result["events_created"] > 0:
        print("  Event(s) created successfully.")
    else:
        print("  No potholes detected -- no events created.")

    print()
    print(f"  Backend: {API_URL}")
    print("=" * 45)
