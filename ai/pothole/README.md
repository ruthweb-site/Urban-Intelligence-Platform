# Pothole / Road Damage Detection

## Goal
Given a video frame, detect potholes / road damage and output an event matching `docs/api_contract.md` (`event_type: "pothole"` or `"road_damage"`).

## Suggested approach (no training from scratch)
1. Get a dataset (see `docs/datasets.md`) — e.g. https://universe.roboflow.com/project-yjhi5/pothole-detection-bqu6s-dwjbo (2475 images, pretrained model also available directly on that page — you may not even need to fine-tune).
2. If fine-tuning: use Ultralytics YOLOv8 (`pip install ultralytics`), fine-tune `yolov8n.pt` or `yolov8s.pt` on the dataset for 30-60 epochs on a free Google Colab GPU (~30-60 min).
3. Export weights (`best.pt`) into this folder.
4. Write `detect.py` here that: loads `best.pt`, takes a frame (numpy array or image path), returns `[{"confidence": float, "bbox": [...]}]`.

## Output contract
When a detection's confidence is above your threshold (start with 0.5), package it as:
```json
{"event_type": "pothole", "confidence": 0.87, ...(rest filled in by ai/pipeline)}
```
Hand this off to `ai/pipeline/` which adds GPS + timestamp and POSTs it to the backend.
