/**
 * sound.js
 * Opt-in micro-audio for the interaction layer. Every sound is
 * synthesized with WebAudio (no assets, no network), and nothing is
 * ever audible until the visitor flips the toggle (persisted in
 * localStorage). The AudioContext is created inside a user gesture,
 * so autoplay policies are satisfied by construction.
 *
 * Replaces the LogosFx.sound stub; modules just call
 * Fx.sound.play('pop') and stay silent-safe when disabled.
 */
(function () {
    'use strict';

    var Fx = window.LogosFx;
    if (!Fx) {
        return;
    }

    var STORE_KEY = 'logos-sound-on';
    var ctx = null;
    var master = null;
    var enabled = false;

    try {
        enabled = localStorage.getItem(STORE_KEY) === '1';
    } catch (err) {
        enabled = false;
    }

    function ensureContext() {
        if (ctx) {
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            return true;
        }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            return false;
        }
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.12;
        master.connect(ctx.destination);
        return true;
    }

    // One enveloped oscillator glide: freq → endFreq over dur seconds.
    function blip(freq, endFreq, dur, type, gain) {
        if (!ctx || ctx.state !== 'running') {
            return;
        }
        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    function chord(freqs, dur, gain) {
        for (var i = 0; i < freqs.length; i++) {
            blip(freqs[i], freqs[i], dur, 'sine', gain);
        }
    }

    var RECIPES = {
        pop:     function () { blip(620, 980, 0.10, 'sine', 0.5); },
        popout:  function () { blip(520, 300, 0.09, 'sine', 0.32); },
        swap:    function () { blip(740, 880, 0.07, 'triangle', 0.28); },
        press:   function () { blip(190, 140, 0.09, 'sine', 0.5); },
        morph:   function () { blip(440, 1320, 0.22, 'sine', 0.32); },
        glide:   function () { blip(880, 920, 0.045, 'sine', 0.16); },
        reveal:  function () { chord([392, 587.33], 0.4, 0.22); },
        toggleOn:  function () { blip(660, 990, 0.12, 'sine', 0.4); },
        toggleOff: function () { blip(660, 440, 0.12, 'sine', 0.4); }
    };

    Fx.sound = {
        get enabled() {
            return enabled;
        },
        play: function (name) {
            if (!enabled || !ctx) {
                return;
            }
            var recipe = RECIPES[name];
            if (recipe) {
                recipe();
            }
        }
    };

    // --------------------------------------------------------
    // Toggle button (fixed, bottom-right). Created by JS, so the
    // control only exists where sound can exist.
    // --------------------------------------------------------
    Fx.onReady(function () {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fx-sound-toggle';
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        btn.setAttribute('aria-label', 'Toggle interface sound');
        btn.title = enabled ? 'Sound on' : 'Sound off';
        document.body.appendChild(btn);

        function paint() {
            btn.innerHTML = enabled
                ? '<i class="fas fa-volume-high"></i>'
                : '<i class="fas fa-volume-xmark"></i>';
            btn.classList.toggle('is-on', enabled);
            btn.title = enabled ? 'Sound on' : 'Sound off';
        }
        paint();

        btn.addEventListener('click', function () {
            enabled = !enabled;
            try {
                localStorage.setItem(STORE_KEY, enabled ? '1' : '0');
            } catch (err) { /* preference just won't persist */ }
            if (enabled) {
                if (ensureContext()) {
                    RECIPES.toggleOn();
                }
            } else if (ctx) {
                // Farewell blip while the context is still alive.
                RECIPES.toggleOff();
            }
            btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            paint();
        });

        // A stored "on" preference still needs one gesture before any
        // AudioContext may start (browser policy). Arm it on first input.
        if (enabled) {
            var arm = function () {
                ensureContext();
                window.removeEventListener('pointerdown', arm);
                window.removeEventListener('keydown', arm);
            };
            window.addEventListener('pointerdown', arm, { passive: true });
            window.addEventListener('keydown', arm);
        }
    });
})();
