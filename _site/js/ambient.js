/**
 * ambient.js
 * Room-scale light effects, built on window.LogosFx.
 *
 *  - Starfield: twinkling four-point stars with depth parallax,
 *    displaced by the cursor's ring (after antigravity.google's
 *    main particle field) plus our own eddy swirl; stars the candle
 *    passes ignite warm, and fast flicks launch shooting stars.
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
    // Starfield — antigravity-style ring displacement, on stars
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
        var stars = [];
        var shots = [];              // shooting stars born from fast flicks

        // Cool starlight — and the warm gold a star turns when the
        // candle (the cursor) catches it.
        var COLORS = ['255,255,255', '0,199,190', '94,92,230', '255,255,255'];
        var WARM = '255,214,150';

        // Ring interaction, after antigravity.google's main particle
        // field: the cursor is an annulus that displaces the dust
        // inside it; springs pull every star back home afterwards.
        var RING_R = 150;
        var RING_PUSH = 260;
        var RING_SWIRL = 110;        // our twist: a tangential eddy
        var SPRING_K = 26;
        var SPRING_C = 6.5;
        var WAKE = 1.6;              // momentum handed over by a fast cursor
        var PARALLAX = 0.02;         // depth lean away from the pointer
        var FLICK_SPEED = 2600;

        var t = 0;
        var shotCool = 0;

        function makeStar() {
            var z = 0.25 + Math.random() * 0.75;   // depth: 0 far, 1 near
            return {
                hx: Math.random() * W,
                hy: Math.random() * H,
                z: z,
                s: (0.7 + z * 1.9) * (0.7 + Math.random() * 0.6),
                phase: Math.random() * 6.2832,
                tws: 0.6 + Math.random() * 1.4,    // twinkle speed
                rot: Math.random() * 6.2832,
                c: COLORS[(Math.random() * COLORS.length) | 0],
                dx: 0, dy: 0, vx: 0, vy: 0,        // displacement spring
                lit: 0                             // candle ignition 0..1
            };
        }

        function resize() {
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = Math.round(W * DPR);
            canvas.height = Math.round(H * DPR);
            canvas.style.width = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

            var want = clamp(Math.round(W * H / 11000), 50, 160);
            while (stars.length < want) {
                stars.push(makeStar());
            }
            stars.length = want;
        }

        resize();
        window.addEventListener('resize', resize, { passive: true });

        // Four-point sparkle: tips on the axes, waist between them.
        function sparkle(x, y, s, rot, alpha, rgb) {
            var w = s * 0.3;
            ctx.beginPath();
            for (var k = 0; k < 4; k++) {
                var a = rot + k * 1.5708;
                var b = a + 0.7854;
                var tx = x + Math.cos(a) * s;
                var ty = y + Math.sin(a) * s;
                if (k === 0) {
                    ctx.moveTo(tx, ty);
                } else {
                    ctx.lineTo(tx, ty);
                }
                ctx.lineTo(x + Math.cos(b) * w, y + Math.sin(b) * w);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')';
            ctx.fill();
        }

        ticker.add(function (dt) {
            if (document.hidden) {
                return false;
            }
            t += dt;

            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';

            var px = pointer.x;
            var py = pointer.y;
            var pvx = pointer.vx;
            var pvy = pointer.vy;

            // A fast flick launches a shooting star (max two aloft).
            shotCool -= dt;
            if (pointer.speed > FLICK_SPEED && shotCool <= 0 && shots.length < 2) {
                shotCool = 2.5;
                var sl = Math.sqrt(pvx * pvx + pvy * pvy) || 1;
                shots.push({
                    x: px,
                    y: py,
                    vx: (pvx / sl) * (900 + Math.random() * 400),
                    vy: (pvy / sl) * (900 + Math.random() * 400),
                    life: 0.9
                });
            }

            var i, st;
            for (i = 0; i < stars.length; i++) {
                st = stars[i];

                // Depth parallax: near stars lean away from the
                // pointer further than far ones.
                var parx = (px - W / 2) * -PARALLAX * st.z;
                var pary = (py - H / 2) * -PARALLAX * st.z;
                var sx = st.hx + st.dx + parx;
                var sy = st.hy + st.dy + pary;

                // Ring displacement + eddy swirl + cursor wake.
                var rx = sx - px;
                var ry = sy - py;
                var d = Math.sqrt(rx * rx + ry * ry);
                if (d < RING_R && d > 0.001) {
                    var push = 1 - d / RING_R;
                    var f = push * push * RING_PUSH * dt;
                    st.vx += (rx / d) * f;
                    st.vy += (ry / d) * f;
                    var sw = push * RING_SWIRL * dt;
                    st.vx += (-ry / d) * sw;
                    st.vy += (rx / d) * sw;
                    st.vx += pvx * push * WAKE * dt;
                    st.vy += pvy * push * WAKE * dt;
                    // The candle catches what it passes.
                    if (d < RING_R * 0.8) {
                        st.lit = Math.min(1, st.lit + dt * 3);
                    }
                }
                st.lit *= Math.exp(-dt / 2.2);

                // Spring back home, lightly underdamped.
                st.vx += (-SPRING_K * st.dx - SPRING_C * st.vx) * dt;
                st.vy += (-SPRING_K * st.dy - SPRING_C * st.vy) * dt;
                st.dx += st.vx * dt;
                st.dy += st.vy * dt;

                // Twinkle, and the flare while ignited.
                var tw = 0.55 + 0.45 * Math.sin(st.phase + t * st.tws);
                var lit = st.lit;
                var alpha = Math.min(1,
                    (0.28 + 0.5 * tw) * (0.35 + 0.65 * st.z) + lit * 0.55);
                var size = st.s * (0.8 + 0.35 * tw + lit * 1.1);

                if (lit > 0.06) {
                    // Warm halo while the candlelight holds it.
                    var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 6);
                    g.addColorStop(0, 'rgba(' + WARM + ',' + (lit * 0.5).toFixed(3) + ')');
                    g.addColorStop(1, 'rgba(' + WARM + ',0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(sx, sy, size * 6, 0, 6.2832);
                    ctx.fill();
                }

                sparkle(sx, sy, size, st.rot + lit * 0.7, alpha, st.c);
                ctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.9).toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(sx, sy, Math.max(0.4, size * 0.28), 0, 6.2832);
                ctx.fill();
            }

            // Shooting stars: bright head dragging a fading tail.
            for (i = shots.length - 1; i >= 0; i--) {
                var sh = shots[i];
                sh.life -= dt;
                if (sh.life <= 0) {
                    shots.splice(i, 1);
                    continue;
                }
                sh.x += sh.vx * dt;
                sh.y += sh.vy * dt;
                var a2 = Math.min(1, sh.life / 0.9);
                var tx2 = sh.x - sh.vx * 0.14;
                var ty2 = sh.y - sh.vy * 0.14;
                var lg = ctx.createLinearGradient(sh.x, sh.y, tx2, ty2);
                lg.addColorStop(0, 'rgba(255,255,255,' + (a2 * 0.9).toFixed(3) + ')');
                lg.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.strokeStyle = lg;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(sh.x, sh.y);
                ctx.lineTo(tx2, ty2);
                ctx.stroke();
                sparkle(sh.x, sh.y, 3.2, t * 4, a2, '255,255,255');
            }

            ctx.globalCompositeOperation = 'source-over';
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
