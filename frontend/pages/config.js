/**
 * Urban Intelligence Platform — Dynamic API Configuration
 * Supports automatic environment switching (Localhost vs Live Render Cloud)
 * and runtime API URL overrides via localStorage or ?api= query parameter.
 */

const CONFIG = {
  // Default Render URL (update this with your deployed Render URL or change it via the UI)
  DEFAULT_REMOTE_API: "https://urban-intelligence-backend.onrender.com",
  LOCAL_API: "http://127.0.0.1:5000",

  /**
   * Resolves the active backend API base URL.
   * Priority:
   * 1. URL Query parameter (?api=https://...)
   * 2. localStorage override ('uip_api_base')
   * 3. Localhost detection (if running on 127.0.0.1 / localhost)
   * 4. Cloud default (DEFAULT_REMOTE_API)
   */
  getApiBase() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryApi = urlParams.get("api");
      if (queryApi && queryApi.trim()) {
        const clean = queryApi.trim().replace(/\/$/, "");
        localStorage.setItem("uip_api_base", clean);
        return clean;
      }

      const saved = localStorage.getItem("uip_api_base");
      if (saved && saved.trim()) {
        return saved.trim().replace(/\/$/, "");
      }

      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1" || window.location.protocol === "file:") {
        return this.LOCAL_API;
      }
    } catch (e) {
      console.warn("[Config] Could not access URL params or localStorage:", e);
    }

    return this.DEFAULT_REMOTE_API;
  },

  /**
   * Sets or clears the active backend API URL.
   */
  setApiBase(url) {
    if (!url || !url.trim()) {
      localStorage.removeItem("uip_api_base");
    } else {
      localStorage.setItem("uip_api_base", url.trim().replace(/\/$/, ""));
    }
  },

  /**
   * Performs a health check against the current API base.
   */
  async checkHealth(timeoutMs = 6000) {
    const apiBase = this.getApiBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(`${apiBase}/api/health`, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timer);
      const latency = Date.now() - start;
      return {
        ok: res.ok,
        status: res.status,
        latency,
        apiBase,
        isColdStart: false
      };
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === "AbortError";
      return {
        ok: false,
        status: 0,
        latency: Date.now() - start,
        apiBase,
        isColdStart: isTimeout,
        error: err.message
      };
    }
  },

  /**
   * Shows a user-friendly modal to inspect, test, and update the Backend API URL.
   */
  openConfigModal() {
    const existingModal = document.getElementById("uip-api-modal");
    if (existingModal) {
      existingModal.style.display = "flex";
      return;
    }

    const currentUrl = this.getApiBase();
    const modal = document.createElement("div");
    modal.id = "uip-api-modal";
    modal.innerHTML = `
      <div class="uip-modal-backdrop" onclick="CONFIG.closeConfigModal()"></div>
      <div class="uip-modal-card">
        <div class="uip-modal-header">
          <h3>⚡ Backend API Settings</h3>
          <button type="button" class="uip-modal-close" onclick="CONFIG.closeConfigModal()">&times;</button>
        </div>
        <div class="uip-modal-body">
          <p class="uip-modal-desc">
            Connect this frontend dashboard to your live cloud backend on Render or your local machine.
          </p>

          <label class="uip-label" for="uip-api-input">Active Backend URL:</label>
          <div class="uip-input-group">
            <input type="text" id="uip-api-input" value="${currentUrl}" placeholder="https://your-backend.onrender.com" />
          </div>

          <div class="uip-quick-buttons">
            <button type="button" class="uip-btn-chip" onclick="CONFIG.applyPreset('local')">🖥️ Localhost (5000)</button>
            <button type="button" class="uip-btn-chip" onclick="CONFIG.applyPreset('render')">☁️ Render Cloud</button>
          </div>

          <div id="uip-modal-status" class="uip-modal-status">
            Click "Test Connection" to ping this server.
          </div>
        </div>
        <div class="uip-modal-footer">
          <button type="button" class="uip-btn-secondary" onclick="CONFIG.testConnection()">Test Connection</button>
          <button type="button" class="uip-btn-primary" onclick="CONFIG.saveModalConfig()">Save & Reload</button>
        </div>
      </div>
    `;

    // Inject styles
    const style = document.createElement("style");
    style.id = "uip-modal-styles";
    style.textContent = `
      #uip-api-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .uip-modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(8, 12, 20, 0.75);
        backdrop-filter: blur(4px);
      }
      .uip-modal-card {
        position: relative;
        width: 90%;
        max-width: 480px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 24px;
        color: #f8fafc;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
      }
      .uip-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .uip-modal-header h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        color: #38bdf8;
      }
      .uip-modal-close {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      .uip-modal-desc {
        color: #94a3b8;
        font-size: 0.88rem;
        margin: 0 0 16px;
        line-height: 1.4;
      }
      .uip-label {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #cbd5e1;
        margin-bottom: 6px;
      }
      .uip-input-group input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        background: #1e293b;
        border: 1px solid #475569;
        border-radius: 8px;
        color: #f8fafc;
        font-size: 0.95rem;
        font-family: monospace;
      }
      .uip-input-group input:focus {
        outline: none;
        border-color: #38bdf8;
      }
      .uip-quick-buttons {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .uip-btn-chip {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 6px;
        color: #94a3b8;
        font-size: 0.8rem;
        padding: 6px 10px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .uip-btn-chip:hover {
        background: #334155;
        color: #f8fafc;
      }
      .uip-modal-status {
        margin-top: 16px;
        padding: 10px 12px;
        border-radius: 8px;
        background: #1e293b;
        font-size: 0.84rem;
        color: #cbd5e1;
      }
      .uip-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      .uip-btn-secondary {
        background: #1e293b;
        border: 1px solid #334155;
        color: #cbd5e1;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 0.88rem;
        cursor: pointer;
      }
      .uip-btn-primary {
        background: #0284c7;
        border: none;
        color: #ffffff;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 0.88rem;
        font-weight: 500;
        cursor: pointer;
      }
      .uip-btn-primary:hover {
        background: #0369a1;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);
  },

  closeConfigModal() {
    const modal = document.getElementById("uip-api-modal");
    if (modal) modal.style.display = "none";
  },

  applyPreset(preset) {
    const input = document.getElementById("uip-api-input");
    if (!input) return;
    if (preset === "local") {
      input.value = this.LOCAL_API;
    } else {
      input.value = this.DEFAULT_REMOTE_API;
    }
  },

  async testConnection() {
    const input = document.getElementById("uip-api-input");
    const statusEl = document.getElementById("uip-modal-status");
    if (!input || !statusEl) return;

    const testUrl = input.value.trim().replace(/\/$/, "");
    statusEl.innerHTML = `<span style="color:#38bdf8;">⏳ Testing connection to ${testUrl}...</span>`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${testUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        statusEl.innerHTML = `<span style="color:#34d399;">✅ Connected successfully! (Status 200 OK)</span>`;
      } else {
        statusEl.innerHTML = `<span style="color:#fbbf24;">⚠️ Server reached but returned HTTP ${res.status}.</span>`;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        statusEl.innerHTML = `<span style="color:#fbbf24;">⏳ Server might be waking up from sleep (cold start). Try again in a few moments.</span>`;
      } else {
        statusEl.innerHTML = `<span style="color:#f87171;">❌ Connection failed: ${err.message}. Check CORS or URL.</span>`;
      }
    }
  },

  saveModalConfig() {
    const input = document.getElementById("uip-api-input");
    if (input) {
      this.setApiBase(input.value);
      window.location.reload();
    }
  }
};
