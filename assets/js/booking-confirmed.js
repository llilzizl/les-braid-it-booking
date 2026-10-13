/* ==========================================================
   Les Braid It: "thank you" page after the Stripe deposit.
   Stripe sends the client here with ?session_id=... The booking
   is confirmed by Stripe's webhook, which can take a few seconds,
   so this page checks every 2 seconds for up to about a minute.
   ========================================================== */
(function () {
  var db = window.LBI_DB;
  var title = document.getElementById('confirm-title');
  var text = document.getElementById('confirm-text');
  var card = document.getElementById('confirm-card');
  var detail = document.getElementById('confirm-detail');
  if (!title) return;

  var sessionId = (window.location.search.match(/[?&]session_id=([^&]+)/) || [])[1];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function show(heading, message) { title.textContent = heading; text.textContent = message; }

  function describe(row) {
    var p = String(row.booking_date).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var t = String(row.booking_time).slice(0, 5).split(':').map(Number);
    var hour = t[0] % 12 === 0 ? 12 : t[0] % 12;
    var time = hour + (t[1] ? ':' + (t[1] < 10 ? '0' : '') + t[1] : '') + (t[0] < 12 ? 'am' : 'pm');
    return row.service_type + ' on ' + DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' at ' + time + '.';
  }

  if (!db || !sessionId) {
    show('We could not find your booking', 'If you were charged, please get in touch on the contact page and include your email address.');
    return;
  }

  var tries = 0;
  function check() {
    tries++;
    db.rpc('booking_status_by_session', { p_session: sessionId }).then(function (res) {
      var row = res.data && res.data[0];
      if (row && row.status === 'confirmed') {
        show('You’re booked in!', 'Thank you. Your deposit has been received.');
        detail.textContent = describe(row);
        card.hidden = false;
        return;
      }
      if (row && row.payment_status === 'refunded') {
        show('Sorry, that time was just taken', 'Your deposit has been refunded automatically (allow a few days to reach your bank). Please choose another time.');
        return;
      }
      if (tries < 30) return setTimeout(check, 2000);
      show('Still confirming', 'Your payment is taking longer than usual. You do not need to pay again. Please check your email, or get in touch on the contact page.');
    }).catch(function () {
      if (tries < 30) setTimeout(check, 2000);
      else show('Still confirming', 'We could not check your booking right now. Please check your email, or get in touch on the contact page.');
    });
  }
  check();
})();
