/**
 * ambient.js
 * Room-scale light effects, built on window.LogosFx.
 *
 *  - Particle constellation: a brand-colored starfield that drifts,
 *    links nearby nodes, and parts around the cursor.
 *  - Memory of light ("烛照台" narrative): the page rests under a
 *    soft veil of darkness; the cursor is a candle that burns holes
 *    in it, and every place it has lit STAYS lit — persisted in
 *    localStorage, so returning visitors see where they explored.
 *  - Companion orb: a small light-spirit that springs behind the
 *    cursor, watches it, and whispers one line about whatever zone
 *    you hover. Lines come from data-orb-line attributes, or from
 *    window.LOGOS_ORACLE_ENDPOINT (?zone=…) when a backend bridge
 *    (e.g. a SparkPool MCP gateway) is configured — the static site
 *    ships with local lines and treats the endpoint as an optional
 *    progressive enhancement.
 *
 * Degradation: touch / reduced-motion / no-JS get none of this; the
 * veil in particular never exists without JS, so content is never
 * dimmed for anyone who can't lift it.
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
    var enablePointerFx = Fx.env.enablePointerFx;

    // ========================================================
    // Particle constellation
    // ========================================================
    function initParticles() {
        if (!enablePointerFx) {
            return;
        }

        var canvas = document.createElement('canvas');
        canvas.className = 'fx-particles';
        canvas.setAttribute('aria-hidden', 'true');
        var bg = document.querySelector('.dynamic-bg');
        if (bg && bg.parentNode) {
            bg.parentNode.insertBefore(canvas, bg.nextSibling);
        } else {
            document.body.insertBefore(canvas, document.body.firstChild);
        }

        var ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        var W = 0;
        var H = 0;
        var nodes = [];

        var COLORS = ['94,92,230', '0,199,190', '255,255,255'];
        var LINK_DIST = 110;
        var CURSOR_DIST = 160;
        var REPEL_DIST = 140;

        function resize() {
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = Math.round(W * DPR);
            canvas.height = Math.round(H * DPR);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

            var want = clamp(Math.round(W * H / 16000), 40, 130);
            while (nodes.length < want) {
                nodes.push({
                    x: Math.random() * W,
                    y: Math.random() * H,
                    vx: (Math.random() - 0.5) * 24,
                    vy: (Math.random() - 0.5) * 24,
                    r: 1 + Math.random() * 1.4,
                    c: COLORS[(Math.random() * COLORS.length) | 0]
                });
            }
            nodes.length = want;
        }

        resize();
        window.addEventListener('resize', resize, { passive: true });

        ticker.add(function (dt) {
            if (document.hidden) {
                return false;
            }

            ctx.clearRect(0, 0, W, H);

            var i, j, n, m;
            for (i = 0; i < nodes.length; i++) {
                n = nodes[i];

                // Cursor repulsion — the light pushes the dust aside.
                var dx = n.x - pointer.x;
                var dy = n.y - pointer.y;
                var d = Math.sqrt(dx * dx + dy * dy);
                if (d < REPEL_DIST && d > 0.001) {
                    var f = (1 - d / REPEL_DIST) * 260 * dt;
                    n.vx += (dx / d) * f;
                    n.vy += (dy / d) * f;
                }

                // Gentle drag back to drift speed.
                n.vx = smooth(n.vx, clamp(n.vx, -34, 34), 0.5, dt);
                n.vy = smooth(n.vy, clamp(n.vy, -34, 34), 0.5, dt);

                n.x += n.vx * dt;
                n.y += n.vy * dt;
                if (n.x < -10) { n.x = W + 10; } else if (n.x > W + 10) { n.x = -10; }
                if (n.y < -10) { n.y = H + 10; } else if (n.y > H + 10) { n.y = -10; }
            }

            // Node-to-node links.
            ctx.lineWidth = 1;
            for (i = 0; i < nodes.length; i++) {
                n = nodes[i];
                for (j = i + 1; j < nodes.length; j++) {
                    m = nodes[j];
                    var lx = n.x - m.x;
                    var ly = n.y - m.y;
                    var ld = Math.sqrt(lx * lx + ly * ly);
                    if (ld < LINK_DIST) {
                        ctx.strokeStyle = 'rgba(' + n.c + ',' + ((1 - ld / LINK_DIST) * 0.22).toFixed(3) + ')';
                        ctx.beginPath();
                        ctx.moveTo(n.x, n.y);
                        ctx.lineTo(m.x, m.y);
                        ctx.stroke();
                    }
                }

                // Brighter filaments toward the cursor.
                var cx = n.x - pointer.x;
                var cy = n.y - pointer.y;
                var cd = Math.sqrt(cx * cx + cy * cy);
                if (cd < CURSOR_DIST) {
                    ctx.strokeStyle = 'rgba(0,199,190,' + ((1 - cd / CURSOR_DIST) * 0.35).toFixed(3) + ')';
                    ctx.beginPath();
                    ctx.moveTo(n.x, n.y);
                    ctx.lineTo(pointer.x, pointer.y);
                    ctx.stroke();
                }
            }

            for (i = 0; i < nodes.length; i++) {
                n = nodes[i];
                ctx.fillStyle = 'rgba(' + n.c + ',0.75)';
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.r, 0, 6.2832);
                ctx.fill();
            }

            return true; // ambient: keep breathing while visible
        });

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                ticker.wake();
            }
        });
    }

    // ========================================================
    // Memory of light — the candle veil
    // ========================================================
    function initLightMemory() {
        if (!enablePointerFx) {
            return;
        }

        var SCALE = 8;                       // veil canvas is 1/8 of the document
        var VEIL_ALPHA = 0.32;
        var STORE_KEY = 'logos-light-mask-v1';
        var doc = document.documentElement;

        var canvas = document.createElement('canvas');
        canvas.className = 'fx-veil';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        var cw = 0;
        var ch = 0;
        var dirty = false;
        var lastSave = 0;

        function paintBase(target) {
            target.globalCompositeOperation = 'source-over';
            target.clearRect(0, 0, cw, ch);
            target.fillStyle = 'rgba(4,4,9,' + VEIL_ALPHA + ')';
            target.fillRect(0, 0, cw, ch);
        }

        // Burn a soft hole in the veil at DOCUMENT coordinates.
        function light(px, py, radius) {
            var x = px / SCALE;
            var y = py / SCALE;
            var r = radius / SCALE;
            ctx.globalCompositeOperation = 'destination-out';
            var g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, 'rgba(0,0,0,0.9)');
            g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 6.2832);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            dirty = true;
        }

        function sizeToDocument() {
            var h = Math.max(doc.scrollHeight, window.innerHeight);
            var w = doc.clientWidth || window.innerWidth;
            cw = Math.max(2, Math.ceil(w / SCALE));
            ch = Math.max(2, Math.ceil(h / SCALE));
            canvas.width = cw;
            canvas.height = ch;
            canvas.style.height = h + 'px';
        }

        function save() {
            if (!dirty) {
                return;
            }
            dirty = false;
            lastSave = Date.now();
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify({
                    w: cw, h: ch, png: canvas.toDataURL('image/png')
                }));
            } catch (err) {
                /* storage full / private mode: the light simply isn't remembered */
            }
        }

        function restore() {
            var raw = null;
            try {
                raw = localStorage.getItem(STORE_KEY);
            } catch (err) {
                return false;
            }
            if (!raw) {
                return false;
            }
            try {
                var data = JSON.parse(raw);
                var img = new Image();
                img.onload = function () {
                    // Remembered light, stretched over today's document.
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.clearRect(0, 0, cw, ch);
                    ctx.drawImage(img, 0, 0, cw, ch);
                };
                img.src = data.png;
                return true;
            } catch (err) {
                return false;
            }
        }

        sizeToDocument();
        paintBase(ctx);
        var hadMemory = restore();

        // First impression: the room you arrive in is already lit —
        // header and hero start uncovered.
        if (!hadMemory) {
            light(window.innerWidth / 2, 80, 420);
            light(window.innerWidth / 2, window.innerHeight * 0.45, 520);
        }

        // The candle follows the pointer (document coordinates).
        var queued = false;
        var qx = 0;
        var qy = 0;
        window.addEventListener('pointermove', function (e) {
            qx = e.clientX + window.scrollX;
            qy = e.clientY + window.scrollY;
            if (!queued) {
                queued = true;
                requestAnimationFrame(function () {
                    queued = false;
                    light(qx, qy, 300);
                });
            }
        }, { passive: true });

        // Scrolling reveals new country: light a soft band as it enters.
        window.addEventListener('scroll', function () {
            light(window.innerWidth / 2 + window.scrollX, window.scrollY + window.innerHeight * 0.6, 260);
        }, { passive: true });

        // Rebuild (preserving remembered light) when the document grows.
        var resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                var old = document.createElement('canvas');
                old.width = cw;
                old.height = ch;
                old.getContext('2d').drawImage(canvas, 0, 0);
                sizeToDocument();
                paintBase(ctx);
                ctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, cw, ch);
            }, 250);
        }, { passive: true });

        // Remember the light: throttled while exploring, guaranteed on exit.
        setInterval(function () {
            if (dirty && Date.now() - lastSave > 4000) {
                save();
            }
        }, 4000);
        window.addEventListener('pagehide', save);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                save();
            }
        });
    }

    // ========================================================
    // Companion orb — the light-spirit
    // ========================================================
    function initOrb() {
        if (!enablePointerFx) {
            return;
        }

        var ZONE = '[data-orb-line]';

        var orb = document.createElement('div');
        orb.className = 'fx-orb';
        orb.setAttribute('aria-hidden', 'true');
        orb.innerHTML =
            '<div class="fx-orb-halo"></div>' +
            '<div class="fx-orb-core"><span class="fx-orb-pupil"></span></div>' +
            '<div class="fx-orb-say"></div>';
        document.body.appendChild(orb);

        var pupil = orb.querySelector('.fx-orb-pupil');
        var say = orb.querySelector('.fx-orb-say');

        var x = pointer.x - 90;
        var y = pointer.y + 60;
        var bobT = Math.random() * 10;
        var shy = 0;              // 0 = curious, 1 = backs off while the pill works
        var typeTimer = null;

        function speak(text) {
            clearInterval(typeTimer);
            say.textContent = '';
            say.classList.add('is-on');
            var i = 0;
            typeTimer = setInterval(function () {
                i++;
                say.textContent = text.slice(0, i);
                if (i >= text.length) {
                    clearInterval(typeTimer);
                }
            }, 26);
        }

        function hush() {
            clearInterval(typeTimer);
            say.classList.remove('is-on');
        }

        // Optional backend bridge (e.g. a SparkPool MCP gateway):
        // window.LOGOS_ORACLE_ENDPOINT = 'https://…/oracle'
        // GET ?zone=<id-or-label> → { "line": "…" } with local fallback.
        function lineFor(zone) {
            var local = zone.getAttribute('data-orb-line') || '';
            var endpoint = window.LOGOS_ORACLE_ENDPOINT;
            if (!endpoint) {
                return Promise.resolve(local);
            }
            var key = zone.id || zone.getAttribute('data-cursor-label') || '';
            var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
            var timeout = setTimeout(function () {
                if (ctrl) { ctrl.abort(); }
            }, 1500);
            return fetch(endpoint + '?zone=' + encodeURIComponent(key), { signal: ctrl && ctrl.signal })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (j) { return (j && j.line) || local; })
                .catch(function () { return local; })
                .then(function (line) { clearTimeout(timeout); return line; });
        }

        var curZone = null;

        document.addEventListener('pointerover', function (e) {
            var zone = e.target && e.target.closest ? e.target.closest(ZONE) : null;
            // Crossing children inside one zone must not restart the line.
            if (!zone || zone === curZone) {
                return;
            }
            curZone = zone;
            shy = 1;
            lineFor(zone).then(function (line) {
                if (line && curZone === zone) { speak(line); }
            });
        });

        document.addEventListener('pointerout', function (e) {
            // Only react when actually leaving a zone — pointerout fires
            // for every element boundary the cursor crosses.
            var from = e.target && e.target.closest ? e.target.closest(ZONE) : null;
            if (!from) {
                return;
            }
            var to = e.relatedTarget;
            if (to && to.closest && to.closest(ZONE)) {
                return;
            }
            curZone = null;
            shy = 0;
            hush();
        });

        // One greeting per session, teaching the light metaphor.
        var greeted = false;
        try {
            greeted = sessionStorage.getItem('logos-orb-greeted') === '1';
        } catch (err) { /* ignore */ }
        if (!greeted) {
            setTimeout(function () {
                speak('嗨，我是光灵 ✦ 移动光标，点亮这个房间。');
                setTimeout(hush, 5200);
                try {
                    sessionStorage.setItem('logos-orb-greeted', '1');
                } catch (err) { /* ignore */ }
            }, 1400);
        }

        var ORB_TAU = 0.42;

        ticker.add(function (dt) {
            if (document.hidden) {
                return false;
            }
            bobT += dt;

            // Shy offset: while the pill is working a zone, the orb
            // hangs back so the two never fight for attention.
            var shyTarget = shy ? 1 : 0;
            var shyNow = smooth(parseFloat(orb.dataset.shy || '0'), shyTarget, 0.25, dt);
            orb.dataset.shy = shyNow.toFixed(3);

            var offX = -70 - shyNow * 40;
            var offY = 55 + shyNow * 30;

            x = smooth(x, pointer.x + offX, ORB_TAU, dt);
            y = smooth(y, pointer.y + offY, ORB_TAU, dt);

            var bob = Math.sin(bobT * 1.6) * 6;
            orb.style.transform =
                'translate3d(' + x.toFixed(1) + 'px,' + (y + bob).toFixed(1) + 'px,0)';
            orb.style.opacity = (0.95 - shyNow * 0.55).toFixed(2);

            // The spirit watches your cursor.
            var dx = clamp((pointer.x - x) / 60, -1, 1);
            var dy = clamp((pointer.y - y) / 60, -1, 1);
            pupil.style.transform =
                'translate3d(' + (dx * 3).toFixed(1) + 'px,' + (dy * 3).toFixed(1) + 'px,0)';

            return true; // ambient personality: stays alive while visible
        });

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                ticker.wake();
            }
        });
    }

    Fx.onReady(function () {
        initParticles();
        initLightMemory();
        initOrb();
        // Ambient subscribers are hungry from birth: start the loop
        // even if no pointer event ever arrives (e.g. a kiosk page).
        ticker.wake();
    });
})();
