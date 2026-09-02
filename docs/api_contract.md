# API Contract

This is the **one shape everyone builds against** — AI, backend, and frontend teammates should not need to renegotiate this mid-week. If it needs to change, update this file first and message the team.

## Event object (what every detector sends)

```json
{
  "event_type": "pothole",
  "confidence": 0.87,
  "latitude": 19.4560,
  "longitude": 72.8110,
  "timestamp": "2026-09-02T10:15:30Z",
  "bus_id": "BUS-001",
  "image_base64": "optional, small snapshot as base64 string",
  "extra": {
    "plate_number": "MH04AB1234",
    "vehicle_class": "car"
  }
}
```

- `event_type`: one of `pothole`, `road_damage`, `waterlogging`, `vehicle_count`, `congestion`, `anpr_alert`, `rash_driving`
- `confidence`: float 0–1
- `latitude` / `longitude`: from GPS (mocked for now via `simulation/mock_route.json`)
- `timestamp`: ISO 8601, UTC
- `bus_id`: which bus/unit generated this (useful once you simulate a "fleet" of 2-3 buses)
- `image_base64`: optional — only include for events that need visual evidence (pothole photo, plate crop)
- `extra`: free-form dict for event-specific fields (plate number + confidence, vehicle class, vehicle count in frame, etc.)

## Endpoints (backend/api)

### `POST /api/events`
Body: one event object (above). Backend stores it and returns the stored record with an assigned `id`.

### `GET /api/events`
Returns all stored events (optionally filter with `?event_type=pothole` or `?bus_id=BUS-001`). Used by the frontend to populate the map and event feed.

### `GET /api/events/heatmap`
Returns just `[{latitude, longitude, weight}]` — lightweight, used for the heatmap layer.

### `GET /api/stats`
Returns simple counts: total events today, events by type, busiest route/area. Used for the analytics panel.

## Rule of thumb
Whoever finishes their detector first should send events in **exactly** this format — that's what lets the frontend and backend keep working without waiting for every AI piece to be "done."
