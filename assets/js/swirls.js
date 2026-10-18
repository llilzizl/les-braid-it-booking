/* ==========================================================
   Les Braid It: glowing swirl that draws itself on scroll
   ----------------------------------------------------------
   Artwork: Lilian's S flourish, designed in Canva at 1080 x 2340.
   assets/images/swirls/s-swirl-map.png packs three layers:
     red   = when each part of the line is drawn (0 = first, 1 = last)
     green = the line itself
     blue  = the soft glow around the line
   A WebGL shader reveals the line in that order and colours it pink.
   A second canvas adds twinkling sparkles on the drawn parts and a
   sparkle trail at the tip of the line while it is drawing.

   Phones: one S fills the screen behind the content.
   Wider screens: the S on the right, and a mirrored copy on the left
   that draws from bottom to top.
   Reduced motion: the swirl is shown fully drawn, with no sparkles.
   ========================================================== */
(function () {
  'use strict';

  var MAP_URL = 'assets/images/swirls/s-swirl-map.png';
  var STATIC_URL = 'assets/images/swirls/s-swirl-static.webp';
  var ART_W = 1080;
  var ART_H = 2340;
  var PHONE_MAX = 720;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Layers ---------- */
  var glCanvas = document.createElement('canvas');
  var fxCanvas = document.createElement('canvas');
  glCanvas.className = 'swirl-layer';
  fxCanvas.className = 'swirl-layer swirl-sparkles';
  [glCanvas, fxCanvas].forEach(function (c) {
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
  });

  /* ---------- Layout: where each S sits on screen ---------- */
  var vw = 0, vh = 0, isPhone = false, rails = [];

  function layout() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    // Phone toolbars change the height while scrolling; ignore small changes
    if (w === vw && Math.abs(h - vh) < 120) return false;
    vw = w; vh = h;
    isPhone = vw <= PHONE_MAX;
    rails = [];
    if (isPhone) {
      var s = Math.max(vw / ART_W, vh / ART_H);
      var rw = ART_W * s, rh = ART_H * s;
      rails.push({ x: (vw - rw) / 2, y: (vh - rh) / 2, w: rw, h: rh, flip: false, reverse: false });
    } else {
      var hh = vh, ww = hh * ART_W / ART_H;
      rails.push({ x: vw - ww, y: 0, w: ww, h: hh, flip: false, reverse: false });
      rails.push({ x: 0, y: 0, w: ww, h: hh, flip: true, reverse: true });
    }
    return true;
  }

  /* ---------- Fallback: static glowing picture ---------- */
  function showStatic() {
    glCanvas.remove();
    fxCanvas.remove();
    var holders = [];
    function place() {
      layout();
      holders.forEach(function (el) { el.remove(); });
      holders = rails.map(function (r) {
        var el = document.createElement('div');
        el.className = 'swirl-static';
        el.setAttribute('aria-hidden', 'true');
        el.style.backgroundImage = 'url("' + STATIC_URL + '")';
        el.style.left = r.x + 'px';
        el.style.top = r.y + 'px';
        el.style.width = r.w + 'px';
        el.style.height = r.h + 'px';
        if (r.flip) el.style.transform = 'scaleX(-1)';
        document.body.appendChild(el);
        return el;
      });
    }
    vw = 0;
    place();
    window.addEventListener('resize', function () { vw = 0; place(); });
  }

  /* ---------- WebGL swirl ---------- */
  var gl = glCanvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) { showStatic(); return; }

  var VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes;',
    'uniform vec4 uRect0; uniform vec4 uRect1;',
    'uniform vec2 uMode0; uniform vec2 uMode1;',   // x = mirror, y = draw in reverse
    'uniform float uP0; uniform float uP1;',
    'uniform float uCount;',
    'const vec3 PINK = vec3(0.91, 0.333, 0.561);',  // #E8558F
    'const vec3 LIGHT = vec3(1.0, 0.82, 0.9);',
    'vec4 rail(vec2 frag, vec4 r, vec2 mode, float p) {',
    '  vec2 uv = (frag - r.xy) / r.zw;',
    '  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);',
    '  if (mode.x > 0.5) uv.x = 1.0 - uv.x;',
    '  vec3 m = texture2D(uTex, uv).rgb;',
    '  float t = m.r;',
    '  if (mode.y > 0.5) t = 1.0 - t;',
    '  float w = 0.012;',
    '  float shown = clamp((p - t) / w, 0.0, 1.0);',
    '  float glowShown = clamp((p - t) / (3.0 * w) + 0.35, 0.0, 1.0) * step(t, p + w);',
    '  float tip = (1.0 - smoothstep(0.0, 2.5 * w, abs(p - t - 0.5 * w))) * step(t, p + w);',
    '  float line = m.g * shown;',
    '  float glow = m.b * glowShown;',
    '  vec3 c = PINK * glow * 1.15 + mix(PINK, LIGHT, 0.45) * line',
    '         + LIGHT * tip * (m.g * 1.3 + m.b * 0.9);',
    '  float a = clamp(max(line, glow * 0.9) + tip * (m.g + m.b) * 0.6, 0.0, 1.0);',
    '  vec3 col = clamp(c / max(a, 0.0001), 0.0, 1.0);',   // keep colour valid for the alpha
    '  return vec4(col * a, a);',
    '}',
    'void main() {',
    '  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);',
    '  vec4 c = rail(frag, uRect0, uMode0, uP0);',
    '  if (uCount > 1.5) { vec4 d = rail(frag, uRect1, uMode1, uP1); c = c + d * (1.0 - c.a); }',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  }
  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  var prog = gl.createProgram();
  if (!vs || !fs) { showStatic(); return; }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { showStatic(); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['uTex', 'uRes', 'uRect0', 'uRect1', 'uMode0', 'uMode1', 'uP0', 'uP1', 'uCount'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  /* ---------- Load the map ---------- */
  var mapImg = new Image();
  var points = [];          // sampled points on the line, for sparkles: [u, v, t]
  var buckets = [];         // points grouped by draw time, for the sparkle trail
  var BUCKETS = 120;

  mapImg.onload = function () {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, mapImg);
    } catch (e) { showStatic(); return; }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U.uTex, 0);
    if (!reduceMotion) samplePoints();
    start();
  };
  mapImg.onerror = showStatic;
  mapImg.src = MAP_URL;

  function samplePoints() {
    var sw = 270, sh = 585;
    var c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    var ctx = c.getContext('2d');
    ctx.drawImage(mapImg, 0, 0, sw, sh);
    var data;
    try { data = ctx.getImageData(0, 0, sw, sh).data; } catch (e) { return; }
    for (var b = 0; b < BUCKETS; b++) buckets.push([]);
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var i = (y * sw + x) * 4;
        if (data[i + 1] > 90) {
          var pt = [(x + 0.5) / sw, (y + 0.5) / sh, data[i] / 255];
          points.push(pt);
          buckets[Math.min(BUCKETS - 1, Math.floor(pt[2] * BUCKETS))].push(pt);
        }
      }
    }
  }

  /* ---------- Progress: intro on load, then follows the scroll ---------- */
  var intro = reduceMotion ? 1 : 0;
  var introStart = null;
  var shown = 0;            // smoothed progress that is actually drawn
  var lastDrawn = -1;
  var fxCtx = fxCanvas.getContext('2d');
  var dpr = 1, fxDpr = 1;

  function target() {
    if (reduceMotion) return 1.05;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, window.scrollY / max) : intro;
    return Math.min(1.05, 0.3 * intro + p * 0.9);
  }

  function resize() {
    var changed = layout();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    fxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    glCanvas.width = Math.round(vw * dpr);
    glCanvas.height = Math.round(vh * dpr);
    fxCanvas.width = Math.round(vw * fxDpr);
    fxCanvas.height = Math.round(vh * fxDpr);
    glCanvas.style.height = fxCanvas.style.height = vh + 'px';
    lastDrawn = -1;
    return changed;
  }

  function railProgress(r) { return shown; }

  function drawSwirl() {
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, glCanvas.width, glCanvas.height);
    for (var i = 0; i < 2; i++) {
      var r = rails[i] || rails[0];
      gl.uniform4f(U['uRect' + i], r.x * dpr, r.y * dpr, r.w * dpr, r.h * dpr);
      gl.uniform2f(U['uMode' + i], r.flip ? 1 : 0, r.reverse ? 1 : 0);
      gl.uniform1f(U['uP' + i], railProgress(r));
    }
    gl.uniform1f(U.uCount, rails.length);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    lastDrawn = shown;
  }

  /* ---------- Sparkles ---------- */
  function makeSprite(rgb, star) {
    var s = 32, c = document.createElement('canvas');
    c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(' + rgb + ',0.9)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    if (star) {
      x.globalCompositeOperation = 'lighter';
      x.fillStyle = 'rgba(255,240,248,0.85)';
      x.fillRect(s / 2 - 0.75, 2, 1.5, s - 4);
      x.fillRect(2, s / 2 - 0.75, s - 4, 1.5);
    }
    return c;
  }
  var SPRITES = [makeSprite('232,85,143', false), makeSprite('255,190,220', true), makeSprite('255,255,255', true)];
  var sparks = [];

  function pointToScreen(pt, r) {
    var u = r.flip ? 1 - pt[0] : pt[0];
    return [r.x + u * r.w, r.y + pt[1] * r.h];
  }
  function ptTime(pt, r) { return r.reverse ? 1 - pt[2] : pt[2]; }

  function spawn(r, pt, trail) {
    var xy = pointToScreen(pt, r);
    var big = Math.random() < 0.25;
    sparks.push({
      x: xy[0] + (Math.random() - 0.5) * 6,
      y: xy[1] + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * (trail ? 0.6 : 0.15),
      vy: -(Math.random() * (trail ? 0.5 : 0.18) + 0.04),
      age: 0,
      life: trail ? 40 + Math.random() * 50 : 70 + Math.random() * 110,
      size: (big ? 9 : 4) + Math.random() * (big ? 8 : 5),
      sprite: SPRITES[big ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0]
    });
  }

  function randomShownPoint(r) {
    for (var tries = 0; tries < 6; tries++) {
      var pt = points[(Math.random() * points.length) | 0];
      if (ptTime(pt, r) <= shown) return pt;
    }
    return null;
  }

  function tipPoint(r) {
    var tt = r.reverse ? 1 - shown : shown;
    var b = Math.floor(tt * BUCKETS);
    for (var k = 0; k < 3; k++) {
      var bb = r.reverse ? b + k : b - k;
      var list = buckets[bb];
      if (list && list.length) return list[(Math.random() * list.length) | 0];
    }
    return null;
  }

  function updateSparks(drawing) {
    var maxSparks = isPhone ? 55 : 110;
    var ambient = isPhone ? 0.35 : 0.7;   // new twinkles per frame
    if (points.length) {
      rails.forEach(function (r) {
        if (sparks.length < maxSparks && Math.random() < ambient) {
          var pt = randomShownPoint(r);
          if (pt) spawn(r, pt, false);
        }
        if (drawing && shown < 1) {
          for (var n = 0; n < (isPhone ? 2 : 3); n++) {
            var tp = tipPoint(r);
            if (tp && sparks.length < maxSparks + 30) spawn(r, tp, true);
          }
        }
      });
    }
    fxCtx.setTransform(fxDpr, 0, 0, fxDpr, 0, 0);
    fxCtx.clearRect(0, 0, vw, vh);
    fxCtx.globalCompositeOperation = 'lighter';
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.age++;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.x += s.vx; s.y += s.vy;
      var k = s.age / s.life;
      fxCtx.globalAlpha = Math.sin(Math.PI * k) * 0.95;
      var sz = s.size * (0.6 + 0.4 * Math.sin(Math.PI * k));
      fxCtx.drawImage(s.sprite, s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
    fxCtx.globalAlpha = 1;
  }

  /* ---------- Main loop ---------- */
  function frame(t) {
    if (!reduceMotion) {
      if (introStart === null) introStart = t;
      var k = Math.min(1, (t - introStart) / 2600);
      intro = 1 - Math.pow(1 - k, 3);
    }
    var goal = target();
    var before = shown;
    shown += (goal - shown) * 0.08;
    if (Math.abs(goal - shown) < 0.0005) shown = goal;
    if (Math.abs(shown - lastDrawn) > 0.0004) drawSwirl();
    if (reduceMotion) return;   // drawn once, no animation
    updateSparks(Math.abs(shown - before) > 0.0002);
    requestAnimationFrame(frame);
  }

  function start() {
    resize();
    if (reduceMotion) { shown = 1.05; drawSwirl(); return; }
    window.addEventListener('resize', function () { if (resize()) sparks.length = 0; drawSwirl(); });
    requestAnimationFrame(frame);
  }
})();
