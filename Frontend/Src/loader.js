/**
 * loader.js — Admin Assist Page Loading & Transition System
 * Provides:
 *   1. Full-screen branded splash loader (#aa-page-loader)
 *   2. Top glowing progress bar (#aa-top-progress)
 *   3. In-page container & card loaders (.aa-spinner-overlay)
 *   4. Button loading states (.aa-btn-loading)
 *   5. Navigation click interceptor for instant feedback
 */

(function (window, document) {
    'use strict';

    var _activeRequests = 0;
    var _progressTimer = null;
    var _currentProgress = 0;
    var _pageLoaderEl = null;
    var _topProgressEl = null;
    var _topProgressBarEl = null;
    var _isPageLoaded = false;
    var _failsafeTimeout = null;

    /* ─── DOM Injection Helpers ───────────────────────────────────── */

    function _ensureTopProgressBar() {
        if (_topProgressEl) return _topProgressEl;
        _topProgressEl = document.getElementById('aa-top-progress');
        if (!_topProgressEl) {
            _topProgressEl = document.createElement('div');
            _topProgressEl.id = 'aa-top-progress';
            _topProgressBarEl = document.createElement('div');
            _topProgressBarEl.className = 'aa-top-progress-bar';
            _topProgressEl.appendChild(_topProgressBarEl);

            var target = document.body || document.documentElement;
            if (target) {
                target.appendChild(_topProgressEl);
            }
        } else {
            _topProgressBarEl = _topProgressEl.querySelector('.aa-top-progress-bar');
        }
        return _topProgressEl;
    }

    function _ensurePageLoader() {
        if (_pageLoaderEl) return _pageLoaderEl;
        _pageLoaderEl = document.getElementById('aa-page-loader');
        if (!_pageLoaderEl) {
            _pageLoaderEl = document.createElement('div');
            _pageLoaderEl.id = 'aa-page-loader';
            _pageLoaderEl.setAttribute('role', 'status');
            _pageLoaderEl.setAttribute('aria-live', 'polite');
            _pageLoaderEl.setAttribute('aria-label', 'Loading page content');

            _pageLoaderEl.innerHTML =
                '<div class="aa-loader-card">' +
                    '<div class="aa-shield-container">' +
                        '<div class="aa-shield-halo"></div>' +
                        '<div class="aa-shield-halo-outer"></div>' +
                        '<div class="aa-shield-glow"></div>' +
                        '<div class="aa-shield-icon">' +
                            '<span>AA</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="aa-loader-brand">Admin Assist</div>' +
                    '<div class="aa-loader-sub">School Information System</div>' +
                    '<div class="aa-loader-status-wrap">' +
                        '<span class="aa-loader-status-text" id="aa-loader-status-msg">Loading workspace</span>' +
                        '<div class="aa-loader-dots"><span></span><span></span><span></span></div>' +
                    '</div>' +
                    '<div class="aa-loader-progress-track">' +
                        '<div class="aa-loader-progress-fill"></div>' +
                    '</div>' +
                '</div>';

            var target = document.body || document.documentElement;
            if (target) {
                target.insertBefore(_pageLoaderEl, target.firstChild);
            }
        }
        return _pageLoaderEl;
    }

    /* ─── Top Progress Bar Controller ─────────────────────────────── */

    function _startProgress() {
        _ensureTopProgressBar();
        if (!_topProgressEl || !_topProgressBarEl) return;

        _topProgressEl.classList.add('active');
        if (_currentProgress === 0) {
            _setProgress(15);
        }

        if (_progressTimer) clearInterval(_progressTimer);
        _progressTimer = setInterval(function () {
            if (_currentProgress < 85) {
                // Trickle progress smoothly
                var increment = Math.max(1, (85 - _currentProgress) * 0.12);
                _setProgress(_currentProgress + increment);
            }
        }, 200);
    }

    function _setProgress(percent) {
        _currentProgress = Math.min(100, Math.max(0, percent));
        if (_topProgressBarEl) {
            _topProgressBarEl.style.width = _currentProgress + '%';
        }
    }

    function _doneProgress() {
        if (_progressTimer) {
            clearInterval(_progressTimer);
            _progressTimer = null;
        }

        _setProgress(100);

        setTimeout(function () {
            if (_topProgressEl) {
                _topProgressEl.classList.remove('active');
            }
            setTimeout(function () {
                _setProgress(0);
            }, 300);
        }, 220);
    }

    /* ─── Full-Screen Page Loader Controller ──────────────────────── */

    function _showPageLoader(message) {
        var loader = _ensurePageLoader();
        if (!loader) return;

        if (message) {
            var msgEl = loader.querySelector('#aa-loader-status-msg');
            if (msgEl) msgEl.textContent = message;
        }

        loader.classList.remove('aa-loader-hidden');
    }

    function _hidePageLoader() {
        var loader = document.getElementById('aa-page-loader');
        if (loader) {
            loader.classList.add('aa-loader-hidden');
            // Remove from accessibility tree after transition
            setTimeout(function () {
                if (loader.classList.contains('aa-loader-hidden')) {
                    loader.setAttribute('aria-hidden', 'true');
                }
            }, 400);
        }
    }

    /* ─── In-Page Card / Section Loader ───────────────────────────── */

    function _showCardLoader(target, message) {
        var el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;

        el.classList.add('aa-loading-container');

        var existing = el.querySelector(':scope > .aa-spinner-overlay');
        if (existing) return existing;

        var overlay = document.createElement('div');
        overlay.className = 'aa-spinner-overlay';
        overlay.innerHTML =
            '<div class="aa-spinner aa-spinner-md"></div>' +
            (message ? '<span class="aa-spinner-text">' + _escapeHtml(message) + '</span>' : '');

        el.appendChild(overlay);
        return overlay;
    }

    function _hideCardLoader(target) {
        var el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;

        var overlay = el.querySelector(':scope > .aa-spinner-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.2s ease';
            setTimeout(function () {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                el.classList.remove('aa-loading-container');
            }, 200);
        } else {
            el.classList.remove('aa-loading-container');
        }
    }

    /* ─── Button Loading State ────────────────────────────────────── */

    function _setButtonLoading(btn, isLoading, loadingText) {
        var el = typeof btn === 'string' ? document.querySelector(btn) : btn;
        if (!el) return;

        if (isLoading) {
            if (!el.getAttribute('data-original-html')) {
                el.setAttribute('data-original-html', el.innerHTML);
            }
            el.disabled = true;
            el.classList.add('aa-btn-loading');

            var spinner = el.querySelector('.aa-btn-spinner');
            if (!spinner) {
                spinner = document.createElement('div');
                spinner.className = 'aa-btn-spinner';
                el.appendChild(spinner);
            }
        } else {
            el.disabled = false;
            el.classList.remove('aa-btn-loading');
            var original = el.getAttribute('data-original-html');
            if (original) {
                el.innerHTML = original;
                el.removeAttribute('data-original-html');
            } else {
                var s = el.querySelector('.aa-btn-spinner');
                if (s && s.parentNode) s.parentNode.removeChild(s);
            }
        }
    }

    /* ─── Navigation Click Interceptor ────────────────────────────── */

    function _setupNavigationListener() {
        document.addEventListener('click', function (e) {
            var anchor = e.target.closest('a');
            if (!anchor) return;

            var href = anchor.getAttribute('href');
            var target = anchor.getAttribute('target');

            // Skip anchor jumps, javascript:, mailto:, new tabs, or external links
            if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
                href.startsWith('mailto:') || href.startsWith('tel:') || target === '_blank') {
                return;
            }

            // Internal .html or relative page navigation
            if (href.endsWith('.html') || !href.includes('://')) {
                _startProgress();
            }
        }, { passive: true });
    }

    /* ─── API Request Tracker ─────────────────────────────────────── */

    function _reqStart() {
        _activeRequests++;
        if (_activeRequests === 1) {
            _startProgress();
        }
    }

    function _reqEnd() {
        _activeRequests = Math.max(0, _activeRequests - 1);
        if (_activeRequests === 0) {
            _doneProgress();
        }
    }

    function _trackPromise(promise) {
        if (!promise || typeof promise.then !== 'function') return promise;
        _reqStart();
        return promise.finally(function () {
            _reqEnd();
        });
    }

    function _escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /* ─── Lifecycle & Auto-Init ───────────────────────────────────── */

    function _init() {
        _ensureTopProgressBar();
        _ensurePageLoader();
        _setupNavigationListener();

        // Start top progress during document parsing
        if (document.readyState === 'loading') {
            _startProgress();
        }

        // Failsafe timeout to never leave screen locked
        _failsafeTimeout = setTimeout(function () {
            _hidePageLoader();
            _doneProgress();
        }, 3500);

        function _dismiss() {
            if (_isPageLoaded) return;
            _isPageLoaded = true;

            if (_failsafeTimeout) {
                clearTimeout(_failsafeTimeout);
                _failsafeTimeout = null;
            }

            // Smooth minimum display threshold to avoid jarring flash
            setTimeout(function () {
                _hidePageLoader();
                _doneProgress();
            }, 250);
        }

        if (document.readyState === 'complete') {
            _dismiss();
        } else {
            window.addEventListener('load', _dismiss);
            document.addEventListener('DOMContentLoaded', function () {
                // Advance progress on DOMContentLoaded
                _setProgress(75);
                setTimeout(_dismiss, 400);
            });
        }
    }

    // Auto-init immediately if DOM is available, or on next tick
    if (document.body) {
        _init();
    } else {
        document.addEventListener('DOMContentLoaded', _init);
    }

    /* ─── Global Public API (AALoader) ────────────────────────────── */

    var AALoader = {
        start: _startProgress,
        set: _setProgress,
        done: _doneProgress,
        showPageLoader: _showPageLoader,
        hidePageLoader: _hidePageLoader,
        showCardLoader: _showCardLoader,
        hideCardLoader: _hideCardLoader,
        setButtonLoading: _setButtonLoading,
        trackPromise: _trackPromise,
        reqStart: _reqStart,
        reqEnd: _reqEnd
    };

    window.AALoader = AALoader;

})(window, document);
