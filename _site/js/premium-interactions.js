/**
 * premium-interactions.js
 * Mouse-driven micro-interactions for the LogosCaller premium theme.
 *
 * Effects:
 *  - Contextual cursor pill (antigravity.google style): the native
 *    cursor is replaced by a floating icon+label pill over any
 *    [data-cursor-pill] zone. It trails the pointer with an eased
 *    lag and pops in with a springy overshoot.
 *  - Cursor spotlight with eased (lerped) follow and click boost
 *  - Pointer parallax on the aurora background and hero content
 *  - 3D tilt + traveling glare on product cards
 *  - Magnetic buttons
 *  - Scroll reveal with per-section stagger
 *
 * Graceful degradation:
 *  - No JS: nothing is added, page renders exactly as before and the
 *    native cursor is never hidden.
 *  - Touch devices: only scroll reveal is enabled.
 *  - prefers-reduced-motion: only scroll reveal (opacity-only) is enabled.
 *
 * Architecture: all pointer-driven animation runs in ONE shared rAF
 * ticker. Smoothing is time-based (identical feel at 60/120/144 Hz),
 * and the ticker parks itself once every subscriber settles.
 */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia('(pointer: fine)').matches;
    var enablePointerFx = finePointer && !reduceMotion;

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    function each(list, fn) {
        Array.prototype.forEach.call(list, fn);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    // Framerate-independent exponential smoothing.
    // tau = time constant in seconds; ~63% of the distance is covered
    // per tau, ~95% per 3*tau. (A per-frame lerp of k at 60 Hz equals
    // tau = -1/60 / ln(1 - k).)
    function smooth(current, target, tau, dt) {
        return current + (target - current) * (1 - Math.exp(-dt / tau));
    }

    // --------------------------------------------------------
    // Shared ticker — a single rAF loop for every pointer effect.
    // Subscribers receive dt (seconds, capped) and return true while
    // they still need frames. The loop parks when nobody is hungry;
    // wake() restarts it on the next input event.
    // --------------------------------------------------------
    var ticker = (function () {
        var subscribers = [];
        var rafId = null;
        var last = 0;

        function frame(now) {
            rafId = null;
            var dt = last ? Math.min((now - last) / 1000, 0.064) : 1 / 60;
            last = now;

            var hungry = false;
            for (var i = 0; i < subscribers.length; i++) {
                if (subscribers[i](dt)) {
                    hungry = true;
                }
            }

            if (hungry) {
                rafId = requestAnimationFrame(frame);
            } else {
                last = 0;
            }
        }

        return {
            add: function (fn) {
                subscribers.push(fn);
            },
            wake: function () {
                if (rafId === null) {
                    rafId = requestAnimationFrame(frame);
                }
            }
        };
    })();

    // --------------------------------------------------------
    // Scroll reveal (safe for every device / motion preference)
    // --------------------------------------------------------
    function initReveal() {
        if (!('IntersectionObserver' in window)) {
            return;
        }

        var targets = document.querySelectorAll(
            '.products .card, .section-title, .section-prose, .cta-row'
        );
        if (!targets.length) {
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            each(entries, function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        // Stagger siblings inside the same section.
        var counters = new WeakMap();
        each(targets, function (el) {
            if (reduceMotion) {
                // Opacity-only fade, no movement.
                el.style.setProperty('--reveal-delay', '0s');
            }
            var group = el.closest ? (el.closest('section') || document.body) : document.body;
            var index = counters.get(group) || 0;
            counters.set(group, index + 1);

            el.classList.add('reveal');
            if (!reduceMotion) {
                el.style.setProperty('--reveal-delay', (index * 0.09).toFixed(2) + 's');
            }
            observer.observe(el);
        });
    }

    // --------------------------------------------------------
    // Contextual cursor pill — antigravity.google style.
    // Over a [data-cursor-pill] zone the native cursor is hidden and
    // a floating pill (icon + label) takes over, centered on the
    // pointer, trailing it with an eased lag.
    //
    // Tuned to mirror antigravity's GSAP rig:
    //   follow   ≈ gsap.quickTo(duration 0.35, ease power2.out)
    //   pop-in   ≈ back.out(1.7)  (CSS overshoot bezier, 0.34s)
    //   pop-out  ≈ power2.in      (CSS ease-in, 0.2s)
    // Their pill is absolutely positioned inside each section and is
    // re-projected on scroll; ours is position:fixed, so scrolling
    // only needs a bounds check to drop zones that move away.
    // --------------------------------------------------------
    function initCursorPill() {
        if (!enablePointerFx) {
            return;
        }

        var ZONE = '[data-cursor-pill]';
        if (!document.querySelector(ZONE)) {
            return;
        }

        var pill = document.createElement('div');
        pill.className = 'cursor-pill';
        pill.setAttribute('aria-hidden', 'true');
        pill.innerHTML =
            '<div class="cursor-pill-inner">' +
            '<i class="cursor-pill-icon"></i>' +
            '<span class="cursor-pill-label"></span>' +
            '</div>';
        document.body.appendChild(pill);

        var iconEl = pill.querySelector('.cursor-pill-icon');
        var labelEl = pill.querySelector('.cursor-pill-label');

        // Only hide native cursors inside zones once the pill is live.
        document.body.classList.add('cursor-pill-live');

        var FOLLOW_TAU = 0.09;
        var targetX = 0;
        var targetY = 0;
        var pillX = 0;
        var pillY = 0;
        var activeZone = null;

        ticker.add(function (dt) {
            if (!activeZone) {
                return false;
            }
            pillX = smooth(pillX, targetX, FOLLOW_TAU, dt);
            pillY = smooth(pillY, targetY, FOLLOW_TAU, dt);

            var settled =
                Math.abs(targetX - pillX) < 0.1 &&
                Math.abs(targetY - pillY) < 0.1;
            if (settled) {
                pillX = targetX;
                pillY = targetY;
            }
            pill.style.transform =
                'translate3d(' + pillX.toFixed(2) + 'px,' + pillY.toFixed(2) + 'px,0)';
            return !settled;
        });

        function setZoneContent(zone) {
            var icon = zone.getAttribute('data-cursor-icon') || '';
            iconEl.className = 'cursor-pill-icon' + (icon ? ' ' + icon : '');
            iconEl.style.display = icon ? '' : 'none';
            labelEl.textContent = zone.getAttribute('data-cursor-label') || '';
        }

        function deactivate() {
            activeZone = null;
            pill.classList.remove('is-active', 'is-press');
        }

        document.addEventListener('pointerover', function (e) {
            var zone = e.target && e.target.closest ? e.target.closest(ZONE) : null;
            if (!zone || zone === activeZone) {
                return;
            }
            if (activeZone) {
                // Direct zone-to-zone hop: swap content, stay visible.
                activeZone = zone;
                setZoneContent(zone);
                return;
            }
            activeZone = zone;
            setZoneContent(zone);
            // Jump to the pointer instead of flying in from a stale spot.
            targetX = pillX = e.clientX;
            targetY = pillY = e.clientY;
            pill.style.transform = 'translate3d(' + pillX + 'px,' + pillY + 'px,0)';
            pill.classList.add('is-active');
            ticker.wake();
        });

        document.addEventListener('pointerout', function (e) {
            if (!activeZone) {
                return;
            }
            var to = e.relatedTarget;
            // Still inside a pill zone (same one, or hopping to another —
            // pointerover handles the swap). relatedTarget === null means
            // the pointer left the window.
            if (to && to.closest && to.closest(ZONE)) {
                return;
            }
            deactivate();
        });

        window.addEventListener('pointermove', function (e) {
            targetX = e.clientX;
            targetY = e.clientY;
            if (activeZone) {
                ticker.wake();
            }
        }, { passive: true });

        // Press feedback — the pill dips slightly while clicking.
        window.addEventListener('pointerdown', function () {
            if (activeZone) {
                pill.classList.add('is-press');
            }
        }, { passive: true });

        window.addEventListener('pointerup', function () {
            pill.classList.remove('is-press');
        }, { passive: true });

        // If the page scrolls the active zone out from under a resting
        // pointer, drop the pill (mirrors antigravity's scroll bounds check).
        window.addEventListener('scroll', function () {
            if (!activeZone) {
                return;
            }
            var r = activeZone.getBoundingClientRect();
            var inside =
                targetX >= r.left && targetX <= r.right &&
                targetY >= r.top && targetY <= r.bottom;
            if (!inside) {
                deactivate();
            }
        }, { passive: true });

        document.documentElement.addEventListener('pointerleave', deactivate, { passive: true });
    }

    // --------------------------------------------------------
    // Pointer field: spotlight + aurora/hero parallax
    // --------------------------------------------------------
    function initPointerField() {
        if (!enablePointerFx) {
            return;
        }

        var spotlight = document.createElement('div');
        spotlight.className = 'cursor-spotlight';
        spotlight.setAttribute('aria-hidden', 'true');
        document.body.appendChild(spotlight);

        var bg = document.querySelector('.dynamic-bg');
        var heroContent = document.querySelector('.hero .hero-content');

        // animate.css keeps its end-state via animation-fill-mode: both,
        // which would permanently override our inline parallax transform.
        // Drop the entrance classes once the intro animation finishes.
        if (heroContent) {
            var clearEntrance = function () {
                heroContent.classList.remove('animate__animated', 'animate__fadeInUp');
                heroContent.removeEventListener('animationend', clearEntrance);
            };
            heroContent.addEventListener('animationend', clearEntrance);
        }

        // Time constants matched to the legacy per-frame lerps at 60 Hz
        // (spotlight 0.14, background 0.05, hero 0.08) so the feel is
        // unchanged there — and finally correct on 120 Hz+ displays.
        var SPOT_TAU = 0.11;
        var BG_TAU = 0.32;
        var HERO_TAU = 0.20;

        var targetX = window.innerWidth / 2;
        var targetY = window.innerHeight / 2;
        var spotX = targetX;
        var spotY = targetY;
        var bgX = 0;
        var bgY = 0;
        var heroX = 0;
        var heroY = 0;
        var engaged = false;

        ticker.add(function (dt) {
            var nx = targetX / window.innerWidth - 0.5;  // -0.5 .. 0.5
            var ny = targetY / window.innerHeight - 0.5;

            spotX = smooth(spotX, targetX, SPOT_TAU, dt);
            spotY = smooth(spotY, targetY, SPOT_TAU, dt);
            spotlight.style.transform =
                'translate3d(' + spotX.toFixed(1) + 'px,' + spotY.toFixed(1) + 'px,0)';

            var bgTargetX = nx * 34;
            var bgTargetY = ny * 34;
            var heroTargetX = nx * -16;
            var heroTargetY = ny * -16;

            if (bg) {
                bgX = smooth(bgX, bgTargetX, BG_TAU, dt);
                bgY = smooth(bgY, bgTargetY, BG_TAU, dt);
                bg.style.transform =
                    'translate3d(' + bgX.toFixed(2) + 'px,' + bgY.toFixed(2) + 'px,0)';
            }

            if (heroContent) {
                heroX = smooth(heroX, heroTargetX, HERO_TAU, dt);
                heroY = smooth(heroY, heroTargetY, HERO_TAU, dt);
                heroContent.style.transform =
                    'translate3d(' + heroX.toFixed(2) + 'px,' + heroY.toFixed(2) + 'px,0)';
            }

            var settled =
                Math.abs(targetX - spotX) < 0.5 &&
                Math.abs(targetY - spotY) < 0.5 &&
                (!bg || (Math.abs(bgTargetX - bgX) < 0.05 && Math.abs(bgTargetY - bgY) < 0.05)) &&
                (!heroContent || (Math.abs(heroTargetX - heroX) < 0.05 && Math.abs(heroTargetY - heroY) < 0.05));

            return !settled;
        });

        window.addEventListener('pointermove', function (e) {
            targetX = e.clientX;
            targetY = e.clientY;
            if (!engaged) {
                engaged = true;
                // Jump the spotlight to the first known position instead of flying in.
                spotX = targetX;
                spotY = targetY;
                document.body.classList.add('spotlight-on');
            }
            ticker.wake();
        }, { passive: true });

        window.addEventListener('pointerdown', function () {
            document.body.classList.add('spotlight-boost');
        }, { passive: true });

        window.addEventListener('pointerup', function () {
            document.body.classList.remove('spotlight-boost');
        }, { passive: true });

        document.documentElement.addEventListener('pointerleave', function () {
            engaged = false;
            document.body.classList.remove('spotlight-on', 'spotlight-boost');
        }, { passive: true });
    }

    // --------------------------------------------------------
    // 3D card tilt with traveling glare
    // --------------------------------------------------------
    function initCardTilt() {
        if (!enablePointerFx) {
            return;
        }

        var MAX_TILT_DEG = 8;

        each(document.querySelectorAll('.products .card'), function (card) {
            card.addEventListener('pointermove', function (e) {
                var rect = card.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return;
                }
                var px = (e.clientX - rect.left) / rect.width;   // 0 .. 1
                var py = (e.clientY - rect.top) / rect.height;   // 0 .. 1

                if (!card.classList.contains('tilt')) {
                    card.classList.add('tilt');
                }
                card.style.setProperty('--tilt-y', ((px - 0.5) * 2 * MAX_TILT_DEG).toFixed(2) + 'deg');
                card.style.setProperty('--tilt-x', ((0.5 - py) * 2 * MAX_TILT_DEG).toFixed(2) + 'deg');
                card.style.setProperty('--glare-x', (px * 100).toFixed(1) + '%');
                card.style.setProperty('--glare-y', (py * 100).toFixed(1) + '%');
            }, { passive: true });

            card.addEventListener('pointerleave', function () {
                card.classList.remove('tilt');
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
            }, { passive: true });
        });
    }

    // --------------------------------------------------------
    // Magnetic buttons — pull toward the cursor, spring back
    // --------------------------------------------------------
    function initMagneticButtons() {
        if (!enablePointerFx) {
            return;
        }

        var STRENGTH = 0.35;
        var MAX_OFFSET_PX = 12;

        each(document.querySelectorAll('.btn'), function (btn) {
            btn.addEventListener('pointermove', function (e) {
                var rect = btn.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return;
                }
                var dx = e.clientX - (rect.left + rect.width / 2);
                var dy = e.clientY - (rect.top + rect.height / 2);
                var mx = clamp(dx * STRENGTH, -MAX_OFFSET_PX, MAX_OFFSET_PX);
                var my = clamp(dy * (STRENGTH + 0.1), -MAX_OFFSET_PX, MAX_OFFSET_PX) - 2;

                btn.classList.add('magnetic');
                btn.style.transform =
                    'translate3d(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px,0)';
            }, { passive: true });

            btn.addEventListener('pointerleave', function () {
                // Remove the fast-tracking class first so the base .btn
                // transition (0.3s ease) animates the release.
                btn.classList.remove('magnetic');
                btn.style.transform = '';
            }, { passive: true });
        });
    }

    onReady(function () {
        initReveal();
        initCursorPill();
        initPointerField();
        initCardTilt();
        initMagneticButtons();
    });
})();
