# Architecture

```
[ Pre-recorded video ]  --->  [ ai/pipeline ]  --->  POST /api/events  --->  [ backend + SQLite ]
      (simulates a bus            (runs pothole /            (docs/api_contract.md)          |
       camera feed)                vehicle / anpr                                            v
                                    detectors on frames,                             [ frontend dashboard ]
                                    packages event JSON,                              map + heatmap + feed
                                    reads mock GPS from
                                    simulation/mock_route.json)
```

## Layers

1. **Onboard / Edge (simulated)** — `ai/` folder. Reads a video file frame-by-frame, runs detection models, attaches mock GPS + timestamp, sends only small event JSON (not raw video) onward. This is the "bandwidth-efficient edge processing" claim.
2. **Communication** — plain REST (`POST /api/events`). No need for anything fancier for a hackathon demo.
3. **Centralized platform** — `backend/` (Flask + SQLite) stores events and serves them; `frontend/` (Leaflet map + charts) visualizes them live.

## Why this shape
- Each layer only needs to know the **event JSON contract** (see `docs/api_contract.md`) to work independently — AI, backend, and frontend teams can build in parallel from Day 1.
- `simulation/fake_event_generator.py` sends fake events in the same contract shape, so backend + frontend teammates never have to wait on the AI models being ready — they build against fake data first, then swap in `ai/pipeline` once it's ready.

## Database
SQLite for the demo (`backend/database/events.db`, auto-created on first run). One table: `events`, columns matching the event JSON. No need for anything heavier in 8 days.

## Deployment for the demo
Everything runs locally on one laptop (backend + frontend + simulation/pipeline all on localhost). No cloud deployment needed unless you have spare time on Day 8.
