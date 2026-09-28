# Urban Intelligence Platform — Technical Architecture

This document provides a detailed breakdown of the architectural tiers, data flow, edge computing trade-offs, and communication contracts for the Urban Intelligence Platform (UIP).

![System Architecture Diagram](../architecture%20diagram%20bus.png)

---

## 1. High-Level System Architecture Diagram

```mermaid
flowchart TB
    subgraph Fleet["🚌 Layer 1: Edge Sensing & Vehicle Fleet (Simulated / Physical)"]
        direction TB
        Dashcam["📹 HD Vehicle Camera / Video Stream"]
        GPS["🛰️ GPS Telemetry Node (Latitude, Longitude, Speed)"]
        
        subgraph EdgeAI["🧠 Onboard Edge AI Inference Pipeline"]
            direction LR
            PotholeYOLO["🕳️ YOLOv8 Pothole & Road Defect Detector"]
            VehicleYOLO["🚗 YOLOv8 Multi-Class Vehicle & Traffic Density"]
            ANPR["🔍 Plate Detector + EasyOCR + Voting Engine"]
        end
        
        Snap["🖼️ Base64 Visual Evidence Compressor"]
        Packager["📦 Unified Telemetry & Event Packager"]

        Dashcam --> EdgeAI
        GPS --> Packager
        EdgeAI --> Snap
        Snap --> Packager
    end

    subgraph Transport["📡 Layer 2: Network & Ingestion Gateway"]
        direction TB
        HTTPS["🔒 Secure REST API (POST /api/events)"]
        Flask["⚡ Flask API Gateway (app.py)"]
        RedisQueue["📨 Redis Broker & Message Queue"]
        CeleryWorker["⚙️ Celery Background Async Workers"]

        Packager -- "Low-Bandwidth JSON + Evidence" --> HTTPS
        HTTPS --> Flask
        Flask --> RedisQueue
        RedisQueue --> CeleryWorker
    end

    subgraph Storage["💾 Layer 3: Caching & Multi-Tier Persistence"]
        direction TB
        RedisCache[("⚡ Redis Cache: Sub-millisecond Hot Data")]
        MongoDB[("🍃 MongoDB: Geospatial Indexes, Events & Tickets")]
        SQLite[("📁 SQLite Fallback: Zero-Config Offline Mode")]

        Flask <--> RedisCache
        Flask <--> MongoDB
        Flask <--> SQLite
        CeleryWorker --> MongoDB
    end

    subgraph UI["🖥️ Layer 4: Visualization & Municipal Command Center"]
        direction TB
        Dashboard["🗺️ Tactical Command Dashboard (Map, Live Feed, Filters)"]
        EvidenceViewer["🔍 Interactive AI Visual Evidence Modal"]
        BusMonitor["📟 In-Cabin Driver & Vehicle Telemetry Terminal"]
        Analytics["📈 Municipal Analytics, Heatmaps & Road Health"]

        Flask -- "GET /api/events, /heatmap, /stats" --> Dashboard
        Dashboard --> EvidenceViewer
        Flask -- "GET /api/buses, /api/impact" --> BusMonitor
        Flask -- "GET /api/road-health, /api/tickets" --> Analytics
    end

    classDef edge fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#fff;
    classDef transport fill:#0f172a,stroke:#818cf8,stroke-width:2px,color:#fff;
    classDef storage fill:#1e1e24,stroke:#34d399,stroke-width:2px,color:#fff;
    classDef ui fill:#18181b,stroke:#f59e0b,stroke-width:2px,color:#fff;

    class Fleet,Dashcam,GPS,EdgeAI,PotholeYOLO,VehicleYOLO,ANPR,Snap,Packager edge;
    class Transport,HTTPS,Flask,RedisQueue,CeleryWorker transport;
    class Storage,RedisCache,MongoDB,SQLite storage;
    class UI,Dashboard,EvidenceViewer,BusMonitor,Analytics ui;
```

---

## 2. Architectural Tiers

### Tier 1: Edge Sensing & Vehicle Fleet
- **Hardware Profile**: Designed to run on embedded edge accelerators (e.g., NVIDIA Jetson Orin Nano, Raspberry Pi 5 with Coral TPU) mounted on public transit buses.
- **Inference Pipeline**:
  - **Pothole Detection**: Custom fine-tuned YOLOv8 model running on incoming camera frames. When defect confidence crosses threshold (e.g. $\ge 0.50$), it computes bounding boxes and extracts visual crops.
  - **Traffic & Congestion Analyzer**: Pretrained YOLOv8 detects 4 vehicle classes (cars, motorcycles, buses, trucks). Calculates aggregate vehicle count and classifies traffic density into `LOW`, `MEDIUM`, or `HIGH` every checkpoint interval (e.g., 4 seconds).
  - **ANPR Engine**: Multi-stage detection using plate localization, bilateral filtering, adaptive Gaussian thresholding, Indian license plate format validation, and multi-frame voting across adjacent frames to ensure character accuracy.
- **Bandwidth Optimization**: Instead of streaming continuous gigabytes of raw video footage over 4G/LTE, the edge device transmits only structured JSON telemetry packets (typically 1–2 KB) with compressed base64 JPEG crops only when an anomaly is confirmed.

---

### Tier 2: Ingestion & API Gateway
- **Flask REST Gateway**: Receives standardized events via `POST /api/events`. Validates payload structure, checks required fields, and normalizes timestamp formats.
- **Asynchronous Task Processing**: High-throughput bursts are pushed to Redis queues and picked up by background Celery worker processes to prevent blocking client HTTP responses.

---

### Tier 3: Caching & Persistence
- **Redis In-Memory Cache**:
  - Caches high-frequency endpoints (`/api/events`, `/api/stats`, `/api/events/heatmap`, `/api/buses`).
  - Active cache invalidation triggers whenever new events are received or ticket statuses change.
- **Dual Engine Storage**:
  - **MongoDB**: Primary production database utilizing 2dsphere geospatial indexing for radius and bounding box spatial queries.
  - **SQLite**: Automatic zero-configuration fallback for offline testing, local demonstrations, and rapid prototyping.

---

### Tier 4: Municipal Command Center
- **Tactical Real-time Dashboard**: Built with Leaflet.js and responsive vanilla CSS/JS. Visualizes bus locations, hot-spots, and recent incidents with color-coded severity markers.
- **Interactive Evidence Viewer**: Allows municipal operators to view the original annotated image with the AI bounding box, verifying road maintenance tickets before dispatching work crews.
- **In-Bus Telemetry Terminal**: Provides drivers and conductors with a live cockpit display showing route speed, nearest GPS checkpoint, and real-time road hazard alerts ahead.
- **Analytics & Health Intelligence**: Offers aggregated reports on road degradation rates, traffic density histories, and ANPR identification logs.
