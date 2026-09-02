# Vehicle Detection, Classification & Counting

## Goal
Detect and count vehicles (car/bus/truck/motorbike) per frame to estimate density/congestion. Output `event_type: "vehicle_count"` or `"congestion"`.

## Suggested approach (zero training needed)
1. `pip install ultralytics`
2. Use the **pretrained** YOLOv8 COCO weights directly — no fine-tuning required:
   ```python
   from ultralytics import YOLO
   model = YOLO("yolov8n.pt")  # auto-downloads pretrained weights
   results = model(frame, classes=[2, 3, 5, 7])  # car, motorcycle, bus, truck (COCO class ids)
   ```
3. Count detections per class per frame → that's your vehicle count.
4. If count per frame exceeds a threshold you decide (e.g. >15 vehicles in view), emit a `congestion` event instead of / in addition to `vehicle_count`.

## Output contract
```json
{"event_type": "vehicle_count", "confidence": 0.9, "extra": {"vehicle_class": "car", "count": 12}, ...}
```
Hand off to `ai/pipeline/`.
