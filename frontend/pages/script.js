// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_LAT = 19.4560;
const DEFAULT_LNG = 72.8110;

const API_BASE = "http://localhost:5000";


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

  if (event.image_base64) {

    if (event.image_base64.startsWith("data:")) {

      return event.image_base64;

    }

    return `data:image/jpeg;base64,${event.image_base64}`;

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

  document.getElementById(
    "eventModal"
  ).style.display = "none";

}


// ======================================================
// VIEW EVIDENCE
// ======================================================

function viewEvidence() {

  if (!selectedEvent) {

    alert("Please select an event first.");

    return;

  }


  const evidenceUrl =
    getEvidenceDataUrl(selectedEvent);

  const eventId =
    selectedEvent.id || selectedEvent.event_id || "EVT";


  const win = window.open("", "_blank");

  if (win) {

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Evidence Snapshot — Event #${eventId}</title>
        <style>
          body { margin: 0; background: #0f1720; color: #e6edf3; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; }
          img { max-width: 90vw; max-height: 80vh; border-radius: 8px; border: 2px solid #4da3ff; box-shadow: 0 8px 30px rgba(0,0,0,0.7); }
          .title { margin-bottom: 16px; font-size: 18px; font-weight: bold; color: #4da3ff; letter-spacing: 1px; }
        </style>
      </head>
      <body>
        <div class="title">🚌 URBAN AI EVIDENCE SNAPSHOT (EVENT #${eventId})</div>
        <img src="${evidenceUrl}" alt="Evidence Snapshot" />
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
// FETCH ALL DATA
// ======================================================

async function fetchAll() {

  try {

    await Promise.all([

      fetchEvents(),

      fetchHeatmap(),

      fetchStats(),

      fetchImpactDashboard(),

      fetchRoadHealth(),

      fetchBuses()

    ]);

  }
  catch (error) {

    console.error(
      "Dashboard error:",
      error
    );

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