/* =========================================================
   URBAN INTELLIGENCE PLATFORM
   ANALYTICS PAGE
   ========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
========================================================= */

const API_BASE =
  typeof CONFIG !== "undefined" && typeof CONFIG.getApiBase === "function"
    ? CONFIG.getApiBase()
    : "http://localhost:5000";

/* =========================================================
   APPLICATION STATE
========================================================= */

const analyticsState = {
  charts: {
    issueTrend: null,
    issueType: null,
    severity: null,
    ticketStatus: null,
  },

  filters: {
    eventType: "ALL",
    severity: "ALL",
    period: "ALL",
  },

  data: {
    overview: null,
    issuesByType: null,
    issuesOverTime: null,
    severity: null,
    tickets: null,
    roadHealth: null,
    hotspots: null,
    busCoverage: null,
    traffic: null,
  },

  requestInProgress: false,
};

/* =========================================================
   DOM HELPERS
========================================================= */

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent =
      value === null || value === undefined || value === ""
        ? "—"
        : String(value);
  }
}

function setHTML(id, html) {
  const element = getElement(id);

  if (element) {
    element.innerHTML = html;
  }
}

function escapeHTML(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   API HELPERS
========================================================= */

function buildApiUrl(endpoint) {
  const base = API_BASE.replace(/\/+$/, "");

  if (!endpoint.startsWith("/")) {
    return `${base}/${endpoint}`;
  }

  return `${base}${endpoint}`;
}

async function fetchJSON(endpoint, options = {}) {
  const response = await fetch(buildApiUrl(endpoint), {
    method: options.method || "GET",

    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },

    body: options.body,

    cache: "no-store",
  });

  let data = null;

  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object"
        ? data.error || data.message
        : null;

    throw new Error(
      message || `Request failed with status ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function unwrapData(payload) {
  if (!payload) {
    return null;
  }

  if (payload.data !== undefined) {
    return payload.data;
  }

  if (payload.result !== undefined) {
    return payload.result;
  }

  return payload;
}

function getArray(payload, possibleKeys = []) {
  const data = unwrapData(payload);

  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  for (const key of possibleKeys) {
    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  return [];
}

/* =========================================================
   VALUE HELPERS
========================================================= */

function getFirstValue(object, keys) {
  if (!object || typeof object !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return undefined;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toLocaleString("en-IN");
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return `${number.toFixed(1)}%`;
}

function formatLabel(value) {
  if (value === null || value === undefined || value === "") {
    return "Unknown";
  }

  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/* =========================================================
   BACKEND STATUS
========================================================= */

function setBackendStatus(status, message) {
  const dot = getElement("analyticsBackendDot");
  const label = getElement("analyticsBackendStatus");

  if (dot) {
    dot.className = "status-dot";

    if (status === "online") {
      dot.classList.add("online");
    } else if (status === "partial") {
      dot.classList.add("partial");
    } else if (status === "offline") {
      dot.classList.add("offline");
    }
  }

  if (label) {
    label.textContent = message;
  }
}

/* =========================================================
   DATA STATUS
========================================================= */

function setDataStatus(type, message) {
  const element = getElement("analyticsDataStatus");

  if (!element) {
    return;
  }

  element.className = "analytics-data-status";

  if (type) {
    element.classList.add(type);
  }

  element.innerHTML = message;
}

/* =========================================================
   CHART DEFAULTS
========================================================= */

function getChartFont() {
  return {
    family:
      'Inter, "Segoe UI", Roboto, Arial, sans-serif',
    size: 10,
  };
}

function getChartOptions() {
  return {
    responsive: true,

    maintainAspectRatio: false,

    animation: {
      duration: 250,
    },

    plugins: {
      legend: {
        labels: {
          font: getChartFont(),

          color: "#647b87",

          usePointStyle: true,

          pointStyle: "circle",

          padding: 14,
        },
      },

      tooltip: {
        backgroundColor: "#ffffff",

        borderColor: "#d7e8ef",

        borderWidth: 1,

        titleColor: "#344955",

        bodyColor: "#657b87",

        titleFont: {
          ...getChartFont(),

          weight: "700",
        },

        bodyFont: getChartFont(),

        padding: 9,

        displayColors: true,
      },
    },

    scales: {
      x: {
        border: {
          display: false,
        },

        grid: {
          color: "#edf3f6",
        },

        ticks: {
          color: "#7d919a",

          font: getChartFont(),

          maxRotation: 0,

          autoSkip: true,

          maxTicksLimit: 8,
        },
      },

      y: {
        beginAtZero: true,

        border: {
          display: false,
        },

        grid: {
          color: "#edf3f6",
        },

        ticks: {
          color: "#7d919a",

          font: getChartFont(),

          precision: 0,
        },
      },
    },
  };
}

/* =========================================================
   CHART AVAILABILITY
========================================================= */

function chartsAvailable() {
  return typeof Chart !== "undefined";
}

function destroyChart(chartName) {
  const chart = analyticsState.charts[chartName];

  if (chart) {
    chart.destroy();

    analyticsState.charts[chartName] = null;
  }
}

function showChartEmptyState(containerId, message) {
  const container = getElement(containerId);

  if (!container) {
    return;
  }

  const canvas = container.querySelector("canvas");

  if (canvas) {
    canvas.style.display = "none";
  }

  let state = container.querySelector(".chart-empty-message");

  if (!state) {
    state = document.createElement("div");

    state.className = "analytics-empty-state chart-empty-message";

    container.appendChild(state);
  }

  state.innerHTML = `
    <i class="fa-solid fa-chart-simple"></i>
    <p>${escapeHTML(message)}</p>
  `;
}

function showChartCanvas(containerId) {
  const container = getElement(containerId);

  if (!container) {
    return;
  }

  const canvas = container.querySelector("canvas");

  if (canvas) {
    canvas.style.display = "block";
  }

  const state = container.querySelector(".chart-empty-message");

  if (state) {
    state.remove();
  }
}

/* =========================================================
   FILTERS
========================================================= */

function readFilters() {
  const eventType = getElement("analyticsEventType");
  const severity = getElement("analyticsSeverity");
  const period = getElement("analyticsPeriod");

  analyticsState.filters.eventType =
    eventType?.value || "ALL";

  analyticsState.filters.severity =
    severity?.value || "ALL";

  analyticsState.filters.period =
    period?.value || "ALL";
}

function initializeFilters() {
  const eventType = getElement("analyticsEventType");
  const severity = getElement("analyticsSeverity");
  const period = getElement("analyticsPeriod");

  if (eventType) {
    eventType.addEventListener("change", () => {
      readFilters();
      loadAnalytics();
    });
  }

  if (severity) {
    severity.addEventListener("change", () => {
      readFilters();
      loadAnalytics();
    });
  }

  if (period) {
    period.addEventListener("change", () => {
      readFilters();
      loadAnalytics();
    });
  }
}

/* =========================================================
   QUERY PARAMETERS
========================================================= */

function buildAnalyticsQuery() {
  const params = new URLSearchParams();

  const {
    eventType,
    severity,
    period,
  } = analyticsState.filters;

  if (eventType && eventType !== "ALL") {
    params.set("event_type", eventType);
  }

  if (severity && severity !== "ALL") {
    params.set("severity", severity);
  }

  if (period && period !== "ALL") {
    params.set("days", period);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

/* =========================================================
   OVERVIEW
========================================================= */

async function fetchOverview() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/overview${query}`
  );

  analyticsState.data.overview = unwrapData(data);

  return analyticsState.data.overview;
}

function renderOverview(data) {
  if (!data || typeof data !== "object") {
    setText("analyticsTotalIssues", "—");
    setText("analyticsRoadHealth", "—");
    setText("analyticsTickets", "—");
    setText("analyticsActiveBuses", "—");

    return;
  }

  const totalIssues = getFirstValue(data, [
    "total_issues",
    "total_events",
    "issues",
    "event_count",
    "total",
  ]);

  const roadHealth = getFirstValue(data, [
    "road_health",
    "road_health_score",
    "average_road_health",
    "avg_road_health",
  ]);

  const tickets = getFirstValue(data, [
    "tickets_created",
    "total_tickets",
    "tickets",
    "ticket_count",
  ]);

  const activeBuses = getFirstValue(data, [
    "active_buses",
    "buses_active",
    "active_bus_count",
    "unique_buses",
    "bus_count",
  ]);

  setText(
    "analyticsTotalIssues",
    formatNumber(totalIssues)
  );

  setText(
    "analyticsRoadHealth",
    typeof roadHealth === "number"
      ? `${roadHealth.toFixed(0)}/100`
      : roadHealth ?? "—"
  );

  setText(
    "analyticsTickets",
    formatNumber(tickets)
  );

  setText(
    "analyticsActiveBuses",
    formatNumber(activeBuses)
  );

  const periodText =
    analyticsState.filters.period === "ALL"
      ? "All available data"
      : `Last ${analyticsState.filters.period} days`;

  setText(
    "analyticsTotalIssuesMeta",
    totalIssues !== undefined
      ? periodText
      : "Data unavailable"
  );

  setText(
    "analyticsRoadHealthMeta",
    roadHealth !== undefined
      ? "Overall road condition"
      : "Data unavailable"
  );

  setText(
    "analyticsTicketsMeta",
    tickets !== undefined
      ? "Authority workflow"
      : "Data unavailable"
  );

  setText(
    "analyticsBusesMeta",
    activeBuses !== undefined
      ? "Buses reporting detected events"
      : "Data unavailable"
  );
}

/* =========================================================
   ISSUES BY TYPE
========================================================= */

async function fetchIssuesByType() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/issues-by-type${query}`
  );

  analyticsState.data.issuesByType = data;

  return data;
}

function normalizeCategoryData(payload) {
  const data = unwrapData(payload);

  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (typeof item === "object") {
          return {
            label: getFirstValue(item, [
              "type",
              "event_type",
              "name",
              "label",
              "category",
            ]),

            value: getFirstValue(item, [
              "count",
              "value",
              "total",
              "issues",
            ]),
          };
        }

        return {
          label: String(item),
          value: 0,
        };
      })
      .filter(
        (item) =>
          item.label !== undefined &&
          item.value !== undefined
      );
  }

  if (data && typeof data === "object") {
    return Object.entries(data)
      .map(([label, value]) => ({
        label,

        value:
          typeof value === "object"
            ? getFirstValue(value, [
                "count",
                "value",
                "total",
              ])
            : value,
      }))
      .filter(
        (item) =>
          item.value !== undefined &&
          Number.isFinite(Number(item.value))
      );
  }

  return [];
}

function renderIssueTypeChart(payload) {
  const data = normalizeCategoryData(payload);

  destroyChart("issueType");

  if (!chartsAvailable() || data.length === 0) {
    showChartEmptyState(
      "issueTypeState",
      "No issue-type analytics are available."
    );

    return;
  }

  showChartCanvas("issueTypeState");

  const canvas = getElement("issueTypeChart");

  if (!canvas) {
    return;
  }

  analyticsState.charts.issueType = new Chart(
    canvas.getContext("2d"),
    {
      type: "doughnut",

      data: {
        labels: data.map((item) =>
          formatLabel(item.label)
        ),

        datasets: [
          {
            data: data.map((item) =>
              Number(item.value)
            ),

            backgroundColor: [
              "#62b9dc",
              "#79c9e5",
              "#8ed5e9",
              "#9ddfc0",
              "#e1c878",
              "#dca18f",
              "#b7a9d9",
            ],

            borderColor: "#ffffff",

            borderWidth: 2,

            hoverOffset: 4,
          },
        ],
      },

      options: {
        ...getChartOptions(),

        cutout: "62%",

        scales: {},

        plugins: {
          ...getChartOptions().plugins,

          legend: {
            position: "bottom",

            labels: {
              ...getChartFont(),

              color: "#647b87",

              usePointStyle: true,

              padding: 10,
            },
          },
        },
      },
    }
  );
}

/* =========================================================
   ISSUE TREND
========================================================= */

async function fetchIssuesOverTime() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/issues-over-time${query}`
  );

  analyticsState.data.issuesOverTime = data;

  return data;
}

/*
 * The backend returns:
 *
 * [
 *   {
 *     date: "2026-09-20",
 *     pothole: 4,
 *     congestion: 2,
 *     total: 6
 *   }
 * ]
 *
 * Normalize this into one total value per date.
 */
function normalizeTimeSeries(payload) {
  const data = unwrapData(payload);

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const label = getFirstValue(item, [
        "date",
        "day",
        "month",
        "period",
        "label",
        "timestamp",
      ]);

      let value = getFirstValue(item, [
        "total",
        "count",
        "value",
        "issues",
        "events",
      ]);

      /*
       * If total is not provided, calculate it from the
       * numeric event-type fields.
       */
      if (value === undefined) {
        value = Object.entries(item)
          .filter(([key, currentValue]) => {
            if (
              [
                "date",
                "day",
                "month",
                "period",
                "label",
                "timestamp",
                "total",
              ].includes(key)
            ) {
              return false;
            }

            return Number.isFinite(Number(currentValue));
          })
          .reduce(
            (sum, [, currentValue]) =>
              sum + Number(currentValue),
            0
          );
      }

      if (label === undefined) {
        return null;
      }

      return {
        label,
        value: Number(value),
      };
    })
    .filter(
      (item) =>
        item &&
        Number.isFinite(item.value)
    );
}

function renderIssueTrendChart(payload) {
  const data = normalizeTimeSeries(payload);

  destroyChart("issueTrend");

  if (!chartsAvailable() || data.length === 0) {
    showChartEmptyState(
      "issueTrendState",
      "No time-series analytics are available."
    );

    return;
  }

  showChartCanvas("issueTrendState");

  const canvas = getElement("issueTrendChart");

  if (!canvas) {
    return;
  }

  const options = getChartOptions();

  analyticsState.charts.issueTrend = new Chart(
    canvas.getContext("2d"),
    {
      type: "line",

      data: {
        labels: data.map((item) =>
          formatLabel(item.label)
        ),

        datasets: [
          {
            label: "Issues Detected",

            data: data.map((item) =>
              item.value
            ),

            borderColor: "#39a9d6",

            backgroundColor:
              "rgba(57, 169, 214, 0.10)",

            borderWidth: 2,

            pointRadius: 3,

            pointHoverRadius: 5,

            pointBackgroundColor: "#39a9d6",

            pointBorderColor: "#ffffff",

            pointBorderWidth: 1,

            fill: true,

            tension: 0.3,
          },
        ],
      },

      options,
    }
  );
}

/* =========================================================
   SEVERITY
========================================================= */

async function fetchSeverity() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/severity${query}`
  );

  analyticsState.data.severity = data;

  return data;
}

function renderSeverityChart(payload) {
  const data = normalizeCategoryData(payload);

  destroyChart("severity");

  if (!chartsAvailable() || data.length === 0) {
    showChartEmptyState(
      "severityState",
      "No severity analytics are available."
    );

    return;
  }

  showChartCanvas("severityState");

  const canvas = getElement("severityChart");

  if (!canvas) {
    return;
  }

  const colorMap = {
    CRITICAL: "#d65353",
    HIGH: "#d99100",
    MEDIUM: "#c9a12d",
    LOW: "#249a6b",
  };

  analyticsState.charts.severity = new Chart(
    canvas.getContext("2d"),
    {
      type: "bar",

      data: {
        labels: data.map((item) =>
          formatLabel(item.label)
        ),

        datasets: [
          {
            label: "Issues",

            data: data.map((item) =>
              Number(item.value)
            ),

            backgroundColor: data.map(
              (item) =>
                colorMap[
                  String(item.label).toUpperCase()
                ] || "#62b9dc"
            ),

            borderRadius: 5,

            borderSkipped: false,

            maxBarThickness: 34,
          },
        ],
      },

      options: {
        ...getChartOptions(),

        plugins: {
          ...getChartOptions().plugins,

          legend: {
            display: false,
          },
        },
      },
    }
  );
}

/* =========================================================
   TICKETS
========================================================= */

async function fetchTicketAnalytics() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/tickets${query}`
  );

  analyticsState.data.tickets = data;

  return data;
}

function renderTicketChart(payload) {
  const data = normalizeCategoryData(payload);

  destroyChart("ticketStatus");

  if (!chartsAvailable() || data.length === 0) {
    showChartEmptyState(
      "ticketStatusState",
      "No ticket analytics are available."
    );

    return;
  }

  showChartCanvas("ticketStatusState");

  const canvas = getElement("ticketStatusChart");

  if (!canvas) {
    return;
  }

  analyticsState.charts.ticketStatus =
    new Chart(canvas.getContext("2d"), {
      type: "doughnut",

      data: {
        labels: data.map((item) =>
          formatLabel(item.label)
        ),

        datasets: [
          {
            data: data.map((item) =>
              Number(item.value)
            ),

            backgroundColor: [
              "#62b9dc",
              "#e0bd65",
              "#79bd9f",
              "#d68b8b",
            ],

            borderColor: "#ffffff",

            borderWidth: 2,

            hoverOffset: 4,
          },
        ],
      },

      options: {
        ...getChartOptions(),

        cutout: "62%",

        scales: {},

        plugins: {
          ...getChartOptions().plugins,

          legend: {
            position: "bottom",

            labels: {
              ...getChartFont(),

              color: "#647b87",

              usePointStyle: true,

              padding: 10,
            },
          },
        },
      },
    });
}

/* =========================================================
   ROAD HEALTH
========================================================= */

async function fetchRoadHealth() {
  const data = await fetchJSON(
    "/api/road-health"
  );

  analyticsState.data.roadHealth = data;

  return data;
}

function getHealthClass(score) {
  const number = Number(score);

  if (!Number.isFinite(number)) {
    return "";
  }

  if (number >= 75) {
    return "health-good";
  }

  if (number >= 50) {
    return "health-medium";
  }

  return "health-poor";
}

/*
 * IMPORTANT:
 * /api/road-health currently returns ONE OBJECT,
 * not an array.
 *
 * Example:
 *
 * {
 *   corridor: "ANDHERI LINK ROAD",
 *   road_health_score: 72,
 *   potholes: 3,
 *   traffic: "HIGH",
 *   incidents: 2,
 *   priority: "HIGH"
 * }
 *
 * This renderer supports both the current object response
 * and a future array response.
 */
function renderRoadHealth(payload) {
  const container =
    getElement("roadHealthAnalytics");

  if (!container) {
    return;
  }

  const raw = unwrapData(payload);

  let data = [];

  if (Array.isArray(raw)) {
    data = raw;
  } else if (raw && typeof raw === "object") {
    const nested = getArray(raw, [
      "roads",
      "road_health",
      "items",
      "results",
    ]);

    data =
      nested.length > 0
        ? nested
        : [raw];
  }

  if (data.length === 0) {
    setHTML(
      "roadHealthAnalytics",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-road-circle-exclamation"></i>
          <p>No road health data is available.</p>
        </div>
      `
    );

    setText(
      "analyticsRoadHealth",
      "—"
    );

    setText(
      "analyticsRoadHealthMeta",
      "Data unavailable"
    );

    return;
  }

  const rows = data
    .map((road) => {
      const name = getFirstValue(road, [
        "road",
        "road_name",
        "corridor",
        "name",
      ]);

      const score = getFirstValue(road, [
        "health_score",
        "road_health_score",
        "road_health",
        "score",
      ]);

      const potholes = getFirstValue(road, [
        "potholes",
        "pothole_count",
      ]);

      const incidents = getFirstValue(road, [
        "incidents",
        "incident_count",
      ]);

      const traffic = getFirstValue(road, [
        "traffic",
        "traffic_level",
      ]);

      const priority = getFirstValue(road, [
        "priority",
        "risk",
      ]);

      return `
        <tr>
          <td class="road-name">
            ${escapeHTML(
              formatLabel(
                name || "Unknown Road"
              )
            )}
          </td>

          <td>
            <span class="health-score ${getHealthClass(
              score
            )}">
              ${
                score !== undefined
                  ? `${escapeHTML(score)}/100`
                  : "—"
              }
            </span>
          </td>

          <td>
            ${
              potholes !== undefined
                ? escapeHTML(
                    formatNumber(potholes)
                  )
                : "—"
            }
          </td>

          <td>
            ${
              incidents !== undefined
                ? escapeHTML(
                    formatNumber(incidents)
                  )
                : "—"
            }
          </td>

          <td>
            ${
              traffic !== undefined
                ? escapeHTML(
                    formatLabel(traffic)
                  )
                : "—"
            }
          </td>

          <td>
            ${
              priority !== undefined
                ? escapeHTML(
                    formatLabel(priority)
                  )
                : "—"
            }
          </td>
        </tr>
      `;
    })
    .join("");

  setHTML(
    "roadHealthAnalytics",
    `
      <table>
        <thead>
          <tr>
            <th>Road / Corridor</th>
            <th>Health</th>
            <th>Potholes</th>
            <th>Incidents</th>
            <th>Traffic</th>
            <th>Priority</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>
    `
  );

  const firstScore = getFirstValue(
    data[0],
    [
      "health_score",
      "road_health_score",
      "road_health",
      "score",
    ]
  );

  if (firstScore !== undefined) {
    const numericScore =
      Number(firstScore);

    setText(
      "analyticsRoadHealth",
      Number.isFinite(numericScore)
        ? `${numericScore.toFixed(0)}/100`
        : firstScore
    );

    setText(
      "analyticsRoadHealthMeta",
      data.length === 1
        ? "Current corridor condition"
        : `${data.length} road corridors`
    );
  }
}

/* =========================================================
   TRAFFIC ANALYSIS
========================================================= */

async function fetchTrafficAnalytics() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/traffic${query}`
  );

  analyticsState.data.traffic = data;

  return data;
}

function renderTrafficAnalysis(payload) {
  const container =
    getElement("trafficAnalysis");

  if (!container) {
    return;
  }

  const data = unwrapData(payload);

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    setHTML(
      "trafficAnalysis",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-chart-column"></i>
          <p>No traffic analytics are available.</p>
        </div>
      `
    );

    return;
  }

  /*
   * Current backend:
   *
   * {
   *   vehicle_count: number,
   *   congestion: number
   * }
   */

  const entries = [
    [
      "Total Vehicles",
      [
        "total_vehicles",
        "vehicles",
        "vehicle_count",
      ],
    ],

    [
      "Peak Traffic",
      [
        "peak_traffic",
        "peak_level",
      ],
    ],

    [
      "Average Traffic",
      [
        "average_traffic",
        "avg_traffic",
      ],
    ],

    [
      "Congestion Events",
      [
        "congestion",
        "congestion_events",
        "congestion_count",
      ],
    ],
  ];

  const items = entries
    .map(([label, keys]) => {
      const value =
        getFirstValue(
          data,
          keys
        );

      if (value === undefined) {
        return "";
      }

      return `
        <div class="summary-item">
          <span class="summary-label">
            ${escapeHTML(label)}
          </span>

          <span class="summary-value">
            ${escapeHTML(
              typeof value === "number"
                ? formatNumber(value)
                : formatLabel(value)
            )}
          </span>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!items) {
    setHTML(
      "trafficAnalysis",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-chart-column"></i>
          <p>No traffic analytics are available.</p>
        </div>
      `
    );

    return;
  }

  setHTML(
    "trafficAnalysis",
    `
      <div class="summary-grid">
        ${items}
      </div>
    `
  );
}

/* =========================================================
   BUS COVERAGE
========================================================= */

async function fetchBusCoverage() {
  const query = buildAnalyticsQuery();

  const data = await fetchJSON(
    `/api/analytics/bus-coverage${query}`
  );

  analyticsState.data.busCoverage = data;

  return data;
}

/*
 * Current backend returns:
 *
 * [
 *   {
 *     bus_id: "...",
 *     event_count: 10,
 *     first_seen: "...",
 *     last_seen: "..."
 *   }
 * ]
 *
 * The previous renderer expected an object.
 */
function renderBusCoverage(payload) {
  const container =
    getElement("busCoverageAnalysis");

  if (!container) {
    return;
  }

  const raw = unwrapData(payload);

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      setHTML(
        "busCoverageAnalysis",
        `
          <div class="analytics-empty-state">
            <i class="fa-solid fa-bus-simple"></i>
            <p>No bus coverage analytics are available.</p>
          </div>
        `
      );

      return;
    }

    const totalEvents =
      raw.reduce(
        (sum, bus) => {
          const count =
            Number(
              getFirstValue(
                bus,
                [
                  "event_count",
                  "events",
                  "count",
                ]
              ) ?? 0
            );

          return (
            sum +
            (
              Number.isFinite(count)
                ? count
                : 0
            )
          );
        },
        0
      );

    const rows = raw
      .map((bus) => {
        const busId =
          getFirstValue(
            bus,
            [
              "bus_id",
              "bus",
              "id",
              "vehicle_id",
            ]
          );

        const eventCount =
          getFirstValue(
            bus,
            [
              "event_count",
              "events",
              "count",
            ]
          );

        const firstSeen =
          getFirstValue(
            bus,
            [
              "first_seen",
              "firstSeen",
            ]
          );

        const lastSeen =
          getFirstValue(
            bus,
            [
              "last_seen",
              "lastSeen",
            ]
          );

        return `
          <tr>
            <td class="road-name">
              ${escapeHTML(
                formatLabel(
                  busId ||
                    "Unknown Bus"
                )
              )}
            </td>

            <td>
              ${
                eventCount !== undefined
                  ? escapeHTML(
                      formatNumber(
                        eventCount
                      )
                    )
                  : "—"
              }
            </td>

            <td>
              ${
                firstSeen !== undefined
                  ? escapeHTML(
                      String(
                        firstSeen
                      )
                    )
                  : "—"
              }
            </td>

            <td>
              ${
                lastSeen !== undefined
                  ? escapeHTML(
                      String(
                        lastSeen
                      )
                    )
                  : "—"
              }
            </td>
          </tr>
        `;
      })
      .join("");

    setHTML(
      "busCoverageAnalysis",
      `
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">
              Buses Tracked
            </span>

            <span class="summary-value">
              ${escapeHTML(
                formatNumber(
                  raw.length
                )
              )}
            </span>
          </div>

          <div class="summary-item">
            <span class="summary-label">
              Detected Events
            </span>

            <span class="summary-value">
              ${escapeHTML(
                formatNumber(
                  totalEvents
                )
              )}
            </span>
          </div>
        </div>

        <div class="analytics-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Bus</th>
                <th>Events</th>
                <th>First Seen</th>
                <th>Last Seen</th>
              </tr>
            </thead>

            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `
    );

    setText(
      "analyticsActiveBuses",
      formatNumber(
        raw.length
      )
    );

    setText(
      "analyticsBusesMeta",
      "Buses reporting detected events"
    );

    return;
  }

  if (
    !raw ||
    typeof raw !== "object"
  ) {
    setHTML(
      "busCoverageAnalysis",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-bus-simple"></i>
          <p>No bus coverage analytics are available.</p>
        </div>
      `
    );

    return;
  }

  const entries = [
    [
      "Total Buses",
      [
        "total_buses",
        "buses",
        "bus_count",
      ],
    ],

    [
      "Active Buses",
      [
        "active_buses",
        "active",
      ],
    ],

    [
      "Coverage",
      [
        "coverage",
        "coverage_percent",
        "coverage_percentage",
      ],
    ],

    [
      "Routes Covered",
      [
        "routes_covered",
        "route_count",
        "routes",
      ],
    ],
  ];

  const items = entries
    .map(([label, keys]) => {
      const value =
        getFirstValue(
          raw,
          keys
        );

      if (
        value === undefined
      ) {
        return "";
      }

      let formattedValue =
        value;

      if (
        label === "Coverage" &&
        Number.isFinite(
          Number(value)
        )
      ) {
        formattedValue =
          formatPercent(
            value
          );
      } else if (
        typeof value === "number"
      ) {
        formattedValue =
          formatNumber(
            value
          );
      }

      return `
        <div class="summary-item">
          <span class="summary-label">
            ${escapeHTML(label)}
          </span>

          <span class="summary-value">
            ${escapeHTML(
              String(
                formattedValue
              )
            )}
          </span>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");

  if (!items) {
    setHTML(
      "busCoverageAnalysis",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-bus-simple"></i>
          <p>No bus coverage analytics are available.</p>
        </div>
      `
    );

    return;
  }

  setHTML(
    "busCoverageAnalysis",
    `
      <div class="summary-grid">
        ${items}
      </div>
    `
  );
}

/* =========================================================
   OPERATIONAL INSIGHTS
========================================================= */

async function fetchInsights() {
  try {
    const query =
      buildAnalyticsQuery();

    return await fetchJSON(
      `/api/analytics/insights${query}`
    );
  } catch (error) {
    console.warn(
      "Analytics insights request failed:",
      error
    );

    return null;
  }
}

/*
 * Current backend /api/analytics/insights returns:
 *
 * {
 *   total_events,
 *   top_issue_type,
 *   top_bus,
 *   issue_types,
 *   bus_activity
 * }
 *
 * Convert this backend summary into useful insight cards.
 */
function renderInsights(payload) {
  const container =
    getElement("analyticsInsights");

  if (!container) {
    return;
  }

  const data =
    unwrapData(payload);

  if (
    !data ||
    typeof data !== "object"
  ) {
    setHTML(
      "analyticsInsights",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-circle-info"></i>
          <p>
            No backend-generated operational insights
            are currently available.
          </p>
        </div>
      `
    );

    return;
  }

  const insights = [];

  const totalEvents =
    getFirstValue(
      data,
      [
        "total_events",
        "total_issues",
        "total",
      ]
    );

  const topIssueType =
    getFirstValue(
      data,
      [
        "top_issue_type",
        "top_type",
        "most_common_issue",
      ]
    );

  const topBus =
    getFirstValue(
      data,
      [
        "top_bus",
        "most_active_bus",
      ]
    );

  const issueTypes =
    getFirstValue(
      data,
      [
        "issue_types",
        "issues_by_type",
      ]
    );

  const busActivity =
    getFirstValue(
      data,
      [
        "bus_activity",
        "bus_coverage",
      ]
    );

  if (
    totalEvents !== undefined
  ) {
    insights.push({
      icon: "fa-chart-line",
      title: "Total Detected Events",
      text: `${formatNumber(totalEvents)} events recorded in the available dataset.`,
    });
  }

  if (
    topIssueType &&
    typeof topIssueType !== "object"
  ) {
    insights.push({
      icon: "fa-triangle-exclamation",
      title: "Most Common Issue",
      text: `${formatLabel(topIssueType)} is the most frequently detected issue type.`,
    });
  }

  if (
    topBus &&
    typeof topBus !== "object"
  ) {
    insights.push({
      icon: "fa-bus",
      title: "Most Active Bus",
      text: `${formatLabel(topBus)} has the highest recorded event activity.`,
    });
  }

  if (
    Array.isArray(issueTypes) &&
    issueTypes.length > 0
  ) {
    insights.push({
      icon: "fa-layer-group",
      title: "Issue Categories",
      text: `${formatNumber(issueTypes.length)} issue categories are present in the analytics dataset.`,
    });
  }

  if (
    Array.isArray(busActivity) &&
    busActivity.length > 0
  ) {
    insights.push({
      icon: "fa-route",
      title: "Bus Activity",
      text: `${formatNumber(busActivity.length)} buses have reported detected events.`,
    });
  }

  if (insights.length === 0) {
    setHTML(
      "analyticsInsights",
      `
        <div class="analytics-empty-state">
          <i class="fa-solid fa-circle-info"></i>
          <p>
            No backend-generated operational insights
            are currently available.
          </p>
        </div>
      `
    );

    return;
  }

  const html =
    insights
      .map((item) => {
        return `
          <article class="insight-item">

            <div class="insight-icon">
              <i class="fa-solid ${escapeHTML(
                item.icon
              )}"></i>
            </div>

            <h4 class="insight-title">
              ${escapeHTML(
                item.title
              )}
            </h4>

            <p class="insight-text">
              ${escapeHTML(
                item.text
              )}
            </p>

          </article>
        `;
      })
      .join("");

  setHTML(
    "analyticsInsights",
    html
  );
}

/* =========================================================
   LOAD SINGLE ANALYTICS DATASET
========================================================= */

async function runAnalyticsRequest(
  name,
  request,
  render
) {
  try {
    const data =
      await request();

    if (render) {
      render(data);
    }

    return {
      name,
      success: true,
    };
  } catch (error) {
    console.warn(
      `Analytics request failed: ${name}`,
      error
    );

    return {
      name,
      success: false,
      error,
    };
  }
}

/* =========================================================
   LOAD ALL ANALYTICS
========================================================= */

async function loadAnalytics() {
  if (
    analyticsState.requestInProgress
  ) {
    return;
  }

  analyticsState.requestInProgress =
    true;

  readFilters();

  setBackendStatus(
    "partial",
    "Loading analytics..."
  );

  setDataStatus(
    "",
    `
      <i class="fa-solid fa-circle-notch fa-spin"></i>
      Loading analytics data...
    `
  );

  const requests = [
    runAnalyticsRequest(
      "overview",
      fetchOverview,
      renderOverview
    ),

    runAnalyticsRequest(
      "issues-by-type",
      fetchIssuesByType,
      renderIssueTypeChart
    ),

    runAnalyticsRequest(
      "issues-over-time",
      fetchIssuesOverTime,
      renderIssueTrendChart
    ),

    runAnalyticsRequest(
      "severity",
      fetchSeverity,
      renderSeverityChart
    ),

    runAnalyticsRequest(
      "tickets",
      fetchTicketAnalytics,
      renderTicketChart
    ),

    runAnalyticsRequest(
      "road-health",
      fetchRoadHealth,
      renderRoadHealth
    ),

    runAnalyticsRequest(
      "traffic",
      fetchTrafficAnalytics,
      renderTrafficAnalysis
    ),

    runAnalyticsRequest(
      "bus-coverage",
      fetchBusCoverage,
      renderBusCoverage
    ),

    runAnalyticsRequest(
      "insights",
      fetchInsights,
      renderInsights
    ),
  ];

  const results =
    await Promise.all(
      requests
    );

  const successful =
    results.filter(
      (result) =>
        result.success
    ).length;

  const total =
    results.length;

  analyticsState.requestInProgress =
    false;

  if (
    successful === total
  ) {
    setBackendStatus(
      "online",
      "Analytics Connected"
    );

    setDataStatus(
      "online",
      `
        <i class="fa-solid fa-circle-check"></i>
        Analytics data updated successfully
      `
    );
  } else if (
    successful > 0
  ) {
    setBackendStatus(
      "partial",
      "Partial Analytics Data"
    );

    setDataStatus(
      "partial",
      `
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${successful} of ${total} analytics sources available
      `
    );
  } else {
    setBackendStatus(
      "offline",
      "Analytics Unavailable"
    );

    setDataStatus(
      "error",
      `
        <i class="fa-solid fa-circle-xmark"></i>
        Analytics data could not be loaded
      `
    );
  }
}

/* =========================================================
   REFRESH BUTTON
========================================================= */

function initializeRefreshButton() {
  const button =
    getElement(
      "analyticsRefreshBtn"
    );

  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    async () => {
      if (
        analyticsState.requestInProgress
      ) {
        return;
      }

      const icon =
        button.querySelector(
          "i"
        );

      if (icon) {
        icon.classList.add(
          "fa-spin"
        );
      }

      try {
        await loadAnalytics();
      } finally {
        if (icon) {
          icon.classList.remove(
            "fa-spin"
          );
        }
      }
    }
  );
}

/* =========================================================
   PAGE INITIALIZATION
========================================================= */

function initializeAnalyticsPage() {
  if (!document.body) {
    return;
  }

  initializeFilters();

  initializeRefreshButton();

  setBackendStatus(
    "partial",
    "Connecting..."
  );

  loadAnalytics();
}

/* =========================================================
   START APPLICATION
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initializeAnalyticsPage
  );
} else {
  initializeAnalyticsPage();
}