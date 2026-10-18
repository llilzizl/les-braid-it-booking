/* ==========================================================
   Les Braid It: floating pink sparkles
   ----------------------------------------------------------
   Used on every page except home and booking, which have
   <body data-decor="swirl"> and get the glowing swirl instead.

   A full-screen canvas behind the content with three kinds of
   sparkle drifting slowly upwards and twinkling:
     - small glowing dots (most of them)
     - soft blurry "bokeh" circles
     - four-point star flares
   Phones get fewer sparkles so scrolling stays smooth.
   Reduced motion: one still frame of sparkles, no movement.
   ========================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var glow = document.createElement('div');
  glow.className = 'sparkle-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glow);

  var canvas = document.createElement('canvas');
  canvas.className = 'swirl-layer sparkle-field';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var COLOURS = ['232,85,143', '255,79,163', '255,194,221', '255,240,248'];

  /* ---------- Sprites, drawn once and reused ---------- */
  function dotSprite(rgb) {
    var s = 32, c = document.createElement('canvas');
    c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(' + rgb + ',0.95)');
    g.addColorStop(0.55, 'rgba(' + rgb + ',0.25)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return c;
  }
  function bokehSprite(rgb) {
    var s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(' + rgb + ',0.55)');
    g.addColorStop(0.6, 'rgba(' + rgb + ',0.3)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return c;
  }
  function starSprite(rgb) {
    var s = 96, m = s / 2, c = document.createElement('canvas');
    c.width = c.height = s;
    var x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter';
    var g = x.createRadialGradient(m, m, 0, m, m, s * 0.22);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(' + rgb + ',0.8)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    // long thin rays fading out
    [[1, 0], [0, 1]].forEach(function (d) {
      var lg = d[0] ? x.createLinearGradient(0, m, s, m) : x.createLinearGradient(m, 0, m, s);
      lg.addColorStop(0, 'rgba(' + rgb + ',0)');
      lg.addColorStop(0.5, 'rgba(255,245,250,1)');
      lg.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = lg;
      if (d[0]) x.fillRect(0, m - 1.5, s, 3); else x.fillRect(m - 1.5, 0, 3, s);
    });
    return c;
  }
  var SPRITES = {
    dot: COLOURS.map(dotSprite),
    bokeh: COLOURS.slice(0, 3).map(bokehSprite),
    star: COLOURS.slice(0, 3).map(starSprite)
  };

  /* ---------- Sparkles ---------- */
  var vw = 0, vh = 0, dpr = 1, isPhone = false;
  var sparkles = [];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  function make(anywhere) {
    var r = Math.random();
    var kind = r < 0.58 ? 'dot' : r < 0.8 ? 'bokeh' : 'star';
    var size = kind === 'dot' ? rand(6, 16) : kind === 'bokeh' ? rand(18, 42) : rand(34, 72);
    return {
      kind: kind,
      sprite: pick(SPRITES[kind]),
      x: rand(0, vw),
      y: anywhere ? rand(0, vh) : vh + size,
      size: size,
      rise: rand(0.12, 0.55) * (kind === 'bokeh' ? 0.6 : 1),
      sway: rand(0.2, 0.8),
      phase: rand(0, Math.PI * 2),
      twinkle: rand(0.015, 0.05),
      base: kind === 'bokeh' ? rand(0.45, 0.8) : rand(0.75, 1)
    };
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w === vw && Math.abs(h - vh) < 120) return;
    vw = w; vh = h;
    isPhone = vw <= 720;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.height = vh + 'px';
    var count = Math.round((isPhone ? 110 : 220) * Math.min(1.3, vh / 900));
    sparkles = [];
    for (var i = 0; i < count; i++) sparkles.push(make(true));
  }

  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < sparkles.length; i++) {
      var s = sparkles[i];
      var tw = 0.65 + 0.35 * Math.sin(s.phase + t * s.twinkle);
      var sz = s.size * (s.kind === 'star' ? 0.75 + 0.25 * tw : 1);
      var x = s.x + Math.sin(s.phase + t * 0.01) * 6 * s.sway;
      ctx.globalAlpha = s.base * tw;
      ctx.drawImage(s.sprite, x - sz / 2, s.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  var frameNo = 0;
  function frame() {
    frameNo++;
    for (var i = 0; i < sparkles.length; i++) {
      var s = sparkles[i];
      s.y -= s.rise;
      if (s.y < -s.size) sparkles[i] = make(false);
    }
    draw(frameNo);
    requestAnimationFrame(frame);
  }

  resize();
  if (reduceMotion) {
    draw(0);
    window.addEventListener('resize', function () { resize(); draw(0); });
    return;
  }
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
