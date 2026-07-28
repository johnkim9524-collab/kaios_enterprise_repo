(function () {
    "use strict";

    function text(id, value) {
        var element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    async function loadObservability() {
        try {
            var statusResponse = await fetch(
                "/api/observability/status"
            );
            var metricsResponse = await fetch(
                "/api/metrics"
            );
            var statusPayload = await statusResponse.json();
            var metricsPayload = await metricsResponse.json();
            var status = statusPayload.data || {};
            var metrics = metricsPayload.data || {};

            text(
                "observability-status",
                status.status || "unknown"
            );
            text(
                "observability-requests",
                String(metrics.request_count || 0)
            );
            text(
                "observability-errors",
                String(metrics.error_count || 0)
            );
            text(
                "observability-latency",
                String(metrics.latency_average_ms || 0) + " ms"
            );
        } catch (error) {
            text("observability-status", "unavailable");
        }
    }

    document.addEventListener(
        "DOMContentLoaded",
        loadObservability
    );
})();