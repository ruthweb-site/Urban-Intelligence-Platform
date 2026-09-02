# ANPR — License Plate Detection + OCR

## Goal
Detect a vehicle's number plate, read the text, and attach a confidence score. Output `event_type: "anpr_alert"`.

## Suggested approach
1. **Plate detection**: use a pretrained plate-detection model from Roboflow Universe (see `docs/datasets.md` for Indian-plate-specific datasets), or fine-tune YOLOv8 for ~30 epochs on an Indian plate dataset if the pretrained one isn't accurate enough.
2. **Text extraction (OCR)**: once you have a cropped plate image, run it through `easyocr` (pretrained, no training needed):
   ```python
   import easyocr
   reader = easyocr.Reader(['en'])
   result = reader.readtext(cropped_plate_image)
   # result gives [(bbox, text, confidence), ...]
   ```
3. Combine plate-detection confidence and OCR confidence into a single overall score (e.g. average, or just report both in `extra`).

## Output contract
```json
{"event_type": "anpr_alert", "confidence": 0.81, "extra": {"plate_number": "MH04AB1234", "ocr_confidence": 0.81}, ...}
```
Hand off to `ai/pipeline/`.
