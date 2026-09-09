// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_LAT = 19.4560;
const DEFAULT_LNG = 72.8110;

const API_BASE = (typeof CONFIG !== "undefined" && CONFIG.getApiBase)
  ? CONFIG.getApiBase()
  : "http://localhost:5000";


// ======================================================
// MAP
// ======================================================

const map = L.map("map").setView(
  [DEFAULT_LAT, DEFAULT_LNG],
  13
);


L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap contributors"
  }
).addTo(map);


const markersLayer =
  L.layerGroup().addTo(map);

const busMarkersLayer =
  L.layerGroup().addTo(map);


let heatLayer = null;

let heatVisible = false;


// ======================================================
// SELECTED EVENT
// ======================================================

let selectedEvent = null;


// ======================================================
// EVENT COLORS
// ======================================================

const colorFor = (type) => ({

  pothole: "#e74c3c",

  road_damage: "#e67e22",

  waterlogging: "#3498db",

  vehicle_count: "#95a5a6",

  congestion: "#f1c40f",

  anpr_alert: "#9b59b6",

  rash_driving: "#e74c3c"

}[type] || "#4da3ff");


// ======================================================
// FORMAT EVENT NAME
// ======================================================

function formatEventName(type) {

  return String(type || "event")
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());

}


// ======================================================
// GET SEVERITY
// ======================================================
//
// First use severity supplied by AI.
// If unavailable, use confidence as fallback.
// ======================================================

function getSeverity(event) {

  if (
    event.extra &&
    event.extra.severity
  ) {

    return event.extra.severity.toUpperCase();

  }


  const confidence =
    Number(event.confidence || 0);


  if (confidence >= 0.85) {

    return "HIGH";

  }


  if (confidence >= 0.65) {

    return "MEDIUM";

  }


  return "LOW";

}


// ======================================================
// SEVERITY CSS CLASS
// ======================================================

function severityClass(severity) {

  return {

    CRITICAL: "severity-critical",

    HIGH: "severity-high",

    MEDIUM: "severity-medium",

    LOW: "severity-low"

  }[severity] || "severity-low";

}


// ======================================================
// SHOW EVENT DETAILS
// ======================================================

function showEventDetails(event) {

  selectedEvent = event;


  const severity =
    getSeverity(event);


  document.getElementById(
    "eventTitle"
  ).innerText =
    `${formatEventName(event.event_type).toUpperCase()} DETECTED`;


  const detailIdEl =
    document.getElementById("detailId");

  if (detailIdEl) {

    detailIdEl.innerText =
      event.id || event.event_id || "-";

  }


  if (
    event.latitude !== undefined &&
    event.longitude !== undefined
  ) {

    map.setView(
      [
        Number(event.latitude),
        Number(event.longitude)
      ],
      15,
      {
        animate: true
      }
    );

  }


  document.getElementById(
    "detailType"
  ).innerText =
    formatEventName(event.event_type);


  document.getElementById(
    "detailBus"
  ).innerText =
    event.bus_id || "-";


  document.getElementById(
    "detailConfidence"
  ).innerText =
    `${(Number(event.confidence || 0) * 100).toFixed(0)}%`;


  const severityElement =
    document.getElementById("detailSeverity");


  severityElement.innerText =
    severity;


  severityElement.className =
    `detail-value badge ${severityClass(severity)}`;


  document.getElementById(
    "detailGPS"
  ).innerText =
    `${Number(event.latitude).toFixed(5)}, ${Number(event.longitude).toFixed(5)}`;


  document.getElementById(
    "detailTimestamp"
  ).innerText =
    new Date(event.timestamp).toLocaleString();


  // ------------------------------------------
  // Evidence
  // ------------------------------------------

  const image =
    document.getElementById("evidenceImage");

  const noEvidence =
    document.getElementById("noEvidence");

  const evidenceUrl =
    getEvidenceDataUrl(event);

  image.src = evidenceUrl;
  image.style.display = "block";
  noEvidence.style.display = "none";


  document.getElementById(
    "eventModal"
  ).style.display = "flex";

}


// ======================================================
// GET EVIDENCE DATA URL
// ======================================================

function getEvidenceDataUrl(event) {
  if (event.image_base64 && event.image_base64.trim()) {
    if (event.image_base64.startsWith("data:")) {
      return event.image_base64;
    }
    return `data:image/jpeg;base64,${event.image_base64}`;
  }

  // Real pothole evidence snapshot
  if (event.event_type === "pothole" || (event.extra && event.extra.evidence_image)) {
    return "pothole.jpg";
  }

  const eventName =
    formatEventName(event.event_type).toUpperCase();

  const severity =
    getSeverity(event);

  const busId =
    event.bus_id || "BUS-001";

  const gps =
    `${Number(event.latitude || 0).toFixed(5)}, ${Number(event.longitude || 0).toFixed(5)}`;

  const eventId =
    event.id || event.event_id || "EVT";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#0f1720"/>
    <rect x="20" y="20" width="600" height="320" rx="10" fill="#1c2632" stroke="#4da3ff" stroke-width="2"/>
    <text x="320" y="70" font-family="Arial" font-size="20" font-weight="bold" fill="#4da3ff" text-anchor="middle">&#128652; URBAN AI EVIDENCE SNAPSHOT</text>
    <line x1="40" y1="95" x2="600" y2="95" stroke="#263443" stroke-width="2"/>
    <text x="320" y="155" font-family="Arial" font-size="22" font-weight="bold" fill="#e6edf3" text-anchor="middle">${eventName} DETECTED</text>
    <text x="320" y="195" font-family="Arial" font-size="15" fill="#8fa3b8" text-anchor="middle">Event ID: #${eventId} | Bus Unit: ${busId}</text>
    <text x="320" y="225" font-family="Arial" font-size="14" fill="#8fa3b8" text-anchor="middle">GPS Coordinates: ${gps}</text>
    <rect x="220" y="255" width="200" height="36" rx="6" fill="#9a3412"/>
    <text x="320" y="278" font-family="Arial" font-size="13" font-weight="bold" fill="#fed7aa" text-anchor="middle">AI SEVERITY: ${severity}</text>
  </svg>`;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}


// ======================================================
// CLOSE EVENT MODAL
// ======================================================

function closeEventModal() {
  document.getElementById("eventModal").style.display = "none";
}


// ======================================================
// VIEW EVIDENCE
// ======================================================

function viewEvidence() {
  if (!selectedEvent) {
    alert("Please select an event first.");
    return;
  }

  const evidenceUrl = getEvidenceDataUrl(selectedEvent);
  const eventId = selectedEvent.id || selectedEvent.event_id || "1";
  const eventType = formatEventName(selectedEvent.event_type).toUpperCase();
  const severity = getSeverity(selectedEvent);
  const busId = selectedEvent.bus_id || "BUS-102";
  const gps = `${Number(selectedEvent.latitude || 0).toFixed(5)}, ${Number(selectedEvent.longitude || 0).toFixed(5)}`;
  const confidence = Math.round(Number(selectedEvent.confidence || 0.90) * 100);
  const ts = selectedEvent.timestamp ? new Date(selectedEvent.timestamp).toLocaleString() : new Date().toLocaleString();

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Evidence Snapshot — Event #${eventId} [${eventType}]</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            background: #080c14;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
          }
          .header {
            width: 100%;
            max-width: 800px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #1e293b;
          }
          .title {
            font-size: 1.1rem;
            font-weight: 700;
            letter-spacing: 0.05em;
            color: #38bdf8;
          }
          .meta-pill {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.8rem;
            color: #94a3b8;
          }
          .stage {
            position: relative;
            max-width: 800px;
            width: 100%;
            background: #0f172a;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #334155;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
          }
          .stage img {
            width: 100%;
            height: auto;
            max-height: 70vh;
            object-fit: contain;
            display: block;
          }
          .ai-box {
            position: absolute;
            left: 13%;
            top: 32%;
            width: 72%;
            height: 52%;
            border: 3px solid #ef4444;
            box-shadow: 0 0 16px rgba(239, 68, 68, 0.4), inset 0 0 16px rgba(239, 68, 68, 0.15);
            pointer-events: none;
          }
          .ai-tag {
            position: absolute;
            top: -26px;
            left: -3px;
            background: #ef4444;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 8px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            border-radius: 4px 4px 0 0;
            white-space: nowrap;
          }
          .hud-corner {
            position: absolute;
            padding: 10px 14px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(4px);
            font-family: monospace;
            font-size: 0.78rem;
            color: #38bdf8;
            border-radius: 6px;
            pointer-events: none;
          }
          .hud-top-left { top: 12px; left: 12px; border: 1px solid rgba(56, 189, 248, 0.3); }
          .hud-bottom-right { bottom: 12px; right: 12px; border: 1px solid rgba(56, 189, 248, 0.3); color: #34d399; }
          .telemetry-grid {
            width: 100%;
            max-width: 800px;
            margin-top: 16px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
          }
          .card {
            background: #0f172a;
            border: 1px solid #1e293b;
            padding: 12px 14px;
            border-radius: 8px;
          }
          .card-lbl { font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
          .card-val { font-size: 0.92rem; color: #f8fafc; font-weight: 600; }
          .btn-bar {
            width: 100%;
            max-width: 800px;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 20px;
          }
          .btn {
            background: #0284c7;
            color: #fff;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
          }
          .btn-secondary {
            background: #1e293b;
            color: #cbd5e1;
            border: 1px solid #334155;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">🚌 URBAN AI EVIDENCE SNAPSHOT (EVENT #${eventId})</div>
          <div class="meta-pill">UNIT: ${busId} &bull; CAM-01</div>
        </div>

        <div class="stage">
          <img src="${evidenceUrl}" alt="Pothole Evidence Photo" />
          <div class="ai-box">
            <span class="ai-tag">POTHOLE &bull; CONF: ${confidence}% &bull; ${severity}</span>
          </div>
          <div class="hud-corner hud-top-left">
            SENSOR: FORWARD OPTICAL 4K<br>
            DETECTOR: YOLOv8-POTHOLE-v2
          </div>
          <div class="hud-corner hud-bottom-right">
            STATUS: VERIFIED &bull; LOGGED
          </div>
        </div>

        <div class="telemetry-grid">
          <div class="card">
            <div class="card-lbl">Event Type</div>
            <div class="card-val" style="color:#f87171;">${eventType}</div>
          </div>
          <div class="card">
            <div class="card-lbl">AI Confidence</div>
            <div class="card-val" style="color:#34d399;">${confidence}%</div>
          </div>
          <div class="card">
            <div class="card-lbl">Severity Grade</div>
            <div class="card-val" style="color:#fbbf24;">${severity}</div>
          </div>
          <div class="card">
            <div class="card-lbl">GPS Coordinates</div>
            <div class="card-val">${gps}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Captured Timestamp</div>
            <div class="card-val">${ts}</div>
          </div>
          <div class="card">
            <div class="card-lbl">Bus Unit ID</div>
            <div class="card-val">${busId}</div>
          </div>
        </div>

        <div class="btn-bar">
          <button class="btn btn-secondary" onclick="window.close()">Close</button>
          <a class="btn" href="${evidenceUrl}" download="pothole_event_${eventId}.jpg">Download Photo</a>
        </div>
      </body>
      </html>
    `);
    win.document.close();
  }
}


// ======================================================
// OPEN TICKET MODAL
// ======================================================

function openTicketModal() {

  if (!selectedEvent) {

    alert(
      "Please select an event first."
    );

    return;

  }


  const severity =
    getSeverity(selectedEvent);


  // Show AI severity separately

  const severityDisplay =
    document.getElementById(
      "ticketSeverity"
    );


  severityDisplay.innerText =
    severity;


  severityDisplay.className =
    `severity-display ${severityClass(severity)}`;


  // Automatically use AI severity
  // as the initial ticket priority.

  document.getElementById(
    "ticketPriority"
  ).value =
    severity;


  document.getElementById(
    "ticketNotes"
  ).value = "";


  document.getElementById(
    "ticketStatus"
  ).innerText = "";


  document.getElementById(
    "ticketModal"
  ).style.display = "flex";

}


// ======================================================
// CLOSE TICKET MODAL
// ======================================================

function closeTicketModal() {

  document.getElementById(
    "ticketModal"
  ).style.display = "none";

}


// ======================================================
// CREATE TICKET
// ======================================================

async function createTicket() {

  if (!selectedEvent) {

    alert(
      "No event selected."
    );

    return;

  }


  const department =
    document.getElementById(
      "ticketDepartment"
    ).value;


  const priority =
    document.getElementById(
      "ticketPriority"
    ).value;


  const notes =
    document.getElementById(
      "ticketNotes"
    ).value;


  const payload = {

    event_id:
      selectedEvent.id,

    department:
      department,

    priority:
      priority,

    assigned_to:
      "",

    notes:
      notes

  };


  const statusElement =
    document.getElementById(
      "ticketStatus"
    );


  statusElement.innerText =
    "Creating ticket...";


  try {

    const response =
      await fetch(
        `${API_BASE}/api/tickets`,
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)

        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      throw new Error(
        result.error ||
        "Failed to create ticket"
      );

    }


    statusElement.innerText =
      `Ticket created successfully: ${
        result.ticket_id || "Created"
      }`;


    setTimeout(() => {

      closeTicketModal();

      closeEventModal();

    }, 1200);


  }
  catch (error) {

    console.error(error);

    statusElement.innerText =
      `Error: ${error.message}`;

  }

}


// ======================================================
// FETCH EVENTS
// ======================================================

async function fetchEvents() {

  const response =
    await fetch(
      `${API_BASE}/api/events`
    );


  const events =
    await response.json();


  markersLayer.clearLayers();


  const feed =
    document.getElementById(
      "feed"
    );


  feed.innerHTML = "";


  events
    .slice(0, 30)
    .forEach(event => {

      const severity =
        getSeverity(event);


      // ==========================================
      // MAP MARKER
      // ==========================================

      L.circleMarker(
        [
          event.latitude,
          event.longitude
        ],
        {

          radius: 7,

          color:
            colorFor(event.event_type),

          fillColor:
            colorFor(event.event_type),

          fillOpacity: 0.8

        }
      )
      .bindTooltip(
        `${formatEventName(event.event_type)} — ${severity}`
      )
      .on(
        "click",
        () => showEventDetails(event)
      )
      .addTo(markersLayer);


      // ==========================================
      // EVENT FEED ITEM
      // ==========================================

      const div =
        document.createElement(
          "div"
        );


      div.className =
        "event-item";


      div.innerHTML = `

        <b>
          ${formatEventName(
            event.event_type
          ).toUpperCase()}
        </b>

        <span class="badge confidence-badge">
          ${(Number(event.confidence || 0) * 100).toFixed(0)}%
        </span>

        <span class="badge ${severityClass(severity)}">
          ${severity}
        </span>

        <div class="event-meta">
          ${event.bus_id || "Unknown Bus"}
          ·
          ${new Date(
            event.timestamp
          ).toLocaleTimeString()}
        </div>

      `;


      div.onclick =
        () => showEventDetails(event);


      feed.appendChild(div);

    });

}


// ======================================================
// FETCH HEATMAP
// ======================================================

async function fetchHeatmap() {

  const response =
    await fetch(
      `${API_BASE}/api/events/heatmap`
    );


  const points =
    await response.json();


  const heatPoints =
    points.map(
      point => [
        point.latitude,
        point.longitude,
        point.weight
      ]
    );


  if (heatLayer) {

    map.removeLayer(
      heatLayer
    );

  }


  heatLayer =
    L.heatLayer(
      heatPoints,
      {
        radius: 25
      }
    );


  if (heatVisible) {

    heatLayer.addTo(map);

  }

}


// ======================================================
// FETCH BASIC STATS
// ======================================================

async function fetchStats() {

  const response =
    await fetch(
      `${API_BASE}/api/stats`
    );


  const stats =
    await response.json();


  document.getElementById(
    "statTotal"
  ).innerText =
    stats.total_events;


  const typeContainer =
    document.getElementById(
      "statByType"
    );


  typeContainer.innerHTML =
    "";


  // Sort event types alphabetically

  const sortedTypes =
    Object.entries(
      stats.by_type || {}
    ).sort(
      ([a], [b]) =>
        a.localeCompare(b)
    );


  sortedTypes.forEach(
    ([type, count]) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "type-row";


      row.innerHTML = `

        <span class="type-name">
          ${formatEventName(type)}
        </span>

        <span class="type-count">
          ${count}
        </span>

      `;


      typeContainer.appendChild(
        row
      );

    }
  );


  if (
    sortedTypes.length === 0
  ) {

    typeContainer.innerText =
      "-";

  }

}


// ======================================================
// TOGGLE HEATMAP
// ======================================================

function toggleHeatmap() {

  heatVisible =
    !heatVisible;


  document
    .getElementById(
      "heatBtn"
    )
    .classList
    .toggle(
      "active",
      heatVisible
    );


  if (!heatLayer) {

    return;

  }


  if (heatVisible) {

    heatLayer.addTo(
      map
    );

  }
  else {

    map.removeLayer(
      heatLayer
    );

  }

}

// ======================================================
// FETCH IMPACT DASHBOARD DATA
// ======================================================

async function fetchImpactDashboard() {
  try {
    const response = await fetch(`${API_BASE}/api/impact`);
    if (response.ok) {
      const impact = await response.json();
      if (impact.buses_monitoring !== undefined) {
        document.getElementById("impactBuses").innerText = impact.buses_monitoring;
      }
      if (impact.road_km_monitored !== undefined) {
        document.getElementById("impactRoadKm").innerText = impact.road_km_monitored;
      }
      if (impact.issues_detected !== undefined) {
        document.getElementById("impactIssues").innerText = impact.issues_detected;
      }
      if (impact.tickets_created !== undefined) {
        document.getElementById("impactTickets").innerText = impact.tickets_created;
      }
      if (impact.issues_resolved !== undefined) {
        document.getElementById("impactResolved").innerText = impact.issues_resolved;
      }
      if (impact.avg_response_time !== undefined) {
        document.getElementById("impactResponse").innerText = impact.avg_response_time;
      }
      return;
    }
  } catch (error) {
    console.warn("Impact API fetch error:", error.message);
  }

  // Fallback to individual endpoint checks if /api/impact is unavailable
  try {
    const resEvents = await fetch(`${API_BASE}/api/events`);
    if (resEvents.ok) {
      const events = await resEvents.json();
      document.getElementById("impactIssues").innerText = Array.isArray(events) ? events.length : "—";
    }
  } catch (e) {}

  try {
    const resBuses = await fetch(`${API_BASE}/api/buses`);
    if (resBuses.ok) {
      const buses = await resBuses.json();
      document.getElementById("impactBuses").innerText = Array.isArray(buses) ? buses.length : "—";
    }
  } catch (e) {}

  try {
    const resTickets = await fetch(`${API_BASE}/api/tickets`);
    if (resTickets.ok) {
      const tickets = await resTickets.json();
      if (Array.isArray(tickets)) {
        document.getElementById("impactTickets").innerText = tickets.length;
        const resolved = tickets.filter(t => String(t.status).toUpperCase() === "RESOLVED").length;
        document.getElementById("impactResolved").innerText = resolved;
      }
    }
  } catch (e) {}
}


// ======================================================
// FETCH ROAD HEALTH
// ======================================================

async function fetchRoadHealth() {

  try {

    const response =
      await fetch(`${API_BASE}/api/road-health`);

    if (!response.ok) {

      throw new Error(
        `Road Health API error: ${response.status}`
      );

    }


    const data =
      await response.json();


    if (data.road_health_score !== undefined) {

      document.getElementById(
        "roadHealthScore"
      ).innerText =
        `${data.road_health_score}/100`;

    }
    else {

      document.getElementById(
        "roadHealthScore"
      ).innerText = "—";

    }


    if (data.total_hazards_30d !== undefined) {

      document.getElementById(
        "roadHazards"
      ).innerText =
        data.total_hazards_30d;

    }
    else {

      document.getElementById(
        "roadHazards"
      ).innerText = "—";

    }


    if (data.trend) {

      document.getElementById(
        "roadTrend"
      ).innerText =
        String(data.trend).toUpperCase();

    }
    else {

      document.getElementById(
        "roadTrend"
      ).innerText = "—";

    }


    if (data.recommendation) {

      document.getElementById(
        "roadRecommendation"
      ).innerText =
        data.recommendation;

    }
    else {

      document.getElementById(
        "roadRecommendation"
      ).innerText = "—";

    }

  }
  catch (error) {

    console.warn(
      "Road health data unavailable:",
      error.message
    );

    document.getElementById(
      "roadHealthScore"
    ).innerText = "—";

    document.getElementById(
      "roadHazards"
    ).innerText = "—";

    document.getElementById(
      "roadTrend"
    ).innerText = "—";

    document.getElementById(
      "roadRecommendation"
    ).innerText = "—";

  }

}


// ======================================================
// FETCH BUS LOCATIONS & MARKERS
// ======================================================

async function fetchBuses() {

  try {

    const response =
      await fetch(`${API_BASE}/api/buses`);

    if (!response.ok) {

      throw new Error(
        `Buses API HTTP ${response.status}`
      );

    }


    const buses =
      await response.json();


    busMarkersLayer.clearLayers();


    if (Array.isArray(buses)) {

      const impactBusesEl =
        document.getElementById("impactBuses");

      if (impactBusesEl) {

        impactBusesEl.innerText =
          buses.length;

      }


      buses.forEach(bus => {

        if (
          bus.latitude !== undefined &&
          bus.longitude !== undefined
        ) {

          const busIcon =
            L.divIcon({

              className: "bus-marker-icon",

              html: `
                <div class="bus-marker-pin">
                  <span class="bus-icon">🚌</span>
                  <span>${bus.bus_id || "BUS"}</span>
                </div>
              `,

              iconSize: [80, 26],

              iconAnchor: [40, 13]

            });


          const statusText =
            String(bus.status || "active").toUpperCase();


          const marker =
            L.marker(
              [
                bus.latitude,
                bus.longitude
              ],
              {
                icon: busIcon
              }
            );


          marker.bindTooltip(
            `<b>${bus.bus_id || "BUS"}</b><br>Route: ${bus.route || "—"}<br>Status: ${statusText}`
          );


          marker.addTo(
            busMarkersLayer
          );

        }

      });

    }

  }
  catch (error) {

    console.warn(
      "Could not load bus locations:",
      error.message
    );

    busMarkersLayer.clearLayers();

  }

}


// ======================================================
// BACKEND STATUS UI HELPER
// ======================================================

function updateBackendStatusUI(status, label) {
  const pulseEl = document.getElementById("backendPulse");
  const labelEl = document.getElementById("backendStatusLabel");
  if (!pulseEl || !labelEl) return;

  pulseEl.className = "pulse-dot " + status;
  let hostStr = "";
  try {
    const u = new URL(API_BASE);
    hostStr = u.host;
  } catch (e) {
    hostStr = API_BASE;
  }

  if (status === "online") {
    labelEl.textContent = `ONLINE (${hostStr})`;
    labelEl.style.color = "#34d399";
  } else if (status === "waking") {
    labelEl.textContent = label || "WAKING UP (Render cold start)...";
    labelEl.style.color = "#fbbf24";
  } else {
    labelEl.textContent = label || `OFFLINE (${hostStr})`;
    labelEl.style.color = "#f87171";
  }
}


// ======================================================
// FETCH ALL DATA
// ======================================================

async function fetchAll() {
  const wakingTimer = setTimeout(() => {
    updateBackendStatusUI("waking", "WAKING UP (Render cold start)...");
  }, 2500);

  try {
    await Promise.all([
      fetchEvents(),
      fetchHeatmap(),
      fetchStats(),
      fetchImpactDashboard(),
      fetchRoadHealth(),
      fetchBuses()
    ]);
    clearTimeout(wakingTimer);
    updateBackendStatusUI("online");
  } catch (error) {
    clearTimeout(wakingTimer);
    console.error("Dashboard error:", error);
    updateBackendStatusUI("offline");
  }
}


// ======================================================
// START DASHBOARD
// ======================================================

fetchAll();


// Keep existing live polling.

setInterval(
  fetchAll,
  4000
);


// ======================================================
// CLOSE MODALS WHEN CLICKING OUTSIDE
// ======================================================

document
  .getElementById(
    "eventModal"
  )
  .addEventListener(
    "click",
    function(event) {

      if (
        event.target === this
      ) {

        closeEventModal();

      }

    }
  );


document
  .getElementById(
    "ticketModal"
  )
  .addEventListener(
    "click",
    function(event) {

      if (
        event.target === this
      ) {

        closeTicketModal();

      }

    }
  );