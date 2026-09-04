import sys
from datetime import datetime
from pathlib import Path
import cv2
from ultralytics import YOLO

# Get current pothole folder
BASE_DIR = Path(__file__).resolve().parent

# Directory for saving annotated evidence images
EVIDENCE_DIR = BASE_DIR / "evidence"

# Trained model
MODEL_PATH = BASE_DIR / "models" / "best.pt"

# Load model
model = YOLO(str(MODEL_PATH))


def detect_potholes(image_path, confidence=0.25):
    """
    Detect potholes in an image, generate annotated evidence image if detected,
    and return detection results.
    """
    image_path = Path(image_path)

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    results = model.predict(
        source=str(image_path),
        conf=confidence,
        verbose=False
    )

    detections = []

    for result in results:
        if result.boxes is None:
            continue

        for box in result.boxes:
            score = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            detections.append({
                "event_type": "pothole",
                "confidence": round(score, 3),
                "bbox": {
                    "x1": round(x1, 2),
                    "y1": round(y1, 2),
                    "x2": round(x2, 2),
                    "y2": round(y2, 2)
                }
            })

    evidence_image_path = None

    if detections:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        evidence_file = EVIDENCE_DIR / f"pothole_{timestamp}.jpg"
        annotated_frame = results[0].plot()
        cv2.imwrite(str(evidence_file), annotated_frame)
        evidence_image_path = str(evidence_file.resolve())

    return {
        "event_type": "pothole",
        "detections": detections,
        "detection_count": len(detections),
        "evidence_image": evidence_image_path
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("python detect.py <image_path>")
        sys.exit(1)

    image_path = sys.argv[1]

    print("Pothole Detection")
    print("-----------------")
    print(f"Image: {image_path}")

    try:
        result = detect_potholes(image_path)
        detections = result["detections"]

        print(f"Detections: {result['detection_count']}")

        for i, detection in enumerate(detections, start=1):
            print(f"\nPothole #{i}")
            print(f"Confidence: {detection['confidence']:.2f}")
            print(f"Bounding Box: {detection['bbox']}")

        if result["evidence_image"]:
            print(f"\nEvidence image:\n{result['evidence_image']}")
        else:
            print("\nNo potholes detected.")

    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)