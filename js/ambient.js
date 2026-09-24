/**
 * ambient.js
 * Room-scale light effects, built on window.LogosFx.
 *
 *  - Starfield: twinkling four-point stars with depth parallax,
 *    displaced by the cursor's ring (after antigravity.google's
 *    main particle field) plus our own eddy swirl; stars the candle
 *    passes flare warm, and fast flicks launch shooting stars. Light
 *    is painted the way optics paint a point source — diffraction
 *    spikes and an anamorphic streak around a tiny Airy core, never
 *    a round blob.
 *  - Memory of light ("烛照台" narrative): the page rests under a
 *    soft veil of darkness; the cursor is a candle that burns holes
 *    in it, and every place it has lit STAYS lit — persisted in
 *    localStorage, so returning visitors see where they explored.
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

        // Cool starlight — and the candle gold a star turns when the
        // cursor catches it. Kept as [r,g,b] so ignition can mix.
        var COLORS = [[255, 255, 255], [0, 199, 190], [94, 92, 230], [255, 255, 255]];
        var WARM = [255, 214, 150];

        function mixc(a, b, t) {
            return ((a[0] + (b[0] - a[0]) * t) | 0) + ',' +
                ((a[1] + (b[1] - a[1]) * t) | 0) + ',' +
                ((a[2] + (b[2] - a[2]) * t) | 0);
        }

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
        var fastFor = 0;

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

        // A tapered light spike: brightest at the star, fading to
        // nothing at both ends — how diffraction actually paints a
        // point source. Round halos read as bokeh balls; spikes and
        // streaks read as starlight.
        function spike(x, y, len, wid, ang, alpha, rgb) {
            if (alpha <= 0.004 || len <= 0.5) {
                return;
            }
            var dx = Math.cos(ang) * len;
            var dy = Math.sin(ang) * len;
            var g = ctx.createLinearGradient(x - dx, y - dy, x + dx, y + dy);
            g.addColorStop(0, 'rgba(' + rgb + ',0)');
            g.addColorStop(0.5, 'rgba(' + rgb + ',' + Math.min(1, alpha).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(' + rgb + ',0)');
            ctx.strokeStyle = g;
            ctx.lineWidth = wid;
            ctx.beginPath();
            ctx.moveTo(x - dx, y - dy);
            ctx.lineTo(x + dx, y + dy);
            ctx.stroke();
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
            // The speed must hold for a couple of frames, so a single
            // velocity spike can never fake a flick.
            fastFor = pointer.speed > FLICK_SPEED ? fastFor + dt : 0;
            shotCool -= dt;
            if (fastFor > 0.045 && shotCool <= 0 && shots.length < 2) {
                fastFor = 0;
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

                // Twinkle, with a fast scintillation shimmer on top.
                var tw = 0.55 + 0.45 * Math.sin(st.phase + t * st.tws);
                tw *= 0.86 + 0.14 * Math.sin(t * 7.3 + st.phase * 3.1);
                var lit = st.lit;
                var alpha = Math.min(1,
                    (0.28 + 0.5 * tw) * (0.35 + 0.65 * st.z) + lit * 0.5);
                var size = st.s * (0.8 + 0.35 * tw + lit * 0.8);
                var col = lit > 0.02 ? mixc(st.c, WARM, lit) : st.c.join(',');
                var rot = st.rot + lit * 0.7;

                // Diffraction cross: the candle makes the spikes grow
                // and slide warm — a flare, not a ball.
                var len = size * (2.1 + 1.7 * tw + lit * 3.2);
                spike(sx, sy, len, Math.max(0.7, size * 0.16), rot, alpha * 0.5, col);
                spike(sx, sy, len * 0.8, Math.max(0.7, size * 0.14), rot + 1.5708, alpha * 0.38, col);
                // Anamorphic smear: glass stretches light sideways.
                spike(sx, sy, len * 1.9, size * 0.5, 0, alpha * (0.1 + lit * 0.16), col);

                // Tiny Airy core bloom — the only round part, kept to
                // a few pixels so it reads as heat, not bokeh.
                var cr = size * 1.7;
                var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, cr);
                g.addColorStop(0, 'rgba(255,255,255,' + (alpha * 0.5).toFixed(3) + ')');
                g.addColorStop(0.4, 'rgba(' + col + ',' + (alpha * 0.22).toFixed(3) + ')');
                g.addColorStop(1, 'rgba(' + col + ',0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(sx, sy, cr, 0, 6.2832);
                ctx.fill();

                sparkle(sx, sy, size, rot, alpha, col);
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

    Fx.onReady(function () {
        initParticles();
        initLightMemory();
        // Ambient subscribers are hungry from birth: start the loop
        // even if no pointer event ever arrives (e.g. a kiosk page).
        ticker.wake();
    });
})();
