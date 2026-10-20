/* ==========================================================
   Les Braid It: custom style request form (booking page)
   ----------------------------------------------------------
   1. Photo + description
   2. How long it takes: two swipeable wheels, hours and minutes
   3. Suggested price, with a hint worked out from the length
   4. A free slot, read live from the same calendar as normal
      bookings (working hours, blocked days, other bookings)
   5. Sends everything to the custom-requests function, which
      saves it, stores the photo privately and emails you both.
   ========================================================== */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var form = document.querySelector('.custom-request-form');
  if (!form) return;

  /* ---------- Settings: change these numbers to change the form ---------- */
  var RATE_LOW = 17;              // £ per hour, low end of the price hint
  var RATE_HIGH = 20;             // £ per hour, high end of the price hint
  var MIN_MINUTES = 30;           // shortest appointment allowed
  var MAX_HOURS = 12;             // hours wheel goes 0 to 12
  var MINUTE_STEPS = [0, 15, 30, 45];
  var START_HOURS = 4;            // where the wheels start (4 hours 0 minutes)
  var SLOT_STEP = 30;             // start times every 30 minutes, like normal bookings
  var GAP_MINUTES = 15;           // tidy-up gap after, same as the database
  var MIN_NOTICE_DAYS = 4;        // same rules as normal bookings
  var MAX_MONTHS_AHEAD = 1;
  var MAX_PHOTO_MB = 8;

  var cfg = window.LBI_SUPABASE || {};
  var db = null;
  if (window.supabase && cfg.url && cfg.anonKey) {
    db = window.LBI_DB || (window.LBI_DB = window.supabase.createClient(cfg.url, cfg.anonKey));
  }

  var statusBox = form.querySelector('.member-status');
  var photoInput = form.querySelector('#cr-photo');
  var preview = form.querySelector('.cr-photo-preview');
  var hoursCol = form.querySelector('#cr-hours');
  var minsCol = form.querySelector('#cr-mins');
  var bubblePrice = form.querySelector('.picker-bubble-price');
  var lengthText = form.querySelector('#cr-length-text');
  var priceHint = form.querySelector('#cr-price-hint');
  var slotsStatus = form.querySelector('.cr-slots-status');
  var daysBox = form.querySelector('.cr-days');
  var timesBox = form.querySelector('.cr-times');
  var submitBtn = form.querySelector('[type="submit"]');
  var successBox = document.querySelector('.cr-success');
  var modal = document.querySelector('.custom-modal');
  function field(id) { return form.querySelector('#cr-' + id); }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toMinutes(t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function minutesToTime(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function niceTime(t) {
    var m = toMinutes(t), h = Math.floor(m / 60), mm = m % 60;
    return (h % 12 === 0 ? 12 : h % 12) + (mm ? ':' + pad(mm) : '') + (h < 12 ? 'am' : 'pm');
  }
  function lengthWords(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + ' hour' + (h === 1 ? '' : 's') : '') + (h && m ? ' ' : '') + (m ? m + ' minutes' : '');
  }

  function showStatus(message, type) {
    if (!message) { statusBox.hidden = true; return; }
    statusBox.textContent = message;
    statusBox.className = 'member-status is-' + (type || 'error');
    statusBox.hidden = false;
    statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- 1. Photo preview ---------- */
  photoInput.addEventListener('change', function () {
    var file = photoInput.files && photoInput.files[0];
    if (preview.src) URL.revokeObjectURL(preview.src);
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) { preview.hidden = true; preview.removeAttribute('src'); return; }
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });

  /* ---------- 2. Duration: an hours wheel and a minutes wheel ---------- */
  // A wheel is a column you swipe up or down; the number in the middle is chosen.
  function makeWheel(col, values, start, label, onChange) {
    var list = col.querySelector('.picker-list');
    var items = values.map(function (v) {
      var item = document.createElement('div');
      item.className = 'picker-item';
      item.setAttribute('data-value', v);
      item.textContent = label(v);
      list.appendChild(item);
      return item;
    });
    var wheelObj = { value: start };

    function paint() {
      var i = values.indexOf(wheelObj.value);
      items.forEach(function (item, j) {
        var d = Math.abs(j - i);
        item.className = 'picker-item' + (d === 0 ? ' is-active' : d === 1 ? ' is-near' : '');
      });
      col.setAttribute('aria-valuenow', wheelObj.value);
    }
    function centre(smooth) {
      var item = items[values.indexOf(wheelObj.value)];
      if (!item) return;
      col.scrollTo({ top: item.offsetTop - (col.clientHeight - item.offsetHeight) / 2, behavior: smooth ? 'smooth' : 'auto' });
    }
    wheelObj.set = function (v, fromScroll) {
      if (values.indexOf(v) === -1) return;
      var changed = v !== wheelObj.value;
      wheelObj.value = v;
      paint();
      if (!fromScroll) centre(true);
      if (changed) onChange();
    };
    wheelObj.centre = centre;

    var timer = null;
    col.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var middle = col.scrollTop + col.clientHeight / 2;
        var best = 0, gap = Infinity;
        items.forEach(function (item, j) {
          var g = Math.abs(item.offsetTop + item.offsetHeight / 2 - middle);
          if (g < gap) { gap = g; best = j; }
        });
        wheelObj.set(values[best], true);
      }, 110);
    }, { passive: true });

    list.addEventListener('click', function (e) {
      var item = e.target.closest('.picker-item');
      if (item) wheelObj.set(Number(item.getAttribute('data-value')));
    });
    col.addEventListener('keydown', function (e) {
      var i = values.indexOf(wheelObj.value);
      var to = { ArrowUp: i - 1, ArrowDown: i + 1, Home: 0, End: values.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      wheelObj.set(values[Math.max(0, Math.min(values.length - 1, to))]);
    });
    paint();
    return wheelObj;
  }

  var hourValues = [];
  for (var hv = 0; hv <= MAX_HOURS; hv++) hourValues.push(hv);
  var hoursWheel = makeWheel(hoursCol, hourValues, START_HOURS, String, onDurationChange);
  var minsWheel = makeWheel(minsCol, MINUTE_STEPS, 0, function (v) { return pad(v); }, onDurationChange);
  var duration = START_HOURS * 60;

  function onDurationChange() {
    var mins = hoursWheel.value * 60 + minsWheel.value;
    // keep it between 30 minutes and 12 hours
    if (mins > MAX_HOURS * 60) { minsWheel.set(0); return; }
    if (mins < MIN_MINUTES) { minsWheel.set(30); return; }
    var changed = mins !== duration;
    duration = mins;
    hoursCol.setAttribute('aria-valuetext', hoursWheel.value + ' hours');
    minsCol.setAttribute('aria-valuetext', minsWheel.value + ' minutes');
    lengthText.textContent = lengthWords(duration) + '. Swipe the numbers up or down. Not sure? Pick your best guess and I’ll confirm it.';
    updatePriceHint();
    if (changed) scheduleSlots();
  }

  function centreWheels() { hoursWheel.centre(false); minsWheel.centre(false); }

  /* ---------- 3. Price hint ---------- */
  function updatePriceHint() {
    var hours = duration / 60;
    var low = Math.round(hours * RATE_LOW), high = Math.round(hours * RATE_HIGH);
    bubblePrice.textContent = '\u00a3' + low + '\u2013\u00a3' + high;
    priceHint.textContent = 'Most requests are accepted at \u00a3' + RATE_LOW + '\u2013\u00a3' + RATE_HIGH +
      ' an hour. For ' + lengthWords(duration) + ', that\u2019s about \u00a3' + low + '\u2013\u00a3' + high + '.';
  }

  /* ---------- 4. Live available times ---------- */
  var rules = null;            // { hours: {...}, blocked: {...}, busy: {...} }
  var rulesPromise = null;
  var chosenDate = null;
  var chosenTime = null;
  var slotsTimer = null;

  function bookingWindow() {
    var now = new Date();
    return {
      first: new Date(now.getFullYear(), now.getMonth(), now.getDate() + MIN_NOTICE_DAYS),
      last: new Date(now.getFullYear(), now.getMonth() + MAX_MONTHS_AHEAD, now.getDate())
    };
  }

  function loadRules(force) {
    if (rulesPromise && !force) return rulesPromise;
    var w = bookingWindow();
    var from = dateKey(w.first), to = dateKey(w.last);
    rulesPromise = Promise.all([
      db.from('working_hours').select('*'),
      db.from('blocked_dates').select('blocked_date').gte('blocked_date', from).lte('blocked_date', to),
      db.rpc('get_busy_slots', { from_date: from, to_date: to })
    ]).then(function (res) {
      res.forEach(function (r) { if (r.error) throw r.error; });
      var hours = {}, blocked = {}, busy = {};
      (res[0].data || []).forEach(function (r) { hours[r.day_of_week] = r; });
      (res[1].data || []).forEach(function (r) { blocked[r.blocked_date] = true; });
      (res[2].data || []).forEach(function (r) {
        var start = toMinutes(r.start_time);
        (busy[r.booking_date] = busy[r.booking_date] || []).push({ start: start, end: start + r.block_minutes });
      });
      rules = { hours: hours, blocked: blocked, busy: busy };
      return rules;
    }).catch(function (err) { rulesPromise = null; throw err; });
    return rulesPromise;
  }

  // Start times on one day with room for the whole appointment plus the gap
  function slotsFor(date) {
    var key = dateKey(date);
    var h = rules.hours[date.getDay()];
    if (!h || !h.is_open || !h.open_time || !h.close_time || rules.blocked[key]) return [];
    var open = toMinutes(h.open_time), close = toMinutes(h.close_time);
    var busy = rules.busy[key] || [];
    var out = [];
    for (var start = open; start + duration <= close; start += SLOT_STEP) {
      var end = start + duration + GAP_MINUTES;
      var clash = busy.some(function (b) { return start < b.end && end > b.start; });
      if (!clash) out.push(minutesToTime(start));
    }
    return out;
  }

  function choiceButton(label, sub, value, selected) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cr-chip' + (selected ? ' is-selected' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', selected ? 'true' : 'false');
    b.setAttribute('data-value', value);
    var main = document.createElement('span');
    main.textContent = label;
    b.appendChild(main);
    if (sub) {
      var small = document.createElement('small');
      small.textContent = sub;
      b.appendChild(small);
    }
    return b;
  }

  function renderSlots() {
    var w = bookingWindow();
    var days = [];
    for (var d = new Date(w.first); d <= w.last; d.setDate(d.getDate() + 1)) {
      var times = slotsFor(d);
      if (times.length) days.push({ date: new Date(d), key: dateKey(d), times: times });
    }
    daysBox.textContent = '';
    timesBox.textContent = '';
    if (!days.length) {
      slotsStatus.textContent = 'No times have room for ' + lengthWords(duration) + ' in the next month. Try a shorter length, or send the request anyway on the contact page.';
      chosenDate = chosenTime = null;
      timesBox.hidden = true;
      return;
    }
    if (!days.some(function (x) { return x.key === chosenDate; })) { chosenDate = null; chosenTime = null; }
    slotsStatus.textContent = 'Days with room for ' + lengthWords(duration) + '. Pick a day, then a start time.';
    days.forEach(function (x) {
      var label = DAY_NAMES[x.date.getDay()] + ' ' + x.date.getDate() + ' ' + MONTHS[x.date.getMonth()];
      daysBox.appendChild(choiceButton(label, x.times.length + (x.times.length === 1 ? ' time' : ' times'), x.key, x.key === chosenDate));
    });
    renderTimes(days);
  }

  function renderTimes(days) {
    timesBox.textContent = '';
    var day = (days || []).filter(function (x) { return x.key === chosenDate; })[0];
    if (!day && chosenDate && rules) {
      var p = chosenDate.split('-');
      var times = slotsFor(new Date(+p[0], +p[1] - 1, +p[2]));
      day = times.length ? { times: times } : null;
    }
    if (!day) { timesBox.hidden = true; chosenTime = null; return; }
    if (day.times.indexOf(chosenTime) === -1) chosenTime = null;
    day.times.forEach(function (t) {
      timesBox.appendChild(choiceButton(niceTime(t), null, t, t === chosenTime));
    });
    timesBox.hidden = false;
  }

  function showSlots(force) {
    if (!db) {
      slotsStatus.textContent = 'Online requests are being set up. Please use the contact page for now.';
      submitBtn.disabled = true;
      return;
    }
    slotsStatus.textContent = 'Loading available times…';
    loadRules(force).then(renderSlots).catch(function (err) {
      console.error('Could not load times', err);
      slotsStatus.textContent = 'Could not load available times. Please close this form and try again.';
    });
  }

  function scheduleSlots() {
    clearTimeout(slotsTimer);
    slotsTimer = setTimeout(function () { if (rules) renderSlots(); else showSlots(); }, 250);
  }

  function pick(box, e, onPick) {
    var chip = e.target.closest('.cr-chip');
    if (!chip) return;
    Array.prototype.forEach.call(box.querySelectorAll('.cr-chip'), function (c) {
      c.classList.toggle('is-selected', c === chip);
      c.setAttribute('aria-checked', c === chip ? 'true' : 'false');
    });
    onPick(chip.getAttribute('data-value'));
  }
  daysBox.addEventListener('click', function (e) {
    pick(daysBox, e, function (v) {
      chosenDate = v;
      chosenTime = null;
      renderTimes();
      timesBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  timesBox.addEventListener('click', function (e) { pick(timesBox, e, function (v) { chosenTime = v; }); });

  /* ---------- Opening the form ---------- */
  var started = false;
  function start() {
    if (!started) {
      started = true;
      requestAnimationFrame(centreWheels);
      // members: fill in their details
      if (db) db.auth.getSession().then(function (r) {
        var s = r.data && r.data.session;
        if (!s) return;
        var meta = s.user.user_metadata || {};
        if (!field('name').value) field('name').value = meta.full_name || '';
        if (!field('email').value) field('email').value = s.user.email || '';
        if (!field('phone').value) field('phone').value = meta.phone || '';
      });
    } else {
      requestAnimationFrame(centreWheels);
    }
    showSlots(true);   // always fresh, so times taken since the page loaded disappear
  }
  Array.prototype.forEach.call(document.querySelectorAll('.open-custom-modal'), function (btn) {
    btn.addEventListener('click', start);
  });
  updatePriceHint();

  /* ---------- 5. Send ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showStatus('');
    if (!db) return;

    var file = photoInput.files && photoInput.files[0];
    var description = field('description').value.trim();
    var name = field('name').value.trim();
    var email = field('email').value.trim();
    var phone = field('phone').value.trim();
    var price = field('price').value.trim();

    if (!file) return showStatus('Please add a photo of the style.');
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) return showStatus('That photo is too big. Please use one under ' + MAX_PHOTO_MB + ' MB.');
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return showStatus('Please upload a JPG, PNG, WEBP or HEIC photo.');
    if (!description) return showStatus('Please describe the style you want.');
    if (price !== '' && !(Number(price) >= 0)) return showStatus('Please enter the price as a number, or leave it empty.');
    if (!chosenDate || !chosenTime) return showStatus('Please choose a day and a start time.');
    if (!name) return showStatus('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showStatus('Please enter a valid email address.');
    if (!phone) return showStatus('Please enter your phone number.');

    var data = new FormData();
    data.append('photo', file);
    data.append('description', description);
    data.append('duration', String(duration));
    data.append('price', price);
    data.append('date', chosenDate);
    data.append('time', chosenTime);
    data.append('name', name);
    data.append('email', email);
    data.append('phone', phone);

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    db.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      return fetch(cfg.url + '/functions/v1/custom-requests', {
        method: 'POST',
        headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + (s ? s.access_token : cfg.anonKey) },
        body: data
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (out) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
      if (out.ok) {
        form.hidden = true;
        successBox.hidden = false;
        successBox.scrollIntoView({ block: 'nearest' });
        return;
      }
      showStatus(out.body.error || 'Something went wrong and your request wasn’t sent. Please try again.');
      if (out.body.code === 'slot_taken' || out.body.code === 'date_unavailable') showSlots(true);
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send request';
      showStatus('Could not reach the server. Please check your connection and try again.');
    });
  });

  // "Done" after sending: close the form and reset it for next time
  var doneBtn = document.querySelector('.custom-modal-done');
  if (doneBtn) doneBtn.addEventListener('click', function () {
    var close = modal && modal.querySelector('.custom-modal-close');
    if (close) close.click();
    form.reset();
    preview.hidden = true;
    chosenDate = chosenTime = null;
    form.hidden = false;
    successBox.hidden = true;
  });
});
