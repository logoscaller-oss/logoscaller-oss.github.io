/**
 * premium-interactions.js
 * Mouse-driven micro-interactions for the LogosCaller premium theme.
 *
 * Effects:
 *  - Cursor spotlight with eased (lerped) follow and click boost
 *  - Pointer parallax on the aurora background and hero content
 *  - 3D tilt + traveling glare on product cards
 *  - Magnetic buttons
 *  - Scroll reveal with per-section stagger
 *
 * Graceful degradation:
 *  - No JS: nothing is added, page renders exactly as before.
 *  - Touch devices: only scroll reveal is enabled.
 *  - prefers-reduced-motion: only scroll reveal (opacity-only) is enabled.
 *
 * All listeners are passive; animation runs in a single rAF loop that
 * parks itself once every eased value settles.
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
    // Pointer field: spotlight + aurora/hero parallax
    // Single eased rAF loop; parks itself when values settle.
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

        var targetX = window.innerWidth / 2;
        var targetY = window.innerHeight / 2;
        var spotX = targetX;
        var spotY = targetY;
        var bgX = 0;
        var bgY = 0;
        var heroX = 0;
        var heroY = 0;
        var engaged = false;
        var rafId = null;

        function schedule() {
            if (rafId === null) {
                rafId = requestAnimationFrame(tick);
            }
        }

        function tick() {
            rafId = null;

            var nx = targetX / window.innerWidth - 0.5;  // -0.5 .. 0.5
            var ny = targetY / window.innerHeight - 0.5;

            spotX += (targetX - spotX) * 0.14;
            spotY += (targetY - spotY) * 0.14;
            spotlight.style.transform =
                'translate3d(' + spotX.toFixed(1) + 'px,' + spotY.toFixed(1) + 'px,0)';

            var bgTargetX = nx * 34;
            var bgTargetY = ny * 34;
            var heroTargetX = nx * -16;
            var heroTargetY = ny * -16;

            if (bg) {
                bgX += (bgTargetX - bgX) * 0.05;
                bgY += (bgTargetY - bgY) * 0.05;
                bg.style.transform =
                    'translate3d(' + bgX.toFixed(2) + 'px,' + bgY.toFixed(2) + 'px,0)';
            }

            if (heroContent) {
                heroX += (heroTargetX - heroX) * 0.08;
                heroY += (heroTargetY - heroY) * 0.08;
                heroContent.style.transform =
                    'translate3d(' + heroX.toFixed(2) + 'px,' + heroY.toFixed(2) + 'px,0)';
            }

            var settled =
                Math.abs(targetX - spotX) < 0.5 &&
                Math.abs(targetY - spotY) < 0.5 &&
                (!bg || (Math.abs(bgTargetX - bgX) < 0.05 && Math.abs(bgTargetY - bgY) < 0.05)) &&
                (!heroContent || (Math.abs(heroTargetX - heroX) < 0.05 && Math.abs(heroTargetY - heroY) < 0.05));

            if (!settled) {
                schedule();
            }
        }

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
            schedule();
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
        initPointerField();
        initCardTilt();
        initMagneticButtons();
    });
})();
