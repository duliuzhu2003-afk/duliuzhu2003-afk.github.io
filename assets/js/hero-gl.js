(() => {
  'use strict';

  // Independent two-image reveal for Zhu Hanlin's own museum presentation.
  // Empty scene + complete original + subject mask; no reference shader or asset is shipped.
  const canvas = document.querySelector('.hero-canvas');
  const visual = document.querySelector('.hero-visual');
  const link = visual?.querySelector('.project-link');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const textureSources = window.PORTFOLIO_HERO_TEXTURES;
  if (!canvas || !visual || !link || !textureSources?.empty
    || !textureSources.full || !textureSources.mask) return;

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const noiseSource = `
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(41.31, 289.17))) * 17389.731);
    }
    float valueNoise(vec2 p) {
      vec2 cell = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(cell);
      float b = hash21(cell + vec2(1.0, 0.0));
      float c = hash21(cell + vec2(0.0, 1.0));
      float d = hash21(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm(vec2 p) {
      return valueNoise(p) * 0.58 + valueNoise(p * 2.37 + 7.1) * 0.28
        + valueNoise(p * 5.71 + 19.4) * 0.14;
    }
  `;

  // A stroke adds density and directional motion to a persistent RGBA field.
  const strokeVariance = 0.0055;
  const strokeSource = `
    precision highp float;
    uniform sampler2D u_field;
    uniform vec2 u_point;
    uniform vec2 u_velocity;
    uniform vec2 u_shape;
    uniform float u_strength;
    varying vec2 v_uv;
    void main() {
      vec2 d = v_uv - u_point;
      d.x *= u_shape.x / u_shape.y;
      float influence = exp(-dot(d, d) / ${strokeVariance.toFixed(4)});
      vec4 previous = texture2D(u_field, v_uv);
      float mixAmount = clamp(influence * min(u_strength, 3.0), 0.0, 1.0);
      vec2 velocity = mix(previous.gb, u_velocity, mixAmount);
      float density = min(previous.r + influence * u_strength, 20.0);
      gl_FragColor = vec4(density, velocity, previous.a);
    }
  `;

  // Semi-Lagrangian transport, neighbour diffusion, irregular drying and a fading history channel.
  const simulationSource = `
    precision highp float;
    uniform sampler2D u_field;
    uniform vec2 u_texel;
    uniform float u_dt;
    uniform float u_time;
    varying vec2 v_uv;
    ${noiseSource}
    void main() {
      vec2 velocity = texture2D(u_field, v_uv).gb;
      vec2 at = v_uv - velocity * u_dt;
      vec4 centre = texture2D(u_field, at);
      float t = u_time * 0.3;
      vec2 wander = vec2(
        fbm(v_uv * 11.0 + t),
        fbm(v_uv * 11.0 + 37.2 - t)
      ) - 0.5;
      wander *= 10.0 * u_texel;
      vec4 left = texture2D(u_field, at - vec2(u_texel.x, 0.0) + wander);
      vec4 right = texture2D(u_field, at + vec2(u_texel.x, 0.0) + wander);
      vec4 down = texture2D(u_field, at - vec2(0.0, u_texel.y) + wander);
      vec4 up = texture2D(u_field, at + vec2(0.0, u_texel.y) + wander);
      float density = mix(centre.r, (left.r + right.r + down.r + up.r) * 0.25, 0.74);
      vec2 transported = mix(centre.gb, (left.gb + right.gb + down.gb + up.gb) * 0.25, 0.37);
      float grain = fbm(v_uv * 15.0 + 5.1 + t * 0.6);
      float localDecay = 0.9 + 0.54 * (grain - 0.5) * 2.0;
      density /= 1.0 + localDecay * u_dt;
      transported /= 1.0 + 3.2 * u_dt;
      float history = max(centre.a - u_dt, 0.0);
      history = max(history, smoothstep(0.3, 0.65, density));
      gl_FragColor = vec4(max(density, 0.0), transported, history);
    }
  `;

  const compositeSource = `
    precision highp float;
    uniform sampler2D u_empty;
    uniform sampler2D u_full;
    uniform sampler2D u_mask;
    uniform sampler2D u_field;
    uniform vec2 u_resolution;
    uniform vec2 u_field_texel;
    uniform float u_time;
    uniform float u_active;
    uniform float u_fade;
    uniform float u_motion;
    uniform float u_static_clear;
    varying vec2 v_uv;
    ${noiseSource}

    vec3 emptyAt(vec2 uv) {
      return texture2D(u_empty, clamp(uv, 0.001, 0.999)).rgb;
    }
    vec3 fullAt(vec2 uv) {
      return texture2D(u_full, clamp(uv, 0.001, 0.999)).rgb;
    }
    float subjectAt(vec2 uv) {
      return texture2D(u_mask, clamp(uv, 0.001, 0.999)).r;
    }

    void main() {
      // Non-interactive and fallback states always show the complete original.
      if (u_static_clear > 0.5) {
        gl_FragColor = vec4(fullAt(v_uv), 1.0);
        return;
      }

      float aspect = u_resolution.x / u_resolution.y;
      vec2 p = vec2(v_uv.x * aspect, v_uv.y);
      float t = u_time * u_motion;
      float subject = subjectAt(v_uv);
      float water = 1.0 - smoothstep(0.25, 0.46, v_uv.y);

      // Quiet caustic threads disturb only the empty water, never a darkened building.
      vec2 q = p * 70.0;
      float ts = t * 3.7;
      vec2 drift = vec2(
        valueNoise(q * 0.3 + ts * 0.05),
        valueNoise(q * 0.3 + 9.1 - ts * 0.04)
      ) * 3.0;
      float n1 = valueNoise(q + drift + vec2(ts * 0.09, 0.0));
      float n2 = valueNoise(q * 1.3 + drift + vec2(7.3, 2.1) - vec2(0.0, ts * 0.08));
      float threads = pow(clamp(1.0 - abs(n1 - n2) * 7.5, 0.0, 1.0), 4.0);
      threads *= 0.6 + 0.4 * valueNoise(q * 0.5 - ts * 0.03);

      vec2 texel = 1.0 / u_resolution;
      float lx = emptyAt(v_uv + vec2(texel.x * 3.0, 0.0)).r
        - emptyAt(v_uv - vec2(texel.x * 3.0, 0.0)).r;
      float ly = emptyAt(v_uv + vec2(0.0, texel.y * 3.0)).g
        - emptyAt(v_uv - vec2(0.0, texel.y * 3.0)).g;
      vec2 slope = vec2(lx, ly);
      vec3 still = emptyAt(v_uv + slope * 0.0015 * water);
      still += (threads * 0.018 + length(slope) * 0.025) * water * (1.0 - still);

      if (u_active < 0.5) {
        gl_FragColor = vec4(still, 1.0);
        return;
      }

      vec4 field = texture2D(u_field, v_uv);
      float w = field.r / 0.395;
      float left = texture2D(u_field, v_uv - vec2(u_field_texel.x * 1.5, 0.0)).r;
      float right = texture2D(u_field, v_uv + vec2(u_field_texel.x * 1.5, 0.0)).r;
      float down = texture2D(u_field, v_uv - vec2(0.0, u_field_texel.y * 1.5)).r;
      float up = texture2D(u_field, v_uv + vec2(0.0, u_field_texel.y * 1.5)).r;
      vec2 gradient = vec2(right - left, up - down) / 0.395;
      float low = mix(0.85, 0.17, u_fade);
      float high = mix(1.15, 1.65, u_fade);
      float irregular = (fbm(p * 36.0 + t * 0.12) - 0.5) * 0.07;
      float fieldOpen = smoothstep(low, high, w + irregular);

      // The subject mask is the only path from the empty plate to the full image.
      // Both building and reflection emerge; sky, trees and titles are not revealed.
      float shape = smoothstep(0.02, 0.24, subject + irregular * 0.45);
      float open = fieldOpen * shape;
      float history = field.a * subject;
      float mist = history * (0.7 + 0.6 * valueNoise(p * 48.0));
      mist += (valueNoise(p * 130.0) - 0.5) * 0.08 * min(history * 4.0, 1.0);
      float fog = pow(smoothstep(0.02, 0.95, mist), 1.6) * (1.0 - fieldOpen);
      fog *= 0.5 + 0.35 * valueNoise(p * 20.6 + vec2(t * 0.04, -t * 0.028))
        + 0.15 * valueNoise(p * 65.5 - t * 0.04);

      vec3 colour = still;
      if (fog > 0.002) {
        vec3 blurred = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float angle = float(i) * 2.39996 + 0.7;
          float distance = 9.0 * sqrt((float(i) + 0.5) / 8.0);
          blurred += emptyAt(v_uv + vec2(cos(angle), sin(angle)) * distance * texel);
        }
        blurred /= 8.0;
        vec3 misted = blurred * 0.94 + vec3(0.025, 0.027, 0.03)
          * (0.9 + 0.2 * hash21(floor(v_uv * u_resolution * 1.5)));
        colour = mix(colour, misted, fog * 0.48);
      }

      vec2 inward = gradient / max(length(gradient), 0.0001);
      float rim = exp(-pow((w - 1.0) / 0.25, 2.0));
      vec2 refractedAt = v_uv + inward * rim * 3.2 * texel;
      vec3 found = fullAt(refractedAt);
      float facing = 0.5 + 0.5 * dot(inward, normalize(vec2(0.6, 0.8)));
      found += (rim * facing * 0.075 + threads * 0.012) * (1.0 - found);
      colour = mix(colour, found, open);
      gl_FragColor = vec4(colour, 1.0);
    }
  `;

  let gl;
  let floatExtension;
  const images = {};
  let emptyTexture;
  let fullTexture;
  let maskTexture;
  let quad;
  let strokeProgram;
  let simulationProgram;
  let compositeProgram;
  let strokeUniforms;
  let simulationUniforms;
  let compositeUniforms;
  let fields = [];
  let fieldWidth = 0;
  let fieldHeight = 0;
  let readIndex = 0;
  let frameId = 0;
  let lastFrame = 0;
  let startTime = 0;
  let timeSeconds = 0;
  let ready = false;
  let inView = true;
  let projectOpen = document.body.classList.contains('has-project');
  let entryStarted = document.documentElement.classList.contains('is-entered');
  let contextLost = false;
  let pendingPointer = null;
  let hoverPoint = null;
  let lastInputPoint = null;
  let lastInputTime = 0;
  let lastStroke = -Infinity;
  let fade = 0;
  let introPrevious = null;
  let introDone = false;
  let strokeCount = 0;
  const strokeTimes = [];
  const activeWindow = Math.log(3 * 5 / 0.395) / 0.9 + 1;

  function status(value) {
    canvas.dataset.webgl = value;
  }

  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function interactive() {
    return hoverQuery.matches && !motionQuery.matches;
  }

  function shouldAnimate() {
    return ready && !contextLost && entryStarted && inView && !projectOpen
      && !document.hidden && interactive();
  }

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed.';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function makeProgram(fragmentSource) {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Program link failed.');
    }
    return program;
  }

  function uniformMap(program, names) {
    return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  }

  function bindTexture(unit, texture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function makeField(width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Half-float fluid target is incomplete.');
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer };
  }

  function allocateFields(width, height) {
    for (const field of fields) {
      gl.deleteTexture(field.texture);
      gl.deleteFramebuffer(field.framebuffer);
    }
    fieldWidth = width;
    fieldHeight = height;
    fields = [makeField(width, height), makeField(width, height)];
    readIndex = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    canvas.dataset.field = `${width}x${height}`;
  }

  function beginPass(program, target, width, height) {
    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, width, height);
  }

  function swapFields() {
    readIndex = 1 - readIndex;
  }

  function addStroke(from, to, dt, strength = 3.0) {
    if (!interactive() || !fields.length) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const aspect = fieldWidth / fieldHeight;
    const distance = Math.hypot(dx * aspect, dy);
    const steps = Math.max(1, Math.ceil(distance / (0.4 * Math.sqrt(strokeVariance))));
    const speed = Math.min(4, Math.hypot(dx, dy) / Math.max(dt, 0.004));
    const scale = Math.hypot(dx, dy) > 0 ? speed / Math.hypot(dx, dy) : 0;
    const vx = dx * scale * 0.8;
    const vy = dy * scale * 0.8;
    for (let i = 0; i < steps; i += 1) {
      const amount = steps === 1 ? 1 : i / (steps - 1);
      const read = fields[readIndex];
      const write = fields[1 - readIndex];
      beginPass(strokeProgram, write.framebuffer, fieldWidth, fieldHeight);
      bindTexture(0, read.texture);
      gl.uniform1i(strokeUniforms.u_field, 0);
      gl.uniform2f(strokeUniforms.u_point, from.x + dx * amount, from.y + dy * amount);
      gl.uniform2f(strokeUniforms.u_velocity, vx, vy);
      gl.uniform2f(strokeUniforms.u_shape, fieldWidth, fieldHeight);
      gl.uniform1f(strokeUniforms.u_strength, strength);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      swapFields();
    }
    lastStroke = timeSeconds;
    strokeCount += 1;
    strokeTimes.push(timeSeconds);
    canvas.dataset.strokes = String(strokeCount);
  }

  function simulate(dt) {
    const read = fields[readIndex];
    const write = fields[1 - readIndex];
    beginPass(simulationProgram, write.framebuffer, fieldWidth, fieldHeight);
    bindTexture(0, read.texture);
    gl.uniform1i(simulationUniforms.u_field, 0);
    gl.uniform2f(simulationUniforms.u_texel, 1 / fieldWidth, 1 / fieldHeight);
    gl.uniform1f(simulationUniforms.u_dt, dt);
    gl.uniform1f(simulationUniforms.u_time, timeSeconds);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    swapFields();
  }

  function processInput() {
    if (pendingPointer) {
      const point = pendingPointer;
      pendingPointer = null;
      const previous = lastInputPoint || point;
      addStroke(previous, point, timeSeconds - lastInputTime);
      lastInputPoint = point;
      lastInputTime = timeSeconds;
      return;
    }
    if (hoverPoint && interactive()) {
      // Holding the pointer still keeps feeding a smaller amount of fluid.
      // The wet area therefore remains alive instead of disappearing under a stationary mouse.
      addStroke(lastInputPoint || hoverPoint, hoverPoint,
        Math.max(1 / 120, timeSeconds - lastInputTime), 0.32);
      lastInputPoint = { ...hoverPoint };
      lastInputTime = timeSeconds;
      return;
    }
    if (introDone || !interactive()) return;
    const localTime = timeSeconds - 2.8;
    if (localTime < 0) return;
    if (localTime >= 1.9) {
      introDone = true;
      introPrevious = null;
      return;
    }
    const progress = localTime / 1.9;
    const smooth = (x) => x * x * (3 - 2 * x);
    const arc = progress < 0.5 ? smooth(progress * 2) : 1 - smooth((progress - 0.5) * 2);
    const point = {
      x: 0.2 + 0.6 * arc,
      y: 0.5 + 0.21 * Math.sin(arc * Math.PI) - (progress < 0.5 ? 0 : 0.05)
    };
    if (introPrevious) addStroke(introPrevious, point, 1 / 30);
    introPrevious = point;
  }

  function render(timestamp = performance.now()) {
    if (!ready || contextLost || gl.isContextLost()) return false;
    if (!startTime) startTime = timestamp;
    const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 1 / 30) : 1 / 60;
    timeSeconds = (timestamp - startTime) / 1000;
    processInput();
    if (!motionQuery.matches && fields.length) simulate(dt);
    const since = timeSeconds - lastStroke;
    const active = interactive() && since < activeWindow;
    const fadeTarget = active ? Math.min(1, Math.max(0, (since - 0.15) / 1.5)) : 1;
    fade += (fadeTarget - fade) * (1 - Math.exp(-dt / (fadeTarget > fade ? 0.25 : 0.1)));

    beginPass(compositeProgram, null, canvas.width, canvas.height);
    bindTexture(0, fields[readIndex].texture);
    bindTexture(1, emptyTexture);
    bindTexture(2, fullTexture);
    bindTexture(3, maskTexture);
    gl.uniform1i(compositeUniforms.u_field, 0);
    gl.uniform1i(compositeUniforms.u_empty, 1);
    gl.uniform1i(compositeUniforms.u_full, 2);
    gl.uniform1i(compositeUniforms.u_mask, 3);
    gl.uniform2f(compositeUniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform2f(compositeUniforms.u_field_texel, 1 / fieldWidth, 1 / fieldHeight);
    gl.uniform1f(compositeUniforms.u_time, timeSeconds);
    gl.uniform1f(compositeUniforms.u_active, active ? 1 : 0);
    gl.uniform1f(compositeUniforms.u_fade, fade);
    gl.uniform1f(compositeUniforms.u_motion, motionQuery.matches ? 0 : 1);
    gl.uniform1f(compositeUniforms.u_static_clear, interactive() ? 0 : 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    while (strokeTimes.length && timeSeconds - strokeTimes[0] > activeWindow) strokeTimes.shift();
    const error = gl.getError();
    canvas.dataset.glError = String(error);
    canvas.dataset.frames = String(Number(canvas.dataset.frames || 0) + 1);
    canvas.dataset.active = active ? '1' : '0';
    canvas.dataset.reveal = active ? Math.max(0, 1 - since / activeWindow).toFixed(3) : '0.000';
    canvas.dataset.veil = active ? (0.62 * (1 - fade)).toFixed(3) : '0.000';
    canvas.dataset.trails = String(interactive() ? strokeTimes.length : 0);
    return error === gl.NO_ERROR;
  }

  function tick(timestamp) {
    frameId = 0;
    if (!shouldAnimate()) return;
    if (timestamp - lastFrame >= 1000 / 30) {
      if (!render(timestamp)) {
        fallback('error');
        return;
      }
      lastFrame = timestamp;
    }
    frameId = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    stop();
    if (shouldAnimate()) frameId = requestAnimationFrame(tick);
  }

  function fallback(reason) {
    stop();
    ready = false;
    visual.classList.remove('is-webgl-ready', 'is-webgl-loading');
    status(reason);
  }

  function makeImageTexture(sourceImage) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, sourceImage);
    return texture;
  }

  function setup() {
    floatExtension = gl.getExtension('EXT_color_buffer_float');
    if (!floatExtension) throw new Error('Floating-point render targets are unavailable.');
    strokeProgram = makeProgram(strokeSource);
    simulationProgram = makeProgram(simulationSource);
    compositeProgram = makeProgram(compositeSource);
    strokeUniforms = uniformMap(strokeProgram, ['u_field', 'u_point', 'u_velocity', 'u_shape', 'u_strength']);
    simulationUniforms = uniformMap(simulationProgram, ['u_field', 'u_texel', 'u_dt', 'u_time']);
    compositeUniforms = uniformMap(compositeProgram, [
      'u_empty', 'u_full', 'u_mask', 'u_field', 'u_resolution', 'u_field_texel', 'u_time',
      'u_active', 'u_fade', 'u_motion', 'u_static_clear'
    ]);

    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    emptyTexture = makeImageTexture(images.empty);
    fullTexture = makeImageTexture(images.full);
    maskTexture = makeImageTexture(images.mask);
    canvas.dataset.simulation = 'webgl2-rgba16f';
    canvas.dataset.textures = 'empty-full-mask';
    canvas.dataset.mode = 'empty-to-building';
    canvas.dataset.textureSizes = ['empty', 'full', 'mask']
      .map((key) => `${images[key].naturalWidth}x${images[key].naturalHeight}`).join(';');
  }

  function resize() {
    if (!gl || contextLost) return;
    const rect = link.getBoundingClientRect();
    const pixelBudget = hoverQuery.matches ? 3600000 : 2400000;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(pixelBudget / Math.max(1, rect.width * rect.height)));
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      if (ready) {
        const aspect = width / height;
        const fieldW = aspect >= 1 ? Math.min(1440, Math.round(512 * aspect)) : 512;
        const fieldH = aspect >= 1 ? 512 : Math.min(1440, Math.round(512 / aspect));
        allocateFields(fieldW, fieldH);
        // Resizing the drawing buffer clears it. Static touch/reduced-motion modes
        // have no animation loop to repair that clear, so redraw immediately.
        if (!render()) fallback('error');
      }
    }
  }

  function activate() {
    const loaded = ['empty', 'full', 'mask'].every((key) =>
      images[key]?.complete && images[key].naturalWidth > 0);
    if (contextLost || !loaded) return;
    try {
      setup();
      resize();
      ready = true;
      const aspect = canvas.width / canvas.height;
      allocateFields(aspect >= 1 ? Math.min(1440, Math.round(512 * aspect)) : 512,
        aspect >= 1 ? 512 : Math.min(1440, Math.round(512 / aspect)));
      pendingPointer = null;
      hoverPoint = null;
      lastInputPoint = null;
      lastStroke = -Infinity;
      strokeTimes.length = 0;
      strokeCount = 0;
      fade = 0;
      introDone = false;
      introPrevious = null;
      startTime = 0;
      lastFrame = 0;
      if (!render()) throw new Error('Initial WebGL draw returned an error.');
      visual.classList.remove('is-webgl-loading');
      visual.classList.add('is-webgl-ready');
      status(interactive() ? 'ready' : 'static');
      syncPlayback();
    } catch (error) {
      fallback('unavailable');
      console.warn(`Hero WebGL fallback: ${error.message}`);
    }
  }

  function queuePoint(x, y) {
    if (!interactive()) return;
    pendingPointer = { x, y };
    introDone = true;
    introPrevious = null;
  }

  function pointerPosition(event) {
    if (event.pointerType === 'touch') return;
    const rect = link.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    hoverPoint = { x, y };
    queuePoint(x, y);
  }

  function deactivate() {
    pendingPointer = null;
    hoverPoint = null;
    lastInputPoint = null;
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    // GPU objects from the lost generation must not be deleted after restoration.
    fields = [];
    emptyTexture = null;
    fullTexture = null;
    maskTexture = null;
    fallback('lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    status('restoring');
    activate();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  window.addEventListener('portfolio:hero-enter', () => {
    entryStarted = true;
    startTime = 0;
    lastFrame = 0;
    syncPlayback();
  });
  window.addEventListener('portfolio:project', (event) => {
    projectOpen = Boolean(event.detail?.open);
    deactivate();
    syncPlayback();
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', syncPlayback);
  motionQuery.addEventListener('change', () => {
    deactivate();
    introDone = true;
    if (motionQuery.matches) {
      stop();
      if (ready) {
        render();
        status('static');
      }
    } else {
      status(ready ? (interactive() ? 'ready' : 'static') : 'unavailable');
      syncPlayback();
    }
  });
  hoverQuery.addEventListener('change', () => {
    deactivate();
    if (ready && !contextLost) render();
    status(ready ? (interactive() ? 'ready' : 'static') : 'unavailable');
    syncPlayback();
  });
  link.addEventListener('pointerenter', pointerPosition, { passive: true });
  link.addEventListener('pointermove', pointerPosition, { passive: true });
  link.addEventListener('pointerleave', deactivate, { passive: true });
  link.addEventListener('pointercancel', deactivate, { passive: true });
  link.addEventListener('focus', () => {
    hoverPoint = { x: 0.5, y: 0.5 };
    queuePoint(0.5, 0.5);
  });
  link.addEventListener('blur', deactivate);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
      syncPlayback();
    }, { rootMargin: '80px' });
    observer.observe(visual);
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(link);
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }

  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
  } catch {
    gl = null;
  }
  if (!gl) {
    status('unavailable');
    return;
  }
  status('loading');
  visual.classList.add('is-webgl-loading');
  let remaining = 3;
  let loadFailed = false;
  for (const key of ['empty', 'full', 'mask']) {
    const sourceImage = new Image();
    images[key] = sourceImage;
    sourceImage.onload = () => {
      remaining -= 1;
      if (remaining === 0 && !loadFailed) activate();
    };
    sourceImage.onerror = () => {
      if (loadFailed) return;
      loadFailed = true;
      fallback('unavailable');
    };
    sourceImage.src = textureSources[key];
  }
})();
