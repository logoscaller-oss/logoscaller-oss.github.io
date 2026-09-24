/**
 * premium-interactions.js
 * Mouse-driven micro-interactions for the LogosCaller premium theme.
 * Built on window.LogosFx (js/fx-core.js): one shared ticker, shared
 * pointer state, shared capability flags.
 *
 * Effects:
 *  - Contextual cursor pill (antigravity.google style) with
 *      · velocity squash & stretch (physics feel)
 *      · ghost trail echoes while moving fast
 *      · dwell-morph into a circular image preview on rich zones
 *      · press feedback, zone-hop label swaps, scroll bounds drop
 *  - Cursor spotlight with eased follow and click boost
 *  - Pointer parallax on the aurora background and hero content
 *  - 3D tilt + traveling glare + edge border-light on product cards
 *  - Magnetic buttons
 *  - Click ripple rings
 *  - Sliding nav indicator (one gliding pill across the links)
 *  - Flashlight inscription (hidden line revealed by the cursor)
 *  - View Transitions circular reveal for same-page anchors
 *  - Scroll reveal with per-section stagger
 *
 * Graceful degradation:
 *  - No JS / missing core: nothing is added, page renders as before.
 *  - Touch devices: only scroll reveal is enabled.
 *  - prefers-reduced-motion: only scroll reveal (opacity-only).
 */
(function () {
    'use strict';

    var Fx = window.LogosFx;
    if (!Fx) {
        return;
    }

    var ticker = Fx.ticker;
    var pointer = Fx.pointer;
    var smooth = Fx.smooth;
    var clamp = Fx.clamp;
    var each = Fx.each;
    var enablePointerFx = Fx.env.enablePointerFx;
    var reduceMotion = Fx.env.reduceMotion;

    // --------------------------------------------------------
    // Scroll reveal (safe for every device / motion preference)
    // --------------------------------------------------------
    function initReveal() {
        if (!('IntersectionObserver' in window)) {
            return;
        }

        var targets = document.querySelectorAll(
            '.products .card, .section-title, .section-prose, .cta-row, .inscription'
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
    // Contextual cursor pill — antigravity.google style, extended.
    //   follow   ≈ gsap.quickTo(duration 0.35, ease power2.out)
    //   pop-in   ≈ back.out(1.7)  (CSS overshoot bezier)
    //   pop-out  ≈ power2.in      (CSS ease-in)
    // Extensions: squash & stretch along the velocity vector,
    // two ghost echoes, and a dwell-morph into an image preview
    // for zones carrying data-cursor-preview.
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
            '<div class="cursor-pill-stretch">' +
            '<div class="cursor-pill-inner">' +
            '<i class="cursor-pill-icon"></i>' +
            '<span class="cursor-pill-label"></span>' +
            '</div>' +
            // Sibling of inner, NOT a child: the morph scales inner
            // away, and the preview disc must survive that.
            '<img class="cursor-pill-preview" alt="">' +
            '</div>';
        document.body.appendChild(pill);

        var stretchEl = pill.querySelector('.cursor-pill-stretch');
        var iconEl = pill.querySelector('.cursor-pill-icon');
        var labelEl = pill.querySelector('.cursor-pill-label');
        var previewEl = pill.querySelector('.cursor-pill-preview');

        // Ghost echoes — blurred comets that lag behind the pill.
        var trails = [0.18, 0.3].map(function (tau, i) {
            var el = document.createElement('div');
            el.className = 'cursor-trail cursor-trail-' + (i + 1);
            el.setAttribute('aria-hidden', 'true');
            document.body.appendChild(el);
            return { el: el, tau: tau, x: 0, y: 0 };
        });

        // Only hide native cursors inside zones once the pill is live.
        document.body.classList.add('cursor-pill-live');

        var FOLLOW_TAU = 0.09;
        var STRETCH_TAU = 0.06;
        var DWELL_MS = 450;

        var targetX = 0;
        var targetY = 0;
        var pillX = 0;
        var pillY = 0;
        var prevX = 0;
        var prevY = 0;
        var stretch = 1;
        var angle = 0;
        var activeZone = null;
        var dwellTimer = null;

        ticker.add(function (dt) {
            var moving = pointer.speed > 1 || activeZone;
            if (!moving && stretch === 1) {
                // Trails also need to settle before parking.
                var trailBusy = false;
                each(trails, function (t) {
                    t.x = smooth(t.x, pointer.x, t.tau, dt);
                    t.y = smooth(t.y, pointer.y, t.tau, dt);
                    t.el.style.transform = 'translate3d(' + t.x.toFixed(1) + 'px,' + t.y.toFixed(1) + 'px,0)';
                    if (Math.abs(pointer.x - t.x) > 1 || Math.abs(pointer.y - t.y) > 1) {
                        trailBusy = true;
                    }
                });
                var fade = parseFloat(trails[0].el.style.opacity || '0');
                if (fade > 0.01) {
                    each(trails, function (t) {
                        t.el.style.opacity = '0';
                    });
                    trailBusy = true;
                }
                return trailBusy;
            }

            // --- pill follow ---
            if (activeZone) {
                pillX = smooth(pillX, targetX, FOLLOW_TAU, dt);
                pillY = smooth(pillY, targetY, FOLLOW_TAU, dt);
                if (Math.abs(targetX - pillX) < 0.1 && Math.abs(targetY - pillY) < 0.1) {
                    pillX = targetX;
                    pillY = targetY;
                }
                pill.style.transform =
                    'translate3d(' + pillX.toFixed(2) + 'px,' + pillY.toFixed(2) + 'px,0)';
            }

            // --- squash & stretch along the pill's own velocity ---
            var vx = (pillX - prevX) / dt;
            var vy = (pillY - prevY) / dt;
            prevX = pillX;
            prevY = pillY;
            var speed = Math.sqrt(vx * vx + vy * vy);
            var wantStretch = 1 + clamp(speed / 6000, 0, 0.16);
            stretch = smooth(stretch, wantStretch, STRETCH_TAU, dt);
            if (speed > 40) {
                angle = Math.atan2(vy, vx);
            }
            var sy = 1 / Math.pow(stretch, 0.85);
            stretchEl.style.transform =
                'rotate(' + angle.toFixed(3) + 'rad) scale(' +
                stretch.toFixed(3) + ',' + sy.toFixed(3) + ')';

            // --- ghost trails: visible while the cursor moves fast ---
            var trailAlpha = clamp((pointer.speed - 250) / 2500, 0, 1);
            each(trails, function (t, i) {
                t.x = smooth(t.x, pointer.x, t.tau, dt);
                t.y = smooth(t.y, pointer.y, t.tau, dt);
                t.el.style.transform = 'translate3d(' + t.x.toFixed(1) + 'px,' + t.y.toFixed(1) + 'px,0)';
                t.el.style.opacity = (trailAlpha * (i === 0 ? 0.35 : 0.18)).toFixed(3);
            });

            var settled =
                (!activeZone || (Math.abs(targetX - pillX) < 0.1 && Math.abs(targetY - pillY) < 0.1)) &&
                Math.abs(stretch - 1) < 0.004 &&
                pointer.speed < 1;
            return !settled;
        });

        function setZoneContent(zone) {
            var icon = zone.getAttribute('data-cursor-icon') || '';
            iconEl.className = 'cursor-pill-icon' + (icon ? ' ' + icon : '');
            iconEl.style.display = icon ? '' : 'none';
            labelEl.textContent = zone.getAttribute('data-cursor-label') || '';
        }

        function cancelDwell() {
            if (dwellTimer) {
                clearTimeout(dwellTimer);
                dwellTimer = null;
            }
            pill.classList.remove('is-preview');
        }

        function startDwell(zone) {
            cancelDwell();
            var src = zone.getAttribute('data-cursor-preview');
            if (!src) {
                return;
            }
            dwellTimer = setTimeout(function () {
                dwellTimer = null;
                if (activeZone === zone) {
                    previewEl.src = src;
                    pill.classList.add('is-preview');
                    Fx.sound.play('morph');
                }
            }, DWELL_MS);
        }

        function deactivate() {
            activeZone = null;
            cancelDwell();
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
                cancelDwell();
                setZoneContent(zone);
                startDwell(zone);
                Fx.sound.play('swap');
                return;
            }
            activeZone = zone;
            setZoneContent(zone);
            // Jump to the pointer instead of flying in from a stale spot.
            targetX = pillX = prevX = e.clientX;
            targetY = pillY = prevY = e.clientY;
            pill.style.transform = 'translate3d(' + pillX + 'px,' + pillY + 'px,0)';
            pill.classList.add('is-active');
            startDwell(zone);
            Fx.sound.play('pop');
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
            Fx.sound.play('popout');
        });

        window.addEventListener('pointermove', function (e) {
            targetX = e.clientX;
            targetY = e.clientY;
            ticker.wake();
        }, { passive: true });

        // Press feedback — the pill dips slightly while clicking.
        window.addEventListener('pointerdown', function () {
            if (activeZone) {
                pill.classList.add('is-press');
                Fx.sound.play('press');
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
        // unchanged there — and correct on 120 Hz+ displays.
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
    // 3D card tilt with traveling glare (border-light is pure CSS,
    // driven by the same --glare-x/--glare-y variables)
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

    // --------------------------------------------------------
    // Click ripple — a brand-colored ring blooms from every click
    // --------------------------------------------------------
    function initRipple() {
        if (!enablePointerFx) {
            return;
        }

        var live = 0;

        window.addEventListener('pointerdown', function (e) {
            if (live > 6) {
                return;
            }
            var ring = document.createElement('div');
            ring.className = 'fx-ripple';
            ring.style.left = e.clientX + 'px';
            ring.style.top = e.clientY + 'px';
            ring.setAttribute('aria-hidden', 'true');
            document.body.appendChild(ring);
            live++;
            ring.addEventListener('animationend', function () {
                ring.remove();
                live--;
            });
        }, { passive: true });
    }

    // --------------------------------------------------------
    // Sliding nav indicator — one glow pill glides between links
    // --------------------------------------------------------
    function initNavGlide() {
        if (!enablePointerFx) {
            return;
        }

        var list = document.querySelector('header nav ul');
        if (!list) {
            return;
        }

        var glide = document.createElement('span');
        glide.className = 'nav-glide';
        glide.setAttribute('aria-hidden', 'true');
        list.appendChild(glide);

        function moveTo(link) {
            var lr = link.getBoundingClientRect();
            var ur = list.getBoundingClientRect();
            glide.style.width = lr.width + 16 + 'px';
            glide.style.transform =
                'translate3d(' + (lr.left - ur.left - 8).toFixed(1) + 'px,' +
                (lr.top - ur.top - 6).toFixed(1) + 'px,0)';
        }

        each(list.querySelectorAll('li a'), function (link) {
            link.addEventListener('pointerenter', function () {
                moveTo(link);
                glide.classList.add('is-on');
                Fx.sound.play('glide');
            });
            link.addEventListener('focus', function () {
                moveTo(link);
                glide.classList.add('is-on');
            });
        });

        list.addEventListener('pointerleave', function () {
            glide.classList.remove('is-on');
        });
        list.addEventListener('focusout', function () {
            glide.classList.remove('is-on');
        });

        // Keep the pill glued to its link while it glides in.
        window.addEventListener('resize', function () {
            glide.classList.remove('is-on');
        }, { passive: true });
    }

    // --------------------------------------------------------
    // Flashlight inscription — a hidden line of brand text that
    // only exists where the cursor's light falls.
    // --------------------------------------------------------
    function initInscription() {
        if (!enablePointerFx) {
            return;
        }

        var line = document.querySelector('.inscription');
        if (!line) {
            return;
        }

        line.closest('section').addEventListener('pointermove', function (e) {
            var r = line.getBoundingClientRect();
            line.style.setProperty('--lx', (e.clientX - r.left).toFixed(1) + 'px');
            line.style.setProperty('--ly', (e.clientY - r.top).toFixed(1) + 'px');
        }, { passive: true });

        line.closest('section').addEventListener('pointerleave', function () {
            // Light leaves: the inscription sinks back into darkness.
            line.style.setProperty('--ly', '-160px');
        }, { passive: true });
    }

    // --------------------------------------------------------
    // View Transitions — same-page anchors reveal through a circle
    // expanding from the click point. Falls back to a plain jump.
    // --------------------------------------------------------
    function initViewTransitions() {
        if (!enablePointerFx || !document.startViewTransition) {
            return;
        }

        document.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
                return;
            }
            var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
            if (!link) {
                return;
            }
            var id = link.getAttribute('href');
            var targetEl = id && id.length > 1 ? document.querySelector(id) : null;
            if (!targetEl) {
                return;
            }

            e.preventDefault();
            document.documentElement.style.setProperty('--vt-x', e.clientX + 'px');
            document.documentElement.style.setProperty('--vt-y', e.clientY + 'px');

            document.startViewTransition(function () {
                targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                if (history.pushState) {
                    history.pushState(null, '', id);
                }
            });
            Fx.sound.play('reveal');
        });
    }

    Fx.onReady(function () {
        initReveal();
        initCursorPill();
        initPointerField();
        initCardTilt();
        initMagneticButtons();
        initRipple();
        initNavGlide();
        initInscription();
        initViewTransitions();
    });
})();
