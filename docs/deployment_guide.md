# Deployment Guide: Urban Intelligence Platform (Vercel + Render)

This guide walks you through deploying the Urban Intelligence Platform into production:
- **Frontend Dashboard & Bus Monitor** deployed on **Vercel** (Global Edge CDN, 100% free).
- **Backend API & Database Layer** deployed on **Render** (Python Flask + Gunicorn WSGI, 100% free).
- **Edge AI & Simulation** streaming real-time events to your live cloud URL.

---

## Architecture Flow

```
   ┌────────────────────────────────────────────────────────┐
   │             Edge Sensing / Telemetry Source            │
   │  (ai/pipeline/unified_pipeline.py or simulation tool)  │
   └───────────────────────────┬────────────────────────────┘
                               │ POST /api/events (JSON)
                               ▼
        ┌───────────────────────────────────────────────┐
        │        Render Web Service (Python Flask)      │
        │      https://your-backend.onrender.com        │
        │  - SQLite (events.db) / MongoDB Atlas         │
        │  - Gunicorn WSGI Server                       │
        │  - Cross-Origin Resource Sharing (CORS)       │
        └───────────────────────▲───────────────────────┘
                                │ GET /api/events, /api/tickets, /api/stats
                                │
        ┌───────────────────────┴───────────────────────┐
        │              Vercel Frontend (CDN)            │
        │       https://your-project.vercel.app         │
        │  - GIS Dashboard (/index.html)                │
        │  - Onboard Bus AI Monitor (/bus-monitor)      │
        │  - Dynamic API switcher & cold start detector │
        └───────────────────────────────────────────────┘
```

---

## Step 1: Commit & Push to GitHub

Ensure all your latest changes are committed and pushed to your GitHub repository:

```bash
git add .
git commit -m "Configure production deployment for Vercel and Render"
git push origin main
```

---

## Step 2: Deploy Backend to Render (Free Web Service)

1. Go to [render.com](https://render.com) and sign in (using GitHub).
2. Click **New +** in the top right and select **Web Service**.
3. Choose **Build and deploy from a Git repository** and connect your `Urban-Intelligence-Platform` repository.
4. Configure the service settings:
   - **Name**: `urban-intelligence-backend` (or any name you prefer)
   - **Region**: Closest to you (e.g. *Singapore*, *Frankfurt*, or *Oregon*)
   - **Branch**: `main`
   - **Root Directory**: `backend` *(important)*
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`
   - **Instance Type**: `Free`
5. *(Optional MongoDB)*: Under **Environment Variables**, you can optionally add:
   - `MONGO_URI`: `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority` (if using MongoDB Atlas)
6. Click **Create Web Service**.
7. Render will build and launch your service. Once it shows **Live**, copy your public URL:
   > Example: `https://urban-intelligence-backend.onrender.com`
8. **Verify**: Open `https://your-backend.onrender.com/` in your browser. You should see:
   ```json
   {
     "message": "Backend service is operational",
     "service": "Urban Intelligence Platform API",
     "status": "online"
   }
   ```

> [!NOTE]
> **Render Free Tier Cold Starts**:
> Render spins down free web services after 15 minutes of inactivity. When accessed again, it takes ~30–45 seconds to wake up. The dashboard includes an automatic detection status pill (`WAKING UP...`) so visitors know the backend is spinning up.

---

## Step 3: Deploy Frontend to Vercel (Free)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New...** -> **Project**.
3. Import your `Urban-Intelligence-Platform` repository.
4. In the configuration screen:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (leave default, `vercel.json` will automatically route to the frontend pages)
5. Click **Deploy**.
6. Within ~20 seconds, your site will be live on Vercel with a URL like:
   > Example: `https://urban-intelligence-platform.vercel.app`

---

## Step 4: Connect Frontend to Your Live Render Backend

You can connect your frontend to your Render backend in any of the following convenient ways:

### Method A: Directly from the Dashboard UI (Recommended)
1. Open your live Vercel URL.
2. Look at the sidebar header and click on the connection pill: **`⚙️ BACKEND: CONNECTING...`**.
3. A settings modal will appear: paste your Render URL (`https://urban-intelligence-backend.onrender.com`).
4. Click **Test Connection**, then **Save & Reload**. The preference is saved in your browser's `localStorage`!

### Method B: Via URL Query Parameter
Share your live site with the API link pre-configured:
```
https://your-app.vercel.app/?api=https://urban-intelligence-backend.onrender.com
```

### Method C: Update Default in `frontend/pages/config.js`
In [frontend/pages/config.js](file:///d:/urban-intelligence-platform/frontend/pages/config.js), edit line 10:
```javascript
DEFAULT_REMOTE_API: "https://your-backend.onrender.com",
```
Commit and push to GitHub — Vercel will automatically redeploy with your default set!

---

## Step 5: Stream Live Events to the Cloud Backend

You can now stream road-sensing events from your computer directly into your live cloud backend.

### Option A: Using the Simulation Generator
```bash
# Set your Render URL and run
python simulation/fake_event_generator.py --api-url=https://your-backend.onrender.com/api/events
```
Or using environment variables:
```bash
# Linux/macOS
API_URL="https://your-backend.onrender.com/api/events" python simulation/fake_event_generator.py

# Windows PowerShell
$env:API_URL="https://your-backend.onrender.com/api/events"; python simulation/fake_event_generator.py
```

### Option B: Using the Unified AI Video Pipeline
```bash
# Windows PowerShell
$env:API_URL="https://your-backend.onrender.com/api/events"; python ai/pipeline/unified_pipeline.py ai/pothole/bus_camera.mp4.mp4
```

Watch the pins and heatmap update **live** on your deployed Vercel dashboard!

---

## Summary of Pages Available

| Page | Local URL | Live Vercel Path |
| :--- | :--- | :--- |
| **GIS Analytics Dashboard** | `http://localhost:8080/index.html` | `https://your-app.vercel.app/` |
| **Onboard Bus AI Monitor** | `http://localhost:8080/bus-monitor.html` | `https://your-app.vercel.app/bus-monitor` |
| **Backend REST API** | `http://localhost:5000/` | `https://your-backend.onrender.com/` |
| **Backend Health Check** | `http://localhost:5000/api/health` | `https://your-backend.onrender.com/api/health` |
