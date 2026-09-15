const measures = {
  layout_shift: 0,
  longest_task_ms: 0,
  interaction_delays: [],
  last_interaction: null
};
let receiptCore = null;

const observe = (type, handler) => {
  try {
    const observer = new PerformanceObserver(list => list.getEntries().forEach(handler));
    observer.observe({ type, buffered: true });
  } catch { /* unsupported metrics remain explicit in the receipt */ }
};

observe("layout-shift", entry => {
  if (!entry.hadRecentInput) measures.layout_shift += entry.value;
});
observe("longtask", entry => {
  measures.longest_task_ms = Math.max(measures.longest_task_ms, entry.duration);
});
observe("event", entry => {
  const delay = Math.max(0, entry.processingStart - entry.startTime);
  measures.interaction_delays.push(delay);
});

function rounded(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function targetLabel(target) {
  return target?.getAttribute?.("aria-label") || target?.textContent?.trim?.().slice(0, 80) || target?.tagName || "UNKNOWN";
}

async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const output = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(output)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function publish(core) {
  window.KIDULTS_PERFORMANCE_RECEIPT = Object.freeze({ ...core, receipt_digest: await digest(core) });
  document.documentElement.dataset.performanceReceipt = JSON.stringify(window.KIDULTS_PERFORMANCE_RECEIPT);
  return window.KIDULTS_PERFORMANCE_RECEIPT;
}

export function beginPerformanceQualification(surface) {
  const started = performance.now();
  document.addEventListener("click", event => {
    const interactionStarted = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      measures.last_interaction = Object.freeze({
        target: targetLabel(event.target),
        response_ms: rounded(performance.now() - interactionStarted)
      });
      if (receiptCore) {
        receiptCore = { ...receiptCore, observed_at: new Date().toISOString(), last_interaction: measures.last_interaction,
          max_interaction_delay_ms: measures.interaction_delays.length ? rounded(Math.max(...measures.interaction_delays)) : measures.last_interaction.response_ms };
        await publish(receiptCore);
      }
    }));
  }, { capture: true });

  return async function completePerformanceQualification(integrationBus) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const navigation = performance.getEntriesByType("navigation")[0];
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map(entry => [entry.name, rounded(entry.startTime)]));
    const layoutStarted = performance.now();
    document.documentElement.getBoundingClientRect();
    getComputedStyle(document.documentElement).display;
    const layoutRead = performance.now() - layoutStarted;
    const core = {
      receipt_id: `v587-performance-${surface.toLowerCase()}-${Math.round(performance.timeOrigin)}`,
      surface,
      observed_at: new Date().toISOString(),
      source: "BROWSER_PERFORMANCE_API",
      integration_bus_state: integrationBus?.state ?? "UNKNOWN",
      render_ms: rounded(performance.now() - started),
      first_paint_ms: paint["first-paint"] ?? null,
      first_contentful_paint_ms: paint["first-contentful-paint"] ?? null,
      memory_js_heap_bytes: Number.isFinite(performance.memory?.usedJSHeapSize) ? performance.memory.usedJSHeapSize : null,
      layout_shift: rounded(measures.layout_shift),
      reflow_probe_ms: rounded(layoutRead),
      longest_task_ms: rounded(measures.longest_task_ms),
      max_interaction_delay_ms: measures.interaction_delays.length ? rounded(Math.max(...measures.interaction_delays)) : null,
      navigation_ms: rounded(navigation?.duration),
      dom_content_loaded_ms: rounded(navigation?.domContentLoadedEventEnd),
      last_interaction: measures.last_interaction,
      production: "HOLD",
      public: "HOLD",
      g5: "HOLD"
    };
    receiptCore = core;
    return publish(core);
  };
}
