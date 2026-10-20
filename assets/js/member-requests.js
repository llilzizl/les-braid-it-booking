/* ==========================================================
   Les Braid It: "Your custom style requests" on the member dashboard.
   Shows every custom request the member has sent (while logged in,
   or as a guest with the same email): its status, the times, any
   offer from Lilian, whether the deposit is paid, and the latest
   message, with a link to the full conversation and to pay.
   Reading is allowed by supabase/10_member_custom_requests.sql.
   ========================================================== */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var box = document.getElementById('my-requests');
  var db = window.LBI_DB;
  if (!box || !db) return;

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CLOSED = ['declined', 'client_declined', 'booked'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pounds(n) { n = Number(n); return '£' + (Number.isInteger(n) ? n : n.toFixed(2)); }
  function when(date, time) {
    var p = String(date).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var t = String(time).slice(0, 5).split(':').map(Number);
    var hour = t[0] % 12 === 0 ? 12 : t[0] % 12;
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + hour + (t[1] ? ':' + (t[1] < 10 ? '0' : '') + t[1] : '') + (t[0] < 12 ? 'am' : 'pm');
  }
  function length(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h ? h + ' hr' + (h === 1 ? '' : 's') : '') + (m ? (h ? ' ' : '') + m + ' mins' : '');
  }
  function offerOpen(r) {
    return r.final_price != null && r.hold_until && new Date(r.hold_until).getTime() > Date.now() && CLOSED.indexOf(r.status) === -1;
  }

  // What the status means, in the client's words
  function state(r) {
    if (r.status === 'booked') return { cls: 'booked', label: 'Booked' };
    if (r.status === 'declined') return { cls: 'closed', label: 'Not able to do it' };
    if (r.status === 'client_declined') return { cls: 'closed', label: 'You declined' };
    if (offerOpen(r)) return { cls: 'action', label: 'Offer ready: pay deposit' };
    if (r.status === 'owner_replied') return { cls: 'action', label: 'Lilian replied' };
    if (r.final_price != null && r.status === 'accepted') return { cls: 'closed', label: 'Offer ran out' };
    return { cls: 'waiting', label: 'With Lilian' };
  }

  function row(dl, label, value) {
    dl.appendChild(el('dt', null, label));
    dl.appendChild(el('dd', null, value));
  }

  function card(r, lastMessage) {
    var st = state(r);
    var c = el('article', 'my-request');

    var head = el('div', 'my-request-head');
    if (r.photo_path) {
      var img = el('img', 'my-request-photo');
      img.alt = 'Your photo for this request';
      head.appendChild(img);
      db.storage.from('custom-requests').createSignedUrl(r.photo_path, 3600).then(function (res) {
        if (res.data && res.data.signedUrl) img.src = res.data.signedUrl; else img.remove();
      }).catch(function () { img.remove(); });
    }
    var title = el('div', 'my-request-title');
    title.appendChild(el('span', 'my-request-badge is-' + st.cls, st.label));
    title.appendChild(el('p', 'my-request-desc', r.description));
    head.appendChild(title);
    c.appendChild(head);

    var dl = el('dl', 'my-request-details');
    row(dl, 'You asked for', when(r.requested_date, r.requested_time) + ' · ' + length(r.duration_minutes) +
      (r.suggested_price != null ? ' · ' + pounds(r.suggested_price) : ''));
    if (r.final_price != null && r.status !== 'declined') {
      row(dl, r.status === 'booked' ? 'Booked for' : 'Lilian’s offer',
        when(r.final_date, r.final_time) + ' · ' + length(r.final_duration) + ' · ' + pounds(r.final_price));
      row(dl, 'Deposit', r.status === 'booked' ? pounds(r.deposit_amount) + ' paid'
        : offerOpen(r) ? pounds(r.deposit_amount) + ' to pay by ' + new Date(r.hold_until).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
        : 'Not paid');
    }
    c.appendChild(dl);

    if (lastMessage && lastMessage.body) {
      var q = el('p', 'my-request-last');
      q.appendChild(el('span', null, (lastMessage.sender === 'owner' ? 'Lilian' : 'You') + ': '));
      q.appendChild(document.createTextNode(lastMessage.body.length > 160 ? lastMessage.body.slice(0, 157) + '…' : lastMessage.body));
      c.appendChild(q);
    }

    var actions = el('div', 'my-request-actions');
    if (r.pay_token) {
      var link = 'my-request.html?token=' + r.pay_token;
      if (offerOpen(r)) {
        var pay = el('a', 'btn-primary', 'Pay ' + pounds(r.deposit_amount) + ' deposit');
        pay.href = link;
        actions.appendChild(pay);
      }
      var open = el('a', offerOpen(r) ? 'btn-outline' : 'btn-primary', CLOSED.indexOf(r.status) === -1 ? 'Open conversation' : 'See conversation');
      open.href = link;
      actions.appendChild(open);
    } else {
      actions.appendChild(el('p', 'my-request-wait', 'Lilian will reply within 24–48 hours. You’ll get an email.'));
    }
    c.appendChild(actions);
    return c;
  }

  db.auth.getSession().then(function (res) {
    if (!res.data || !res.data.session) return;
    return db.from('custom_requests').select('*').order('created_at', { ascending: false }).then(function (out) {
      box.textContent = '';
      if (out.error) {
        box.appendChild(el('p', 'my-requests-empty', 'Your requests can’t be shown right now. Please try again later.'));
        return;
      }
      var list = out.data || [];
      if (!list.length) {
        box.appendChild(el('p', 'my-requests-empty', 'You haven’t sent any custom requests yet.'));
        return;
      }
      var ids = list.map(function (r) { return r.id; });
      return db.from('custom_request_messages').select('request_id, sender, body, created_at').in('request_id', ids)
        .order('created_at', { ascending: true }).then(function (m) {
          var last = {};
          (m.data || []).forEach(function (msg) { if (msg.body) last[msg.request_id] = msg; });
          // ones that need them first
          list.sort(function (a, b) { return (state(b).cls === 'action') - (state(a).cls === 'action'); });
          list.forEach(function (r) { box.appendChild(card(r, last[r.id])); });
        });
    });
  });

  // "Send a new custom request" opens the form on the booking page
  var newBtn = document.querySelector('[data-new-request]');
  if (newBtn) newBtn.addEventListener('click', function () { window.location.href = 'booking.html#custom-request'; });
});
