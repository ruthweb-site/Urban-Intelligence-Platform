// ======================================================
// URBAN INTELLIGENCE PLATFORM
// MAIN DASHBOARD SCRIPT
// ======================================================


// ======================================================
// CONFIGURATION
// ======================================================

const DEFAULT_LAT = 19.4560;
const DEFAULT_LNG = 72.8110;

const API_BASE =
  (typeof CONFIG !== "undefined" && CONFIG.getApiBase)
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
// APPLICATION STATE
// ======================================================

let selectedEvent = null;

let allEvents = [];

let currentEventFilter = "ALL";

let currentSeverityFilter = "ALL";

let isFetching = false;


// ======================================================
// EVENT COLORS
// ======================================================

const colorFor = (type) => ({
  pothole: "#d64545",
  road_damage: "#d99100",
  waterlogging: "#318fc1",
  vehicle_count: "#78909c",
  congestion: "#c98a00",
  anpr_alert: "#7657c8",
  rash_driving: "#d64545"
}[type] || "#38a9d6");


// ======================================================
// FORMAT EVENT NAME
// ======================================================

function formatEventName(type) {
  return String(type || "event")
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}


// ======================================================
// SAFE ELEMENT HELPER
// ======================================================

function getElement(id) {
  return document.getElementById(id);
}


// ======================================================
// SAFE TEXT UPDATE
// ======================================================

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.innerText = value;
  }
}


// ======================================================
// GET EVENT ID
// ======================================================

function getEventId(event) {
  if (!event) {
    return null;
  }

  return event.id ?? event.event_id ?? null;
}


// ======================================================
// GET SEVERITY
// ======================================================
//
// Priority:
// 1. Explicit AI/backend severity
// 2. Confidence fallback
//
// The fallback is used only when the backend does not
// provide a severity value.
// ======================================================

function getSeverity(event) {
  if (!event) {
    return "LOW";
  }

  const possibleSeverity =
    event.extra &&
    event.extra.severity;

  if (
    possibleSeverity !== undefined &&
    possibleSeverity !== null &&
    String(possibleSeverity).trim() !== ""
  ) {
    return String(possibleSeverity).toUpperCase();
  }

  if (
    event.severity !== undefined &&
    event.severity !== null &&
    String(event.severity).trim() !== ""
  ) {
    return String(event.severity).toUpperCase();
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
// FILTER EVENTS
// ======================================================

function getFilteredEvents() {
  return allEvents.filter(event => {
    const eventType =
      String(event.event_type || "").toLowerCase();

    const severity =
      getSeverity(event);

    const typeMatches =
      currentEventFilter === "ALL" ||
      eventType === currentEventFilter.toLowerCase();

    const severityMatches =
      currentSeverityFilter === "ALL" ||
      severity === currentSeverityFilter;

    return typeMatches && severityMatches;
  });
}


// ======================================================
// APPLY EVENT FILTERS
// ======================================================

function applyEventFilters() {
  renderEventMarkers(
    getFilteredEvents()
  );

  renderEventFeed(
    getFilteredEvents()
  );
}


// ======================================================
// RENDER EVENT MARKERS
// ======================================================

function renderEventMarkers(events) {
  markersLayer.clearLayers();

  events.forEach(event => {
    const latitude =
      Number(event.latitude);

    const longitude =
      Number(event.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    const severity =
      getSeverity(event);

    const eventType =
      String(event.event_type || "event");

    const markerColor =
      colorFor(eventType);

    const marker =
      L.circleMarker(
        [latitude, longitude],
        {
          radius: 7,

          color: markerColor,

          fillColor: markerColor,

          fillOpacity: 0.82,

          weight: 2
        }
      );

    marker.bindTooltip(
      `${formatEventName(eventType)} — ${severity}`
    );

    marker.on(
      "click",
      () => showEventDetails(event)
    );

    marker.addTo(
      markersLayer
    );
  });
}


// ======================================================
// RENDER EVENT FEED
// ======================================================

function renderEventFeed(events) {
  const feed =
    getElement("feed");

  if (!feed) {
    return;
  }

  feed.innerHTML = "";

  if (!events.length) {
    feed.innerHTML = `
      <div class="empty-state">
        No events match the selected filters.
      </div>
    `;

    return;
  }

  events
    .slice(0, 30)
    .forEach(event => {
      const severity =
        getSeverity(event);

      const eventType =
        event.event_type || "event";

      const div =
        document.createElement("div");

      div.className =
        "event-item";

      const confidence =
        Number(event.confidence || 0);

      const confidenceText =
        Number.isFinite(confidence)
          ? `${(confidence * 100).toFixed(0)}%`
          : "—";

      let timeText = "—";

      if (event.timestamp) {
        const date =
          new Date(event.timestamp);

        if (!Number.isNaN(date.getTime())) {
          timeText =
            date.toLocaleTimeString();
        }
      }

      div.innerHTML = `
        <b>
          ${formatEventName(eventType).toUpperCase()}
        </b>

        <span class="badge confidence-badge">
          ${confidenceText}
        </span>

        <span class="badge ${severityClass(severity)}">
          ${severity}
        </span>

        <div class="event-meta">
          ${event.bus_id || "Unknown Bus"}
          ·
          ${timeText}
        </div>
      `;

      div.addEventListener(
        "click",
        () => showEventDetails(event)
      );

      feed.appendChild(div);
    });
}


// ======================================================
// UPDATE FILTER STATE
// ======================================================

function updateFilters() {
  const eventTypeFilter =
    getElement("eventTypeFilter");

  const severityFilter =
    getElement("severityFilter");

  currentEventFilter =
    eventTypeFilter
      ? eventTypeFilter.value
      : "ALL";

  currentSeverityFilter =
    severityFilter
      ? severityFilter.value
      : "ALL";

  applyEventFilters();
}


// ======================================================
// INITIALIZE FILTER LISTENERS
// ======================================================

function initializeFilters() {
  const eventTypeFilter =
    getElement("eventTypeFilter");

  const severityFilter =
    getElement("severityFilter");

  if (eventTypeFilter) {
    eventTypeFilter.addEventListener(
      "change",
      updateFilters
    );
  }

  if (severityFilter) {
    severityFilter.addEventListener(
      "change",
      updateFilters
    );
  }
}


// ======================================================
// SHOW EVENT DETAILS
// ======================================================

function showEventDetails(event) {
  if (!event) {
    return;
  }

  selectedEvent = event;

  const severity =
    getSeverity(event);

  const eventType =
    event.event_type || "event";

  setText(
    "eventTitle",
    `${formatEventName(eventType).toUpperCase()} DETECTED`
  );

  setText(
    "detailId",
    getEventId(event) ?? "-"
  );

  const latitude =
    Number(event.latitude);

  const longitude =
    Number(event.longitude);

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    map.setView(
      [latitude, longitude],
      15,
      {
        animate: true
      }
    );
  }

  setText(
    "detailType",
    formatEventName(eventType)
  );

  setText(
    "detailBus",
    event.bus_id || "-"
  );

  const confidence =
    Number(event.confidence);

  setText(
    "detailConfidence",
    Number.isFinite(confidence)
      ? `${(confidence * 100).toFixed(0)}%`
      : "—"
  );

  const severityElement =
    getElement("detailSeverity");

  if (severityElement) {
    severityElement.innerText =
      severity;

    severityElement.className =
      `detail-value badge ${severityClass(severity)}`;
  }

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    setText(
      "detailGPS",
      `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
    );
  } else {
    setText(
      "detailGPS",
      "—"
    );
  }

  let timestampText = "—";

  if (event.timestamp) {
    const timestamp =
      new Date(event.timestamp);

    if (!Number.isNaN(timestamp.getTime())) {
      timestampText =
        timestamp.toLocaleString();
    }
  }

  setText(
    "detailTimestamp",
    timestampText
  );

  updateEvidenceDisplay(event);

  const eventModal =
    getElement("eventModal");

  if (eventModal) {
    eventModal.style.display =
      "flex";
  }
}


// ======================================================
// EVIDENCE SOURCE RESOLUTION
// ======================================================
//
// IMPORTANT:
// No synthetic/fake evidence is generated.
//
// Only actual evidence returned by the backend is used.
// ======================================================

function getEvidenceSource(event) {
  if (!event) {
    return null;
  }

  // ------------------------------------------
  // Direct base64 image
  // ------------------------------------------

  if (
    typeof event.image_base64 === "string" &&
    event.image_base64.trim() !== ""
  ) {
    const value =
      event.image_base64.trim();

    if (value.startsWith("data:image/")) {
      return value;
    }

    return `data:image/jpeg;base64,${value}`;
  }


  // ------------------------------------------
  // Direct image URL fields
  // ------------------------------------------

  const directFields = [
    "evidence_url",
    "evidence_image",
    "image_url",
    "image_path",
    "evidence_path"
  ];

  for (const field of directFields) {
    const value =
      event[field];

    if (
      typeof value === "string" &&
      value.trim() !== ""
    ) {
      return resolveEvidenceUrl(
        value.trim()
      );
    }
  }


  // ------------------------------------------
  // Nested extra object
  // ------------------------------------------

  if (
    event.extra &&
    typeof event.extra === "object"
  ) {
    const nestedFields = [
      "evidence_url",
      "evidence_image",
      "image_url",
      "image_path",
      "evidence_path"
    ];

    for (const field of nestedFields) {
      const value =
        event.extra[field];

      if (
        typeof value === "string" &&
        value.trim() !== ""
      ) {
        return resolveEvidenceUrl(
          value.trim()
        );
      }
    }
  }


  return null;
}


// ======================================================
// RESOLVE EVIDENCE URL
// ======================================================

function resolveEvidenceUrl(value) {
  if (!value) {
    return null;
  }

  if (
    value.startsWith("data:image/")
  ) {
    return value;
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:")
  ) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${API_BASE}${value}`;
  }

  return `${API_BASE}/${value}`;
}


// ======================================================
// UPDATE EVIDENCE DISPLAY
// ======================================================

function updateEvidenceDisplay(event) {
  const image =
    getElement("evidenceImage");

  const noEvidence =
    getElement("noEvidence");

  const source =
    getEvidenceSource(event);

  if (!image || !noEvidence) {
    return;
  }

  image.onload = () => {
    image.style.display =
      "block";

    noEvidence.style.display =
      "none";
  };

  image.onerror = () => {
    image.removeAttribute("src");

    image.style.display =
      "none";

    noEvidence.style.display =
      "block";

    noEvidence.innerText =
      "Evidence is unavailable or could not be loaded.";
  };

  if (source) {
    image.src =
      source;

    image.style.display =
      "block";

    noEvidence.style.display =
      "none";
  } else {
    image.removeAttribute("src");

    image.style.display =
      "none";

    noEvidence.style.display =
      "block";

    noEvidence.innerText =
      "No evidence image is available for this event.";
  }
}


// ======================================================
// CLOSE EVENT MODAL
// ======================================================

function closeEventModal() {
  const modal =
    getElement("eventModal");

  if (modal) {
    modal.style.display =
      "none";
  }
}


// ======================================================
// VIEW EVIDENCE
// ======================================================
//
// Opens the real backend-provided evidence.
// If no evidence exists, nothing fake is generated.
// ======================================================

function viewEvidence() {
  if (!selectedEvent) {
    alert(
      "Please select an event first."
    );

    return;
  }

  const evidenceUrl =
    getEvidenceSource(selectedEvent);

  if (!evidenceUrl) {
    alert(
      "No evidence image is available for this event."
    );

    return;
  }

  const newWindow =
    window.open(
      evidenceUrl,
      "_blank",
      "noopener,noreferrer"
    );

  if (!newWindow) {
    alert(
      "The evidence window was blocked by the browser. Please allow pop-ups for this dashboard."
    );
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

  const severityDisplay =
    getElement("ticketSeverity");

  if (severityDisplay) {
    severityDisplay.innerText =
      severity;

    severityDisplay.className =
      `severity-display ${severityClass(severity)}`;
  }

  const priority =
    getElement("ticketPriority");

  if (priority) {
    const availableValues =
      Array.from(priority.options)
        .map(option => option.value);

    if (
      availableValues.includes(severity)
    ) {
      priority.value =
        severity;
    }
  }

  const notes =
    getElement("ticketNotes");

  if (notes) {
    notes.value = "";
  }

  const status =
    getElement("ticketStatus");

  if (status) {
    status.innerText = "";
  }

  const ticketModal =
    getElement("ticketModal");

  if (ticketModal) {
    ticketModal.style.display =
      "flex";
  }
}


// ======================================================
// CLOSE TICKET MODAL
// ======================================================

function closeTicketModal() {
  const modal =
    getElement("ticketModal");

  if (modal) {
    modal.style.display =
      "none";
  }
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

  const eventId =
    getEventId(selectedEvent);

  if (
    eventId === null ||
    eventId === undefined ||
    eventId === ""
  ) {
    const status =
      getElement("ticketStatus");

    if (status) {
      status.innerText =
        "Error: Selected event does not contain a valid event ID.";
    }

    return;
  }

  const department =
    getElement("ticketDepartment")?.value || "";

  const priority =
    getElement("ticketPriority")?.value || "";

  const notes =
    getElement("ticketNotes")?.value || "";

  const statusElement =
    getElement("ticketStatus");

  if (statusElement) {
    statusElement.innerText =
      "Creating ticket...";
  }

  const payload = {
    event_id: eventId,
    department: department,
    priority: priority,
    assigned_to: "",
    notes: notes
  };

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

    let result = {};

    try {
      result =
        await response.json();
    } catch (jsonError) {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        `Ticket API returned HTTP ${response.status}`
      );
    }

    if (statusElement) {
      statusElement.innerText =
        `Ticket created successfully: ${
          result.ticket_id ||
          result.id ||
          "Created"
        }`;
    }

    setTimeout(() => {
      closeTicketModal();
      closeEventModal();
    }, 1200);

    await fetchImpactDashboard();

  } catch (error) {
    console.error(
      "Ticket creation failed:",
      error
    );

    if (statusElement) {
      statusElement.innerText =
        `Error: ${error.message}`;
    }
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

  if (!response.ok) {
    throw new Error(
      `Events API HTTP ${response.status}`
    );
  }

  const events =
    await response.json();

  if (!Array.isArray(events)) {
    throw new Error(
      "Events API returned an invalid response."
    );
  }

  allEvents =
    events;

  applyEventFilters();
}


// ======================================================
// FETCH HEATMAP
// ======================================================

async function fetchHeatmap() {
  const response =
    await fetch(
      `${API_BASE}/api/events/heatmap`
    );

  if (!response.ok) {
    throw new Error(
      `Heatmap API HTTP ${response.status}`
    );
  }

  const points =
    await response.json();

  if (!Array.isArray(points)) {
    throw new Error(
      "Heatmap API returned an invalid response."
    );
  }

  const heatPoints =
    points
      .map(point => [
        Number(point.latitude),
        Number(point.longitude),
        Number(point.weight ?? 1)
      ])
      .filter(point =>
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Number.isFinite(point[2])
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
        radius: 25,
        blur: 18,
        maxZoom: 17
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

  if (!response.ok) {
    throw new Error(
      `Stats API HTTP ${response.status}`
    );
  }

  const stats =
    await response.json();

  setText(
    "statTotal",
    stats.total_events ?? "—"
  );

  const typeContainer =
    getElement("statByType");

  if (!typeContainer) {
    return;
  }

  typeContainer.innerHTML = "";

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
        document.createElement("div");

      row.className =
        "type-row";

      const typeName =
        document.createElement("span");

      typeName.className =
        "type-name";

      typeName.innerText =
        formatEventName(type);

      const typeCount =
        document.createElement("span");

      typeCount.className =
        "type-count";

      typeCount.innerText =
        count;

      row.appendChild(
        typeName
      );

      row.appendChild(
        typeCount
      );

      typeContainer.appendChild(
        row
      );
    }
  );

  if (!sortedTypes.length) {
    typeContainer.innerHTML =
      `<span class="loading-state">No event type data available.</span>`;
  }
}


// ======================================================
// TOGGLE HEATMAP
// ======================================================

function toggleHeatmap() {
  heatVisible =
    !heatVisible;

  const heatButton =
    getElement("heatBtn");

  if (heatButton) {
    heatButton.classList.toggle(
      "active",
      heatVisible
    );
  }

  if (!heatLayer) {
    return;
  }

  if (heatVisible) {
    heatLayer.addTo(map);
  } else {
    map.removeLayer(
      heatLayer
    );
  }
}


// ======================================================
// FETCH IMPACT DASHBOARD DATA
// ======================================================

async function fetchImpactDashboard() {
  const response =
    await fetch(
      `${API_BASE}/api/impact`
    );

  if (!response.ok) {
    throw new Error(
      `Impact API HTTP ${response.status}`
    );
  }

  const impact =
    await response.json();

  setText(
    "impactBuses",
    impact.buses_monitoring ?? "—"
  );

  setText(
    "impactRoadKm",
    impact.road_km_monitored ?? "—"
  );

  setText(
    "impactIssues",
    impact.issues_detected ?? "—"
  );

  setText(
    "impactTickets",
    impact.tickets_created ?? "—"
  );

  setText(
    "impactResolved",
    impact.issues_resolved ?? "—"
  );

  setText(
    "impactResponse",
    impact.avg_response_time ?? "—"
  );
}


// ======================================================
// FETCH ROAD HEALTH
// ======================================================

async function fetchRoadHealth() {
  const response =
    await fetch(
      `${API_BASE}/api/road-health`
    );

  if (!response.ok) {
    throw new Error(
      `Road Health API HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  setText(
    "roadHealthScore",
    data.road_health_score !== undefined
      ? `${data.road_health_score}/100`
      : "—"
  );

  setText(
    "roadHazards",
    data.total_hazards_30d !== undefined
      ? data.total_hazards_30d
      : "—"
  );

  setText(
    "roadTrend",
    data.trend
      ? String(data.trend).toUpperCase()
      : "—"
  );

  setText(
    "roadRecommendation",
    data.recommendation || "—"
  );

  if (data.corridor) {
    setText(
      "roadCorridor",
      data.corridor
    );
  }
}


// ======================================================
// FETCH BUS LOCATIONS & MARKERS
// ======================================================

async function fetchBuses() {
  const response =
    await fetch(
      `${API_BASE}/api/buses`
    );

  if (!response.ok) {
    throw new Error(
      `Buses API HTTP ${response.status}`
    );
  }

  const buses =
    await response.json();

  if (!Array.isArray(buses)) {
    throw new Error(
      "Buses API returned an invalid response."
    );
  }

  busMarkersLayer.clearLayers();

  const impactBuses =
    getElement("impactBuses");

  if (impactBuses) {
    impactBuses.innerText =
      buses.length;
  }

  buses.forEach(bus => {
    const latitude =
      Number(bus.latitude);

    const longitude =
      Number(bus.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return;
    }

    const busId =
      bus.bus_id || "BUS";

    const busIcon =
      L.divIcon({
        className:
          "bus-marker-icon",

        html: `
          <div class="bus-marker-pin">
            <span class="bus-icon">🚌</span>
            <span>${busId}</span>
          </div>
        `,

        iconSize: [80, 26],

        iconAnchor: [40, 13]
      });

    const statusText =
      String(
        bus.status || "active"
      ).toUpperCase();

    const marker =
      L.marker(
        [latitude, longitude],
        {
          icon: busIcon
        }
      );

    marker.bindTooltip(
      `<b>${busId}</b><br>` +
      `Route: ${bus.route || "—"}<br>` +
      `Status: ${statusText}`
    );

    marker.addTo(
      busMarkersLayer
    );
  });
}


// ======================================================
// BACKEND STATUS UI
// ======================================================

function updateBackendStatusUI(
  status,
  label
) {
  const pulseEl =
    getElement("backendPulse");

  const labelEl =
    getElement("backendStatusLabel");

  if (!pulseEl || !labelEl) {
    return;
  }

  pulseEl.className =
    `pulse-dot ${status}`;

  let hostStr =
    API_BASE;

  try {
    const url =
      new URL(API_BASE);

    hostStr =
      url.host;
  } catch (error) {
    // Keep API_BASE when it is not a valid URL.
  }

  if (status === "online") {
    labelEl.textContent =
      `ONLINE (${hostStr})`;

    labelEl.style.color =
      "#22a06b";

  } else if (status === "waking") {
    labelEl.textContent =
      label ||
      "WAKING UP...";

    labelEl.style.color =
      "#d99100";

  } else {
    labelEl.textContent =
      label ||
      `OFFLINE (${hostStr})`;

    labelEl.style.color =
      "#d64545";
  }
}


// ======================================================
// SAFE API CALL WRAPPER
// ======================================================
//
// Each dashboard section is allowed to fail independently.
// One broken endpoint will not prevent the other sections
// from loading.
// ======================================================

async function runDashboardRequest(
  name,
  request
) {
  try {
    await request();

    return {
      name,
      success: true
    };

  } catch (error) {
    console.warn(
      `${name} unavailable:`,
      error.message
    );

    return {
      name,
      success: false,
      error
    };
  }
}


// ======================================================
// FETCH ALL DATA
// ======================================================

async function fetchAll() {
  if (isFetching) {
    return;
  }

  isFetching =
    true;

  const wakingTimer =
    setTimeout(() => {
      updateBackendStatusUI(
        "waking",
        "WAKING UP..."
      );
    }, 2500);

  const results =
    await Promise.all([
      runDashboardRequest(
        "Events",
        fetchEvents
      ),

      runDashboardRequest(
        "Heatmap",
        fetchHeatmap
      ),

      runDashboardRequest(
        "Stats",
        fetchStats
      ),

      runDashboardRequest(
        "Impact",
        fetchImpactDashboard
      ),

      runDashboardRequest(
        "Road Health",
        fetchRoadHealth
      ),

      runDashboardRequest(
        "Buses",
        fetchBuses
      )
    ]);

  clearTimeout(
    wakingTimer
  );

  const eventsResult =
    results.find(
      result =>
        result.name === "Events"
    );

  const successfulRequests =
    results.filter(
      result =>
        result.success
    ).length;

  const totalRequests =
    results.length;

  if (
    successfulRequests ===
    totalRequests
  ) {
    updateBackendStatusUI(
      "online"
    );

  } else if (
    successfulRequests > 0
  ) {
    updateBackendStatusUI(
      "waking",
      `PARTIAL DATA (${successfulRequests}/${totalRequests})`
    );

  } else {
    updateBackendStatusUI(
      "offline"
    );
  }

  if (
    eventsResult &&
    !eventsResult.success &&
    allEvents.length === 0
  ) {
    renderEventMarkers([]);

    renderEventFeed([]);
  }

  isFetching =
    false;
}


// ======================================================
// INITIALIZE FILTERS
// ======================================================

initializeFilters();


// ======================================================
// START DASHBOARD
// ======================================================

fetchAll();


// ======================================================
// LIVE POLLING
// ======================================================
//
// Keep the dashboard synchronized with backend changes.
// ======================================================

setInterval(
  fetchAll,
  4000
);


// ======================================================
// CLOSE MODALS WHEN CLICKING OUTSIDE
// ======================================================

const eventModal =
  getElement("eventModal");

if (eventModal) {
  eventModal.addEventListener(
    "click",
    function(event) {
      if (
        event.target === this
      ) {
        closeEventModal();
      }
    }
  );
}


const ticketModal =
  getElement("ticketModal");

if (ticketModal) {
  ticketModal.addEventListener(
    "click",
    function(event) {
      if (
        event.target === this
      ) {
        closeTicketModal();
      }
    }
  );
}


// ======================================================
// ESCAPE KEY — CLOSE MODALS
// ======================================================

document.addEventListener(
  "keydown",
  function(event) {
    if (event.key !== "Escape") {
      return;
    }

    closeEventModal();
    closeTicketModal();
  }
);