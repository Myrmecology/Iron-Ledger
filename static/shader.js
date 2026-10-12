/* =====================================================================
   TIME TO GET REAL: shader.js
   Full-screen liquid WebGL background. Raw WebGL, no libraries.

   - Draws into <canvas id="fx-canvas"> (added in layout.html).
   - On success, adds the "fx-webgl" class to <html>, which hides the
     CSS gradient fallback. On any failure it does nothing, so the
     fallback simply stays visible.
   - Pauses when the tab is hidden.
   - Freezes into a still frame in Calm Mode or with reduced motion.
   - Speeds up when Chaos Mode is on.
   - Colors shift smoothly; nothing flashes.

   Remove its <script> line in layout.html to turn it off.
   ===================================================================== */

(function () {
    "use strict";

    const canvas = document.getElementById("fx-canvas");
    if (!canvas) {
        return;
    }

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false })
        || canvas.getContext("experimental-webgl");
    if (!gl) {
        return; // No WebGL: the CSS gradient fallback stays visible
    }

    const root = document.documentElement;

    /* ----- Shaders ----- */
    const vertexSource = `
        attribute vec2 aPosition;
        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `;

    const fragmentSource = `
        precision mediump float;

        uniform vec2 uRes;
        uniform float uTime;
        uniform float uChaos;
        uniform vec2 uMouse;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
                mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
                u.y
            );
        }

        float fbm(vec2 p) {
            float value = 0.0;
            float amp = 0.5;
            mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
            for (int i = 0; i < 5; i++) {
                value += amp * noise(p);
                p = m * p;
                amp *= 0.5;
            }
            return value;
        }

        vec3 palette(float t) {
            return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / uRes.y;
            float t = uTime;

            // Pull the liquid gently toward the mouse
            vec2 toMouse = uMouse - uv;
            float pull = exp(-length(toMouse) * 3.0);
            uv += toMouse * pull * 0.08;

            // Domain warping: noise feeding noise makes the liquid swirl
            vec2 q = vec2(
                fbm(uv * 1.8 + vec2(0.0, t)),
                fbm(uv * 1.8 + vec2(5.2, 1.3) - t)
            );
            vec2 r = vec2(
                fbm(uv * 1.8 + 4.0 * q + vec2(1.7, 9.2) + t * 1.5),
                fbm(uv * 1.8 + 4.0 * q + vec2(8.3, 2.8) - t * 1.2)
            );
            float f = fbm(uv * 1.8 + 4.0 * r);

            // Vibrant colors that slowly cycle through the rainbow
            vec3 color = palette(f * 1.6 + length(q) + t * 0.6);
            color = mix(color, palette(r.x + t * 0.9 + 0.5), 0.45);

            // Glossy streaks running through the paint like water
            float streak = smoothstep(0.52, 0.58, fract(f * 5.0 - t * 1.5));
            color += streak * 0.22;

            // Depth and a soft glow where the mouse is
            color *= 0.65 + 0.6 * f;
            color += pull * 0.15 * (0.6 + 0.4 * uChaos);

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn("Shader compile failed:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) {
        return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn("Shader link failed:", gl.getProgramInfoLog(program));
        return;
    }
    gl.useProgram(program);

    // One big triangle that covers the whole screen
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uChaos = gl.getUniformLocation(program, "uChaos");
    const uMouse = gl.getUniformLocation(program, "uMouse");

    /* ----- Sizing: render at reduced resolution for speed; it's liquid, so softness looks good ----- */
    const RENDER_SCALE = 0.5;

    function resize() {
        const width = Math.max(1, Math.floor(window.innerWidth * RENDER_SCALE));
        const height = Math.max(1, Math.floor(window.innerHeight * RENDER_SCALE));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        }
        gl.uniform2f(uRes, width, height);
    }

    /* ----- Mouse, eased so the liquid follows smoothly ----- */
    const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);
    let mouseTarget = { x: aspect() * 0.5, y: 0.5 };
    let mouse = { x: mouseTarget.x, y: mouseTarget.y };

    window.addEventListener("pointermove", function (event) {
        mouseTarget.x = (event.clientX / Math.max(1, window.innerWidth)) * aspect();
        mouseTarget.y = 1 - event.clientY / Math.max(1, window.innerHeight);
    }, { passive: true });

    /* ----- Modes ----- */
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function isStill() {
        return root.classList.contains("calm-on") || reducedMotion.matches;
    }

    function isChaos() {
        return root.classList.contains("chaos-on");
    }

    /* ----- Animation loop ----- */
    let time = Math.random() * 100; // random start so every visit looks different
    let chaos = 0;
    let lastFrame = 0;
    let frameId = null;

    function draw() {
        mouse.x += (mouseTarget.x - mouse.x) * 0.05;
        mouse.y += (mouseTarget.y - mouse.y) * 0.05;
        gl.uniform1f(uTime, time);
        gl.uniform1f(uChaos, chaos);
        gl.uniform2f(uMouse, mouse.x, mouse.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
        const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
        lastFrame = now;

        chaos += ((isChaos() ? 1 : 0) - chaos) * 0.04;   // ease in and out of Chaos speed
        time += dt * (0.12 + chaos * 0.35);

        draw();
        frameId = requestAnimationFrame(frame);
    }

    function start() {
        if (frameId !== null || document.hidden || isStill()) {
            return;
        }
        lastFrame = 0;
        frameId = requestAnimationFrame(frame);
    }

    function stop() {
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
    }

    function refresh() {
        if (document.hidden || isStill()) {
            stop();
            draw(); // keep a still frame on screen
        } else {
            start();
        }
    }

    /* ----- Wire everything up ----- */
    resize();
    draw();
    root.classList.add("fx-webgl");
    refresh();

    window.addEventListener("resize", function () {
        resize();
        if (frameId === null) {
            draw();
        }
    });

    document.addEventListener("visibilitychange", refresh);

    if (reducedMotion.addEventListener) {
        reducedMotion.addEventListener("change", refresh);
    }

    // React when Calm Mode or Chaos Mode is switched on or off
    new MutationObserver(refresh).observe(root, { attributes: true, attributeFilter: ["class"] });

    // If the graphics card resets, fall back to the CSS gradient
    canvas.addEventListener("webglcontextlost", function (event) {
        event.preventDefault();
        stop();
        root.classList.remove("fx-webgl");
    });
})();