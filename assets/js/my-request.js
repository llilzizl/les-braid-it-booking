/* ==========================================================
   Les Braid It: the client's page for their custom request.
   They arrive from an email with ?token=... (long and random,
   so only they can open it). From here they can:
     - see your offer, with anything you changed marked
     - pay the deposit (this accepts the offer and books them in)
     - reply to you, or decline the offer
   ========================================================== */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var cfg = window.LBI_SUPABASE || {};
  var db = window.LBI_DB || (window.supabase && cfg.url && cfg.anonKey ? window.supabase.createClient(cfg.url, cfg.anonKey) : null);
  var title = document.getElementById('req-title');
  if (!title) return;
  var text = document.getElementById('req-text');
  var card = document.getElementById('req-card');
  var statusBox = document.getElementById('req-status');
  var offerBox = document.getElementById('offer-box');
  var summary = document.getElementById('offer-summary');
  var payBtn = document.getElementById('pay-btn');
  var thread = document.getElementById('thread');
  var replyForm = document.getElementById('reply-form');
  var replyText = document.getElementById('reply-text');
  var declineBtn = document.getElementById('decline-btn');

  var token = (window.location.search.match(/[?&]token=([a-f0-9]+)/) || [])[1];
  var cancelled = /[?&]cancelled=1/.test(window.location.search);
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var request = null;

  function show(heading, message) { title.textContent = heading; text.textContent = message; }
  function pounds(n) { n = Number(n); return '£' + (Number.isInteger(n) ? n : n.toFixed(2)); }
  function when(date, time) {
    var p = String(date).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var t = String(time).slice(0, 5).split(':').map(Number);
    var hour = t[0] % 12 === 0 ? 12 : t[0] % 12;
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' at ' + hour + (t[1] ? ':' + (t[1] < 10 ? '0' : '') + t[1] : '') + (t[0] < 12 ? 'am' : 'pm');
  }
  function length(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + ' hr' + (h === 1 ? '' : 's') : '') + (m ? (h ? ' ' : '') + m + ' mins' : '');
  }
  function stamp(iso) {
    return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function setStatus(message, type) {
    statusBox.textContent = message || '';
    statusBox.className = 'member-status is-' + (type || 'error');
    statusBox.hidden = !message;
  }
  function el(tag, cls, content) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (content != null) n.textContent = content;
    return n;
  }

  function call(payload) {
    return fetch(cfg.url + '/functions/v1/custom-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
      body: JSON.stringify(Object.assign({ token: token }, payload))
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
    });
  }

  function summaryRow(label, value, before) {
    var dt = el('dt', null, label);
    var dd = el('dd', null, value);
    if (before && before !== value) {
      dd.appendChild(el('span', 'was', 'You asked for ' + before));
      dd.classList.add('is-changed');
    }
    summary.appendChild(dt);
    summary.appendChild(dd);
  }

  function render(r) {
    request = r;
    summary.textContent = '';
    thread.textContent = '';
    var closed = ['booked', 'declined', 'client_declined'].indexOf(r.status) !== -1;

    if (r.status === 'booked') show('You’re booked in!', 'Your deposit has been paid. Check your email for the confirmation.');
    else if (r.status === 'declined') show('About your request', 'Sorry, I can’t take this request on.');
    else if (r.status === 'client_declined') show('You declined this offer', 'No problem. You’re welcome to send a new request from the booking page.');
    else if (r.offer_open) show('Hi ' + (r.first_name || 'there') + ', here’s my offer', 'Pay the deposit to book, or reply if you’d like something changed.');
    else if (r.status === 'expired') show('This offer has run out', 'The time to pay the deposit passed, so the slot was released. You can still reply below.');
    else show('Hi ' + (r.first_name || 'there'), 'Here’s our conversation about your custom style request.');

    // The offer, with anything different from what they asked for marked
    offerBox.hidden = !r.offer_open;
    if (r.offer_open) {
      summaryRow('When', when(r.final_date, r.final_time), when(r.requested_date, r.requested_time));
      summaryRow('Length', length(r.final_duration), length(r.duration_minutes));
      summaryRow('Price', pounds(r.final_price), r.suggested_price != null ? pounds(r.suggested_price) : null);
      summaryRow('Deposit to pay now', pounds(r.deposit_amount));
      summaryRow('To pay on the day', pounds(Number(r.final_price) - Number(r.deposit_amount)));
      payBtn.textContent = 'Pay ' + pounds(r.deposit_amount) + ' deposit to book';
      document.getElementById('offer-hold').textContent = 'This time is held for you until ' +
        new Date(r.hold_until).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) + '.';
    }

    // The conversation
    var mine = el('div', 'thread-msg client');
    mine.appendChild(el('div', 'thread-meta', 'Your request'));
    mine.appendChild(el('div', 'thread-body', r.description));
    thread.appendChild(mine);
    (r.messages || []).forEach(function (m) {
      var b = el('div', 'thread-msg ' + m.sender);
      var who = m.sender === 'owner' ? 'Lilian' : 'You';
      var what = m.kind === 'offer' ? (m.offer && m.offer.changed ? ' suggested changes' : ' accepted your request') : m.kind === 'decline' ? ' declined' : '';
      b.appendChild(el('div', 'thread-meta', who + what + ' · ' + stamp(m.at)));
      if (m.kind === 'offer' && m.offer) {
        b.appendChild(el('div', 'thread-offer', pounds(m.offer.price) + ', ' + length(m.offer.duration) + ', ' + when(m.offer.date, m.offer.time)));
      }
      if (m.body) b.appendChild(el('div', 'thread-body', m.body));
      thread.appendChild(b);
    });

    replyForm.hidden = closed;
    declineBtn.hidden = !r.offer_open;
    card.hidden = false;
  }

  function load() {
    return db.rpc('custom_request_by_token', { p_token: token }).then(function (res) {
      var r = res.data && res.data[0];
      if (res.error || !r) {
        show('We could not find this request', 'Please use the link in your email. If it still does not work, get in touch on the contact page.');
        return;
      }
      render(r);
    }).catch(function () {
      show('Something went wrong', 'Could not load your request. Please check your connection and refresh the page.');
    });
  }

  if (!db || !token) {
    show('We could not find this request', 'Please use the link in your email. If it still does not work, get in touch on the contact page.');
    return;
  }
  load().then(function () {
    if (cancelled && request && request.offer_open) setStatus('Payment cancelled, so nothing was charged. Your time is still held, so you can try again.', 'info');
  });

  /* ---------- Pay the deposit ---------- */
  payBtn.addEventListener('click', function () {
    var label = payBtn.textContent;
    payBtn.disabled = true;
    payBtn.textContent = 'Please wait…';
    setStatus('');
    call({ action: 'checkout' }).then(function (out) {
      if (out.ok && out.body.url) {
        payBtn.textContent = 'Taking you to payment…';
        window.location.href = out.body.url;
        return;
      }
      payBtn.disabled = false;
      payBtn.textContent = label;
      setStatus(out.body.error || 'Could not open the payment page. Please try again.');
      if (out.body.code === 'hold_expired' || out.body.code === 'already_paid') load();
    }).catch(function () {
      payBtn.disabled = false;
      payBtn.textContent = label;
      setStatus('Could not reach the server. Please check your connection and try again.');
    });
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted && request) { payBtn.disabled = false; render(request); } });

  /* ---------- Reply ---------- */
  replyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var message = replyText.value.trim();
    if (!message) { setStatus('Please write your reply first.'); return; }
    var btn = replyForm.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    call({ action: 'reply', message: message }).then(function (out) {
      btn.disabled = false;
      btn.textContent = 'Send reply';
      if (!out.ok) { setStatus(out.body.error || 'Your reply wasn’t sent. Please try again.'); return; }
      replyText.value = '';
      setStatus('Reply sent. I’ll get back to you soon.' + (request && request.offer_open ? ' The offer above is still open if you’d like to book it.' : ''), 'success');
      load();
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = 'Send reply';
      setStatus('Could not reach the server. Please check your connection and try again.');
    });
  });

  /* ---------- Decline the offer ---------- */
  declineBtn.addEventListener('click', function () {
    if (declineBtn.getAttribute('data-sure') !== '1') {
      declineBtn.setAttribute('data-sure', '1');
      declineBtn.textContent = 'Tap again to decline. This releases the time.';
      setTimeout(function () { declineBtn.removeAttribute('data-sure'); declineBtn.textContent = 'No thanks, decline this offer'; }, 5000);
      return;
    }
    declineBtn.disabled = true;
    call({ action: 'client_decline', message: replyText.value.trim() }).then(function (out) {
      declineBtn.disabled = false;
      if (!out.ok) { setStatus(out.body.error || 'Something went wrong. Please try again.'); return; }
      setStatus('');
      load();
    }).catch(function () {
      declineBtn.disabled = false;
      setStatus('Could not reach the server. Please check your connection and try again.');
    });
  });
});
