(function () {
    "use strict";

    var storageKey = "kaios_bearer_token";
    var originalFetch = window.fetch.bind(window);

    function token() {
        return sessionStorage.getItem(storageKey) || "";
    }

    function showLogin(message) {
        var overlay = document.getElementById("security-login");
        var error = document.getElementById("security-login-error");

        if (overlay) {
            overlay.classList.add("is-visible");
        }

        if (error) {
            error.textContent = message || "";
        }
    }

    function hideLogin() {
        var overlay = document.getElementById("security-login");

        if (overlay) {
            overlay.classList.remove("is-visible");
        }
    }

    window.fetch = function (input, init) {
        var options = Object.assign({}, init || {});
        var headers = new Headers(options.headers || {});
        var bearer = token();

        if (bearer) {
            headers.set("Authorization", "Bearer " + bearer);
        }

        options.headers = headers;

        return originalFetch(input, options).then(function (response) {
            if (response.status === 401) {
                showLogin("Authentication is required.");
            }

            return response;
        });
    };

    document.addEventListener("DOMContentLoaded", function () {
        var form = document.getElementById("security-login-form");
        var input = document.getElementById("security-token-input");

        if (!form || !input) {
            return;
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            var value = input.value.trim();

            if (!value) {
                showLogin("Enter a Bearer token.");
                return;
            }

            sessionStorage.setItem(storageKey, value);

            originalFetch("/api/edition", {
                headers: {
                    "Authorization": "Bearer " + value
                }
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error("Authentication failed.");
                }

                hideLogin();
                window.location.reload();
            }).catch(function () {
                sessionStorage.removeItem(storageKey);
                showLogin("Invalid or unauthorized token.");
            });
        });

        originalFetch("/api/security/status")
            .then(function (response) {
                return response.json();
            })
            .then(function (payload) {
                var data = payload.data || {};

                if (
                    data.status === "enabled"
                    && !token()
                ) {
                    showLogin("");
                }
            })
            .catch(function () {
                return undefined;
            });
    });
})();