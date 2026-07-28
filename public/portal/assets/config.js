(function () {
    "use strict";
    function text(id, value) { var element = document.getElementById(id); if (element) { element.textContent = value; } }
    async function loadConfigurationHealth() {
        try {
            var response = await fetch("/api/config/status", {headers:{"Accept":"application/json"}});
            var payload = await response.json();
            var data = payload.data || payload;
            text("config-health-status", data.status || "unknown");
            text("config-health-environment", data.environment || "unknown");
            text("config-health-production-ready", data.production_ready ? "Ready" : "Not ready");
            text("config-health-secret-source", data.security && data.security.api_secret_source ? data.security.api_secret_source : "unknown");
        } catch (error) {
            text("config-health-status", "unavailable");
            text("config-health-production-ready", "Not ready");
        }
    }
    document.addEventListener("DOMContentLoaded", loadConfigurationHealth);
})();