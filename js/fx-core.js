/**
 * fx-core.js
 * Shared foundation for every pointer/ambient effect on the site.
 *
 * Exposes window.LogosFx:
 *  - ticker: ONE rAF loop for all effects. Subscribers receive dt
 *    (seconds, capped) and return true while they need more frames;
 *    the loop parks itself when nobody is hungry. wake() restarts it.
 *  - pointer: live cursor position + smoothed velocity (px/s).
 *  - smooth()/clamp()/each()/onReady(): shared math & DOM helpers.
 *  - env: capability flags (finePointer, reduceMotion, enablePointerFx).
 *  - sound: no-op stub; js/sound.js replaces it with the real engine.
 *
 * Loaded first (defer order in _layouts/premium.html). Every other
 * fx module guards on window.LogosFx so a missing core degrades to
 * "no effects" instead of errors.
 */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia('(pointer: fine)').matches;

    // --------------------------------------------------------
    // Shared ticker
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
    // Pointer state (position + smoothed velocity)
    // --------------------------------------------------------
    var pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, speed: 0 };

    (function () {
        var lastX = pointer.x;
        var lastY = pointer.y;
        var lastT = 0;
        var VEL_TAU = 0.08;

        window.addEventListener('pointermove', function (e) {
            var now = performance.now();
            var gap = lastT ? (now - lastT) / 1000 : Infinity;
            var dt = Math.min(gap, 0.1);
            lastT = now;

            // A long gap means the cursor teleported (first move after
            // load, re-entry from another screen, a pause): a jump is
            // not motion, so it must not register as velocity.
            var jump = gap > 0.25;
            var ivx = jump ? 0 : (e.clientX - lastX) / dt;
            var ivy = jump ? 0 : (e.clientY - lastY) / dt;
            lastX = e.clientX;
            lastY = e.clientY;

            pointer.x = e.clientX;
            pointer.y = e.clientY;

            var k = 1 - Math.exp(-dt / VEL_TAU);
            pointer.vx += (ivx - pointer.vx) * k;
            pointer.vy += (ivy - pointer.vy) * k;
            pointer.speed = Math.sqrt(pointer.vx * pointer.vx + pointer.vy * pointer.vy);

            ticker.wake();
        }, { passive: true });

        // Velocity decays to zero once the pointer stops (no further
        // pointermove events arrive), so park-friendly subscribers see
        // the decay: run a short settle loop after each move.
        ticker.add(function (dt) {
            if (pointer.speed < 1) {
                pointer.vx = pointer.vy = pointer.speed = 0;
                return false;
            }
            var k = 1 - Math.exp(-dt / VEL_TAU);
            pointer.vx += (0 - pointer.vx) * k;
            pointer.vy += (0 - pointer.vy) * k;
            pointer.speed = Math.sqrt(pointer.vx * pointer.vx + pointer.vy * pointer.vy);
            return true;
        });
    })();

    // --------------------------------------------------------
    // Helpers
    // --------------------------------------------------------
    function smooth(current, target, tau, dt) {
        return current + (target - current) * (1 - Math.exp(-dt / tau));
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function each(list, fn) {
        Array.prototype.forEach.call(list, fn);
    }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    window.LogosFx = {
        ticker: ticker,
        pointer: pointer,
        smooth: smooth,
        clamp: clamp,
        each: each,
        onReady: onReady,
        env: {
            reduceMotion: reduceMotion,
            finePointer: finePointer,
            enablePointerFx: finePointer && !reduceMotion
        },
        // Replaced by js/sound.js when present.
        sound: { enabled: false, play: function () {} }
    };
})();
