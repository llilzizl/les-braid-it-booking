/* ==========================================================
   Portfolio scrapbook (portfolio.html)
   - Style buttons filter the photos.
   - Laptops: up to 10 photos scattered in two messy rows,
     "Shuffle the pile" shows the next ones.
   - Phones: swipeable rows, each photo at its own height and tilt.
   - "Pause motion" stops the floating (it never runs for people
     whose device asks for reduced motion, see style.css).
   The photo buttons themselves are never recreated, only moved,
   so the lightbox in main.js keeps working on them.
   ========================================================== */
(function () {
  var page = document.querySelector('.scrapbook');
  var board = page && page.querySelector('.scrap-board');
  if (!board) return;

  var stage = page.querySelector('.scrap-stage');
  var items = Array.prototype.slice.call(board.querySelectorAll('.portfolio-item'));
  var chips = Array.prototype.slice.call(page.querySelectorAll('.scrap-chip'));
  var status = page.querySelector('.scrap-status');
  var shuffleBtn = page.querySelector('.scrap-shuffle');
  var pauseBtn = page.querySelector('.scrap-pause');
  var phone = window.matchMedia('(max-width: 720px)');

  var current = 'all';
  var shift = 0;

  // Photos grouped by style, in page order
  var byCat = {};
  items.forEach(function (item) {
    var cat = item.getAttribute('data-cat');
    (byCat[cat] = byCat[cat] || []).push(item);
  });

  // Take one from each list in turn, so styles are mixed together
  function mix(lists) {
    var out = [];
    var longest = Math.max.apply(null, lists.map(function (l) { return l.length; }));
    for (var r = 0; r < longest; r++) {
      lists.forEach(function (l) { if (l[r]) out.push(l[r]); });
    }
    return out;
  }

  function photosFor(cat) {
    if (cat !== 'all') return (byCat[cat] || []).slice();
    return mix(['fulani', 'psi', 'boho', 'natural', 'layered', 'cassie', 'patewo'].map(function (c) { return byCat[c] || []; }));
  }

  // The "messy" look: each position in the pattern has its own size, height, tilt and tape colour
  var widths = [176, 150, 190, 160, 170];
  var drops = [12, 54, 0, 34, 20];
  var tilts = [-6, 5, -2, 7, -8, 3];
  var tapes = ['rgba(232, 85, 143, 0.8)', 'rgba(255, 252, 249, 0.75)', 'rgba(245, 230, 0, 0.7)'];

  // Laptop slots: [left %, top %, width %, tilt]. Top is a % of the board's height.
  var slots = [
    [1, 6, 20, -8], [17, 0, 22, 5], [35, 8.3, 21, -3], [52, 1.4, 22, 7], [71, 9.1, 21, -6],
    [6, 55.4, 21, 6], [24, 49.5, 20, -5], [41, 59.4, 22, 4], [59, 51.5, 21, -7], [77, 58.4, 21, 4]
  ];
  var oneRowSlots = [[1, 12, 20, -8], [17, 0, 22, 5], [35, 16, 21, -3], [52, 3, 22, 7], [71, 18, 21, -6]];

  function styleItem(item, j, extra) {
    item.style.cssText = extra;
    item.style.setProperty('--tilt', tilts[j % 6] + 'deg');
    item.style.setProperty('--tape', tapes[j % 3]);
    item.style.setProperty('--delay', '-' + ((j * 1.3) % 7).toFixed(1) + 's');
    item.style.setProperty('--dur', (6 + (j % 3)) + 's');
  }

  function render() {
    var list = photosFor(current);
    var total = list.length;

    // Tell the lightbox which photos belong to the chosen style
    items.forEach(function (item) {
      item.setAttribute('data-out', list.indexOf(item) === -1 ? 'true' : 'false');
    });

    board.innerHTML = '';
    board.className = 'scrap-board';

    if (phone.matches) {
      renderRows(list);
      shuffleBtn.hidden = true;
      stage.classList.remove('has-two-rows');
      status.textContent = total + ' photos. Swipe each row, tap a photo for a closer look.';
    } else {
      var shown = renderScatter(list);
      shuffleBtn.hidden = total < 2;
      status.textContent = 'Showing ' + shown + ' of ' + total + ' photos. Tap a photo for a closer look.';
    }
  }

  function renderRows(list) {
    var groups;
    if (current === 'all') {
      groups = [
        ['weaves', mix([byCat.psi || [], byCat.fulani || [], byCat.cassie || []])],
        ['braids', mix([byCat.layered || [], byCat.boho || []])],
        ['more styles', mix([byCat.natural || [], byCat.patewo || []])]
      ];
    } else {
      // Share this style's photos across up to 3 rows
      var rowCount = Math.min(3, Math.ceil(list.length / 2));
      groups = [];
      for (var g = 0; g < rowCount; g++) groups.push([['pile one', 'pile two', 'pile three'][g], []]);
      list.forEach(function (item, i) { groups[i % rowCount][1].push(item); });
    }

    groups.forEach(function (group, r) {
      var row = document.createElement('section');
      row.className = 'scrap-row scrap-row-' + (r + 1);
      row.setAttribute('aria-label', group[0] + ' photos');
      row.innerHTML = '<div class="scrap-row-head"><h2 class="scrap-row-title"></h2><span aria-hidden="true">swipe &#8594;</span></div>';
      row.querySelector('.scrap-row-title').textContent = group[0];

      var strip = document.createElement('div');
      strip.className = 'scrap-strip';
      strip.tabIndex = 0; // keyboard users can focus the row and scroll it with the arrow keys
      strip.setAttribute('aria-label', group[0] + ', ' + group[1].length + ' photos, scroll sideways');

      group[1].forEach(function (item, i) {
        var j = i + r * 2;
        styleItem(item, j, '');
        item.style.setProperty('--w', widths[j % 5] + 'px');
        item.style.setProperty('--drop', drops[j % 5] + 'px');
        item.style.setProperty('--z', 1 + (j * 3) % 5);
        strip.appendChild(item);
      });
      row.appendChild(strip);
      board.appendChild(row);
    });
  }

  function renderScatter(list) {
    var total = list.length;
    var step = current === 'all' ? 10 : 3;
    var start = total ? (shift * step) % total : 0;
    var ordered = list.slice(start).concat(list.slice(0, start)).slice(0, 10);
    var twoRows = ordered.length > 5;
    var pattern = twoRows ? slots : oneRowSlots;

    board.classList.add('is-scatter', twoRows ? 'is-two-rows' : 'is-one-row');
    stage.classList.toggle('has-two-rows', twoRows);

    ordered.forEach(function (item, i) {
      var s = pattern[i];
      styleItem(item, i, '');
      item.style.setProperty('--x', s[0] + '%');
      item.style.setProperty('--y', s[1] + '%');
      item.style.setProperty('--w', s[2] + '%');
      item.style.setProperty('--tilt', s[3] + 'deg');
      item.style.setProperty('--z', 10 + (i * 3) % 7);
      board.appendChild(item);
    });
    return ordered.length;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      current = chip.getAttribute('data-filter');
      shift = 0;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      render();
    });
  });

  shuffleBtn.addEventListener('click', function () {
    shift++;
    render();
  });

  pauseBtn.addEventListener('click', function () {
    var paused = page.classList.toggle('is-paused');
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.textContent = paused ? 'Play motion' : 'Pause motion';
  });

  // Switch layouts when the screen crosses the phone size (e.g. rotating a tablet)
  if (phone.addEventListener) phone.addEventListener('change', render);
  else phone.addListener(render);

  page.classList.add('is-ready');
  render();
})();
