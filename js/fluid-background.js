/**
 * fluid-background.js
 * Shader aurora: replaces the DOM aurora blobs with a GPU fbm field
 * that the cursor stirs. Built on window.LogosFx.
 *
 * The pointer's smoothed velocity feeds a gaussian impulse into the
 * domain warp, so fast strokes swirl the aurora around the cursor
 * and it relaxes back when you rest.
 *
 * Cost control: renders at a fraction of CSS resolution (the parent's
 * 80px blur hides the upscale completely), parks with the shared
 * ticker when the tab is hidden, and degrades to the existing DOM
 * blobs whenever WebGL or the compile fails, or on reduced motion.
 */
(function () {
    'use strict';

    var Fx = window.LogosFx;
    if (!Fx || !Fx.env.enablePointerFx) {
        return;
    }

    var VERT = [
        'attribute vec2 a_pos;',
        'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
    ].join('\n');

    var FRAG = [
        'precision mediump float;',
        'uniform vec2 u_res;',
        'uniform float u_time;',
        'uniform vec2 u_pointer;',   // aspect-corrected, y-up
        'uniform vec2 u_impulse;',
        '',
        'float hash(vec2 p) {',
        '    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
        '}',
        'float noise(vec2 p) {',
        '    vec2 i = floor(p);',
        '    vec2 f = fract(p);',
        '    f = f * f * (3.0 - 2.0 * f);',
        '    return mix(',
        '        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
        '        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),',
        '        f.y);',
        '}',
        'float fbm(vec2 p) {',
        '    float v = 0.0;',
        '    float a = 0.5;',
        '    for (int i = 0; i < 4; i++) {',
        '        v += a * noise(p);',
        '        p *= 2.03;',
        '        a *= 0.5;',
        '    }',
        '    return v;',
        '}',
        '',
        'void main() {',
        '    vec2 uv = gl_FragCoord.xy / u_res;',
        '    float aspect = u_res.x / max(u_res.y, 1.0);',
        '    vec2 p = vec2(uv.x * aspect, uv.y);',
        '    vec2 d = p - u_pointer;',
        '    float g = exp(-dot(d, d) * 6.0);',
        '    vec2 warp = u_impulse * g;',
        '',
        '    vec2 q = vec2(',
        '        fbm(p * 1.7 + vec2(0.0, u_time * 0.05) + warp),',
        '        fbm(p * 1.7 + vec2(5.2, 1.3) - u_time * 0.04));',
        '    float f = fbm(p * 2.2 + q * 1.6 + warp * 2.0 +',
        '                vec2(u_time * 0.02, -u_time * 0.03));',
        '',
        '    vec3 col = vec3(0.024, 0.024, 0.031);',
        '    vec3 purple = vec3(0.369, 0.361, 0.902);',
        '    vec3 teal = vec3(0.0, 0.780, 0.745);',
        '    vec3 pink = vec3(1.0, 0.176, 0.333);',
        '',
        '    col = mix(col, purple * 0.55, smoothstep(0.25, 0.85, f) * 0.85);',
        '    col = mix(col, teal * 0.50, smoothstep(0.45, 0.95, q.x * f) * 0.55);',
        '    col = mix(col, pink * 0.35, smoothstep(0.60, 1.00, q.y * q.x) * 0.35);',
        '    col += purple * g * 0.22;',          // halo where the cursor stirs
        '    gl_FragColor = vec4(col, 0.9);',
        '}'
    ].join('\n');

    Fx.onReady(function () {
        var host = document.querySelector('.dynamic-bg');
        if (!host) {
            return;
        }

        var canvas = document.createElement('canvas');
        canvas.className = 'fx-fluid';
        canvas.setAttribute('aria-hidden', 'true');

        var gl = null;
        try {
            gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false }) ||
                 canvas.getContext('experimental-webgl');
        } catch (err) {
            gl = null;
        }
        if (!gl) {
            return; // DOM aurora blobs remain the background
        }

        function compile(type, src) {
            var sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                return null;
            }
            return sh;
        }

        var vs = compile(gl.VERTEX_SHADER, VERT);
        var fs = compile(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) {
            return;
        }
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            return;
        }
        gl.useProgram(prog);

        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        var uRes = gl.getUniformLocation(prog, 'u_res');
        var uTime = gl.getUniformLocation(prog, 'u_time');
        var uPointer = gl.getUniformLocation(prog, 'u_pointer');
        var uImpulse = gl.getUniformLocation(prog, 'u_impulse');

        // Shader is live: retire the DOM blobs.
        host.insertBefore(canvas, host.firstChild);
        document.body.classList.add('fluid-bg-on');

        var SCALE = Fx.env.finePointer ? 0.5 : 0.4;
        var W = 0;
        var H = 0;

        function resize() {
            var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            W = Math.max(2, Math.round(window.innerWidth * dpr * SCALE));
            H = Math.max(2, Math.round(window.innerHeight * dpr * SCALE));
            canvas.width = W;
            canvas.height = H;
            gl.viewport(0, 0, W, H);
        }
        resize();
        window.addEventListener('resize', resize, { passive: true });

        var impX = 0;
        var impY = 0;
        var IMP_TAU = 0.35;
        var t0 = performance.now();

        Fx.ticker.add(function (dt) {
            if (document.hidden) {
                return false;
            }

            // Velocity (px/s, y-down) → small warp impulse, y-up for GL.
            var tx = Fx.clamp(Fx.pointer.vx / 5000, -0.6, 0.6);
            var ty = Fx.clamp(-Fx.pointer.vy / 5000, -0.6, 0.6);
            var k = 1 - Math.exp(-dt / IMP_TAU);
            impX += (tx - impX) * k;
            impY += (ty - impY) * k;

            var aspect = W / Math.max(H, 1);
            var px = (Fx.pointer.x / Math.max(window.innerWidth, 1)) * aspect;
            var py = 1 - Fx.pointer.y / Math.max(window.innerHeight, 1);

            gl.uniform2f(uRes, W, H);
            gl.uniform1f(uTime, (performance.now() - t0) / 1000);
            gl.uniform2f(uPointer, px, py);
            gl.uniform2f(uImpulse, impX, impY);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            return true; // ambient: keeps flowing while visible
        });

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                Fx.ticker.wake();
            }
        });

        // The aurora flows from first paint, not from first mouse move.
        Fx.ticker.wake();
    });
})();
