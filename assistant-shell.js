(function () {
  "use strict";

  if (window.__conglobalOpsAssistantInitialized) return;
  window.__conglobalOpsAssistantInitialized = true;

  const ROOT_ID = "conglobalOpsAssistant";
  const PREFS_KEY = "conglobal-ops-assistant-prefs-v1";
  const SESSION_KEY = "conglobal-ops-assistant-session-v1";
  const SCHEMA_VERSION = 1;
  const MAX_MESSAGES = 40;
  const MAX_CONTEXT_BYTES = 64000;
  const pageLabels = {
    amReport: "AM Report",
    chassisStatus: "Chassis Status",
    timeMd: "Timesheet",
    billing: "Billing",
    excelView: "Excel View",
    lphTracker: "LPH Tracker",
    matrix: "The Matrix",
    matrixWide: "Matrix Wide",
    obsidian: "Operations Dashboard",
    roster: "Roster",
    timeOff: "Time Off",
    audits: "Audits",
    checklist: "Checklist"
  };

  const defaultPrefs = Object.freeze({
    version: 1,
    enabled: true,
    displayState: "compact",
    defaultState: "compact",
    rememberPosition: true,
    suggestions: true,
    notifications: true,
    proactive: false,
    animationMode: "on",
    theme: "system",
    tone: "operational",
    responseLength: "standard",
    geometry: null,
    position: null
  });

  const capabilities = [
    {
      id: "application-guidance",
      label: "Application Guidance",
      status: "available-local",
      description: "Explains documented pages, workflows, terms, and confirmed project rules from the embedded knowledge base.",
      requiredData: ["question"],
      permissions: ["local knowledge"],
      providerRequired: false,
      limitation: "Does not inspect live page records unless a page adapter is connected."
    },
    {
      id: "calculation-explanation",
      label: "Calculation Explanation",
      status: "available-local",
      description: "Explains documented formulas such as track remaining footage, LPH, current-work hours, and chassis net.",
      requiredData: ["formula or metric"],
      permissions: ["local knowledge"],
      providerRequired: false,
      limitation: "Can explain formulas locally; calculating a live result requires validated inputs."
    },
    {
      id: "data-interpretation",
      label: "Data Interpretation",
      status: "not-connected",
      description: "Will interpret selected records with provenance, freshness, validation, and conflicts.",
      requiredData: ["page data adapter", "selected records"],
      permissions: ["read selected page data"],
      providerRequired: false,
      limitation: "No live page data adapter is connected in this foundation."
    },
    {
      id: "data-audit",
      label: "Data Audit",
      status: "foundation-ready",
      description: "Defines audit scope, sources, validation rules, findings layout, and action-preview controls.",
      requiredData: ["audit scope", "two validated sources", "comparison rule"],
      permissions: ["read selected data"],
      providerRequired: false,
      limitation: "No audit executor is connected; no audit has been run."
    },
    {
      id: "forecasting",
      label: "Forecasting",
      status: "foundation-ready",
      description: "Collects workload, rate, time window, staffing, equipment, delay, and freshness inputs.",
      requiredData: ["workload", "rate", "available hours", "constraints"],
      permissions: ["read selected data"],
      providerRequired: false,
      limitation: "No forecast executor is connected; no forecast result is available."
    },
    {
      id: "scenario-comparison",
      label: "Scenario Comparison",
      status: "not-connected",
      description: "Will compare named scenarios using a shared baseline and consistent metrics.",
      requiredData: ["baseline", "scenario inputs", "metrics"],
      permissions: ["read selected scenario data"],
      providerRequired: false,
      limitation: "Scenario adapters are not connected."
    },
    {
      id: "operational-suggestions",
      label: "Operational Suggestions",
      status: "planned",
      description: "Will propose evidence-linked options with impact, risk, confidence, and required approvals.",
      requiredData: ["validated context", "constraints", "objectives"],
      permissions: ["read selected data"],
      providerRequired: true,
      limitation: "Suggestions are planned and cannot change application data."
    },
    {
      id: "information-gathering",
      label: "Information Gathering",
      status: "foundation-ready",
      description: "Defines missing-information questions and future approved data-source connectors.",
      requiredData: ["question", "approved sources"],
      permissions: ["explicit source access"],
      providerRequired: false,
      limitation: "No external source is contacted automatically."
    },
    {
      id: "risk-detection",
      label: "Risk Detection",
      status: "not-connected",
      description: "Will evaluate documented thresholds against validated live records.",
      requiredData: ["risk rules", "live data", "scope"],
      permissions: ["read selected data"],
      providerRequired: false,
      limitation: "No live risk scan is connected."
    },
    {
      id: "report-handoff",
      label: "Report / Handoff Support",
      status: "planned",
      description: "Will assemble source-linked shift handoffs and reports for user review.",
      requiredData: ["scope", "approved findings", "audience"],
      permissions: ["read selected data", "explicit export"],
      providerRequired: true,
      limitation: "Report generation and delivery are planned."
    }
  ];

  capabilities.forEach(capability => {
    capability.availability = capability.status === "available-local" ? "available" : capability.status === "foundation-ready" ? "foundation-only" : capability.status;
    capability.futureAction = {
      executorId: capability.id,
      interface: "registerCapabilityExecutor",
      confirmationRequired: ["operational-suggestions", "report-handoff"].includes(capability.id),
      currentMode: "no automatic execution"
    };
  });

  const foundationSchemas = Object.freeze({
    auditFinding: Object.freeze({
      fields: ["id", "severity", "category", "page", "fieldOrRecord", "finding", "expected", "actual", "operationalImpact", "suggestedReview", "resolutionStatus", "acknowledgedBy", "createdAt"],
      states: ["open", "acknowledged", "resolved", "dismissed"]
    }),
    forecastResult: Object.freeze({
      fields: ["scenarioName", "generatedAt", "dataFreshness", "inputs", "assumptions", "calculationMethod", "confidence", "predictedResult", "actualResult", "variance"],
      states: ["missing-inputs", "ready", "running", "complete", "failed", "stale"]
    }),
    actionProposal: Object.freeze({
      fields: ["id", "explanation", "affectedRecords", "before", "after", "operationalImpact", "requestedBy", "confirmedBy", "auditTrail", "undoToken"],
      states: ["proposed", "previewed", "confirmed", "applied", "audited", "undone"]
    }),
    notification: Object.freeze({
      fields: ["title", "message", "severity", "source", "createdAt", "acknowledged"],
      states: ["new", "acknowledged", "muted", "cleared"]
    })
  });

  const providerStateDefinitions = Object.freeze({
    "not-configured": "No secure server gateway is configured.",
    configured: "A secure gateway is registered but has not been tested.",
    testing: "Testing the secure gateway connection.",
    connected: "The secure gateway reported a valid connection.",
    "invalid-credentials": "The secure gateway rejected its server-side credentials.",
    "provider-unavailable": "The configured provider is unavailable.",
    "model-unavailable": "The configured model is unavailable.",
    "usage-limit": "The provider reported a usage or rate limit.",
    "quota-exceeded": "The provider reported that the configured account quota is exhausted.",
    timeout: "The secure gateway request timed out.",
    "request-failed": "The secure gateway request failed."
  });

  const promptSets = {
    matrix: [
      { text: "Explain the track capacity rules", live: false },
      { text: "What inputs are needed to forecast release?", live: false },
      { text: "Audit the current track setup", live: true }
    ],
    matrixWide: [
      { text: "Explain the visual railcar scaling", live: false },
      { text: "What does Live Look use?", live: false },
      { text: "Compare the active scenarios", live: true }
    ],
    excelView: [
      { text: "Explain moving and splitting blocks", live: false },
      { text: "Explain Current Work calculations", live: false },
      { text: "Find blocking conflicts", live: true }
    ],
    chassisStatus: [
      { text: "Explain the chassis net calculation", live: false },
      { text: "What is the daily inbound order?", live: false },
      { text: "Forecast chassis shortages", live: true }
    ],
    timeMd: [
      { text: "Explain the missing-punch rule", live: false },
      { text: "Which lunch gaps are ignored?", live: false },
      { text: "Audit this day for missing punches", live: true }
    ],
    billing: [
      { text: "Explain how LPH should be calculated", live: false },
      { text: "What should reconcile to the archive?", live: false },
      { text: "Audit the current performance sources", live: true }
    ],
    checklist: [
      { text: "Explain the mechanic inspection workflow", live: false },
      { text: "What evidence should a checklist retain?", live: false },
      { text: "Review today's incomplete checklist items", live: true }
    ],
    all: [
      { text: "What can you help with right now?", live: false },
      { text: "How do you protect operational data?", live: false },
      { text: "What needs to be connected next?", live: false }
    ]
  };

  let prefs = loadJson(localStorage, PREFS_KEY, defaultPrefs);
  prefs = normalizePrefs(prefs);
  let session = normalizeSession(loadJson(sessionStorage, SESSION_KEY, { version: 1, name: "Current investigation", messages: [] }));
  if (!session || session.version !== 1 || !Array.isArray(session.messages)) session = { version: 1, name: "Current investigation", messages: [] };
  session.messages = session.messages.slice(-MAX_MESSAGES);

  let activeTab = "chat";
  let context = createBaseContext();
  let currentRequest = null;
  let providerStatus = {
    code: window.CONGLOBAL_OPS_ASSISTANT_GATEWAY ? "configured" : "not-configured",
    updatedAt: new Date().toISOString(),
    provider: null,
    model: null
  };
  let pendingContextRequest = null;
  let lastLauncher = null;
  let lastFocused = null;
  let suppressLauncherClick = false;
  const adapters = new Map();
  const capabilityExecutors = new Map();
  const dataSources = new Map();
  const notifications = [];
  const knowledge = window.CONGLOBAL_OPS_KNOWLEDGE || { version: "unavailable", entries: [], limitations: [] };

  const root = getOrCreateRoot();
  const restoreButton = getOrCreateExternalButton("conglobalOpsAssistantRestore", "oa-restore", "Restore YardMate", "Restore operations assistant");
  const enableButton = getOrCreateExternalButton("conglobalOpsAssistantEnable", "oa-enable", "Enable YardMate", "Enable operations assistant");

  root.innerHTML = buildMarkup();
  root.setAttribute("role", "complementary");
  root.setAttribute("aria-label", "YardMate operations assistant");
  root.dataset.theme = prefs.theme;
  root.dataset.animation = prefs.animationMode;
  root.dataset.helperStatus = "idle";

  const elements = {
    panel: root.querySelector(".oa-panel"),
    head: root.querySelector(".oa-head"),
    messages: root.querySelector(".oa-messages"),
    suggestions: root.querySelector(".oa-suggestions"),
    input: root.querySelector(".oa-compose textarea"),
    send: root.querySelector(".oa-send"),
    contextLabel: root.querySelector("[data-role='context-label']"),
    footerState: root.querySelector("[data-role='footer-state']"),
    live: root.querySelector(".oa-live"),
    notificationBadges: root.querySelectorAll("[data-role='notification-badge']"),
    resize: root.querySelector(".oa-resize-grip")
  };

  bindEvents();
  renderAll();
  setDisplayState(prefs.enabled ? prefs.displayState : "disabled", { persist: false, announce: false });
  applyGeometry();
  clampToViewport();
  requestPageContext();

  const api = {
    version: "1.0.0-foundation",
    open: () => setDisplayState("expanded"),
    minimize: () => setDisplayState("minimized"),
    compact: () => setDisplayState("compact"),
    hide: () => setDisplayState("hidden"),
    disable: () => setEnabled(false),
    enable: () => setEnabled(true),
    setPage: page => {
      updatePageContext(page);
      requestPageContext();
    },
    refreshContext: options => requestPageContext(options || {}),
    updateContext: partial => updateContext(partial, "host-api"),
    registerAdapter: registerAdapter,
    unregisterAdapter: unregisterAdapter,
    registerCapabilityExecutor: registerCapabilityExecutor,
    unregisterCapabilityExecutor: id => capabilityExecutors.delete(String(id || "")),
    registerDataSource: registerDataSource,
    notify: notify,
    getContext: () => structuredCloneSafe(context),
    getCapabilities: () => structuredCloneSafe(capabilities.map(capability => ({ ...capability, executorConnected: capabilityExecutors.has(capability.id) }))),
    getFoundationSchemas: () => structuredCloneSafe(foundationSchemas),
    getProviderStatus: () => structuredCloneSafe(providerStatus),
    classifyPrompt: (prompt, options) => structuredCloneSafe(classifyPromptIntent(prompt, options)),
    getKnowledgeMetadata: () => ({
      id: knowledge.id,
      version: knowledge.version,
      reviewedAt: knowledge.reviewedAt,
      entryCount: knowledge.entries.length,
      statuses: Object.keys(knowledge.statusDefinitions || {})
    }),
    reset: resetAssistant
  };
  window.ConglobalOpsAssistant = api;
  window.OpsAssistant = api;

  function buildMarkup() {
    return `
      <section class="oa-panel" aria-label="YardMate assistant panel" aria-live="off">
        <header class="oa-head" data-drag-handle tabindex="0" aria-label="Drag assistant. Alt plus arrow keys moves; Alt plus Shift plus arrow keys resizes.">
          <div class="oa-brand-mark" aria-hidden="true">YM</div>
          <div class="oa-title"><strong>YardMate</strong><span>Settegast operations helper</span></div>
          <div class="oa-head-actions">
            <button class="oa-icon-button oa-notification-button" type="button" data-action="alerts" aria-label="Notifications"><span aria-hidden="true">!</span><span class="oa-badge" data-role="notification-badge" hidden>0</span></button>
            <button class="oa-icon-button" type="button" data-action="compact" aria-label="Compact assistant">o</button>
            <button class="oa-icon-button" type="button" data-action="minimized" aria-label="Minimize to helper character">-</button>
            <button class="oa-icon-button" type="button" data-action="hide" aria-label="Hide assistant">x</button>
          </div>
        </header>
        <nav class="oa-tabs" aria-label="Assistant sections" role="tablist">
          ${tabButton("chat", "Chat", true)}
          ${tabButton("context", "Context")}
          ${tabButton("tools", "Tools")}
          ${tabButton("alerts", "Alerts")}
          ${tabButton("settings", "Settings")}
        </nav>
        <div class="oa-main">
          <section class="oa-view oa-chat" id="oa-view-chat" data-view="chat" role="tabpanel" aria-labelledby="oa-tab-chat">
            <div class="oa-context-strip"><span data-role="context-label">Page context</span><button type="button" data-action="context">Review context</button></div>
            <div class="oa-messages" aria-label="Conversation messages"></div>
          </section>
          <section class="oa-view" id="oa-view-context" data-view="context" role="tabpanel" aria-labelledby="oa-tab-context" hidden></section>
          <section class="oa-view" id="oa-view-tools" data-view="tools" role="tabpanel" aria-labelledby="oa-tab-tools" hidden></section>
          <section class="oa-view" id="oa-view-alerts" data-view="alerts" role="tabpanel" aria-labelledby="oa-tab-alerts" hidden></section>
          <section class="oa-view" id="oa-view-settings" data-view="settings" role="tabpanel" aria-labelledby="oa-tab-settings" hidden></section>
        </div>
        <div>
          <div class="oa-suggestions" aria-label="Suggested questions"></div>
          <form class="oa-compose">
            <label class="oa-visually-hidden" for="oaAssistantInput">Ask YardMate</label>
            <textarea id="oaAssistantInput" rows="1" maxlength="4000" placeholder="Ask about this page, a rule, calculation, audit, or forecast..." aria-describedby="oaInputHelp"></textarea>
            <button class="oa-send" type="submit" aria-label="Send question">&gt;</button>
            <span id="oaInputHelp" class="oa-visually-hidden">Enter sends. Shift Enter adds a new line. No external request is made in this foundation.</span>
          </form>
        </div>
        <footer class="oa-footer"><span data-role="footer-state">Local knowledge ready</span><span>v1 foundation</span></footer>
        <div class="oa-resize-grip" role="separator" aria-label="Resize assistant" tabindex="0"></div>
      </section>
      <button class="oa-character-button" type="button" data-action="expand" aria-label="Open YardMate operations assistant" aria-expanded="false" aria-controls="${ROOT_ID}">
        ${characterMarkup()}
        <span class="oa-badge oa-launcher-badge" data-role="notification-badge" hidden>0</span>
      </button>
      <div class="oa-compact-bubble" data-drag-handle>
        ${characterMarkup()}
        <button class="oa-compact-copy oa-icon-button" type="button" data-action="expand" aria-label="Open YardMate"><strong>YardMate is ready</strong><span>Local guidance available - AI disconnected</span></button>
        <button class="oa-icon-button" type="button" data-action="hide" aria-label="Hide assistant">x</button>
        <span class="oa-badge oa-launcher-badge" data-role="notification-badge" hidden>0</span>
      </div>
      <div class="oa-live oa-visually-hidden" aria-live="polite" aria-atomic="true"></div>`;
  }

  function characterMarkup() {
    return `<span class="oa-character" aria-hidden="true"><span class="oa-character-body"></span><span class="oa-character-clip"></span><span class="oa-character-face"><span class="oa-eye left"></span><span class="oa-eye right"></span><span class="oa-character-mouth"></span></span><span class="oa-character-stripe"></span><span class="oa-character-state"></span></span>`;
  }

  function tabButton(id, label, selected) {
    return `<button class="oa-tab" id="oa-tab-${id}" type="button" role="tab" data-tab="${id}" aria-controls="oa-view-${id}" aria-selected="${selected ? "true" : "false"}" tabindex="${selected ? "0" : "-1"}">${label}</button>`;
  }

  function getOrCreateRoot() {
    let node = document.getElementById(ROOT_ID);
    if (!node) {
      node = document.createElement("div");
      node.id = ROOT_ID;
      node.dataset.privateUi = "true";
      document.body.appendChild(node);
    }
    return node;
  }

  function getOrCreateExternalButton(id, className, text, label) {
    let button = document.getElementById(id);
    if (!button) {
      button = document.createElement("button");
      button.id = id;
      button.className = className;
      button.type = "button";
      button.textContent = text;
      button.setAttribute("aria-label", label);
      button.dataset.privateUi = "true";
      document.body.appendChild(button);
    }
    return button;
  }

  function createBaseContext() {
    const pageId = currentPageId();
    return {
      schemaVersion: SCHEMA_VERSION,
      page: { id: pageId, label: pageLabels[pageId] || "Workbook" },
      tab: null,
      selectedDate: null,
      shift: null,
      train: null,
      block: null,
      track: null,
      employee: null,
      group: null,
      filters: [],
      warnings: [],
      selectedRow: null,
      scenario: null,
      planningPeriod: null,
      mode: null,
      source: "workbook shell",
      capturedAt: new Date().toISOString(),
      freshness: "page route only",
      validationStatus: "shell context",
      adapterStatus: "not connected"
    };
  }

  function currentPageId() {
    const id = String(location.hash || "").replace(/^#/, "");
    if (pageLabels[id]) return id;
    try {
      const stored = localStorage.getItem("conglobal-active-page");
      if (stored && pageLabels[stored]) return stored;
    } catch (_) {}
    return "amReport";
  }

  function bindEvents() {
    root.addEventListener("click", event => {
      const action = event.target.closest("[data-action]");
      if (action) {
        handleAction(action.dataset.action, action);
        return;
      }
      const tab = event.target.closest("[data-tab]");
      if (tab) switchTab(tab.dataset.tab, true);
      const suggestion = event.target.closest("[data-suggestion]");
      if (suggestion) {
        elements.input.value = suggestion.dataset.suggestion;
        submitPrompt(suggestion.dataset.suggestion, { requiresLive: suggestion.dataset.live === "true" });
      }
    });

    root.querySelector(".oa-compose").addEventListener("submit", event => {
      event.preventDefault();
      if (currentRequest) stopCurrentRequest();
      else submitPrompt(elements.input.value);
    });

    elements.input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (currentRequest) stopCurrentRequest();
        else submitPrompt(elements.input.value);
      }
    });

    root.querySelectorAll("[data-drag-handle]").forEach(handle => handle.addEventListener("pointerdown", startDrag));
    root.querySelector(".oa-character-button").addEventListener("pointerdown", event => startDrag(event, true));
    root.querySelector(".oa-tabs").addEventListener("keydown", handleTabKeydown);
    elements.resize.addEventListener("pointerdown", startResize);
    elements.head.addEventListener("keydown", moveOrResizeWithKeyboard);
    elements.resize.addEventListener("keydown", resizeWithKeyboard);

    restoreButton.addEventListener("click", () => setDisplayState(preferredDisplayState()));
    enableButton.addEventListener("click", () => setEnabled(true));

    window.addEventListener("hashchange", () => {
      updatePageContext({ id: currentPageId(), label: pageLabels[currentPageId()] });
      requestPageContext();
    });
    window.addEventListener("resize", clampToViewport);
    window.addEventListener("message", receiveContextMessage);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && root.dataset.state === "expanded") {
        setDisplayState("compact");
        restoreFocus();
      }
    });
  }

  function handleTabKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(root.querySelectorAll("[data-tab]"));
    const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    event.preventDefault();
    switchTab(tabs[nextIndex].dataset.tab, true);
  }

  function handleAction(action, source) {
    if (action === "expand") {
      if (suppressLauncherClick) return;
      lastLauncher = source;
      setDisplayState("expanded");
      window.setTimeout(() => elements.input.focus(), 0);
    } else if (action === "compact") {
      setDisplayState("compact");
    } else if (action === "minimized") {
      setDisplayState("minimized");
    } else if (action === "hide") {
      setDisplayState("hidden");
    } else if (["chat", "context", "tools", "alerts", "settings"].includes(action)) {
      switchTab(action, true);
      if (root.dataset.state !== "expanded") setDisplayState("expanded");
    } else if (action === "clear-conversation") {
      if (window.confirm("Clear this browser-tab conversation? This does not change operational data.")) clearConversation();
    } else if (action === "new-conversation") {
      startNewConversation();
    } else if (action === "reset-assistant") {
      if (window.confirm("Reset YardMate layout and preferences?")) resetAssistant();
    } else if (action === "disable-assistant") {
      if (window.confirm("Disable YardMate? A small Enable YardMate control will remain available.")) setEnabled(false);
    } else if (action === "test-provider") {
      testProviderConnection();
    } else if (action === "disconnect-provider") {
      disconnectProvider();
    } else if (action === "clear-notifications") {
      notifications.splice(0);
      renderNotifications();
    } else if (action === "refresh-context") {
      requestPageContext({ explicit: true });
    }
  }

  function switchTab(tabId, focusTab) {
    if (!["chat", "context", "tools", "alerts", "settings"].includes(tabId)) return;
    activeTab = tabId;
    root.querySelectorAll("[data-tab]").forEach(button => {
      const selected = button.dataset.tab === tabId;
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) button.focus();
    });
    root.querySelectorAll("[data-view]").forEach(view => { view.hidden = view.dataset.view !== tabId; });
    if (tabId === "context") renderContext();
    if (tabId === "tools") renderTools();
    if (tabId === "alerts") {
      notifications.forEach(item => { item.acknowledged = true; });
      renderNotifications();
    }
    if (tabId === "settings") renderSettings();
  }

  function setDisplayState(state, options = {}) {
    const allowed = ["minimized", "compact", "expanded", "hidden", "disabled"];
    if (!allowed.includes(state)) state = "compact";
    if (!prefs.enabled && state !== "disabled") state = "disabled";
    const previousState = root.dataset.state;
    if (previousState && previousState !== state && ["expanded", "compact", "minimized"].includes(previousState)) saveGeometry();
    const focusedWithin = root.contains(document.activeElement);
    const focusedRestore = document.activeElement === restoreButton || document.activeElement === enableButton;
    if (focusedWithin) lastFocused = document.activeElement;
    root.dataset.state = state;
    root.querySelectorAll("[data-action='expand']").forEach(button => button.setAttribute("aria-expanded", state === "expanded" ? "true" : "false"));
    restoreButton.hidden = state !== "hidden";
    enableButton.hidden = state !== "disabled";
    if (["expanded", "compact", "minimized"].includes(state)) {
      restoreButton.hidden = true;
      enableButton.hidden = true;
    }
    if (["expanded", "compact", "minimized"].includes(state)) {
      applyGeometry();
      clampToViewport();
    }
    if (state === "expanded") renderAll();
    if (focusedWithin || focusedRestore) {
      const focusTarget = state === "hidden"
        ? restoreButton
        : state === "disabled"
          ? enableButton
          : state === "minimized"
            ? root.querySelector(".oa-character-button")
            : state === "compact"
              ? root.querySelector(".oa-compact-copy")
              : elements.input;
      if (focusTarget) window.setTimeout(() => focusTarget.focus(), 0);
    }
    if (options.persist !== false) {
      prefs.displayState = state === "disabled" ? prefs.displayState : state;
      savePrefs();
    }
    if (options.announce !== false) announce(`YardMate ${state}.`);
  }

  function setEnabled(enabled) {
    prefs.enabled = Boolean(enabled);
    if (enabled) {
      context = createBaseContext();
      const next = preferredDisplayState();
      prefs.displayState = next;
      savePrefs();
      setDisplayState(next, { persist: false });
      requestPageContext();
    } else {
      if (currentRequest) stopCurrentRequest();
      pendingContextRequest = null;
      dataSources.clear();
      context = createBaseContext();
      savePrefs();
      setDisplayState("disabled", { persist: false });
    }
  }

  function preferredDisplayState() {
    return ["minimized", "compact", "expanded"].includes(prefs.defaultState) ? prefs.defaultState : "compact";
  }

  function startDrag(event, allowInteractive = false) {
    if (event.button !== 0 || (!allowInteractive && event.target.closest("button, input, textarea, select"))) return;
    if (isSheetMode() && root.dataset.state === "expanded") return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    lastFocused = document.activeElement;
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    let moved = false;
    const move = moveEvent => {
      if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) > 4) moved = true;
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      root.style.left = `${clamp(rect.left + moveEvent.clientX - startX, 8, innerWidth - width - 8)}px`;
      root.style.top = `${clamp(rect.top + moveEvent.clientY - startY, 8, innerHeight - height - 8)}px`;
    };
    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      if (moved && allowInteractive) {
        suppressLauncherClick = true;
        window.setTimeout(() => { suppressLauncherClick = false; }, 180);
      }
      saveGeometry();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    document.addEventListener("pointercancel", stop, { once: true });
  }

  function startResize(event) {
    if (event.button !== 0 || isSheetMode()) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = moveEvent => {
      root.style.width = `${clamp(rect.width + moveEvent.clientX - startX, 360, innerWidth - rect.left - 8)}px`;
      root.style.height = `${clamp(rect.height + moveEvent.clientY - startY, 470, innerHeight - rect.top - 8)}px`;
    };
    const stop = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      saveGeometry();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
    document.addEventListener("pointercancel", stop, { once: true });
  }

  function moveOrResizeWithKeyboard(event) {
    if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.shiftKey) resizeRootBy(event.key, 16);
    else moveRootBy(event.key, 16);
  }

  function resizeWithKeyboard(event) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    resizeRootBy(event.key, event.shiftKey ? 32 : 12);
  }

  function moveRootBy(key, amount) {
    const rect = root.getBoundingClientRect();
    const dx = key === "ArrowLeft" ? -amount : key === "ArrowRight" ? amount : 0;
    const dy = key === "ArrowUp" ? -amount : key === "ArrowDown" ? amount : 0;
    root.style.left = `${clamp(rect.left + dx, 8, innerWidth - rect.width - 8)}px`;
    root.style.top = `${clamp(rect.top + dy, 8, innerHeight - rect.height - 8)}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    saveGeometry();
  }

  function resizeRootBy(key, amount) {
    const rect = root.getBoundingClientRect();
    const dw = key === "ArrowLeft" ? -amount : key === "ArrowRight" ? amount : 0;
    const dh = key === "ArrowUp" ? -amount : key === "ArrowDown" ? amount : 0;
    root.style.width = `${clamp(rect.width + dw, 360, innerWidth - rect.left - 8)}px`;
    root.style.height = `${clamp(rect.height + dh, 470, innerHeight - rect.top - 8)}px`;
    saveGeometry();
  }

  function saveGeometry() {
    if (!prefs.rememberPosition || !["expanded", "compact", "minimized"].includes(root.dataset.state)) return;
    if (root.dataset.state === "expanded" && isSheetMode()) return;
    const rect = root.getBoundingClientRect();
    prefs.position = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      viewportWidth: innerWidth,
      viewportHeight: innerHeight
    };
    if (root.dataset.state === "expanded") {
      prefs.geometry = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        viewportWidth: innerWidth,
        viewportHeight: innerHeight
      };
    }
    savePrefs();
  }

  function applyGeometry() {
    const geometry = prefs.geometry;
    const position = prefs.position || geometry;
    if (!prefs.rememberPosition || !position) return;
    if (root.dataset.state === "expanded" && isSheetMode()) {
      root.style.removeProperty("left");
      root.style.removeProperty("top");
      root.style.removeProperty("right");
      root.style.removeProperty("bottom");
      root.style.removeProperty("width");
      root.style.removeProperty("height");
      return;
    }
    if (root.dataset.state === "expanded" && geometry) {
      const minWidth = Math.min(360, Math.max(240, innerWidth - 16));
      const minHeight = Math.min(470, Math.max(280, innerHeight - 16));
      root.style.width = `${clamp(Number(geometry.width) || 410, minWidth, Math.max(minWidth, innerWidth - 16))}px`;
      root.style.height = `${clamp(Number(geometry.height) || 620, minHeight, Math.max(minHeight, innerHeight - 16))}px`;
    }
    const rect = root.getBoundingClientRect();
    root.style.left = `${clamp(Number(position.left) || 8, 8, Math.max(8, innerWidth - rect.width - 8))}px`;
    root.style.top = `${clamp(Number(position.top) || 8, 8, Math.max(8, innerHeight - rect.height - 8))}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function clampToViewport() {
    if (!["expanded", "compact", "minimized"].includes(root.dataset.state)) return;
    if (root.dataset.state === "expanded" && isSheetMode()) return;
    const rect = root.getBoundingClientRect();
    if (root.dataset.state === "expanded") {
      const minWidth = Math.min(360, Math.max(240, innerWidth - 16));
      const minHeight = Math.min(470, Math.max(280, innerHeight - 16));
      const width = clamp(rect.width, minWidth, Math.max(minWidth, innerWidth - 16));
      const height = clamp(rect.height, minHeight, Math.max(minHeight, innerHeight - 16));
      root.style.width = `${width}px`;
      root.style.height = `${height}px`;
    }
    const nextRect = root.getBoundingClientRect();
    root.style.left = `${clamp(nextRect.left, 8, Math.max(8, innerWidth - nextRect.width - 8))}px`;
    root.style.top = `${clamp(nextRect.top, 8, Math.max(8, innerHeight - nextRect.height - 8))}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function isSheetMode() {
    return matchMedia("(max-width: 640px), (max-height: 520px)").matches;
  }

  function submitPrompt(rawPrompt, options = {}) {
    const prompt = String(rawPrompt || "").trim();
    if (!prompt || currentRequest) return;
    elements.input.value = "";
    if (looksLikeCredential(prompt)) {
      appendMessage({
        role: "assistant",
        timestamp: new Date().toISOString(),
        response: structuredResponse({
          result: "A possible credential or secret was detected. YardMate did not save or process that text.",
          inputs: ["Credential safety filter"],
          reasoning: "Credentials must be configured only through a secure server-side gateway, never through chat or page storage.",
          assumptions: ["The text may contain a key, token, password, or authorization value."],
          accuracy: "The original text was discarded and was not added to conversation history.",
          impact: "No network request was made and no operational data was changed.",
          action: "Rotate the credential if it was real, then configure a future authenticated server gateway outside this HTML.",
          confidence: "Moderate",
          sourceType: "privacy safeguard",
          state: "warning"
        })
      });
      renderMessages();
      announce("Possible credential discarded.");
      return;
    }
    const snapshot = structuredCloneSafe(context);
    appendMessage({ role: "user", text: prompt, timestamp: new Date().toISOString(), context: snapshot });
    renderMessages();
    root.dataset.helperStatus = "thinking";
    renderNotificationBadge();
    elements.footerState.textContent = "Reviewing local knowledge";
    elements.send.classList.add("stop");
    elements.send.textContent = "x";
    elements.send.setAttribute("aria-label", "Stop response");
    const request = { cancelled: false, timer: 0 };
    currentRequest = request;
    request.timer = window.setTimeout(() => {
      if (request.cancelled) return;
      const response = buildLocalResponse(prompt, snapshot, options);
      appendMessage({ role: "assistant", response, timestamp: new Date().toISOString(), context: snapshot });
      currentRequest = null;
      root.dataset.helperStatus = response.state || "success";
      elements.footerState.textContent = response.sourceType === "local knowledge" ? "Local knowledge response" : "Foundation status response";
      elements.send.classList.remove("stop");
      elements.send.textContent = ">";
      elements.send.setAttribute("aria-label", "Send question");
      renderMessages();
      renderNotificationBadge();
      announce("YardMate response ready.");
    }, prefs.animationMode === "on" ? 220 : prefs.animationMode === "reduced" ? 60 : 0);
  }

  function stopCurrentRequest() {
    if (!currentRequest) return;
    currentRequest.cancelled = true;
    window.clearTimeout(currentRequest.timer);
    currentRequest = null;
    root.dataset.helperStatus = "idle";
    renderNotificationBadge();
    elements.footerState.textContent = "Response stopped";
    elements.send.classList.remove("stop");
    elements.send.textContent = ">";
    elements.send.setAttribute("aria-label", "Send question");
    announce("Response stopped.");
  }

  function buildLocalResponse(prompt, snapshot, options = {}) {
    const normalized = prompt.toLowerCase();
    const pageLabel = snapshot.page && snapshot.page.label ? snapshot.page.label : "current page";
    const intent = classifyPromptIntent(prompt, options);
    const asksAuditExecution = intent.capability === "data-audit" && intent.mode === "execute";
    const asksForecastExecution = intent.capability === "forecasting" && intent.mode === "execute";
    const asksScenario = /\b(compare|comparison)\b.*\bscenario|\bscenario\b.*\b(compare|comparison)\b/.test(normalized);
    const asksLiveReview = /\bwhat data is missing\b|\bfind missing (data|values|records)\b|\b(are|check|reconcile).{0,24}\btotals? (consistent|correct|match)\b|\b(current|visible|active) warning\b|\b(explain|review).{0,20}\b(values? i am seeing|current warning|selected (row|record))\b|\bwhat (information|data) is (outdated|stale)\b|\bwhich values require manual verification\b/.test(normalized);
    const asksConnection = /\b(api|provider|model|connect ai|api key|credential)\b/.test(normalized);
    const asksCapabilities = /what can you help|what.*do right now|capabilit|what needs.*connect|what.*connected next/.test(normalized);
    const hasLiveAdapter = snapshot.adapterStatus === "connected";

    if (asksCapabilities) {
      const localNow = capabilities.filter(item => item.status === "available-local").map(item => item.label);
      const foundation = capabilities.filter(item => item.status === "foundation-ready").map(item => item.label);
      return structuredResponse({
        result: `Available locally now: ${localNow.join(", ")}. Foundation ready but not executing live work: ${foundation.join(", ")}. Other capabilities remain clearly marked as not connected or planned.`,
        inputs: [`Page: ${pageLabel}`, `Knowledge entries: ${knowledge.entries.length}`, "Capability registry v1"],
        reasoning: "Availability comes directly from the capability registry so the interface and response use the same status source.",
        assumptions: ["You are asking about the current foundation, not a future provider-connected version."],
        accuracy: "No capability without an executor is described as operational.",
        impact: "No data was read, changed, or sent outside the application.",
        action: "Use local guidance now. Connect validated page adapters next for data interpretation, audits, and forecasting; add a secure server gateway later for provider-backed features.",
        confidence: "High",
        sourceType: "foundation status",
        state: "success"
      });
    }

    if (asksAuditExecution) {
      return structuredResponse({
        result: `The audit workflow is prepared, but no audit executor is connected. ${hasLiveAdapter ? "Page context is available, but it has not been audited." : "No live page data adapter is connected."} No audit has been run and there are no findings to report.`,
        inputs: [`Page: ${pageLabel}`, "Local audit control rules", `Live records: ${hasLiveAdapter ? "adapter connected; not audited" : "unavailable"}`, "Audit executor: unavailable"],
        reasoning: "A valid audit needs a defined scope, named comparison sources, freshness, and a test rule. Producing findings without those records would be misleading.",
        assumptions: ["You want to audit the current page or selection.", "No live records were supplied in the question."],
        accuracy: "No operational values were calculated or inferred.",
        impact: "No data was read, changed, or sent outside the application.",
        action: "Select the scope and connect a validated page adapter. Then preview the sources and rules before running the audit.",
        confidence: "High",
        sourceType: "foundation status",
        state: "missing"
      });
    }

    if (asksForecastExecution) {
      return structuredResponse({
        result: `The forecasting interface is prepared, but no forecast executor is connected. ${hasLiveAdapter ? "Connected context has not been calculated into a forecast." : "A forecast cannot be calculated from shell context alone."}`,
        inputs: [`Page: ${pageLabel}`, "Documented forecast requirements", `Live workload and constraints: ${hasLiveAdapter ? "adapter context available; not calculated" : "unavailable"}`, "Forecast executor: unavailable"],
        reasoning: "A defensible forecast needs workload, rate, available time, staffing/equipment limits, delay allowances, source freshness, and a defined outcome.",
        assumptions: ["No validated workload or constraint values were supplied."],
        accuracy: "No forecast number was generated.",
        impact: "No operational plan or application data was changed.",
        action: "Provide or connect the remaining lifts/footage/demand, target rate, available hours, staffing, equipment, and known delays.",
        confidence: "High",
        sourceType: "foundation status",
        state: "missing"
      });
    }

    if (asksScenario || asksLiveReview || options.requiresLive) {
      return structuredResponse({
        result: "This request needs validated live records and a connected capability executor. The interface is ready, but no live interpretation or scenario executor is connected, so no result was generated.",
        inputs: [`Page: ${pageLabel}`, `Page adapter: ${hasLiveAdapter ? "connected" : "not connected"}`, "Capability executor: unavailable"],
        reasoning: "Local knowledge can explain documented rules, but it cannot claim to inspect current records or compare active scenarios without an approved executor.",
        assumptions: ["The request refers to current application data rather than general operational guidance."],
        accuracy: "No live analysis, comparison, checklist review, or risk scan was performed.",
        impact: "No data was read beyond reviewable context and no operational record was changed.",
        action: "Connect a validated page adapter and the appropriate read-only executor, then review the exact scope and inputs before running it.",
        confidence: "High",
        sourceType: "foundation status",
        state: "missing"
      });
    }

    if (asksConnection) {
      const providerDescription = providerStateDefinitions[providerStatus.code] || "Provider state unavailable.";
      return structuredResponse({
        result: `AI provider status: ${providerStatus.code.replace(/-/g, " ")}. ${providerDescription} Local knowledge guidance remains available without it.`,
        inputs: [`Provider status: ${providerStatus.code}`, `Secure gateway adapter: ${window.CONGLOBAL_OPS_ASSISTANT_GATEWAY ? "registered" : "unavailable"}`],
        reasoning: "A production credential must remain server-side and must never be embedded in HTML, browser storage, logs, conversation history, or exports.",
        assumptions: [window.CONGLOBAL_OPS_ASSISTANT_GATEWAY ? "Gateway status comes from the current browser session test." : "No secure deployment gateway has been installed."],
        accuracy: "This reflects the current assistant connection registry.",
        impact: "No network request was made and no credential was requested.",
        action: window.CONGLOBAL_OPS_ASSISTANT_GATEWAY ? "Use Settings to test the secure gateway. Never paste a credential into chat." : "In a future deployment, add an authenticated server-side gateway and inject only a non-secret adapter into this page.",
        confidence: "High",
        sourceType: "foundation status",
        state: "warning"
      });
    }

    const matches = retrieveKnowledge(prompt, snapshot.page && snapshot.page.id);
    if (!matches.length) {
      return structuredResponse({
        result: "I could not determine that from the embedded operational knowledge.",
        inputs: [`Page: ${pageLabel}`, `Knowledge version: ${knowledge.version}`],
        reasoning: "No sufficiently relevant reviewed knowledge entry matched the question, and live page data is not connected.",
        assumptions: [],
        accuracy: "No answer was guessed.",
        impact: "No data was read, changed, or sent outside the application.",
        action: "Add the missing rule to the operational knowledge base or connect an approved data source for this question.",
        confidence: "Low",
        sourceType: "local knowledge",
        state: "missing"
      });
    }

    const primary = matches[0].entry;
    const supporting = matches.slice(1, 3).map(item => item.entry);
    const ruleStatus = normalizeKnowledgeStatus(primary.status || primary.reviewStatus);
    const inputs = [`Page: ${pageLabel}`, `Knowledge: ${primary.title}`];
    supporting.forEach(entry => inputs.push(`Supporting knowledge: ${entry.title}`));
    const rules = (primary.rules || primary.details || []).slice(0, prefs.responseLength === "concise" ? 3 : 6);
    const resultText = [primary.summary, ...rules].filter(Boolean).join(" ");
    const labeledResult = ruleStatus === "confirmed" ? resultText : `${titleCase(ruleStatus)} knowledge - ${resultText}`;
    const assumptions = ["This is guidance from the embedded knowledge base, not a reading of current operational records."];
    if (ruleStatus !== "confirmed") assumptions.push(`This knowledge is ${ruleStatus} and requires verification before operational use.`);
    const recommendedAction = ruleStatus === "superseded"
      ? "Do not use this historical rule. Review its superseding reference before acting."
      : ruleStatus === "confirmed"
        ? (primary.rules && primary.rules.length ? primary.rules[0] : "Review the cited rule against current source data before acting.")
        : "Verify this knowledge with an authorized user and current source data before acting.";
    return structuredResponse({
      result: labeledResult,
      inputs,
      reasoning: `The response matched the documented ${primary.category || "operations"} rule most closely to your wording and current page context.`,
      assumptions,
      accuracy: `Knowledge status: ${ruleStatus}; source version: ${primary.sourceVersion || knowledge.version}.`,
      impact: "Guidance only. No application data was changed.",
      action: recommendedAction,
      confidence: ruleStatus === "confirmed" ? titleCase(primary.confidence || "medium") : "Low",
      sourceType: "local knowledge",
      sources: [primary, ...supporting].map(entry => ({ id: entry.id, title: entry.title, status: normalizeKnowledgeStatus(entry.status || entry.reviewStatus), version: entry.sourceVersion || knowledge.version })),
      state: ruleStatus === "confirmed" ? "success" : "warning"
    });
  }

  function classifyPromptIntent(prompt, options = {}) {
    const normalized = String(prompt || "").toLowerCase();
    const asksAudit = /\b(audit|reconcile|find mismatch|find missing|check records)\b/.test(normalized);
    const asksForecast = /\b(forecast|predict|project|how long|release time|shortage|what if)\b/.test(normalized);
    const guidanceCue = /\b(explain|definition|formula|rule|rules|requirements?|inputs?|workflow|what is|what are|what should|how does|how is|how are|needed to)\b/.test(normalized);
    const executionCue = /\b(run|perform|execute|calculate|generate|scan)\b|\b(audit|forecast|reconcile|check)\s+(this|the current|current|today|selected|active|these|those)\b/.test(normalized);
    const mode = options.requiresLive || executionCue || !guidanceCue ? "execute" : "guidance";
    if (asksAudit) return { capability: "data-audit", mode, requiresLive: mode === "execute" };
    if (asksForecast) return { capability: "forecasting", mode, requiresLive: mode === "execute" };
    return { capability: "application-guidance", mode: options.requiresLive ? "execute" : "guidance", requiresLive: Boolean(options.requiresLive) };
  }

  function structuredResponse(values) {
    return {
      result: values.result || "",
      inputs: values.inputs || [],
      reasoning: values.reasoning || "",
      assumptions: values.assumptions || [],
      accuracy: values.accuracy || "",
      impact: values.impact || "",
      action: values.action || "",
      confidence: values.confidence || "Medium",
      sourceType: values.sourceType || "foundation status",
      sources: values.sources || [],
      state: values.state || "idle"
    };
  }

  function retrieveKnowledge(prompt, pageId) {
    const tokens = tokenize(prompt);
    if (!tokens.length) return [];
    return (knowledge.entries || []).map(entry => {
      const title = tokenize(entry.title || "");
      const keywords = tokenize((entry.keywords || []).join(" "));
      const body = tokenize([entry.summary, ...(entry.rules || []), ...(entry.details || [])].join(" "));
      let score = 0;
      tokens.forEach(token => {
        if (title.includes(token)) score += 7;
        if (keywords.includes(token)) score += 5;
        if (body.includes(token)) score += 2;
      });
      const substantiveScore = score;
      if (substantiveScore < 4) return { entry, score: 0 };
      if (score > 0 && (entry.pages || []).includes(pageId)) score += 4;
      if (score > 0 && (entry.pages || []).includes("all")) score += 1;
      const status = normalizeKnowledgeStatus(entry.status || entry.reviewStatus);
      const asksForHistory = tokens.some(token => ["historical", "history", "old", "previous", "superseded"].includes(token));
      if (status === "superseded" && !asksForHistory) score = 0;
      return { entry, score };
    }).filter(item => item.score >= 4).sort((a, b) => b.score - a.score);
  }

  function tokenize(value) {
    const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "what", "how", "why", "can", "are", "does", "about", "into", "when", "where", "have", "need", "is", "was", "were", "will", "would", "could", "should", "today", "tomorrow"]);
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(token => token.length > 1 && !stop.has(token));
  }

  function appendMessage(message) {
    session.messages.push(message);
    session.messages = session.messages.slice(-MAX_MESSAGES);
    saveSession();
  }

  function renderAll() {
    renderMessages();
    renderSuggestions();
    renderContextLabel();
    renderNotificationBadge();
    if (activeTab === "context") renderContext();
    if (activeTab === "tools") renderTools();
    if (activeTab === "alerts") renderNotifications();
    if (activeTab === "settings") renderSettings();
  }

  function renderMessages() {
    elements.messages.replaceChildren();
    const welcome = document.createElement("section");
    welcome.className = "oa-welcome";
    const welcomeTitle = document.createElement("h3");
    welcomeTitle.textContent = session.name || "Current investigation";
    const welcomeCopy = document.createElement("p");
    welcomeCopy.textContent = "I can answer documented operational questions locally. Live audits, forecasts, and record changes remain disconnected until validated adapters are added.";
    const statuses = document.createElement("div");
    statuses.className = "oa-status-row";
    statuses.append(statusPill("Knowledge", knowledge.entries.length ? "ready" : "offline"), statusPill("Live data", context.adapterStatus === "connected" ? "ready" : "planned"), statusPill("AI", providerStatus.code === "connected" ? "ready" : "offline"));
    welcome.append(welcomeTitle, welcomeCopy, statuses);
    elements.messages.appendChild(welcome);

    session.messages.forEach(message => {
      const article = document.createElement("article");
      article.className = `oa-message ${message.role === "user" ? "user" : "assistant"}`;
      const meta = document.createElement("div");
      meta.className = "oa-message-meta";
      meta.textContent = `${message.role === "user" ? "You" : "YardMate"} - ${formatTime(message.timestamp)}`;
      const body = document.createElement("div");
      body.className = "oa-message-body";
      if (message.role === "user") {
        const p = document.createElement("p");
        p.textContent = message.text || "";
        body.appendChild(p);
      } else {
        renderStructuredResponse(body, message.response || structuredResponse({ result: "Response unavailable." }));
      }
      article.append(meta, body);
      elements.messages.appendChild(article);
    });
    window.requestAnimationFrame(() => { elements.messages.scrollTop = elements.messages.scrollHeight; });
  }

  function renderStructuredResponse(container, response) {
    const sections = [
      ["Result", response.result],
      ["Inputs Used", response.inputs],
      ["Reasoning", response.reasoning],
      ["Assumptions", response.assumptions],
      ["Accuracy Check", response.accuracy],
      ["Operational Impact", response.impact],
      ["Recommended Action", response.action]
    ];
    sections.forEach(([title, value]) => {
      if (value == null || (Array.isArray(value) && !value.length) || value === "") return;
      const section = document.createElement("section");
      section.className = "oa-response-section";
      const heading = document.createElement("h4");
      heading.textContent = title;
      section.appendChild(heading);
      if (Array.isArray(value)) {
        const list = document.createElement("ul");
        value.forEach(item => {
          const li = document.createElement("li");
          li.textContent = String(item);
          list.appendChild(li);
        });
        section.appendChild(list);
      } else {
        const p = document.createElement("p");
        p.textContent = String(value);
        section.appendChild(p);
      }
      container.appendChild(section);
    });
    const confidence = document.createElement("div");
    confidence.className = "oa-response-section";
    const pill = document.createElement("span");
    pill.className = "oa-confidence";
    pill.textContent = `Confidence: ${response.confidence || "Medium"}`;
    confidence.appendChild(pill);
    container.appendChild(confidence);
  }

  function statusPill(label, state) {
    const pill = document.createElement("span");
    pill.className = `oa-status-pill ${state}`;
    const dot = document.createElement("span");
    dot.className = "oa-status-dot";
    dot.setAttribute("aria-hidden", "true");
    pill.append(dot, document.createTextNode(`${label}: ${state === "ready" ? "ready" : state === "offline" ? "disconnected" : "foundation"}`));
    return pill;
  }

  function renderSuggestions() {
    elements.suggestions.replaceChildren();
    if (!prefs.suggestions) {
      elements.suggestions.hidden = true;
      return;
    }
    elements.suggestions.hidden = false;
    const prompts = promptSets[context.page.id] || promptSets.all;
    prompts.forEach(prompt => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "oa-chip";
      button.dataset.suggestion = prompt.text;
      button.dataset.live = prompt.live ? "true" : "false";
      button.textContent = prompt.live ? `${prompt.text} - live data` : prompt.text;
      if (prompt.live) button.title = "Requires a connected live page data adapter";
      elements.suggestions.appendChild(button);
    });
  }

  function renderContextLabel() {
    const details = [context.page.label];
    if (context.selectedDate) details.push(context.selectedDate);
    if (context.shift) details.push(context.shift);
    if (context.track) details.push(`Track ${context.track}`);
    elements.contextLabel.textContent = details.join(" - ");
  }

  function renderContext() {
    const view = root.querySelector("[data-view='context']");
    view.replaceChildren();
    const section = sectionShell("Context in use", "Review the exact context available to a response. Shell context is available now; page-level fields require an adapter.");
    const card = document.createElement("div");
    card.className = "oa-card";
    const dl = document.createElement("dl");
    dl.className = "oa-kv";
    const entries = [
      ["Page", context.page.label], ["Page ID", context.page.id], ["Tab", context.tab || "Not provided"], ["Selected date", context.selectedDate || "Not provided"],
      ["Shift", context.shift || "Not provided"], ["Train", context.train || "Not provided"], ["Block", context.block || "Not provided"],
      ["Track", context.track || "Not provided"], ["Employee", context.employee || "Not provided"], ["Group", context.group || "Not provided"],
      ["Filters", context.filters && context.filters.length ? context.filters.join(", ") : "None"], ["Warnings", context.warnings && context.warnings.length ? context.warnings.join(", ") : "None"],
      ["Selected row", context.selectedRow || "Not provided"], ["Scenario", context.scenario || "Not provided"], ["Planning period", context.planningPeriod || "Not provided"], ["Mode", context.mode || "Not provided"],
      ["Source", context.source], ["Freshness", context.freshness], ["Validation", context.validationStatus], ["Live adapter", context.adapterStatus]
    ];
    entries.forEach(([term, value]) => {
      const dt = document.createElement("dt"); dt.textContent = term;
      const dd = document.createElement("dd"); dd.textContent = String(value);
      dl.append(dt, dd);
    });
    card.appendChild(dl);
    const row = document.createElement("div"); row.className = "oa-button-row";
    row.append(button("Request selected-page context", "oa-secondary-button", "refresh-context"));
    card.appendChild(row);
    section.appendChild(card);

    const dataSection = sectionShell("Data sources", "Every future adapter must report provenance, freshness, validation, and conflicts.");
    if (!dataSources.size) {
      const empty = document.createElement("div"); empty.className = "oa-empty";
      const wrap = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = "No live data source connected";
      wrap.append(strong, document.createTextNode("Local knowledge is ready; page records have not been requested."));
      empty.appendChild(wrap); dataSection.appendChild(empty);
    } else {
      dataSources.forEach(source => dataSection.appendChild(dataSourceCard(source)));
    }
    view.append(section, dataSection);
  }

  function renderTools() {
    const view = root.querySelector("[data-view='tools']");
    view.replaceChildren();
    const intro = sectionShell("Capability registry", "Status, requirements, permissions, provider need, and limitations are controlled from one registry.");
    capabilities.forEach(capability => {
      const card = document.createElement("div");
      card.className = "oa-card oa-capability";
      const title = document.createElement("strong"); title.textContent = capability.label;
      const status = document.createElement("span");
      const statusClass = capability.status === "available-local" ? "ready" : capability.status === "not-connected" ? "offline" : "";
      status.className = `oa-capability-status ${statusClass}`;
      status.textContent = capability.status === "available-local" ? "Local now" : capability.status.replace(/-/g, " ");
      const description = document.createElement("p"); description.textContent = `${capability.description} Limitation: ${capability.limitation}`;
      const tags = document.createElement("div"); tags.className = "oa-tag-row"; tags.style.gridColumn = "1 / -1";
      tags.append(
        tag(`Availability: ${capability.availability}`),
        tag(`AI: ${capability.providerRequired ? "required" : "not required"}`),
        tag(`Executor: ${capabilityExecutors.has(capability.id) ? "registered - never auto-run" : "not connected"}`),
        tag(`Permissions: ${capability.permissions.join(", ")}`)
      );
      card.append(title, status, description, tags);
      intro.appendChild(card);
    });

    const audit = sectionShell("Audit workspace", "No audit has been run. Connect validated sources and define a scope before this can produce findings.");
    const auditNotice = document.createElement("div"); auditNotice.className = "oa-notice"; auditNotice.textContent = "Foundation Ready - audit executor not connected."; audit.appendChild(auditNotice);
    audit.appendChild(outputGrid([
      ["Scope", "Not selected"], ["Sources", "No validated sources"], ["Rules", "Not selected"], ["Findings", "0 - no audit run"]
    ]));
    audit.appendChild(foundationTable(
      ["Severity", "Category", "Page / record", "Finding", "Status"],
      "No audit findings. Running an audit requires an explicit scope, validated sources, and comparison rules."
    ));

    const forecast = sectionShell("Forecast workspace", "No forecast has been run. Workload, rate, time window, staffing, equipment, delay, and freshness inputs are required.");
    const forecastNotice = document.createElement("div"); forecastNotice.className = "oa-notice"; forecastNotice.textContent = "Foundation Ready - forecast executor not connected; no numeric result has been generated."; forecast.appendChild(forecastNotice);
    forecast.appendChild(outputGrid([
      ["Scenario", "Not selected"], ["Generated", "Not generated"], ["Freshness", "No live inputs"], ["Method", "Not connected"],
      ["Confidence", "Cannot determine"], ["Predicted result", "Unavailable"], ["Actual result", "Unavailable"], ["Variance", "Unavailable"]
    ]));
    const forecastInputs = document.createElement("div"); forecastInputs.className = "oa-foundation-note"; forecastInputs.textContent = "Required: workload, target/current rate, productive time, staffing, equipment constraints, delays, and source timestamps."; forecast.appendChild(forecastInputs);

    const action = sectionShell("Action confirmation", "Future suggestions follow Proposed -> Previewed -> Confirmed -> Applied -> Audited, with an undo path.");
    const actionNotice = document.createElement("div"); actionNotice.className = "oa-notice error"; actionNotice.textContent = "No action executor is connected. YardMate cannot change operational records in this build."; action.appendChild(actionNotice);
    action.appendChild(foundationTable(
      ["Affected record", "Current value", "Proposed value", "Impact"],
      "No action proposed. A future action must show an explanation and affected records before confirmation."
    ));
    const actionButtons = document.createElement("div"); actionButtons.className = "oa-button-row";
    const confirmAction = button("Confirm previewed action", "oa-primary-button", "unavailable-action"); confirmAction.disabled = true;
    const undoAction = button("Undo applied action", "oa-secondary-button", "unavailable-action"); undoAction.disabled = true;
    actionButtons.append(confirmAction, undoAction); action.appendChild(actionButtons);
    view.append(intro, audit, forecast, action);
  }

  function outputGrid(items) {
    const dl = document.createElement("dl");
    dl.className = "oa-output-grid";
    items.forEach(([label, value]) => {
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = value;
      dl.append(dt, dd);
    });
    return dl;
  }

  function foundationTable(headers, emptyText) {
    const region = document.createElement("div");
    region.className = "oa-table-region";
    region.tabIndex = 0;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", `${headers[0]} foundation table`);
    const table = document.createElement("table"); table.className = "oa-foundation-table";
    const thead = document.createElement("thead"); const headRow = document.createElement("tr");
    headers.forEach(label => { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; headRow.appendChild(th); });
    thead.appendChild(headRow);
    const tbody = document.createElement("tbody"); const emptyRow = document.createElement("tr"); const emptyCell = document.createElement("td");
    emptyCell.colSpan = headers.length; emptyCell.className = "oa-table-empty"; emptyCell.textContent = emptyText; emptyRow.appendChild(emptyCell); tbody.appendChild(emptyRow);
    table.append(thead, tbody); region.appendChild(table); return region;
  }

  function renderNotifications() {
    const view = root.querySelector("[data-view='alerts']");
    view.replaceChildren();
    const section = sectionShell("Notifications", "Operational notifications are opt-in. No sample findings or forecasts are inserted here.");
    if (!notifications.length) {
      const empty = document.createElement("div"); empty.className = "oa-empty";
      const wrap = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = "No notifications";
      wrap.append(strong, document.createTextNode("Connected adapters can add source-linked notices in a future update.")); empty.appendChild(wrap); section.appendChild(empty);
    } else {
      notifications.forEach(item => {
        const card = document.createElement("div"); card.className = "oa-card";
        const title = document.createElement("div"); title.className = "oa-card-title"; title.textContent = item.title;
        const body = document.createElement("div"); body.className = "oa-card-body"; body.textContent = item.message;
        card.append(title, body); section.appendChild(card);
      });
      const row = document.createElement("div"); row.className = "oa-button-row"; row.append(button("Clear notifications", "oa-secondary-button", "clear-notifications")); section.appendChild(row);
    }
    view.appendChild(section);
    renderNotificationBadge();
  }

  function renderSettings() {
    const view = root.querySelector("[data-view='settings']");
    view.replaceChildren();
    const provider = sectionShell("AI provider", "Production credentials must be configured in a secure server-side gateway and never entered into this HTML.");
    provider.append(
      formRow("Provider", selectControl("provider", [providerStatus.provider || "Secure gateway"], true)),
      formRow("Model", inputControl("model", providerStatus.model || "Configured by secure gateway", true)),
      formRow("Credential", inputControl("credential", "Server-side only - never stored here", true))
    );
    const providerNotice = document.createElement("div");
    providerNotice.className = `oa-notice ${providerStatus.code === "connected" ? "success" : ["configured", "testing", "not-configured"].includes(providerStatus.code) ? "" : "error"}`.trim();
    providerNotice.textContent = `${titleCase(providerStatus.code.replace(/-/g, " "))} - ${providerStateDefinitions[providerStatus.code] || "Unknown provider state."}`;
    provider.appendChild(providerNotice);
    const providerButtons = document.createElement("div"); providerButtons.className = "oa-button-row";
    const test = button("Test secure gateway", "oa-secondary-button", "test-provider");
    test.disabled = !window.CONGLOBAL_OPS_ASSISTANT_GATEWAY || providerStatus.code === "testing";
    const disconnect = button("Disconnect / clear metadata", "oa-secondary-button", "disconnect-provider");
    disconnect.disabled = !window.CONGLOBAL_OPS_ASSISTANT_GATEWAY && providerStatus.code === "not-configured";
    providerButtons.append(test, disconnect); provider.appendChild(providerButtons);

    const response = sectionShell("Response preferences", "These are non-secret local interface preferences.");
    response.append(
      formRow("Default opening state", selectControl("defaultState", ["Minimized", "Compact", "Expanded"], false, prefs.defaultState)),
      formRow("Tone", selectControl("tone", ["Operational", "Concise", "Explanatory"], false, prefs.tone)),
      formRow("Response length", selectControl("responseLength", ["Concise", "Standard", "Detailed"], false, prefs.responseLength)),
      formRow("Theme", selectControl("theme", ["System", "Dark", "Light"], false, prefs.theme)),
      formRow("Animations", selectControl("animationMode", ["On", "Reduced", "Off"], false, prefs.animationMode))
    );
    response.append(toggleRow("Suggested questions", "suggestions", prefs.suggestions), toggleRow("Notifications", "notifications", prefs.notifications), toggleRow("Proactive help", "proactive", prefs.proactive), toggleRow("Remember position", "rememberPosition", prefs.rememberPosition));

    const conversation = sectionShell("Conversation management", "Current conversation is stored only for this browser tab. Long-term investigations are planned.");
    conversation.appendChild(formRow("Conversation name", inputControl("conversationName", session.name || "Current investigation", false)));
    const conversationButtons = document.createElement("div"); conversationButtons.className = "oa-button-row";
    conversationButtons.append(button("New conversation", "oa-secondary-button", "new-conversation"), button("Clear conversation", "oa-danger-button", "clear-conversation")); conversation.appendChild(conversationButtons);
    const saved = document.createElement("div"); saved.className = "oa-notice"; saved.textContent = "Saved investigations: Planned - no long-term or cloud conversation storage is enabled."; conversation.appendChild(saved);

    const knowledgeStatus = sectionShell("Knowledge and capabilities", "The embedded knowledge remains available without an AI provider. Non-confirmed rules stay visibly labeled and require review.");
    knowledgeStatus.appendChild(outputGrid([
      ["Knowledge version", knowledge.version || "Unavailable"],
      ["Reviewed", knowledge.reviewedAt || "Not provided"],
      ["Entries", String((knowledge.entries || []).length)],
      ["Statuses", Object.keys(knowledge.statusDefinitions || {}).join(", ") || "Unavailable"],
      ["Local capabilities", String(capabilities.filter(item => item.availability === "available").length)],
      ["Foundation-only", String(capabilities.filter(item => item.availability === "foundation-only").length)]
    ]));

    const privacy = sectionShell("Privacy and permissions", "Local guidance is available. Live data, external requests, and changes are separate explicit permissions.");
    const privacyList = document.createElement("div"); privacyList.className = "oa-card";
    const dl = document.createElement("dl"); dl.className = "oa-kv";
    [["Local knowledge", "Allowed"], ["Read live page data", context.adapterStatus === "connected" ? "Adapter-scoped" : "Not connected"], ["External requests", "Not allowed automatically"], ["Change records", "No executor"], ["Secrets", "Likely credentials are rejected; gateway only"]].forEach(([term, value]) => { const dt=document.createElement("dt");dt.textContent=term;const dd=document.createElement("dd");dd.textContent=value;dl.append(dt,dd); });
    privacyList.appendChild(dl); privacy.appendChild(privacyList);

    const reset = sectionShell("Assistant controls", "Reset affects YardMate preferences only and never operational records.");
    const resetButtons = document.createElement("div"); resetButtons.className = "oa-button-row";
    resetButtons.append(button("Reset layout and preferences", "oa-secondary-button", "reset-assistant"), button("Disable YardMate", "oa-danger-button", "disable-assistant")); reset.appendChild(resetButtons);
    view.append(provider, response, conversation, knowledgeStatus, privacy, reset);
    bindSettingsControls(view);
  }

  function bindSettingsControls(view) {
    view.querySelectorAll("[data-pref]").forEach(control => {
      control.addEventListener("change", () => {
        const key = control.dataset.pref;
        prefs[key] = control.type === "checkbox" ? control.checked : String(control.value).toLowerCase();
        if (key === "theme") root.dataset.theme = prefs.theme;
        if (key === "animationMode") root.dataset.animation = prefs.animationMode;
        if (key === "suggestions") renderSuggestions();
        if (key === "rememberPosition" && !prefs.rememberPosition) { prefs.geometry = null; prefs.position = null; }
        savePrefs();
      });
    });
    const name = view.querySelector("[data-session-name]");
    if (name) name.addEventListener("change", () => { session.name = String(name.value || "Current investigation").trim() || "Current investigation"; saveSession(); renderMessages(); });
  }

  function sectionShell(title, copy) {
    const section = document.createElement("section"); section.className = "oa-section";
    const head = document.createElement("div"); head.className = "oa-section-head";
    const text = document.createElement("div"); const h3 = document.createElement("h3"); h3.textContent = title;
    const p = document.createElement("p"); p.className = "oa-section-copy"; p.textContent = copy;
    text.append(h3, p); head.appendChild(text); section.appendChild(head); return section;
  }

  function formRow(labelText, control) {
    const row = document.createElement("div"); row.className = "oa-form-row";
    const label = document.createElement("label"); label.textContent = labelText; label.appendChild(control); row.appendChild(label); return row;
  }

  function inputControl(id, value, disabled) {
    const input = document.createElement("input"); input.type = "text"; input.value = value; input.disabled = Boolean(disabled);
    if (id === "conversationName") input.dataset.sessionName = "true"; else input.dataset.pref = id;
    return input;
  }

  function selectControl(id, values, disabled, selected) {
    const select = document.createElement("select"); select.disabled = Boolean(disabled); select.dataset.pref = id;
    values.forEach(value => { const option = document.createElement("option"); option.value = value.toLowerCase().replace(/\s+/g, "-"); option.textContent = value; if (String(selected || "").toLowerCase() === option.value || String(selected || "").toLowerCase() === value.toLowerCase()) option.selected = true; select.appendChild(option); });
    return select;
  }

  function toggleRow(label, key, checked) {
    const row = document.createElement("label"); row.className = "oa-toggle-row";
    const span = document.createElement("span"); span.textContent = label;
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(checked); input.dataset.pref = key;
    row.append(span, input); return row;
  }

  function button(text, className, action) {
    const node = document.createElement("button"); node.type = "button"; node.className = className; node.textContent = text; node.dataset.action = action; return node;
  }

  function tag(text) { const node = document.createElement("span"); node.className = "oa-tag"; node.textContent = text; return node; }

  function dataSourceCard(source) {
    const card = document.createElement("div"); card.className = "oa-card";
    const title = document.createElement("div"); title.className = "oa-card-title"; title.textContent = source.label || source.id;
    const body = document.createElement("div"); body.className = "oa-card-body"; body.textContent = `Source: ${source.source || "not provided"}. Freshness: ${source.freshness || "not provided"}. Validation: ${source.validationStatus || "not provided"}. Conflicts: ${source.conflicts && source.conflicts.length ? source.conflicts.length : 0}.`;
    card.append(title, body); return card;
  }

  function updatePageContext(page) {
    const suppliedId = String(page && page.id || "").trim();
    const id = /^[A-Za-z0-9_-]{1,80}$/.test(suppliedId) ? suppliedId : currentPageId();
    const previousPageId = context && context.page ? context.page.id : null;
    pendingContextRequest = null;
    if (previousPageId && previousPageId !== id) dataSources.clear();
    context = { ...createBaseContext(), page: { id, label: page && page.label ? String(page.label).slice(0, 120) : pageLabels[id] || titleCase(id.replace(/[-_]+/g, " ")) || "Workbook" } };
    renderContextLabel(); renderSuggestions();
    if (activeTab === "context") renderContext();
  }

  function updateContext(partial, source) {
    if (!prefs.enabled) return;
    if (!partial || typeof partial !== "object") return;
    const allowed = ["tab", "selectedDate", "shift", "train", "block", "track", "employee", "group", "filters", "warnings", "selectedRow", "scenario", "planningPeriod", "mode", "freshness", "validationStatus", "adapterStatus"];
    const next = { ...context };
    allowed.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(partial, key)) next[key] = sanitizeContextValue(key, partial[key]);
    });
    next.source = String(source || partial.source || "page adapter").slice(0, 120);
    next.capturedAt = new Date().toISOString();
    context = next;
    renderContextLabel();
    if (activeTab === "context") renderContext();
  }

  function sanitizeContextValue(key, value) {
    if (["filters", "warnings"].includes(key)) return Array.isArray(value) ? value.slice(0, 30).map(item => redactCredentialText(String(item)).slice(0, 200)) : [];
    if (value == null) return null;
    if (typeof value === "object") return redactCredentialText(JSON.stringify(value)).slice(0, 1000);
    return redactCredentialText(String(value)).slice(0, 500);
  }

  function requestPageContext(options = {}) {
    if (!prefs.enabled) return;
    const explicit = Boolean(options.explicit);
    const requestedFields = explicit
      ? ["tab", "selectedDate", "shift", "train", "block", "track", "employee", "group", "filters", "warnings", "selectedRow", "scenario", "planningPeriod", "mode", "freshness", "validationStatus"]
      : ["tab", "selectedDate", "shift", "mode", "freshness", "validationStatus"];
    const registeredAdapter = adapters.get(context.page.id);
    if (registeredAdapter) {
      const requestPage = context.page.id;
      Promise.resolve().then(() => registeredAdapter.getContext({ pageId: requestPage, requestedFields, explicit, purpose: "Reviewable assistant context summary" })).then(result => {
        if (context.page.id !== requestPage || !result || typeof result !== "object") return;
        updateContext({ ...result, adapterStatus: "connected" }, registeredAdapter.label || `registered ${requestPage} adapter`);
      }).catch(() => {
        updateContext({ adapterStatus: "error", validationStatus: "adapter error" }, registeredAdapter.label || `registered ${requestPage} adapter`);
      });
      return;
    }
    const frame = activeFrame();
    context.adapterStatus = "not connected";
    context.freshness = "page route only";
    context.validationStatus = "shell context";
    if (!frame || !frame.contentWindow) {
      renderContextLabel();
      return;
    }
    const requestId = randomId();
    const token = randomId();
    pendingContextRequest = { requestId, token, pageId: context.page.id, sourceWindow: frame.contentWindow, expiresAt: Date.now() + 1500 };
    frame.contentWindow.postMessage({
      type: "conglobal-ops-assistant-context-request",
      schemaVersion: SCHEMA_VERSION,
      requestId,
      token,
      pageId: context.page.id,
      requestedFields,
      purpose: "Reviewable assistant context summary"
    }, "*");
    window.setTimeout(() => {
      if (pendingContextRequest && pendingContextRequest.requestId === requestId) pendingContextRequest = null;
    }, 1600);
  }

  function receiveContextMessage(event) {
    if (!prefs.enabled) return;
    const data = event.data;
    const pending = pendingContextRequest;
    if (!pending || event.source !== pending.sourceWindow || !data || data.type !== "conglobal-ops-assistant-context-response") return;
    if (Date.now() > pending.expiresAt || data.schemaVersion !== SCHEMA_VERSION || data.requestId !== pending.requestId || data.token !== pending.token || data.pageId !== pending.pageId) return;
    let serialized = "";
    try { serialized = JSON.stringify(data); } catch (_) { return; }
    if (serialized.length > MAX_CONTEXT_BYTES) return;
    pendingContextRequest = null;
    updateContext({ ...data.context, adapterStatus: "connected" }, data.source && data.source.label ? data.source.label : "validated page adapter");
    if (data.source) registerDataSource({ ...data.source, id: data.source.id || `page-${data.pageId}` });
  }

  function activeFrame() {
    const chassis = document.getElementById("chassisPageFrame");
    const primary = document.getElementById("pageFrame");
    return context.page.id === "chassisStatus" ? chassis : primary;
  }

  function registerAdapter(id, adapter) {
    const key = String(id || "").trim();
    if (!key || !adapter || typeof adapter.getContext !== "function") return false;
    adapters.set(key, adapter);
    requestPageContext();
    return true;
  }

  function unregisterAdapter(id) {
    const key = String(id || "").trim();
    const removed = adapters.delete(key);
    if (removed && context.page.id === key) {
      dataSources.clear();
      context.adapterStatus = "not connected";
      context.freshness = "page route only";
      context.validationStatus = "shell context";
      requestPageContext();
      renderContextLabel();
    }
    return removed;
  }

  function registerCapabilityExecutor(capabilityId, executor) {
    const id = String(capabilityId || "").trim();
    if (!capabilities.some(capability => capability.id === id) || !executor || typeof executor.execute !== "function") return false;
    capabilityExecutors.set(id, {
      execute: executor.execute,
      label: String(executor.label || id).slice(0, 120),
      permissions: Array.isArray(executor.permissions) ? executor.permissions.slice(0, 20).map(value => String(value).slice(0, 100)) : [],
      readOnly: executor.readOnly !== false
    });
    if (activeTab === "tools") renderTools();
    return true;
  }

  function registerDataSource(source) {
    if (!prefs.enabled) return false;
    if (!source || !source.id) return false;
    const safe = {
      id: redactCredentialText(String(source.id)).slice(0, 100), label: redactCredentialText(String(source.label || source.id)).slice(0, 120), source: redactCredentialText(String(source.source || "")).slice(0, 180),
      freshness: redactCredentialText(String(source.freshness || "")).slice(0, 120), validationStatus: redactCredentialText(String(source.validationStatus || "")).slice(0, 120),
      conflicts: Array.isArray(source.conflicts) ? source.conflicts.slice(0, 30).map(item => redactCredentialText(String(item)).slice(0, 200)) : []
    };
    dataSources.set(safe.id, safe);
    if (activeTab === "context") renderContext();
    return true;
  }

  function notify(item) {
    if (!prefs.enabled) return false;
    if (!item || !item.title || !prefs.notifications) return false;
    const severity = ["info", "success", "warning", "error", "critical"].includes(String(item.severity || "info").toLowerCase()) ? String(item.severity || "info").toLowerCase() : "info";
    notifications.unshift({ id: randomId(), title: String(item.title).slice(0, 120), message: String(item.message || "").slice(0, 1000), severity, source: String(item.source || "adapter"), createdAt: new Date().toISOString(), acknowledged: false });
    notifications.splice(20);
    renderNotificationBadge();
    return true;
  }

  function testProviderConnection() {
    const gateway = window.CONGLOBAL_OPS_ASSISTANT_GATEWAY;
    if (!gateway || typeof gateway.test !== "function") {
      setProviderStatus("not-configured");
      announce("Secure provider gateway is unavailable in this build.");
      return;
    }
    setProviderStatus("testing");
    announce("Testing secure gateway.");
    const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 15000));
    Promise.race([Promise.resolve().then(() => gateway.test()), timeout]).then(result => {
      if (result && result.ok) {
        setProviderStatus("connected", result);
        announce("Secure gateway connected.");
        return;
      }
      const code = result && providerStateDefinitions[result.code] ? result.code : "request-failed";
      setProviderStatus(code, result || {});
      announce(providerStateDefinitions[code]);
    }).catch(error => {
      const code = error && error.message === "timeout" ? "timeout" : "provider-unavailable";
      setProviderStatus(code);
      announce(providerStateDefinitions[code]);
    });
  }

  function disconnectProvider() {
    const gateway = window.CONGLOBAL_OPS_ASSISTANT_GATEWAY;
    if (gateway && typeof gateway.disconnect === "function") {
      try { gateway.disconnect(); } catch (_) {}
    }
    setProviderStatus(gateway ? "configured" : "not-configured", { provider: null, model: null });
    announce("Provider connection metadata cleared. No credential was stored in YardMate.");
  }

  function setProviderStatus(code, details = {}) {
    const safeCode = providerStateDefinitions[code] ? code : "request-failed";
    providerStatus = {
      code: safeCode,
      updatedAt: new Date().toISOString(),
      provider: Object.prototype.hasOwnProperty.call(details, "provider") ? safeProviderMetadata(details.provider, 80) : providerStatus.provider,
      model: Object.prototype.hasOwnProperty.call(details, "model") ? safeProviderMetadata(details.model, 120) : providerStatus.model
    };
    if (activeTab === "settings") renderSettings();
  }

  function startNewConversation() {
    session = { version: 1, name: `Investigation ${new Date().toLocaleDateString()}`, messages: [] };
    saveSession(); renderMessages();
  }

  function clearConversation() {
    session.messages = []; saveSession(); renderMessages();
  }

  function resetAssistant() {
    prefs = { ...defaultPrefs };
    try { localStorage.removeItem(PREFS_KEY); } catch (_) {}
    root.removeAttribute("style");
    root.dataset.theme = prefs.theme;
    root.dataset.animation = prefs.animationMode;
    renderAll();
    setDisplayState("compact", { persist: true });
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
  }

  function saveSession() {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (_) {}
  }

  function loadJson(storage, key, fallback) {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : structuredCloneSafe(fallback);
    } catch (_) {
      return structuredCloneSafe(fallback);
    }
  }

  function normalizePrefs(value) {
    const next = { ...defaultPrefs, ...(value || {}) };
    if (next.version !== 1) return { ...defaultPrefs };
    for (const key of ["enabled", "rememberPosition", "suggestions", "notifications", "proactive"]) next[key] = next[key] === true;
    if (!["minimized", "compact", "expanded", "hidden"].includes(next.displayState)) next.displayState = "compact";
    if (!["compact", "expanded", "minimized"].includes(next.defaultState)) next.defaultState = "compact";
    if (!["system", "dark", "light"].includes(next.theme)) next.theme = "system";
    if (!["operational", "concise", "explanatory"].includes(next.tone)) next.tone = "operational";
    if (!["concise", "standard", "detailed"].includes(next.responseLength)) next.responseLength = "standard";
    if (!next.animationMode && typeof next.animations === "boolean") next.animationMode = next.animations ? "on" : "off";
    if (!["on", "reduced", "off"].includes(next.animationMode)) next.animationMode = "on";
    delete next.animations;
    if (!next.position || typeof next.position !== "object") next.position = null;
    return next;
  }

  function normalizeSession(value) {
    const next = value && typeof value === "object" ? value : { version: 1, name: "Current investigation", messages: [] };
    const messages = Array.isArray(next.messages) ? next.messages.slice(-MAX_MESSAGES) : [];
    return {
      version: 1,
      name: String(next.name || "Current investigation").slice(0, 120),
      messages: messages.filter(message => !containsCredentialDeep(message))
    };
  }

  function looksLikeCredential(value) {
    const text = String(value || "");
    return /\bsk-[A-Za-z0-9_-]{16,}\b|\bAIza[A-Za-z0-9_-]{20,}\b|\bBearer\s+[A-Za-z0-9._~-]{12,}\b|\b(api[ _-]?key|access[ _-]?token|refresh[ _-]?token|password|client[ _-]?secret)\s*[:=]\s*\S+/i.test(text);
  }

  function containsCredentialDeep(value) {
    if (typeof value === "string") return looksLikeCredential(value);
    if (!value || typeof value !== "object") return false;
    try { return looksLikeCredential(JSON.stringify(value)); } catch (_) { return true; }
  }

  function redactCredentialText(value) {
    const text = String(value || "");
    return looksLikeCredential(text) ? "[credential-like value removed]" : text;
  }

  function safeProviderMetadata(value, limit) {
    if (value == null || value === "") return null;
    const text = String(value);
    return looksLikeCredential(text) ? null : text.slice(0, limit);
  }

  function saveGeometrySafe() { try { saveGeometry(); } catch (_) {} }

  function renderNotificationBadge() {
    const count = notifications.filter(item => !item.acknowledged).length;
    elements.notificationBadges.forEach(badge => {
      badge.hidden = count === 0;
      badge.textContent = String(Math.min(count, 99));
    });
    const countText = count ? `, ${count} notification${count === 1 ? "" : "s"}` : ", no notifications";
    const helperStatus = String(root.dataset.helperStatus || "idle").replace(/-/g, " ");
    root.querySelectorAll("[data-action='expand']").forEach(button => button.setAttribute("aria-label", `Open YardMate operations assistant, status ${helperStatus}${countText}`));
    root.querySelectorAll("[data-action='alerts']").forEach(button => button.setAttribute("aria-label", `Notifications${countText}`));
  }

  function restoreFocus() {
    const target = lastLauncher && document.contains(lastLauncher) ? lastLauncher : lastFocused && document.contains(lastFocused) ? lastFocused : null;
    if (target && typeof target.focus === "function") window.setTimeout(() => target.focus(), 0);
  }

  function announce(text) {
    elements.live.textContent = "";
    window.setTimeout(() => { elements.live.textContent = text; }, 20);
  }

  function formatTime(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "now" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
  }

  function titleCase(value) {
    return String(value || "").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function normalizeKnowledgeStatus(value) {
    const status = String(value || "unresolved").toLowerCase();
    return ["confirmed", "inferred", "proposed", "superseded", "unresolved", "verification-required"].includes(status) ? status : "unresolved";
  }

  function structuredCloneSafe(value) {
    try { return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  window.addEventListener("beforeunload", saveGeometrySafe);
})();
