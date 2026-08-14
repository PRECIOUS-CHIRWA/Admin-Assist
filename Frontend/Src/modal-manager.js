(function () {
    'use strict';

    /* ─── Inject required styles ────────────────────────────────────────────
       Injected once so this file is self-contained and works even if
       aa-shared.css has not yet applied the modal z-index override.
    ────────────────────────────────────────────────────────────────────── */
    function _injectStyles() {
        if (document.getElementById('aa-modal-manager-styles')) return;

        var style = document.createElement('style');
        style.id = 'aa-modal-manager-styles';
        style.textContent = `
/* ── Modal backdrop ──────────────────────────────────────────────── */
.aa-modal-backdrop {
    position: fixed !important;
    inset: 0 !important;
    background: rgba(0, 0, 0, .50) !important;
    display: flex !important;
    align-items: flex-start !important;
    justify-content: center !important;
    padding: 2rem 1rem !important;
    z-index: 10000 !important;          /* above sidebar (9999) */
    overflow-y: auto !important;
    pointer-events: all !important;
    opacity: 0;
    transition: opacity .2s ease !important;
}
.aa-modal-backdrop[hidden] {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
}
.aa-modal-backdrop.aa-modal-visible {
    opacity: 1 !important;
}

/* ── Modal dialog ────────────────────────────────────────────────── */
.aa-modal {
    background: #ffffff;
    border-radius: 12px;
    width: 100%;
    max-width: 680px;
    box-shadow: 0 8px 30px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.08);
    flex-shrink: 0;
    transform: translateY(16px);
    transition: transform .25s cubic-bezier(.4,0,.2,1) !important;
    pointer-events: all !important;
}
.aa-modal-backdrop.aa-modal-visible .aa-modal {
    transform: translateY(0) !important;
}
.aa-modal-sm  { max-width: 480px !important; }
.aa-modal-lg  { max-width: 860px !important; }
.aa-modal-xl  { max-width: 1040px !important; }

/* ── Scroll lock ─────────────────────────────────────────────────── */
body.aa-modal-open { overflow: hidden !important; }

/* ── Toast notifications ─────────────────────────────────────────── */
#aa-toast-container {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 20000;
    display: flex;
    flex-direction: column;
    gap: .6rem;
    pointer-events: none;
    max-width: 360px;
}
.aa-toast {
    display: flex;
    align-items: flex-start;
    gap: .75rem;
    padding: .85rem 1.1rem;
    border-radius: 10px;
    font-size: .875rem;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,.14);
    pointer-events: all;
    animation: aa-toast-in .25s cubic-bezier(.4,0,.2,1) forwards;
    line-height: 1.4;
    word-break: break-word;
}
.aa-toast.aa-toast-out {
    animation: aa-toast-out .25s ease forwards;
}
.aa-toast-icon {
    font-size: 1.1rem;
    flex-shrink: 0;
    margin-top: 1px;
}
.aa-toast-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
.aa-toast-error   { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.aa-toast-warning { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.aa-toast-info    { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
.aa-toast-close {
    margin-left: auto; flex-shrink: 0;
    background: none; border: none; cursor: pointer;
    font-size: 1rem; opacity: .5; padding: 0 0 0 .5rem;
    color: inherit; line-height: 1;
}
.aa-toast-close:hover { opacity: 1; }
@keyframes aa-toast-in {
    from { opacity: 0; transform: translateX(30px); }
    to   { opacity: 1; transform: translateX(0); }
}
@keyframes aa-toast-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(30px); }
}

/* ── Loading spinner in buttons ──────────────────────────────────── */
.aa-btn-loading::after {
    content: '';
    display: inline-block;
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,.4);
    border-top-color: #fff;
    border-radius: 50%;
    margin-left: .5rem;
    animation: aa-spin .6s linear infinite;
    vertical-align: middle;
}
@keyframes aa-spin {
    to { transform: rotate(360deg); }
}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ─── Stack tracking ────────────────────────────────────────────────── */
    var _stack = [];   // IDs of currently open modals, topmost last

    /* ─── Core open ─────────────────────────────────────────────────────── */
    function open(modalId, opts) {
        opts = opts || {};
        var backdrop = document.getElementById(modalId);
        if (!backdrop) {
            console.warn('[ModalManager] No element found with id:', modalId);
            return;
        }

        // Remove hidden attr first so display:flex applies, then animate
        backdrop.removeAttribute('hidden');

        // Track opener so we can return focus on close
        backdrop._opener = opts.opener || document.activeElement || null;

        // Record in stack
        if (_stack.indexOf(modalId) === -1) _stack.push(modalId);

        // Lock body scroll
        document.body.classList.add('aa-modal-open');

        // Animate in (defer one frame so transition fires)
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                backdrop.classList.add('aa-modal-visible');
            });
        });

        // Wire close on backdrop click (once)
        if (!backdrop._mmWired) {
            backdrop._mmWired = true;

            backdrop.addEventListener('click', function (e) {
                if (e.target === backdrop) close(modalId);
            });

            // Wire close button(s) inside this modal
            backdrop.querySelectorAll('.aa-modal-close').forEach(function (btn) {
                btn.addEventListener('click', function () { close(modalId); });
            });
        }

        // Move focus to first focusable element inside the dialog
        var dialog = backdrop.querySelector('[role="dialog"], .aa-modal');
        if (dialog) {
            var focusable = dialog.querySelector(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),' +
                'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusable) {
                setTimeout(function () { focusable.focus(); }, 80);
            }
        }
    }

    /* ─── Core close ────────────────────────────────────────────────────── */
    function close(modalId) {
        var backdrop = document.getElementById(modalId);
        if (!backdrop) return;

        // Animate out
        backdrop.classList.remove('aa-modal-visible');

        // After transition ends, add hidden attr
        var onEnd = function () {
            backdrop.setAttribute('hidden', '');
            backdrop.removeEventListener('transitionend', onEnd);
        };
        backdrop.addEventListener('transitionend', onEnd);

        // Safety fallback if transitionend never fires
        setTimeout(function () {
            if (!backdrop.hasAttribute('hidden')) {
                backdrop.setAttribute('hidden', '');
            }
        }, 350);

        // Remove from stack
        var idx = _stack.indexOf(modalId);
        if (idx !== -1) _stack.splice(idx, 1);

        // Release scroll lock if no more modals open
        if (_stack.length === 0) {
            document.body.classList.remove('aa-modal-open');
        }

        // Return focus to opener
        if (backdrop._opener && typeof backdrop._opener.focus === 'function') {
            setTimeout(function () {
                try { backdrop._opener.focus(); } catch (e) { }
            }, 50);
        }
    }

    /* ─── Close all ─────────────────────────────────────────────────────── */
    function closeAll() {
        var ids = _stack.slice(); // copy since close() mutates _stack
        ids.forEach(function (id) { close(id); });
    }

    /* ─── Escape key handler ────────────────────────────────────────────── */
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (_stack.length > 0) {
            e.stopImmediatePropagation();   // prevent sidebar from also closing
            close(_stack[_stack.length - 1]);
        }
    }, true /* capture phase — fires before navigation.js bubbling handler */);

    /* ─── Toast notification system ─────────────────────────────────────── */
    function toast(message, type, duration) {
        type = type || 'info';
        duration = duration !== undefined ? duration : 4000;

        var container = document.getElementById('aa-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'aa-toast-container';
            document.body.appendChild(container);
        }

        var icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

        var el = document.createElement('div');
        el.className = 'aa-toast aa-toast-' + type;
        el.innerHTML =
            '<span class="aa-toast-icon">' + (icons[type] || 'ℹ️') + '</span>' +
            '<span>' + _esc(message) + '</span>' +
            '<button class="aa-toast-close" aria-label="Dismiss">&times;</button>';

        el.querySelector('.aa-toast-close').addEventListener('click', function () {
            _dismissToast(el);
        });

        container.appendChild(el);

        if (duration > 0) {
            setTimeout(function () { _dismissToast(el); }, duration);
        }

        return el;
    }

    function _dismissToast(el) {
        if (!el.parentNode) return;
        el.classList.add('aa-toast-out');
        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 270);
    }

    /* ─── Button loading state ──────────────────────────────────────────── */
    function setLoading(btnId, isLoading, restoreText) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        if (isLoading) {
            btn._originalText = btn.textContent;
            btn.disabled = true;
            btn.classList.add('aa-btn-loading');
            btn.textContent = restoreText || 'Loading…';
            btn.classList.add('aa-btn-loading');
        } else {
            btn.disabled = false;
            btn.classList.remove('aa-btn-loading');
            btn.textContent = restoreText || btn._originalText || 'Submit';
        }
    }

    /* ─── HTML escape helper ────────────────────────────────────────────── */
    function _esc(v) {
        return String(v || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ─── Initialise ────────────────────────────────────────────────────── */
    _injectStyles();

    /* ─── Public API ────────────────────────────────────────────────────── */
    window.ModalManager = {
        open: open,
        close: close,
        closeAll: closeAll,
        toast: toast,
        setLoading: setLoading,
        /** Returns true if at least one modal is currently open. */
        _hasOpen: function () { return _stack.length > 0; },
    };

})();
