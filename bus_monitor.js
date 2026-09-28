"use strict";

/*
 * Urban Intelligence Platform — Bus Monitor
 *
 * Behaviour:
 * 1. Shows the local pothole evidence frame immediately.
 * 2. Uses real /api/buses and /api/events data when available.
 * 3. If the backend has no event yet, keeps the page populated with a clearly
 *    labelled local demo detection instead of leaving the interface empty.
 * 4. Never generates a fake SVG/image. The evidence frame is pothole.jpg.
 */

const API_BASE =
  typeof CONFIG !== "undefined" && typeof CONFIG.getApiBase === "function"
    ? CONFIG.getApiBase()
    : "http://127.0.0.1:5000";

const ENDPOINTS = {
  health: `${API_BASE}/api/health`,
  buses: `${API_BASE}/api/buses`,
  events: `${API_BASE}/api/events`
};

/*
 * Local demonstration data.
 *
 * This is used ONLY when the backend has no active bus/event.
 * Once real backend data exists, the UI switches to that data automatically.
 */
const DEMO_DATA = {
  bus_id: "BUS-001",
  route_id: "ROUTE-18",
  camera_id: "CAM-01",

  latitude: 19.0760,
  longitude: 72.8777,

  speed: 38.4,
  heading: 184,
  altitude: 14,

  inference_ms: 18.2,
  fps: 29.4,

  confidence: 0.90,
  severity: "HIGH",
  detection_count: 1,

  event_type: "pothole",

  timestamp: new Date().toISOString(),

  bbox: {
    x1: 71.66,
    y1: 114.67,
    x2: 459.37,
    y2: 303.32
  },

  evidence_image: "pothole.jpg",

  model: "YOLOv8 Pothole-Edge",

  source: "local_demo"
};

const state = {
  bus: null,
  event: null,

  demoMode: true,

  bboxVisible: true,

  feedMode: "image",

  backendOnline: false,

  submitting: false,

  toastTimer: null
};

/* =========================================================
   DOM HELPER
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value ?? "--";
  }
}

function setHTML(id, value) {
  const element = $(id);

  if (element) {
    element.innerHTML = value ?? "";
  }
}

function setStyle(id, property, value) {
  const element = $(id);

  if (element) {
    element.style[property] = value;
  }
}

function setVisible(id, visible) {
  const element = $(id);

  if (element) {
    element.hidden = !visible;
  }
}

/* =========================================================
   GENERIC HELPERS
   ========================================================= */

function firstDefined(...values) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );
}

function numberValue(value, fallback = null) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function formatConfidence(value) {
  const confidence = numberValue(value);

  if (confidence === null) {
    return "--";
  }

  const percentage =
    confidence <= 1
      ? confidence * 100
      : confidence;

  return `${percentage.toFixed(0)}%`;
}

function formatCoordinate(value, digits = 4) {
  const parsed = numberValue(value);

  return parsed === null
    ? "--"
    : parsed.toFixed(digits);
}

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium"
  });
}

/* =========================================================
   EXTRA / JSON PARSER
   ========================================================= */

function parseExtra(event) {
  if (!event || !event.extra) {
    return {};
  }

  if (typeof event.extra === "object") {
    return event.extra;
  }

  try {
    return JSON.parse(event.extra);
  } catch (_) {
    return {};
  }
}

/* =========================================================
   NORMALIZE BUS DATA
   ========================================================= */

function normalizeBus(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    ...raw,

    bus_id: firstDefined(
      raw.bus_id,
      raw.busId,
      raw.id
    ),

    route_id: firstDefined(
      raw.route_id,
      raw.routeId,
      raw.route
    ),

    camera_id: firstDefined(
      raw.camera_id,
      raw.cameraId,
      raw.camera
    ),

    latitude: firstDefined(
      raw.latitude,
      raw.lat
    ),

    longitude: firstDefined(
      raw.longitude,
      raw.lng,
      raw.lon
    ),

    speed: firstDefined(
      raw.speed,
      raw.speed_kmh,
      raw.speedKmh
    ),

    heading: firstDefined(
      raw.heading,
      raw.heading_deg
    ),

    altitude: firstDefined(
      raw.altitude,
      raw.altitude_m
    ),

    inference_ms: firstDefined(
      raw.inference_ms,
      raw.inferenceTime,
      raw.inference_time
    ),

    fps: firstDefined(
      raw.fps,
      raw.frame_rate
    ),

    timestamp: firstDefined(
      raw.timestamp,
      raw.last_seen,
      raw.updated_at
    )
  };
}

/* =========================================================
   NORMALIZE EVENT DATA
   ========================================================= */

function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const extra = parseExtra(raw);

  const bbox = firstDefined(
    raw.bbox,
    extra.bbox,
    extra.bounding_box
  );

  return {
    ...raw,
    ...extra,

    id: firstDefined(
      raw.id,
      raw.event_id,
      extra.event_id
    ),

    event_type: firstDefined(
      raw.event_type,
      extra.event_type,
      "pothole"
    ),

    bus_id: firstDefined(
      raw.bus_id,
      extra.bus_id,
      state.bus?.bus_id
    ),

    route_id: firstDefined(
      raw.route_id,
      extra.route_id,
      state.bus?.route_id
    ),

    camera_id: firstDefined(
      raw.camera_id,
      extra.camera_id,
      state.bus?.camera_id
    ),

    latitude: firstDefined(
      raw.latitude,
      extra.latitude,
      state.bus?.latitude
    ),

    longitude: firstDefined(
      raw.longitude,
      extra.longitude,
      state.bus?.longitude
    ),

    timestamp: firstDefined(
      raw.timestamp,
      raw.received_at,
      extra.timestamp
    ),

    confidence: firstDefined(
      raw.confidence,
      extra.confidence
    ),

    severity: firstDefined(
      raw.severity,
      extra.severity,
      "HIGH"
    ),

    detection_count: firstDefined(
      raw.detection_count,
      extra.detection_count,
      1
    ),

    bbox,

    image_base64: firstDefined(
      raw.image_base64,
      raw.imageBase64,
      extra.image_base64
    ),

    evidence_image: firstDefined(
      raw.evidence_image,
      extra.evidence_image,
      "pothole.jpg"
    ),

    inference_ms: firstDefined(
      raw.inference_ms,
      extra.inference_ms,
      state.bus?.inference_ms,
      DEMO_DATA.inference_ms
    ),

    fps: firstDefined(
      raw.fps,
      extra.fps,
      state.bus?.fps,
      DEMO_DATA.fps
    ),

    speed: firstDefined(
      raw.speed,
      extra.speed,
      state.bus?.speed
    ),

    heading: firstDefined(
      raw.heading,
      extra.heading,
      state.bus?.heading
    ),

    altitude: firstDefined(
      raw.altitude,
      extra.altitude,
      state.bus?.altitude
    ),

    model: firstDefined(
      raw.model,
      extra.model,
      DEMO_DATA.model
    )
  };
}

/* =========================================================
   FETCH HELPER
   ========================================================= */

async function fetchJSON(
  url,
  options = {},
  timeout = 5000
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   CLOCK
   ========================================================= */

function updateClock() {
  const now = new Date();

  const local =
    now.toLocaleTimeString(
      "en-IN",
      {
        hour12: false
      }
    );

  const utc =
    now.toISOString().slice(11, 19);

  setText(
    "liveClock",
    `${local} LOCAL | ${utc} UTC`
  );
}

/* =========================================================
   BACKEND STATUS
   ========================================================= */

function renderBackendStatus(online) {
  state.backendOnline = online;

  const host = (() => {
    try {
      return new URL(API_BASE).host;
    } catch (_) {
      return API_BASE;
    }
  })();

  setText(
    "backendStatusText",
    online
      ? `ONLINE (${host})`
      : `OFFLINE (${host})`
  );

  setStyle(
    "backendStatusText",
    "color",
    online
      ? "#22a06b"
      : "#d64545"
  );
}

async function checkBackend() {
  try {
    await fetchJSON(
      ENDPOINTS.health,
      {},
      3500
    );

    renderBackendStatus(true);
  } catch (_) {
    renderBackendStatus(false);
  }
}

/* =========================================================
   BUS UI
   ========================================================= */

function applyBusToUI(bus) {
  if (!bus) {
    return;
  }

  /* Header */

  setText(
    "hdrBusId",
    bus.bus_id || "--"
  );

  setText(
    "hdrRouteId",
    bus.route_id || "--"
  );

  setText(
    "hdrCamId",
    bus.camera_id || "--"
  );

  /* Footer */

  setText(
    "ftrBusId",
    bus.bus_id || "--"
  );

  setText(
    "ftrRoute",
    bus.route_id || "--"
  );

  setText(
    "ftrCam",
    bus.camera_id || "--"
  );

  setText(
    "ftrGps",
    `${formatCoordinate(bus.latitude)}, ${formatCoordinate(bus.longitude)}`
  );

  /* Camera */

  setText(
    "cameraTag",
    bus.camera_id || "--"
  );

  /* HUD */

  setText(
    "hudCameraId",
    bus.camera_id || "--"
  );

  setText(
    "hudInferenceTime",
    bus.inference_ms !== undefined
      ? `${numberValue(
          bus.inference_ms,
          DEMO_DATA.inference_ms
        ).toFixed(1)} ms`
      : "--"
  );

  setText(
    "hudFps",
    bus.fps !== undefined
      ? numberValue(
          bus.fps,
          DEMO_DATA.fps
        ).toFixed(1)
      : "--"
  );

  setText(
    "hudHeading",
    bus.heading !== undefined
      ? `${numberValue(
          bus.heading,
          DEMO_DATA.heading
        ).toFixed(0)}°`
      : "--"
  );

  setText(
    "hudSpeed",
    bus.speed !== undefined
      ? `${numberValue(
          bus.speed,
          DEMO_DATA.speed
        ).toFixed(1)} KM/H`
      : "--"
  );

  setText(
    "hudAltitude",
    bus.altitude !== undefined
      ? `${numberValue(
          bus.altitude,
          DEMO_DATA.altitude
        ).toFixed(0)} m`
      : "--"
  );

  setText(
    "hudGps",
    `${formatCoordinate(bus.latitude)}, ${formatCoordinate(bus.longitude)}`
  );

  setText(
    "ftrTimestamp",
    formatTimestamp(bus.timestamp)
  );

  setText(
    "modelInfo",
    bus.model || DEMO_DATA.model
  );

  setText(
    "aiPipelineStatus",
    state.demoMode
      ? "LOCAL EVIDENCE"
      : "AI PIPELINE ONLINE"
  );
}

/* =========================================================
   BUS ID FROM URL
   ========================================================= */

function getBusIdFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return (
    params.get("bus_id") ||
    params.get("bus") ||
    null
  );
}

/* =========================================================
   LOAD BUS DATA
   ========================================================= */

async function loadBus() {
  try {
    const payload =
      await fetchJSON(
        ENDPOINTS.buses
      );

    const rows =
      Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.buses)
          ? payload.buses
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

    const requestedId =
      getBusIdFromUrl();

    const selected =
      rows.find((row) => {
        const bus =
          normalizeBus(row);

        return (
          requestedId &&
          bus?.bus_id === requestedId
        );
      }) || rows[0];

    if (selected) {
      state.bus =
        normalizeBus(selected);

      applyBusToUI(
        state.bus
      );

      return state.bus;
    }
  } catch (error) {
    console.warn(
      "Bus telemetry unavailable:",
      error
    );
  }

  /*
   * Backend did not return bus data.
   * Keep the page populated with local demonstration data.
   */

  state.bus =
    normalizeBus(DEMO_DATA);

  applyBusToUI(
    state.bus
  );

  return state.bus;
}

/* =========================================================
   LATEST EVENT
   ========================================================= */

function getLatestEvent(events) {
  if (
    !Array.isArray(events) ||
    events.length === 0
  ) {
    return null;
  }

  return events
    .map(normalizeEvent)
    .filter(Boolean)
    .sort((a, b) => {
      const ta =
        new Date(
          a.timestamp || 0
        ).getTime();

      const tb =
        new Date(
          b.timestamp || 0
        ).getTime();

      return (
        tb - ta ||
        Number(b.id || 0) -
          Number(a.id || 0)
      );
    })[0];
}

/* =========================================================
   DEMO EVENT
   ========================================================= */

function demoEvent() {
  return normalizeEvent({
    ...DEMO_DATA,

    timestamp:
      new Date().toISOString(),

    image_base64: null
  });
}

/* =========================================================
   LOAD LATEST EVENT
   ========================================================= */

async function loadLatestEvent() {
  const busId =
    state.bus?.bus_id ||
    DEMO_DATA.bus_id;

  try {
    const url =
      `${ENDPOINTS.events}?bus_id=${encodeURIComponent(
        busId
      )}`;

    const payload =
      await fetchJSON(url);

    const events =
      Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.events)
          ? payload.events
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

    const latest =
      getLatestEvent(
        events.filter((event) => {
          const type =
            String(
              event?.event_type ||
              event?.type ||
              ""
            ).toLowerCase();

          return (
            !type ||
            type === "pothole" ||
            type === "road_damage"
          );
        })
      );

    if (latest) {
      state.demoMode = false;

      state.event = latest;

      renderDetection(
        latest
      );

      return latest;
    }
  } catch (error) {
    console.warn(
      "No live event available:",
      error
    );
  }

  /*
   * No backend event.
   *
   * Use local pothole evidence so the interface
   * remains useful instead of showing empty cards.
   */

  state.demoMode = true;

  state.event =
    demoEvent();

  renderDetection(
    state.event
  );

  return state.event;
}

/* =========================================================
   BOUNDING BOX
   ========================================================= */

function getBBox(event) {
  const raw =
    event?.bbox;

  if (!raw) {
    return null;
  }

  if (
    Array.isArray(raw) &&
    raw.length >= 4
  ) {
    return {
      x1: numberValue(raw[0]),
      y1: numberValue(raw[1]),
      x2: numberValue(raw[2]),
      y2: numberValue(raw[3])
    };
  }

  if (
    typeof raw === "object"
  ) {
    return {
      x1: numberValue(
        firstDefined(
          raw.x1,
          raw.x,
          raw.left
        )
      ),

      y1: numberValue(
        firstDefined(
          raw.y1,
          raw.y,
          raw.top
        )
      ),

      x2: numberValue(
        firstDefined(
          raw.x2,
          raw.right
        )
      ),

      y2: numberValue(
        firstDefined(
          raw.y2,
          raw.bottom
        )
      )
    };
  }

  return null;
}

function renderBBox(event) {
  const bbox =
    getBBox(event);

  const box =
    $("potholeBBox");

  if (
    !box ||
    !bbox ||
    [
      bbox.x1,
      bbox.y1,
      bbox.x2,
      bbox.y2
    ].some(
      (value) =>
        value === null
    )
  ) {
    if (box) {
      box.hidden = true;
    }

    return;
  }

  const imageWidth =
    numberValue(
      event.image_width,
      538
    );

  const imageHeight =
    numberValue(
      event.image_height,
      360
    );

  const width =
    Math.max(
      0,
      bbox.x2 - bbox.x1
    );

  const height =
    Math.max(
      0,
      bbox.y2 - bbox.y1
    );

  box.style.left =
    `${(bbox.x1 / imageWidth) * 100}%`;

  box.style.top =
    `${(bbox.y1 / imageHeight) * 100}%`;

  box.style.width =
    `${(width / imageWidth) * 100}%`;

  box.style.height =
    `${(height / imageHeight) * 100}%`;

  box.hidden =
    !state.bboxVisible;

  setText(
    "bboxLabel",
    `POTHOLE • ${formatConfidence(
      event.confidence
    )} • ${String(
      event.severity || "HIGH"
    ).toUpperCase()}`
  );

  setText(
    "bboxCoordinates",
    `BBOX: [${bbox.x1.toFixed(
      2
    )}, ${bbox.y1.toFixed(
      2
    )}, ${bbox.x2.toFixed(
      2
    )}, ${bbox.y2.toFixed(
      2
    )}]`
  );

  setText(
    "specBbox1",
    `X1: ${bbox.x1.toFixed(
      2
    )} px, Y1: ${bbox.y1.toFixed(
      2
    )} px`
  );

  setText(
    "specBbox2",
    `X2: ${bbox.x2.toFixed(
      2
    )} px, Y2: ${bbox.y2.toFixed(
      2
    )} px`
  );

  const area =
    width * height;

  setText(
    "specDefectArea",
    `${width.toFixed(
      1
    )} × ${height.toFixed(
      1
    )} px (${area.toFixed(
      0
    )} px²)`
  );
}

/* =========================================================
   EVIDENCE IMAGE
   ========================================================= */

function renderEvidence(event) {
  const image =
    $("frameImage");

  if (!image) {
    return;
  }

  image.hidden = false;

  image.style.display =
    state.feedMode === "image"
      ? "block"
      : "none";

  /*
   * Real backend evidence takes priority.
   */

  if (event?.image_base64) {
    const value =
      String(
        event.image_base64
      );

    image.src =
      value.startsWith(
        "data:image/"
      )
        ? value
        : `data:image/jpeg;base64,${value}`;

    return;
  }

  /*
   * Otherwise use the actual local pothole image.
   */

  image.src =
    event?.evidence_image ||
    DEMO_DATA.evidence_image;
}

/* =========================================================
   RENDER DETECTION
   ========================================================= */

function renderDetection(event) {
  const confidence =
    numberValue(
      event.confidence,
      DEMO_DATA.confidence
    );

  const severity =
    String(
      event.severity ||
      "HIGH"
    ).toUpperCase();

  const count =
    numberValue(
      event.detection_count,
      1
    );

  /* Main alert */

  setText(
    "detectionVerdict",
    "POTHOLE DETECTED"
  );

  setText(
    "detectionSubtitle",
    state.demoMode
      ? "Local pothole evidence frame • waiting for live AI event"
      : "Road surface pothole reported by onboard edge AI"
  );

  setText(
    "detectionBadge",
    state.demoMode
      ? `${severity} • DEMO`
      : severity
  );

  /* Confidence */

  setText(
    "valConfidence",
    formatConfidence(
      confidence
    )
  );

  setText(
    "confidenceStatus",
    state.demoMode
      ? "LOCAL FRAME"
      : "VALIDATED"
  );

  setText(
    "confidenceSub",
    "Detection confidence"
  );

  /* Severity */

  setText(
    "valSeverity",
    severity
  );

  setText(
    "severityStatus",
    severity === "CRITICAL"
      ? "CRITICAL"
      : "HIGH PRIORITY"
  );

  setText(
    "severitySub",
    "AI classification"
  );

  /* Count */

  setText(
    "valCount",
    String(count)
  );

  setText(
    "countStatus",
    "IN FRAME"
  );

  setText(
    "countSub",
    "Detected pothole(s)"
  );

  /* Spatial information */

  setText(
    "specStatus",
    state.demoMode
      ? "DEMO DETECTION"
      : "THREAT DETECTED"
  );

  setText(
    "specInferenceSpeed",
    `${numberValue(
      event.inference_ms,
      DEMO_DATA.inference_ms
    ).toFixed(
      1
    )} ms (YOLOv8)`
  );

  /* Event */

  setText(
    "ftrEventId",
    event.id
      ? `#${event.id}`
      : "DEMO"
  );

  setText(
    "ftrTimestamp",
    formatTimestamp(
      event.timestamp
    )
  );

  /* HUD */

  setText(
    "hudCameraId",
    event.camera_id ||
      state.bus?.camera_id ||
      DEMO_DATA.camera_id
  );

  setText(
    "hudInferenceTime",
    `${numberValue(
      event.inference_ms,
      DEMO_DATA.inference_ms
    ).toFixed(
      1
    )} ms`
  );

  setText(
    "hudFps",
    numberValue(
      event.fps,
      DEMO_DATA.fps
    ).toFixed(1)
  );

  setText(
    "hudHeading",
    `${numberValue(
      event.heading,
      DEMO_DATA.heading
    ).toFixed(0)}°`
  );

  setText(
    "hudSpeed",
    `${numberValue(
      event.speed,
      DEMO_DATA.speed
    ).toFixed(1)} KM/H`
  );

  setText(
    "hudAltitude",
    `${numberValue(
      event.altitude,
      DEMO_DATA.altitude
    ).toFixed(0)} m`
  );

  setText(
    "hudGps",
    `${formatCoordinate(
      event.latitude
    )}, ${formatCoordinate(
      event.longitude
    )}`
  );

  /* Footer */

  setText(
    "ftrGps",
    `${formatCoordinate(
      event.latitude
    )}, ${formatCoordinate(
      event.longitude
    )}`
  );

  setText(
    "ftrBusId",
    event.bus_id ||
      state.bus?.bus_id ||
      DEMO_DATA.bus_id
  );

  setText(
    "ftrRoute",
    event.route_id ||
      state.bus?.route_id ||
      DEMO_DATA.route_id
  );

  setText(
    "ftrCam",
    event.camera_id ||
      state.bus?.camera_id ||
      DEMO_DATA.camera_id
  );

  setText(
    "modelInfo",
    event.model ||
      DEMO_DATA.model
  );

  /* Image + bounding box */

  renderEvidence(event);

  renderBBox(event);

  updateTransmissionState();
}

/* =========================================================
   TRANSMISSION STATUS
   ========================================================= */

function updateTransmissionState() {
  const button =
    $("btnSendEvent");

  if (button) {
    button.disabled =
      state.submitting;
  }

  if (state.demoMode) {
    setText(
      "transStatusText",
      "Status: DEMO DATA — NOT DISPATCHED"
    );

    setText(
      "lastHttpCode",
      "DEMO"
    );

    setText(
      "ftrStatusText",
      "LOCAL POTHOLE EVIDENCE"
    );

    setText(
      "aiPipelineStatus",
      "LOCAL EVIDENCE"
    );
  } else {
    setText(
      "transStatusText",
      "Status: READY TO DISPATCH"
    );

    setText(
      "lastHttpCode",
      "HTTP --"
    );

    setText(
      "ftrStatusText",
      "LIVE EVENT READY"
    );

    setText(
      "aiPipelineStatus",
      "AI PIPELINE ONLINE"
    );
  }
}

/* =========================================================
   IMAGE / VIDEO SWITCH
   ========================================================= */

function setFeedMode(mode) {
  state.feedMode =
    mode === "video"
      ? "video"
      : "image";

  const image =
    $("frameImage");

  const video =
    $("frameVideo");

  const imageButton =
    $("btnTestFrame");

  const videoButton =
    $("btnVideoFeed");

  if (
    state.feedMode === "video"
  ) {
    const source =
      video?.querySelector(
        "source"
      )?.getAttribute(
        "src"
      );

    if (source) {
      if (image) {
        image.style.display =
          "none";
      }

      if (video) {
        video.style.display =
          "block";
      }

      video.play().catch(
        () => {}
      );

      imageButton?.classList.remove(
        "active"
      );

      videoButton?.classList.add(
        "active"
      );
    } else {
      state.feedMode =
        "image";
    }
  }

  if (
    state.feedMode === "image"
  ) {
    if (video) {
      video.pause();

      video.style.display =
        "none";
    }

    if (image) {
      image.style.display =
        "block";

      image.hidden =
        false;
    }

    imageButton?.classList.add(
      "active"
    );

    videoButton?.classList.remove(
      "active"
    );
  }

  renderBBox(
    state.event ||
      demoEvent()
  );
}

/* =========================================================
   BOUNDING BOX TOGGLE
   ========================================================= */

function toggleBBox() {
  state.bboxVisible =
    !state.bboxVisible;

  const box =
    $("potholeBBox");

  if (box) {
    box.hidden =
      !state.bboxVisible;
  }

  setText(
    "btnToggleBBox",
    state.bboxVisible
      ? "🎯 BBox: ON"
      : "🎯 BBox: OFF"
  );

  $("btnToggleBBox")
    ?.classList.toggle(
      "active",
      state.bboxVisible
    );
}

/* =========================================================
   IMAGE ERROR
   ========================================================= */

function handleImageFallback(image) {
  image.hidden = false;

  image.removeAttribute(
    "onerror"
  );

  setText(
    "viewportStateTitle",
    "Pothole image not found"
  );

  setText(
    "viewportStateMessage",
    "Place pothole.jpg in the same folder as bus-monitor.html."
  );

  setVisible(
    "viewportState",
    true
  );
}

/* =========================================================
   SEND EVENT TO COMMAND CENTER
   ========================================================= */

async function sendToCommandCenter() {
  if (
    state.submitting ||
    !state.event
  ) {
    return;
  }

  state.submitting =
    true;

  const button =
    $("btnSendEvent");

  const buttonText =
    $("btnSendText");

  if (button) {
    button.disabled =
      true;
  }

  setText(
    "btnSendText",
    "TRANSMITTING..."
  );

  setText(
    "transStatusText",
    "Status: DISPATCHING EVENT..."
  );

  const event =
    state.event;

  const payload = {
    event_type: "pothole",

    confidence:
      numberValue(
        event.confidence,
        DEMO_DATA.confidence
      ),

    latitude:
      numberValue(
        event.latitude,
        DEMO_DATA.latitude
      ),

    longitude:
      numberValue(
        event.longitude,
        DEMO_DATA.longitude
      ),

    timestamp:
      new Date().toISOString(),

    bus_id:
      event.bus_id ||
      DEMO_DATA.bus_id,

    image_base64:
      event.image_base64 ||
      null,

    extra: {
      severity:
        event.severity ||
        DEMO_DATA.severity,

      route_id:
        event.route_id ||
        DEMO_DATA.route_id,

      camera_id:
        event.camera_id ||
        DEMO_DATA.camera_id,

      evidence_image:
        event.evidence_image ||
        DEMO_DATA.evidence_image,

      detection_count:
        numberValue(
          event.detection_count,
          1
        ),

      bbox:
        getBBox(event),

      inference_ms:
        numberValue(
          event.inference_ms,
          DEMO_DATA.inference_ms
        ),

      fps:
        numberValue(
          event.fps,
          DEMO_DATA.fps
        ),

      source:
        state.demoMode
          ? "bus_monitor_demo"
          : "bus_monitor"
    }
  };

  try {
    const response =
      await fetch(
        ENDPOINTS.events,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );

    setText(
      "lastHttpCode",
      `HTTP ${response.status}`
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    let result = {};

    try {
      result =
        await response.json();
    } catch (_) {
      result = {};
    }

    const id =
      firstDefined(
        result.id,
        result.event_id
      );

    state.demoMode =
      false;

    if (id) {
      setText(
        "ftrEventId",
        `#${id}`
      );
    }

    setText(
      "transStatusText",
      id
        ? `Status: EVENT SENT (ID #${id})`
        : "Status: EVENT SENT"
    );

    setText(
      "ftrStatusText",
      "EVENT SENT TO COMMAND CENTER"
    );

    setText(
      "btnSendText",
      "✓ EVENT DISPATCHED"
    );

    showToast(
      "Event Sent",
      id
        ? `Pothole event #${id} was registered by the backend.`
        : "Pothole event was accepted by the backend."
    );
  } catch (error) {
    console.error(
      "Pothole event transmission failed:",
      error
    );

    setText(
      "lastHttpCode",
      "HTTP ERR"
    );

    setText(
      "transStatusText",
      "Status: TRANSMISSION FAILED"
    );

    setText(
      "btnSendText",
      "RETRY TRANSMISSION"
    );

    showToast(
      "Transmission Failed",
      `Could not send the pothole event to ${API_BASE}.`
    );
  } finally {
    state.submitting =
      false;

    if (button) {
      button.disabled =
        false;
    }

    if (
      buttonText &&
      buttonText.textContent ===
        "TRANSMITTING..."
    ) {
      buttonText.textContent =
        "SEND TO COMMAND CENTER";
    }
  }
}

/* =========================================================
   TOAST
   ========================================================= */

function showToast(
  title,
  message
) {
  setText(
    "toastTitle",
    title
  );

  setText(
    "toastMessage",
    message
  );

  $("successToast")
    ?.classList.add(
      "show"
    );

  if (state.toastTimer) {
    clearTimeout(
      state.toastTimer
    );
  }

  state.toastTimer =
    setTimeout(
      closeToast,
      5000
    );
}

function closeToast() {
  $("successToast")
    ?.classList.remove(
      "show"
    );
}

/* =========================================================
   INITIAL VIEWPORT
   ========================================================= */

function initializeViewport() {
  const image =
    $("frameImage");

  if (image) {
    /*
     * IMPORTANT:
     * This is the actual pothole image.
     * No generated placeholder is used.
     */
    image.src =
      DEMO_DATA.evidence_image;

    image.hidden =
      false;

    image.style.display =
      "block";

    image.addEventListener(
      "error",
      () =>
        handleImageFallback(
          image
        ),
      {
        once: true
      }
    );
  }

  setVisible(
    "viewportState",
    false
  );

  setText(
    "viewportStateTitle",
    "Pothole Evidence"
  );

  setText(
    "viewportStateMessage",
    "Local pothole evidence frame loaded."
  );

  setText(
    "btnToggleBBox",
    "🎯 BBox: ON"
  );
}

/* =========================================================
   REFRESH
   ========================================================= */

async function refresh() {
  await loadBus();

  await loadLatestEvent();
}

/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.setFeedMode =
  setFeedMode;

window.toggleBBox =
  toggleBBox;

window.sendToCommandCenter =
  sendToCommandCenter;

window.closeToast =
  closeToast;

window.handleImageFallback =
  handleImageFallback;

/* =========================================================
   INITIALIZATION
   ========================================================= */

window.addEventListener(
  "DOMContentLoaded",
  async () => {
    initializeViewport();

    updateClock();

    setInterval(
      updateClock,
      1000
    );

    /*
     * Render local pothole evidence immediately.
     * This prevents the page from opening with empty cards.
     */
    state.bus =
      normalizeBus(
        DEMO_DATA
      );

    state.event =
      demoEvent();

    state.demoMode =
      true;

    applyBusToUI(
      state.bus
    );

    renderDetection(
      state.event
    );

    /*
     * Now try to replace demo data
     * with real backend data.
     */
    await checkBackend();

    await refresh();

    /*
     * Backend health check.
     */
    setInterval(
      checkBackend,
      10000
    );

    /*
     * Refresh bus/event data.
     */
    setInterval(
      refresh,
      5000
    );
  }
);