/**
 * panels.js
 * Slide-over panel management.
 *
 * Responsibilities:
 *   - Open / close panels by ID
 *   - Wire [data-panel] trigger buttons and [data-panel-close] buttons
 *   - Close on backdrop click and Escape key
 *   - Role-gate triggers via [data-require-role]
 *   - Fetch and render live panel content from the API
 *
 * Load on pages that include panel markup.
 * Requires: auth.js (for apiFetch, getUser)
 */

/* === Sprint 2 Additions: Slide-Over Panels === */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * openPanel(panelId)
 * Slides in the panel, shows the backdrop, locks body scroll, and loads content.
 */
function openPanel(panelId) {
    const panel = document.getElementById(panelId);
    const backdrop = document.getElementById("panel-backdrop");
    if (!panel) return;

    panel.removeAttribute("hidden");
    panel.classList.add("slide-panel--open");

    if (backdrop) {
        backdrop.classList.add("panel-backdrop--visible");
        backdrop.setAttribute("aria-hidden", "false");
    }

    document.body.classList.add("scroll-locked");

    // Move keyboard focus to the close button for accessibility
    const closeBtn = panel.querySelector(".slide-panel__close");
    if (closeBtn) closeBtn.focus();

    _loadPanelContent(panelId);
}

/**
 * closePanel(panelId)
 * Slides the panel out and restores backdrop / scroll.
 */
function closePanel(panelId) {
    const panel = document.getElementById(panelId);
    const backdrop = document.getElementById("panel-backdrop");
    if (!panel) return;

    panel.classList.remove("slide-panel--open");

    if (backdrop) {
        backdrop.classList.remove("panel-backdrop--visible");
        backdrop.setAttribute("aria-hidden", "true");
    }

    document.body.classList.remove("scroll-locked");

    // Re-add the hidden attribute after the slide-out CSS transition (250ms)
    setTimeout(() => {
        if (!panel.classList.contains("slide-panel--open")) {
            panel.setAttribute("hidden", "");
        }
    }, 260);
}

/**
 * applyPanelRoleGates(userRole)
 * Removes any trigger button or element that requires a role the current
 * user doesn't have. Call once after the user's role is known.
 *
 * Usage in HTML: <button data-require-role="administrator">…</button>
 */
function applyPanelRoleGates(userRole) {
    document.querySelectorAll("[data-require-role]").forEach(el => {
        const allowed = el.dataset.requireRole.split(" ");
        if (!allowed.includes(userRole)) el.remove();
    });
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    // Wire [data-panel="panelId"] buttons to openPanel
    document.querySelectorAll("[data-panel]").forEach(btn => {
        btn.addEventListener("click", () => openPanel(btn.dataset.panel));
    });

    // Wire [data-panel-close="panelId"] buttons to closePanel
    document.querySelectorAll("[data-panel-close]").forEach(btn => {
        btn.addEventListener("click", () => closePanel(btn.dataset.panelClose));
    });

    // Backdrop click closes all open panels
    const backdrop = document.getElementById("panel-backdrop");
    if (backdrop) {
        backdrop.addEventListener("click", () => {
            document.querySelectorAll(".slide-panel--open")
                .forEach(p => closePanel(p.id));
        });
    }

    // Escape key closes all open panels
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            document.querySelectorAll(".slide-panel--open")
                .forEach(p => closePanel(p.id));
        }
    });

    // Apply role gates once the user is known
    const user = getUser();
    if (user && user.role) applyPanelRoleGates(user.role);
});

// ─── Live content loading ─────────────────────────────────────────────────────

// Each panel ID maps to its backend endpoint path (relative to API_BASE)
const _PANEL_ENDPOINTS = {
    "panel-grading-scale": "/settings/grading-scale",
    "panel-moderation": "/moderation/checklist",
    "panel-teacher-notes": "/notes",
};

/**
 * _loadPanelContent(panelId)
 * Fetches panel data from the API and renders it.
 * Skips the fetch if the panel body already has data-loaded="true".
 */
async function _loadPanelContent(panelId) {
    const body = document.getElementById(`${panelId}-body`);
    if (!body || body.dataset.loaded === "true") return;

    const path = _PANEL_ENDPOINTS[panelId];
    if (!path) return;

    // Show a shimmer skeleton while loading
    body.innerHTML = `<div class="skeleton-block" aria-hidden="true"></div>`;

    try {
        const res = await apiFetch(path);
        if (!res || !res.ok) throw new Error("Could not load panel data");

        const data = await res.json();
        _renderPanelContent(panelId, body, data);
        body.dataset.loaded = "true";
    } catch (err) {
        body.innerHTML = `<p class="text-error">${_esc(err.message)}</p>`;
    }
}

/**
 * _renderPanelContent(panelId, bodyEl, data)
 * Renders the appropriate UI for each panel type.
 */
function _renderPanelContent(panelId, body, data) {
    if (panelId === "panel-grading-scale") {
        const rows = Array.isArray(data) ? data : [];
        body.innerHTML = rows.length
            ? rows.map(row => `
                <div class="panel-grade-row">
                    <strong class="panel-grade-letter">${_esc(row.grade)}</strong>
                    <span class="panel-grade-range">${row.min_mark}–${row.max_mark}</span>
                    <span class="panel-grade-label">${_esc(row.label || "")}</span>
                </div>`).join("")
            : "<p>No grading scale configured.</p>";

    } else if (panelId === "panel-moderation") {
        const items = Array.isArray(data) ? data : [];
        body.innerHTML = items.length
            ? `<ul class="panel-checklist">
                ${items.map(item => `
                    <li class="panel-checklist__item">
                        <label>
                            <input type="checkbox" ${item.is_required ? "required" : ""}>
                            ${_esc(item.item)}
                        </label>
                    </li>`).join("")}
               </ul>`
            : "<p>No checklist items configured.</p>";

    } else if (panelId === "panel-teacher-notes") {
        const notes = Array.isArray(data) ? data : (data.notes || []);

        body.innerHTML = `
            <div class="panel-notes-form">
                <textarea
                    id="note-input"
                    rows="3"
                    placeholder="Write a note…"
                    aria-label="Note content"
                ></textarea>
                <button class="btn btn--primary btn--sm" id="save-note-btn">Save Note</button>
            </div>
            <ul class="panel-notes-list">
                ${notes.length
                ? notes.map(n => `
                        <li class="panel-note-item">
                            <p>${_esc(n.content)}</p>
                            <small>${new Date(n.created_at).toLocaleString()}</small>
                        </li>`).join("")
                : "<li class='panel-note-empty'>No notes yet.</li>"
            }
            </ul>
        `;

        // Wire the Save Note button
        const saveBtn = body.querySelector("#save-note-btn");
        if (saveBtn) {
            saveBtn.addEventListener("click", async () => {
                const input = body.querySelector("#note-input");
                const content = (input ? input.value : "").trim();
                if (!content) return;

                saveBtn.disabled = true;
                saveBtn.textContent = "Saving…";

                try {
                    const res = await apiFetch("/notes", {
                        method: "POST",
                        body: JSON.stringify({ content }),
                    });
                    if (!res || !res.ok) throw new Error("Could not save note");

                    // Reset loaded flag so the panel refreshes next open
                    body.dataset.loaded = "";
                    _loadPanelContent("panel-teacher-notes");
                } catch (err) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Save Note";
                    body.querySelector(".panel-notes-list")
                        .insertAdjacentHTML("afterbegin",
                            `<li class="text-error">${_esc(err.message)}</li>`);
                }
            });
        }
    }
}

// ─── Private helper ───────────────────────────────────────────────────────────

function _esc(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}