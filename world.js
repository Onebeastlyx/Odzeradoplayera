/* world.js · Od Zera Do Playera
   The night, rendered live in the browser.

   Pass A draws the city. With a photo plate loaded (world.plate + world.use) it
   is a real frame of the night, cover-fitted and zoomed on a focus point, with
   depth of field from the mip chain; two slots dissolve one plate into the
   next. Without a plate (nothing loaded yet, a failed load, no WebGL2) it is
   the procedural city: point lights seen through a lens, three depth planes
   (far windows, street lamps, near orbs) plus their reflection in the wet
   street, with a focus control that turns points into bokeh discs. It renders
   into a half-resolution target with mipmaps (full resolution in plate mode),
   because a defocused city is soft anyway.

   Pass B is the window: rain on the glass (running drops with trails, beading
   droplets that grow and evaporate), fog the drops wipe clean, each drop an
   upside-down lens onto the city, then the grade, vignette and grain.

   The page drives it with world.set({...}); everything is lerped here so the
   page can write targets from scroll without caring about smoothing. */
(function (global) {
  'use strict';

  var VS = [
    '#version 300 es',
    'in vec2 aPos; out vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var COMMON = [
    'vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }',
    'float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }'
  ].join('\n');

  /* ---------------------------------------------------------------- city */
  var FS_CITY = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; out vec4 o;',
    'uniform float uTime, uFocus, uDolly, uTargetOn, uAspect, uStreet, uLights;',
    'uniform vec2 uTarget, uPar;',
    // the photo plates: two slots dissolved by uMix, uPlate fading the whole photo in over the procedural city
    'uniform sampler2D uPlateA, uPlateB;',
    'uniform vec4 uViewA, uViewB;',        // (cx, cy, zoom, plateAspect): focus point in plate uv (y down), zoom >= 1
    'uniform vec2 uResA;',
    'uniform float uMix, uPlate, uGain;',
    COMMON,
    // Cover-fit: the window of the plate seen through this canvas (its aspect A), zoomed about the focus
    // point and nudged by the parallax, never past an edge. uv is canvas 0..1 with y up; the plate is y down.
    'vec2 coverUv(vec2 uv, vec4 v, float A, vec2 par, out vec2 s){',
    '  s = A > v.w ? vec2(1.0, v.w / A) : vec2(A / v.w, 1.0);',   // visible fraction of the plate at zoom 1
    '  s /= max(v.z, 1.0);',
    '  vec2 c = clamp(v.xy + par, s * 0.5, 1.0 - s * 0.5);',
    '  return c + (vec2(uv.x, 1.0 - uv.y) - 0.5) * s;',
    '}',
    // One plate, roughly linear. Depth of field is the mip level above the plate's own texel density.
    'vec3 plateAt(sampler2D t, vec4 v, float dof){',
    '  vec2 s; vec2 puv = coverUv(vUv, v, uAspect, vec2(uPar.x, -uPar.y) * 0.5, s);',
    '  float base = log2(max(1.0, s.x * float(textureSize(t, 0).x) / uResA.x));',
    '  vec3 c = textureLod(t, puv, base + dof).rgb;',
    '  return c * c;',
    '}',
    // sodium, warm white, cool white, tail red, magenta, teal. Weighted toward warm.
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0)); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }',
    'vec3 pal(float k){',
    '  if (k < 0.36) return vec3(1.0, 0.42, 0.10);',
    '  if (k < 0.64) return vec3(1.0, 0.74, 0.46);',
    '  if (k < 0.80) return vec3(0.55, 0.72, 1.0);',
    '  if (k < 0.93) return vec3(1.0, 0.10, 0.07);',
    '  if (k < 0.975) return vec3(1.0, 0.16, 0.42);',
    '  return vec3(0.16, 0.80, 0.86);',
    '}',
    // One depth plane of lights drawn as discs of radius coc (circle of confusion).
    'vec3 plane(vec2 p, float cell, float dens, vec3 band, float seed, float gain, float coc, vec2 an, float tw){',
    '  vec3 acc = vec3(0.0);',
    '  vec2 id0 = floor(p / cell);',
    '  for (int j = -2; j <= 2; j++) {',
    '    for (int i = -2; i <= 2; i++) {',
    '      vec2 id = id0 + vec2(float(i), float(j));',
    '      float e = h21(id + seed);',
    '      vec2 r2 = h22(id + seed * 1.37);',
    '      vec2 c = (id + 0.1 + 0.8 * r2) * cell;',
    '      float bw = smoothstep(band.x - band.z, band.x + band.z, c.y) * (1.0 - smoothstep(band.y - band.z, band.y + band.z, c.y));',
    '      float hz = exp(-max(0.0, c.y - band.x) / band.z / 3.0);',
    '      float cl = smoothstep(0.28, 0.72, vnoise(vec2(c.x * 3.1 + seed, seed * 0.37)));',
    '      float th = dens * bw * mix(1.0, hz, 0.6) * mix(0.25, 1.35, cl);',
    '      float th2 = th * (1.0 + 0.9 * uLights);',
    '      if (e > th2) continue;',
    '      float on = e < th ? 1.0 : clamp((th2 - e) / (0.12 * th2 + 1e-4), 0.0, 1.0);',
    '      float k = h21(id + seed * 2.11);',
    '      vec3 col = pal(k);',
    '      float rr = coc * (0.82 + 0.36 * h21(id + seed * 3.7));',
    '      float d = length((p - c) * an);',
    '      float E = gain * (0.3 + 0.7 * h21(id + seed * 5.3));',
    '      E *= 1.0 + tw * 0.22 * sin(uTime * (0.6 + 2.2 * k) + 6.2831 * e);',
    '      float soft = max(0.0011, rr * 0.14);',
    '      float disc = smoothstep(rr, rr - soft, d);',
    '      float rim = 0.72 + 0.42 * smoothstep(rr * 0.35, rr, d);',
    '      float area = mix(1.0, 0.14, smoothstep(0.004, 0.10, rr));',
    '      float glow = exp(-d * d / (rr * rr * 2.2 + 0.00008)) * 0.07 + exp(-d * d / 0.0007) * 0.06 * uFocus;',
    '      acc += col * E * on * (disc * rim * area + glow);',
    '    }',
    '  }',
    '  return acc;',
    '}',
    'void main(){',
    '  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);',
    '  float y = p.y;',
    '  float yS = uStreet;',
    // night sky to sodium haze at the horizon, a dark wet street below
    '  vec3 col = mix(vec3(0.0018, 0.0026, 0.0055), vec3(0.020, 0.011, 0.007), smoothstep(0.5, yS + 0.05, y));',
    '  col += vec3(0.030, 0.013, 0.005) * exp(-pow((y - yS - 0.10) / 0.15, 2.0));',
    '  col = mix(col, vec3(0.004, 0.0042, 0.0055), smoothstep(yS + 0.03, yS - 0.10, y));',
    '  vec2 T = uTarget;',
    '  vec2 pf = T + (p - T) / (1.0 + uDolly * 0.30) + uPar * 0.22;',
    '  vec2 pm = T + (p - T) / (1.0 + uDolly * 1.05) + uPar * 0.55;',
    '  vec2 pn = T + (p - T) / (1.0 + uDolly * 2.8) + uPar * 1.35;',
    '  float f = uFocus;',
    '  float cocF = mix(0.040, 0.0042, f);',
    '  float cocM = mix(0.080, 0.0075, f);',
    '  float cocN = mix(0.25, 0.17, f);',
    // the far and mid lights and their reflection are the expensive part: skipped once the photo covers them
    '  if (uPlate < 0.999) {',
    '    col += plane(pf, 0.034, 0.34, vec3(yS + 0.07, yS + 0.40, 0.07), 11.0, 0.36, cocF, vec2(1.0), 1.0);',
    '    col += plane(pm, 0.072, 0.30, vec3(yS + 0.02, yS + 0.24, 0.05), 23.0, 0.85, cocM, vec2(1.0), 0.45);',
    '    if (y < yS + 0.04) {',
    '      vec2 pr = pm; pr.y = 2.0 * yS - pr.y;',
    '      pr.x += 0.0016 * sin(pr.y * 38.0 + uTime * 1.3) + 0.0008 * sin(pr.y * 71.0 - uTime * 1.9);',
    '      vec3 refl = plane(pr, 0.072, 0.30, vec3(yS + 0.02, yS + 0.24, 0.05), 23.0, 0.30 * mix(0.35, 1.0, f), cocM * 1.1, vec2(1.0, mix(0.5, 0.16, f)), 0.45);',
    '      col += refl * smoothstep(yS + 0.03, yS - 0.07, y) * smoothstep(-0.8, yS - 0.05, y);',
    '    }',
    '  }',
    // the photo takes the place of the sky, the street and the far lights
    '  if (uPlate > 0.001) {',
    '    float dof = mix(3.0, 0.0, smoothstep(0.15, 0.7, f));',
    '    vec3 ph = plateAt(uPlateA, uViewA, dof);',
    '    if (uMix > 0.001) ph = mix(ph, plateAt(uPlateB, uViewB, dof), uMix);',
    '    col = mix(col, ph * uGain, uPlate);',
    '  }',
    // the near bokeh stays (at half gain over a photo) for depth
    '  col += plane(pn, 0.22, 0.20, vec3(-0.9, 0.9, 0.2), 37.0, 0.09 * mix(1.0, 0.5, uPlate), cocN, vec2(1.0), 0.15);',
    // her: one warm light that comes into focus as you get closer (the photo shows her itself)
    '  if (uTargetOn > 0.001 && uPlate < 0.999) {',
    '    float d = length(p - T);',
    '    float rT = mix(0.030, 0.011, f) * (1.0 + uDolly * 2.4);',
    '    vec3 w = vec3(1.0, 0.60, 0.40);',
    '    float disc = smoothstep(rT, rT * 0.78, d);',
    '    float glow = exp(-d * d / (rT * rT * 12.0));',
    '    col += w * uTargetOn * (disc * 0.85 + glow * 0.55) * (1.0 - uPlate);',
    '  }',
    '  o = vec4(sqrt(clamp(col * 0.5, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');

  /* --------------------------------------------------------------- glass */
  var FS_GLASS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv; out vec4 o;',
    'uniform sampler2D uCity;',
    'uniform vec2 uRes;',
    'uniform float uTime, uRain, uFog, uClear, uWarm, uDrain, uExposure, uDim, uGrain, uAspect, uFrame, uPlate;',
    'uniform vec4 uDrop;',
    COMMON,
    'vec3 city(vec2 uv, float lod){ vec3 s = textureLod(uCity, clamp(uv, 0.001, 0.999), lod).rgb; return s * s * 2.0; }',
    // Running drops with wet trails. x: height, yz: lens vector (center - q), w: how much the trail wiped.
    'vec4 running(vec2 q, float t, float amt){',
    '  float W = 0.062;',
    '  float cx = floor(q.x / W);',
    '  vec2 r = h22(vec2(cx, 7.1));',
    '  float r3 = h21(vec2(cx, 3.3));',
    '  if (r3 > amt) return vec4(0.0);',
    '  float sp = 0.06 + 0.15 * r.x;',
    '  float tt = t * sp + r.y * 7.0;',
    '  float s = tt + 0.16 * sin(tt * 3.1 + r.x * 6.28);',
    '  float yd = 1.18 - fract(s) * 1.45;',
    '  float xb = (cx + 0.5 + 0.34 * (r.y - 0.5)) * W;',
    '  float xPath = xb + 0.010 * sin(q.y * 17.0 + r.x * 6.28) + 0.005 * sin(q.y * 41.0 + r.y * 6.28);',
    '  float rx = W * (0.10 + 0.16 * r.x * r.x);',
    '  vec2 c = vec2(xb + 0.010 * sin(yd * 17.0 + r.x * 6.28) + 0.005 * sin(yd * 41.0 + r.y * 6.28), yd);',
    '  vec2 dv = (q - c) / vec2(rx, rx * 1.28);',
    '  if (dv.y > 0.0) dv.x *= 1.0 + dv.y * 0.55;',
    '  float h = max(0.0, 1.0 - dot(dv, dv));',
    '  vec2 lens = c - q;',
    '  float above = q.y - yd;',
    '  float tl = 0.16 + 0.34 * r.x;',
    '  float ta = clamp(above / tl, 0.0, 1.0);',
    '  float inT = step(0.0, above) * step(above, tl);',
    '  float tw = rx * 0.85 * (1.0 - ta * 0.5);',
    '  float trail = inT * smoothstep(tw, tw * 0.35, abs(q.x - xPath)) * (1.0 - ta);',
    '  float seg = 0.028;',
    '  float si = floor(above / seg);',
    '  vec2 dc = vec2(xb + 0.010 * sin((yd + (si + 0.5) * seg) * 17.0 + r.x * 6.28) + 0.005 * sin((yd + (si + 0.5) * seg) * 41.0 + r.y * 6.28), yd + (si + 0.5) * seg);',
    '  float dr = rx * 0.30 * (1.0 - ta) * step(0.3, h21(vec2(cx, si)));',
    '  if (dr > 0.0005 && inT > 0.5) {',
    '    vec2 d2 = (q - dc) / dr;',
    '    float h2 = max(0.0, 1.0 - dot(d2, d2));',
    '    if (h2 > h) { h = h2; lens = dc - q; }',
    '  }',
    '  return vec4(h, lens, trail);',
    '}',
    // Beading droplets that grow and evaporate on their own clock.
    'vec4 beads(vec2 q, float t, float cell, float dens, float seed){',
    '  vec2 id = floor(q / cell);',
    '  vec2 r = h22(id + seed);',
    '  float e = h21(id + seed * 1.7);',
    '  if (e > dens) return vec4(0.0);',
    '  vec2 c = (id + 0.3 + 0.4 * r) * cell;',
    '  float life = fract(t * 0.035 * (0.5 + r.x) + e * 13.0);',
    '  float g = smoothstep(0.0, 0.10, life) * (1.0 - smoothstep(0.82, 1.0, life));',
    '  float rr = cell * (0.10 + 0.18 * r.y) * g;',
    '  if (rr < 0.0004) return vec4(0.0);',
    '  vec2 dv = (q - c) / rr;',
    '  float h = max(0.0, 1.0 - dot(dv, dv));',
    '  return vec4(h, c - q, rr);',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 q = vec2(uv.x * uAspect, uv.y);',
    '  float t = uTime;',
    '  float amt = uRain * (1.0 - uClear);',
    '  vec4 run = amt > 0.01 ? running(q, t, amt) : vec4(0.0);',
    '  vec4 b1 = beads(q, t, 0.030, 0.80 * amt, 1.0);',
    '  vec4 b2 = beads(q + vec2(0.37, 0.11), t * 1.3, 0.014, 0.65 * amt, 9.0);',
    '  float wipe = run.w;',
    '  float hb1 = b1.x * (1.0 - wipe), hb2 = b2.x * (1.0 - wipe);',
    '  float h = run.x; vec2 lens = run.yz;',
    '  if (hb1 > h) { h = hb1; lens = b1.yz; }',
    '  if (hb2 > h) { h = hb2; lens = b2.yz; }',
    // one big drop, placed by the page (Prawda): a lens onto the city with a wet trail above it
    '  if (uDrop.w > 0.001) {',
    '    vec2 dq = vec2(uDrop.x * uAspect, uDrop.y);',
    '    float rD = uDrop.z;',
    '    vec2 dv = (q - dq) / vec2(rD, rD * 1.22);',
    '    if (dv.y > 0.0) dv.x *= 1.0 + dv.y * 0.45;',
    '    float hD = max(0.0, 1.0 - dot(dv, dv)) * uDrop.w;',
    '    if (hD > h) { h = hD; lens = dq - q; }',
    '    float above = q.y - dq.y;',
    '    float tl = 0.55;',
    '    float xw = abs(q.x - dq.x - 0.004 * sin(q.y * 23.0) - 0.002 * sin(q.y * 61.0));',
    '    float tr = step(0.0, above) * smoothstep(rD * 0.62, rD * 0.22, xw) * (1.0 - clamp(above / tl, 0.0, 1.0));',
    '    wipe = max(wipe, tr * uDrop.w);',
    '    float si = floor(above / 0.035);',
    '    vec2 sc = vec2(dq.x + 0.004 * sin((dq.y + (si + 0.5) * 0.035) * 23.0), dq.y + (si + 0.5) * 0.035);',
    '    float sr = rD * 0.2 * (1.0 - clamp(above / tl, 0.0, 1.0)) * step(0.35, h21(vec2(si, 4.0)));',
    '    if (above > 0.0 && sr > 0.0005) { vec2 d2 = (q - sc) / sr; float h2 = max(0.0, 1.0 - dot(d2, d2)) * uDrop.w; if (h2 > h) { h = h2; lens = sc - q; } }',
    '  }',
    '  float drop = smoothstep(0.0, 0.22, h);',
    '  float fog = clamp(uFog * (1.0 - uClear) * (1.0 - wipe * 0.92), 0.0, 1.0);',
    // three views of the city: through clear glass, through fog, through a drop
    '  vec3 clearV = city(uv, 0.35);',
    '  float lf = 2.6 + fog * 2.0;',
    '  vec2 px = 3.0 / uRes;',
    '  vec2 jit = (h22(uv * uRes + fract(uFrame * 0.37) * 31.0) - 0.5) * px * 7.0;',
    '  vec3 fogV = city(uv + jit, lf) * 0.4 + (city(uv + jit + vec2(px.x * 5.0, px.y * 2.0), lf) + city(uv + jit - vec2(px.x * 5.0, px.y * 2.0), lf) + city(uv + jit + vec2(-px.x * 2.0, px.y * 5.0), lf) + city(uv + jit - vec2(-px.x * 2.0, px.y * 5.0), lf)) * 0.15;',
    '  vec2 luv = uv + vec2(lens.x / uAspect, lens.y) * 4.2 * drop;',
    '  vec3 dropV = city(luv, 0.6);',
    '  vec3 col = mix(clearV, fogV, fog);',
    '  col = mix(col, dropV * (0.9 + 0.25 * h), drop);',
    // drop shading: dark refracting rim, small specular from the room behind you
    '  float rim = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.18, 0.55, h));',
    '  col *= 1.0 - rim * 0.45 * (1.0 - uClear);',
    '  vec2 ld = normalize(vec2(-0.55, 0.75));',
    '  float spec = pow(max(0.0, dot(normalize(-lens + 1e-5), ld)), 6.0) * smoothstep(0.25, 0.9, h);',
    '  col += vec3(0.85, 0.9, 1.0) * spec * 0.10 * (1.0 - uClear);',
    // fogged glass scatters: milky, lifted blacks, a cool cast
    '  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(col, vec3(L) * 1.02 + vec3(0.0016, 0.0022, 0.0034), fog * (1.0 - drop) * 0.30);',
    // grade: zero is cold and drained, player is warm and saturated
    '  L = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  float sat = mix(1.0, 0.22, uDrain) * mix(1.0, 1.18, uWarm);',
    '  col = mix(vec3(L), col, sat) * mix(vec3(0.86, 0.97, 1.14), vec3(1.10, 0.96, 0.82), uWarm);',
    '  col = max(col - 0.0025, 0.0) * uExposure * (1.0 - uDim * 0.55);',
    '  col = col / (1.0 + col * 0.55);',
    '  vec2 vq = (uv - 0.5) * vec2(uAspect * 0.85, 1.0);',
    // the vignette: softer over a photo, which brings its own
    '  float vig = smoothstep(1.08, 0.22, length(vq));',
    '  col *= mix(mix(0.36, 1.0, vig), mix(0.74, 1.0, vig), uPlate);',
    '  col = pow(max(col, 0.0), vec3(1.0 / 2.2));',
    '  col += (h21(uv * uRes + fract(uFrame * 0.618) * 97.0) - 0.5) * uGrain;',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('[world] shader: ' + log);
    }
    return s;
  }
  function program(gl, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('[world] link: ' + gl.getProgramInfoLog(p));
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  var DEFAULTS = {
    rain: 0.6, fog: 0.5, clear: 0, focus: 0.35, warm: 0.35, drain: 0.3, dolly: 0,
    tx: 0.18, ty: -0.02, targetOn: 0, speed: 1, exposure: 0.95, dim: 0,
    parX: 0, parY: 0, grain: 0.035, street: -0.2, lights: 0,
    dropX: 0.72, dropY: 0.8, dropR: 0.05, dropOn: 0,
    // the plates: slot B's share, each slot's view (focus point in plate uv, y down, and zoom), the photo's gain
    plateMix: 0, viewAx: 0.5, viewAy: 0.5, viewAz: 1, viewBx: 0.5, viewBy: 0.5, viewBz: 1, plateGain: 0.9
  };
  var VIEW_KEYS = [['viewAx', 'viewAy', 'viewAz'], ['viewBx', 'viewBy', 'viewBz']];

  function create(canvas, opts) {
    opts = opts || {};
    var gl = null;
    try {
      gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: false, stencil: false,
        premultipliedAlpha: false, powerPreference: 'high-performance',
        preserveDrawingBuffer: !!opts.preserve
      });
    } catch (e) { gl = null; }
    if (!gl) return null;

    var city, glass;
    try { city = program(gl, FS_CITY); glass = program(gl, FS_GLASS); }
    catch (e) { console.warn(e.message); return null; }

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture(), fbo = gl.createFramebuffer();
    var W = 0, H = 0, FW = 0, FH = 0, fullRes = false;

    var cur = {}, tgt = {};
    Object.keys(DEFAULTS).forEach(function (k) { cur[k] = tgt[k] = DEFAULTS[k]; });
    if (opts.state) Object.keys(opts.state).forEach(function (k) { cur[k] = tgt[k] = opts.state[k]; });

    var mobile = opts.mobile != null ? opts.mobile : matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    var scale = opts.scale || (mobile ? 0.62 : 0.8);
    var dprCap = mobile ? 2 : 1.5;

    /* ---- the plates: a cache of at most three on the GPU (about 8 MB each with
       mipmaps), two slots in Pass A, and a ramp of 0.6 s whenever a slot's photo
       becomes ready, so nothing pops. A failed load leaves the procedural city. */
    var plates = {}, plateOn = 0;
    var slots = [{ name: null, on: 0, fresh: false }, { name: null, on: 0, fresh: false }];
    var blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    function inSlot(n) { return slots[0].name === n || slots[1].name === n; }
    function upload(e, img) {
      var loaded = Object.keys(plates).filter(function (n) { return plates[n].tex; });
      while (loaded.length >= 3) {
        var victim = null;
        loaded.forEach(function (n) { if (!inSlot(n) && (!victim || plates[n].used < plates[victim].used)) victim = n; });
        if (!victim) break;
        gl.deleteTexture(plates[victim].tex); plates[victim].tex = null;
        loaded.splice(loaded.indexOf(victim), 1);
      }
      var t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      e.tex = t; e.w = img.naturalWidth; e.h = img.naturalHeight; e.used = frame;
    }
    function load(e) {
      if (e.loading || e.tex || e.failed) return;
      e.loading = true;
      var img = new Image();
      img.decoding = 'async';
      img.src = e.url;
      var done = function () { e.loading = false; if (!gl.isContextLost()) upload(e, img); };
      var fail = function () { e.loading = false; e.failed = true; };
      if (img.decode) img.decode().then(done, fail); else { img.onload = done; img.onerror = fail; }
    }
    // a slot that just changed plates shows the new view at once instead of easing from the old one
    function snapFresh() {
      slots.forEach(function (s, i) { if (s.fresh) { VIEW_KEYS[i].forEach(function (k) { cur[k] = tgt[k]; }); s.fresh = false; } });
    }

    function resize() {
      var dpr = Math.min(global.devicePixelRatio || 1, dprCap);
      var cw = canvas.clientWidth || global.innerWidth, ch = canvas.clientHeight || global.innerHeight;
      var w = Math.max(2, Math.round(cw * dpr * scale)), h = Math.max(2, Math.round(ch * dpr * scale));
      if (w === W && h === H) return;
      W = canvas.width = w; H = canvas.height = h;
      // a photo wants the city target at full resolution, or the sharp states look soft
      var fr = fullRes ? 1 : 0.5;
      FW = Math.max(2, Math.round(W * fr)); FH = Math.max(2, Math.round(H * fr));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    var time = opts.time || 7.0, frame = 0, last = 0, raf = 0, running = false;
    var lerpK = opts.lerp || 0.085;

    function step(dt) {
      var k = 1 - Math.pow(1 - lerpK, dt * 60);
      Object.keys(tgt).forEach(function (key) { cur[key] += (tgt[key] - cur[key]) * k; });
      time += dt * cur.speed;
      frame++;
      // each slot ramps up once its photo is on the GPU; the photo as a whole is on while any slot is ready
      var ready = false, r = dt / 0.6;
      slots.forEach(function (s) {
        var e = s.name && plates[s.name], want = e && e.tex ? 1 : 0;
        if (want) ready = true;
        s.on += Math.max(-r, Math.min(r, want - s.on));
      });
      plateOn += Math.max(-r, Math.min(r, (ready ? 1 : 0) - plateOn));
    }

    function draw() {
      var wantFull = plateOn > 0.001;
      if (wantFull !== fullRes) { fullRes = wantFull; W = H = 0; }
      resize();
      var aspect = W / H;
      // Pass A: the city
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, FW, FH);
      gl.useProgram(city.p);
      var u = city.u;
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uFocus, cur.focus);
      gl.uniform1f(u.uDolly, cur.dolly);
      gl.uniform1f(u.uTargetOn, cur.targetOn);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uStreet, cur.street);
      gl.uniform1f(u.uLights, cur.lights);
      gl.uniform2f(u.uTarget, cur.tx, cur.ty);
      gl.uniform2f(u.uPar, cur.parX, cur.parY);
      // the plates: slot B's share is renormalised to the slots that are actually ready
      var eA = slots[0].name && plates[slots[0].name], eB = slots[1].name && plates[slots[1].name];
      var onA = slots[0].on, onB = slots[1].on, m = cur.plateMix, den = (1 - m) * onA + m * onB;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, eA && eA.tex ? eA.tex : blank);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, eB && eB.tex ? eB.tex : blank);
      gl.uniform1i(u.uPlateA, 1);
      gl.uniform1i(u.uPlateB, 2);
      gl.uniform4f(u.uViewA, cur.viewAx, cur.viewAy, cur.viewAz, eA && eA.tex ? eA.w / eA.h : 1.5);
      gl.uniform4f(u.uViewB, cur.viewBx, cur.viewBy, cur.viewBz, eB && eB.tex ? eB.w / eB.h : 1.5);
      gl.uniform2f(u.uResA, FW, FH);
      gl.uniform1f(u.uMix, den > 1e-4 ? m * onB / den : (onB > onA ? 1 : 0));
      gl.uniform1f(u.uPlate, plateOn);
      gl.uniform1f(u.uGain, cur.plateGain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      // Pass B: the glass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(glass.p);
      u = glass.u;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uCity, 0);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uRain, cur.rain);
      gl.uniform1f(u.uFog, cur.fog);
      gl.uniform1f(u.uClear, cur.clear);
      gl.uniform1f(u.uWarm, cur.warm);
      gl.uniform1f(u.uDrain, cur.drain);
      gl.uniform1f(u.uExposure, cur.exposure);
      gl.uniform1f(u.uDim, cur.dim);
      gl.uniform1f(u.uGrain, cur.grain);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uFrame, frame);
      gl.uniform1f(u.uPlate, plateOn);
      gl.uniform4f(u.uDrop, cur.dropX, cur.dropY, cur.dropR, cur.dropOn);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function loop(now) {
      raf = 0;
      if (!running) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }

    var api = {
      gl: gl,
      canvas: canvas,
      set: function (s) { for (var k in s) if (k in tgt && s[k] === s[k]) tgt[k] = s[k]; snapFresh(); },
      jump: function (s) {
        for (var k in s) if (k in tgt) { tgt[k] = cur[k] = s[k]; }
        snapFresh();
        // no easing at all: a ready photo shows at once
        slots.forEach(function (sl) { var e = sl.name && plates[sl.name]; sl.on = e && e.tex ? 1 : 0; });
        plateOn = slots[0].on || slots[1].on ? 1 : 0;
      },
      get: function () { return cur; },
      // plates: start loading one (idempotent; a failed load is not retried), put two in the slots, ask after them
      plate: function (name, url) {
        var e = plates[name];
        if (!e) e = plates[name] = { url: url, tex: null, w: 1, h: 1, used: 0, loading: false, failed: false };
        load(e);
        return e;
      },
      use: function (a, b) {
        [a, b].forEach(function (n, i) {
          var s = slots[i];
          n = n || null;
          if (n !== s.name) { s.name = n; s.fresh = true; }
          var e = n && plates[n];
          if (e) { e.used = frame; load(e); }   // (an evicted plate comes back from the browser cache)
        });
      },
      plates: function () {
        var o = { on: plateOn, slots: slots.map(function (s) { return { name: s.name, on: +s.on.toFixed(3) }; }), loaded: {} };
        Object.keys(plates).forEach(function (n) { var e = plates[n]; o.loaded[n] = e.tex ? 'ready' : e.failed ? 'failed' : e.loading ? 'loading' : 'evicted'; });
        return o;
      },
      start: function () { if (running) return; running = true; last = 0; raf = requestAnimationFrame(loop); },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
      running: function () { return running; },
      renderOnce: function (dt) { step(dt == null ? 0 : dt); draw(); },
      scale: function () { return scale; },
      setScale: function (v) { scale = v; W = H = 0; },   // the next draw reallocates, so no blank frame shows
      resize: resize
    };
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); api.stop(); if (opts.onLost) opts.onLost(); });
    return api;
  }

  global.NightWorld = { create: create, DEFAULTS: DEFAULTS };
})(window);
