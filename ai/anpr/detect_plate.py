import cv2
import os
import re
import requests
import easyocr
import numpy as np
from datetime import datetime, timezone
from collections import Counter
from ultralytics import YOLO

VIDEO_PATH = "sample_videos/6571483-hd_1920_1080_30fps.mp4"
BACKEND_URL = "http://127.0.0.1:5050/api/events"
BUS_ID = "BUS-001"
LATITUDE = 19.0760
LONGITUDE = 72.8777

MIN_DETECT_CONF = 0.5
MIN_OCR_CONF = 0.2  # CHANGED: lowered — correction step cleans up text, so we don't want to
                     # throw away readable-but-imperfect OCR before it gets a chance to be corrected.
                     # Final decision to SEND still requires PLATE_PATTERN match, which is the real gate.

PLATE_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

CROP_DIR = "crops"
os.makedirs(CROP_DIR, exist_ok=True)

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

recent_plates = []   # list of dicts: {center, readings: [text,...], sent, last_seen_frame}
MAX_CENTER_DIST = 80
FORGET_AFTER_FRAMES = int(fps * 5)

# CHANGED: Indian plate format SS DD LL(L) DDDD, and OCR confusion correction tables
LETTER_TO_DIGIT = {'O': '0', 'I': '1', 'Z': '2', 'S': '5', 'B': '8', 'G': '6', 'T': '1'}
DIGIT_TO_LETTER = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G'}
PLATE_PATTERN = re.compile(r'^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$')


def preprocess_crop(crop):
    """CHANGED: stronger preprocessing — bigger upscale, sharpen, adaptive threshold."""
    crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)

    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    gray = cv2.filter2D(gray, -1, kernel)

    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 15
    )
    return thresh


def correct_plate_format(text):
    """
    CHANGED: force-fit OCR text into known Indian plate structure SS DD LL(L) DDDD,
    correcting digit/letter confusion per-position. Returns corrected text,
    or None if it can't be made to fit (wrong length = segmentation error, not fixable here).
    """
    text = text.replace(" ", "").upper()

    for total_len, letter_group_len in [(10, 2), (9, 1)]:
        if len(text) != total_len:
            continue

        chars = list(text)
        pos = 0
        for _ in range(2):  # state letters
            if chars[pos].isdigit():
                chars[pos] = DIGIT_TO_LETTER.get(chars[pos], chars[pos])
            pos += 1
        for _ in range(2):  # district digits
            if chars[pos].isalpha():
                chars[pos] = LETTER_TO_DIGIT.get(chars[pos], chars[pos])
            pos += 1
        for _ in range(letter_group_len):  # series letters
            if chars[pos].isdigit():
                chars[pos] = DIGIT_TO_LETTER.get(chars[pos], chars[pos])
            pos += 1
        for _ in range(4):  # plate number digits
            if chars[pos].isalpha():
                chars[pos] = LETTER_TO_DIGIT.get(chars[pos], chars[pos])
            pos += 1

        candidate = "".join(chars)
        if PLATE_PATTERN.match(candidate):
            return candidate

    return None


def vote_best_reading(readings):
    """
    CHANGED: given multiple corrected readings of the SAME tracked plate (collected
    across frames), pick the most common length, then majority-vote each character
    position. This fixes segmentation errors (extra/missing char in one frame) as
    long as most reads agree on length.
    """
    if not readings:
        return None

    length_counts = Counter(len(r) for r in readings)
    best_length, _ = length_counts.most_common(1)[0]
    same_length = [r for r in readings if len(r) == best_length]

    voted_chars = []
    for i in range(best_length):
        col = [r[i] for r in same_length]
        most_common_char, _ = Counter(col).most_common(1)[0]
        voted_chars.append(most_common_char)

    voted = "".join(voted_chars)
    return voted if PLATE_PATTERN.match(voted) else same_length[-1]


def find_match(center):
    for p in recent_plates:
        dist = np.hypot(p["center"][0] - center[0], p["center"][1] - center[1])
        if dist < MAX_CENTER_DIST:
            return p
    return None


def cleanup_old(frame_number):
    global recent_plates
    recent_plates = [
        p for p in recent_plates
        if frame_number - p["last_seen_frame"] <= FORGET_AFTER_FRAMES
    ]


def send_event(plate_text, ocr_conf):
    payload = {
        "event_type": "anpr_alert",
        "confidence": round(ocr_conf, 2),
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


while True:
    ret, frame = cap.read()
    if not ret:
        break

    if frame_number % check_every_n_frames == 0:
        cleanup_old(frame_number)

        results = plate_model(frame, verbose=False)
        boxes = results[0].boxes

        for i, box in enumerate(boxes):
            detect_confidence = box.conf[0].item()
            if detect_confidence < MIN_DETECT_CONF:
                continue

            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            cropped_plate = frame[y1:y2, x1:x2]

            if cropped_plate.size == 0:
                continue

            crop_filename = os.path.join(CROP_DIR, f"frame{frame_number}_box{i}.jpg")
            ok = cv2.imwrite(crop_filename, cropped_plate)
            if not ok:
                print(f"  WARNING: failed to save crop to {crop_filename}")

            processed = preprocess_crop(cropped_plate)
            ocr_results = ocr_reader.readtext(processed, allowlist=PLATE_ALLOWLIST)

            if len(ocr_results) == 0:
                continue

            plate_text = "".join([text for (_, text, _) in ocr_results]).strip()
            avg_ocr_confidence = sum([conf for (_, _, conf) in ocr_results]) / len(ocr_results)

            if avg_ocr_confidence < MIN_OCR_CONF:
                continue

            # CHANGED: try to snap raw OCR text to valid plate format
            corrected = correct_plate_format(plate_text)
            display_text = corrected if corrected else plate_text

            print(f"Frame {frame_number}: raw='{plate_text}' corrected='{corrected}' "
                  f"detect_conf={detect_confidence:.2f} ocr_conf={avg_ocr_confidence:.2f} "
                  f"crop='{crop_filename}'")

            if corrected is None:
                continue  # wrong length even after correction -> segmentation error, skip sending

            center = ((x1 + x2) / 2, (y1 + y2) / 2)
            match = find_match(center)

            if match is None:
                recent_plates.append({
                    "center": center,
                    "readings": [corrected],
                    "sent": False,
                    "last_seen_frame": frame_number,
                })
                match = recent_plates[-1]
            else:
                match["readings"].append(corrected)
                match["last_seen_frame"] = frame_number

            # CHANGED: only send once we have at least 2 corrected readings to vote across,
            # OR immediately if a single reading came in with very high confidence.
            if len(match["readings"]) >= 2 or avg_ocr_confidence >= 0.9:
                voted = vote_best_reading(match["readings"])
                if voted and not match["sent"]:
                    send_event(voted, avg_ocr_confidence)
                    match["sent"] = True

    frame_number += 1

cap.release()
print(f"\nDone. Crops saved to ./{CROP_DIR}/")