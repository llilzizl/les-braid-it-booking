/* ==========================================================
   Les Braid It: neon pink sparkle field (booking page)
   ----------------------------------------------------------
   Used on pages with <body data-decor="neon">.

   A full-screen canvas behind the content, filled with a dense
   field of neon pink and magenta sparkles:
     - small sharp dots (most of them)
     - soft blurry glows
     - a few star flares with long, faint rays
   They twinkle, drift very slowly, and move a little slower than
   the page when you scroll, so the field feels deep.

   Keeping the writing readable (accessibility):
   the script finds every piece of text that sits directly on the
   background (not inside a solid card or button) and fades any
   sparkle out as it gets close to it. So sparkles show around
   the service cards and between sections, but never behind words.

   Phones get fewer sparkles so scrolling stays smooth.
   Reduced motion: a still field with no twinkling or drifting.
   ========================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var canvas = document.createElement('canvas');
  canvas.className = 'swirl-layer neon-field';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Neon pinks and magentas, all close to the brand hot pink #E8558F
  var COLOURS = ['255,46,160', '232,85,143', '214,38,150', '255,105,190'];

  /* ---------- Sprites: drawn once, then stamped many times ---------- */
  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }
  function dotSprite(rgb) {
    var s = 32, c = makeCanvas(s), x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,225,242,1)');
    g.addColorStop(0.18, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.5, 'rgba(' + rgb + ',0.3)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return c;
  }
  function glowSprite(rgb) {
    var s = 64, c = makeCanvas(s), x = c.getContext('2d');
    var g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(' + rgb + ',0.7)');
    g.addColorStop(0.45, 'rgba(' + rgb + ',0.35)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return c;
  }
  function flareSprite(rgb) {
    var s = 160, m = s / 2, c = makeCanvas(s), x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter';
    var g = x.createRadialGradient(m, m, 0, m, m, s * 0.16);
    g.addColorStop(0, 'rgba(255,230,245,1)');
    g.addColorStop(0.25, 'rgba(' + rgb + ',0.95)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    // long thin rays: strong horizontal and vertical, fainter diagonals
    x.translate(m, m);
    [[0, 1], [Math.PI / 2, 1], [Math.PI / 4, 0.35], [-Math.PI / 4, 0.35]].forEach(function (ray) {
      x.save();
      x.rotate(ray[0]);
      var lg = x.createLinearGradient(-m, 0, m, 0);
      lg.addColorStop(0, 'rgba(' + rgb + ',0)');
      lg.addColorStop(0.5, 'rgba(255,200,230,' + ray[1] + ')');
      lg.addColorStop(1, 'rgba(' + rgb + ',0)');
      x.fillStyle = lg;
      x.fillRect(-m, -1, s, 2);
      x.restore();
    });
    return c;
  }
  var SPRITES = {
    dot: COLOURS.map(dotSprite),
    glow: COLOURS.map(glowSprite),
    flare: COLOURS.slice(0, 2).map(flareSprite)
  };

  /* ---------- Text the sparkles must stay away from ---------- */
  var clearZones = [];   // page coordinates: [left, top, right, bottom]
  var PAD = 8;           // gap kept around each piece of text
  var FADE = 26;         // distance over which a sparkle fades back in

  // true if the element sits on something solid (a card, a button, a header),
  // which already hides the sparkles behind it
  function onSolidBackground(el) {
    while (el && el !== document.body) {
      var bg = getComputedStyle(el).backgroundColor;
      var m = bg.match(/rgba?\(([^)]+)\)/);
      if (m) {
        var parts = m[1].split(',');
        var alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
        if (alpha >= 0.85) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function collectClearZones() {
    var seen = new Set();
    var zones = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      var el = node.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('script, style, [hidden], [aria-hidden="true"]')) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (onSolidBackground(el)) continue;
      zones.push([r.left - PAD, r.top + window.scrollY - PAD, r.right + PAD, r.bottom + window.scrollY + PAD]);
    }
    clearZones = zones;
    needsDraw = true;
  }

  var zoneTimer = null;
  function scheduleZones() {
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(collectClearZones, 150);
  }

  // how visible a sparkle may be (0 to 1), given how close it is to text
  function clearance(x, y, radius, zones) {
    var vis = 1;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      var dx = Math.max(z[0] - x, 0, x - z[2]);
      var dy = Math.max(z[1] - y, 0, y - z[3]);
      var d = Math.sqrt(dx * dx + dy * dy) - radius;
      if (d <= 0) return 0;
      if (d < FADE) vis = Math.min(vis, d / FADE);
    }
    return vis;
  }

  /* ---------- Sparkles ---------- */
  var vw = 0, vh = 0, dpr = 1, isPhone = false;
  var sparkles = [];
  var needsDraw = true;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  function make() {
    var r = Math.random();
    var kind = r < 0.66 ? 'dot' : r < 0.965 ? 'glow' : 'flare';
    var size = kind === 'dot' ? rand(6, 16) : kind === 'glow' ? rand(18, 46) : rand(80, 150);
    return {
      kind: kind,
      sprite: pick(SPRITES[kind]),
      x: rand(0, vw),
      y: rand(0, vh),
      size: size,
      // how much of the sprite counts as "solid" when keeping clear of text
      radius: kind === 'flare' ? size * 0.18 : size * 0.4,
      vx: rand(-0.08, 0.08),
      vy: rand(-0.12, 0.02),
      depth: rand(0.15, 0.45),      // scroll parallax: slower than the page
      phase: rand(0, Math.PI * 2),
      twinkle: rand(0.02, 0.07),
      base: kind === 'glow' ? rand(0.55, 0.9) : rand(0.8, 1)
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
    // dense like the reference, but capped so phones stay smooth
    var count = Math.min(isPhone ? 260 : 620, Math.round(vw * vh / (isPhone ? 1300 : 2000)));
    sparkles = [];
    for (var i = 0; i < count; i++) sparkles.push(make());
    scheduleZones();
    needsDraw = true;
  }

  function wrap(v, max, margin) {
    var span = max + margin * 2;
    return ((((v + margin) % span) + span) % span) - margin;
  }

  function draw(t) {
    var scrollY = window.scrollY;
    // only the clear zones currently on screen matter
    var visible = [];
    for (var i = 0; i < clearZones.length; i++) {
      var z = clearZones[i];
      if (z[3] - scrollY > -60 && z[1] - scrollY < vh + 60) {
        visible.push([z[0], z[1] - scrollY, z[2], z[3] - scrollY]);
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < sparkles.length; j++) {
      var s = sparkles[j];
      var margin = s.size;
      var x = wrap(s.x, vw, margin);
      var y = wrap(s.y - scrollY * s.depth, vh, margin);
      var vis = clearance(x, y, s.radius, visible);
      if (vis <= 0) continue;
      var tw = reduceMotion ? 0.9 : 0.7 + 0.3 * Math.sin(s.phase + t * s.twinkle);
      var sz = s.kind === 'flare' ? s.size * (0.7 + 0.3 * tw) : s.size;
      ctx.globalAlpha = s.base * tw * vis;
      ctx.drawImage(s.sprite, x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    needsDraw = false;
  }

  var frameNo = 0;
  function frame() {
    frameNo++;
    for (var i = 0; i < sparkles.length; i++) {
      sparkles[i].x += sparkles[i].vx;
      sparkles[i].y += sparkles[i].vy;
    }
    draw(frameNo);
    requestAnimationFrame(frame);
  }

  /* ---------- Start ---------- */
  resize();
  collectClearZones();
  window.addEventListener('resize', resize);
  window.addEventListener('load', scheduleZones);
  if (window.ResizeObserver) new ResizeObserver(scheduleZones).observe(document.body);
  // the booking page shows and hides sections as you choose a service
  new MutationObserver(scheduleZones).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style']
  });

  if (reduceMotion) {
    // no animation: just redraw when the page scrolls or the layout changes
    var pending = false;
    var redraw = function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; draw(0); });
    };
    window.addEventListener('scroll', redraw, { passive: true });
    setInterval(function () { if (needsDraw) redraw(); }, 250);
    draw(0);
    return;
  }
  requestAnimationFrame(frame);
})();
