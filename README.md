# Urban Intelligence Platform — AI-Powered Mobile Urban Sensing via Public Transport Fleet

SIH Internal Hackathon Project | Org: Bharat Electronics

## What this repo contains (Day 1 scaffold)

This is the starting skeleton for the 8-day build. It is intentionally minimal but **runnable end-to-end** on Day 1: a fake event generator sends mock detections to the backend, and the dashboard shows them live on a map. From Day 2 onward, each team member replaces one piece of this with real logic.

```
urban-intelligence-platform/
├── ai/            <- AI teammate(s): pothole, vehicle, anpr models + the pipeline that ties them together
├── backend/       <- Backend teammate: Flask API + SQLite database
├── frontend/      <- Frontend teammate: dashboard (map, event feed, charts)
├── simulation/    <- Fake event generator (stands in for a real bus + camera until AI models are ready)
├── docs/          <- Architecture notes, API contract, dataset links, day plan
└── README.md
```

## Quick start (run this today, Day 1)

### 1. Backend (Terminal 1)
```bash
cd backend
pip install -r requirements.txt --break-system-packages
python app.py
```
Runs on **http://localhost:5000**

### 2. Frontend (Terminal 2)
```bash
cd frontend/pages
python -m http.server 8080
```
Open **http://localhost:8080** in your browser. You should see a map of the city (edit the default coordinates in `frontend/pages/index.html` if your city is different).

### 3. Simulate events (Terminal 3)
```bash
cd simulation
pip install requests --break-system-packages
python fake_event_generator.py
```
This sends fake pothole/vehicle/ANPR events to the backend every few seconds, along the mock GPS route in `simulation/mock_route.json`. Watch them appear live on the dashboard map.

**If all three of these run and you see pins appear on the map — Day 1 target is done.** Everyone can now build their real piece against this same contract without waiting on each other.

## Team split
| Folder | Owner | Job |
|---|---|---|
| `ai/pothole/` | AI teammate 1 | Fine-tune YOLOv8 on pothole dataset, output detections in the shared event JSON format |
| `ai/vehicle/` | AI teammate 2 | Pretrained YOLOv8 (COCO) for vehicle detection/counting — no training needed |
| `ai/anpr/` | AI teammate 3 (or same as above) | Plate detection + OCR (EasyOCR), attach confidence score |
| `ai/pipeline/` | Whoever finishes first | Combines all 3 detectors, reads video frame-by-frame, posts events to backend (replaces `simulation/fake_event_generator.py`) |
| `backend/` | Backend teammate | Flask API, database, replace SQLite with something bigger only if you have time to spare |
| `frontend/` | Frontend teammate | Map, heatmap, event feed table, analytics panel |
| `docs/` | Everyone | Keep `docs/api_contract.md` updated — it's the one source of truth for what an "event" looks like |

See `docs/` for the API contract, dataset links, architecture notes, and the day-by-day plan.
