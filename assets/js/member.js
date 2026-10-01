/* ==========================================================
   Les Braid It — member area (login, sign up, password reset)
   Needs: supabase-js (CDN) + assets/js/supabase-config.js
   ========================================================== */

document.addEventListener('DOMContentLoaded', function () {

  var config = window.LBI_SUPABASE || {};
  var db = null;
  if (window.supabase && config.url && config.anonKey) {
    db = window.supabase.createClient(config.url, config.anonKey);
  }

  var DASHBOARD_PAGE = 'member-dashboard.html';
  var LOGIN_PAGE = 'login.html';
  var pageUrl = function (page) { return new URL(page, window.location.href).href; };

  /* ---------------- Helpers ---------------- */
  var statusBox = document.querySelector('.member-status');

  var showStatus = function (message, type) {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = 'member-status is-' + (type || 'error');
    statusBox.hidden = false;
  };

  var clearStatus = function () {
    if (statusBox) statusBox.hidden = true;
  };

  // Turn Supabase's technical errors into friendly ones
  var friendlyError = function (error) {
    var msg = (error && error.message) || '';
    if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Please try again.';
    if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
    if (/already registered/i.test(msg)) return 'An account with that email already exists. Try logging in instead.';
    if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/password/i.test(msg) && /characters/i.test(msg)) return 'Your password must be at least 8 characters.';
    return msg || 'Something went wrong. Please try again.';
  };

  var setBusy = function (form, busy) {
    var btn = form.querySelector('[type="submit"]');
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = 'Please wait…';
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
    btn.disabled = busy;
  };

  // Show / hide password buttons
  document.querySelectorAll('.password-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentElement.querySelector('input');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });

  var memberForms = document.querySelectorAll('.member-form');

  if (!db) {
    if (document.body.hasAttribute('data-members-only')) return window.location.replace(pageUrl(LOGIN_PAGE));
    showStatus('Member accounts are being set up and will be available soon. You can still book as a guest on the booking page.', 'info');
    memberForms.forEach(function (form) {
      form.querySelectorAll('input, button').forEach(function (el) { el.disabled = true; });
    });
    return;
  }

  /* ---------------- Login / Sign up page ---------------- */
  var authCard = document.querySelector('.member-auth');

  if (authCard) {
    // Already logged in? Go straight to the dashboard
    db.auth.getSession().then(function (result) {
      if (result.data.session) window.location.replace(pageUrl(DASHBOARD_PAGE));
    });

    var authTabs = Array.prototype.slice.call(authCard.querySelectorAll('.member-tabs .tab'));
    var panels = Array.prototype.slice.call(authCard.querySelectorAll('.member-panel'));

    var showPanel = function (name) {
      clearStatus();
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
      authTabs.forEach(function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-panel') === name ? 'true' : 'false');
      });
      var firstInput = authCard.querySelector('.member-panel[data-panel="' + name + '"] input');
      if (firstInput) firstInput.focus();
    };

    authTabs.forEach(function (t) {
      t.addEventListener('click', function () { showPanel(t.getAttribute('data-panel')); });
    });
    authCard.querySelectorAll('[data-show-panel]').forEach(function (link) {
      link.addEventListener('click', function () { showPanel(link.getAttribute('data-show-panel')); });
    });

    if (window.location.hash === '#signup') showPanel('signup');

    // Log in
    var loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearStatus();
      setBusy(loginForm, true);
      db.auth.signInWithPassword({
        email: loginForm.email.value.trim(),
        password: loginForm.password.value
      }).then(function (result) {
        setBusy(loginForm, false);
        if (result.error) return showStatus(friendlyError(result.error));
        window.location.href = pageUrl(DASHBOARD_PAGE);
      });
    });

    // Sign up
    var signupForm = document.getElementById('signup-form');
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearStatus();

      var password = signupForm.password.value;
      if (password.length < 8) return showStatus('Your password must be at least 8 characters.');
      if (password !== signupForm.confirm.value) return showStatus('Your passwords don’t match.');

      setBusy(signupForm, true);
      db.auth.signUp({
        email: signupForm.email.value.trim(),
        password: password,
        options: {
          emailRedirectTo: pageUrl(DASHBOARD_PAGE),
          data: {
            full_name: signupForm.fullname.value.trim(),
            phone: signupForm.phone.value.trim()
          }
        }
      }).then(function (result) {
        setBusy(signupForm, false);
        if (result.error) return showStatus(friendlyError(result.error));

        // Supabase hides whether an email is taken; an empty identities list means it is
        var user = result.data.user;
        if (user && user.identities && user.identities.length === 0) {
          return showStatus('An account with that email already exists. Try logging in instead.');
        }
        if (result.data.session) {
          window.location.href = pageUrl(DASHBOARD_PAGE);
        } else {
          signupForm.reset();
          showStatus('Nearly there! We’ve sent a confirmation link to your email. Click it to activate your account.', 'success');
        }
      });
    });

    // Forgot password
    var forgotForm = document.getElementById('forgot-form');
    forgotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearStatus();
      setBusy(forgotForm, true);
      db.auth.resetPasswordForEmail(forgotForm.email.value.trim(), {
        redirectTo: pageUrl('reset-password.html')
      }).then(function (result) {
        setBusy(forgotForm, false);
        if (result.error) return showStatus(friendlyError(result.error));
        forgotForm.reset();
        showStatus('If there’s an account with that email, a password reset link is on its way.', 'success');
      });
    });
  }

  /* ---------------- Reset password page ---------------- */
  var resetForm = document.getElementById('reset-form');

  if (resetForm) {
    // The link in the reset email logs the member in for this one purpose
    var hasRecoverySession = false;
    db.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY' || session) hasRecoverySession = true;
    });

    resetForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearStatus();

      var password = resetForm.password.value;
      if (password.length < 8) return showStatus('Your password must be at least 8 characters.');
      if (password !== resetForm.confirm.value) return showStatus('Your passwords don’t match.');
      if (!hasRecoverySession) return showStatus('This reset link has expired or already been used. Please request a new one from the login page.');

      setBusy(resetForm, true);
      db.auth.updateUser({ password: password }).then(function (result) {
        setBusy(resetForm, false);
        if (result.error) return showStatus(friendlyError(result.error));
        showStatus('Password updated! Taking you to your dashboard…', 'success');
        setTimeout(function () { window.location.href = pageUrl(DASHBOARD_PAGE); }, 1500);
      });
    });
  }

  /* ---------------- Pages that need a logged in member ---------------- */
  if (document.body.hasAttribute('data-members-only')) {
    db.auth.getSession().then(function (result) {
      var session = result.data.session;
      if (!session) return window.location.replace(pageUrl(LOGIN_PAGE));

      db.from('profiles').select('full_name').eq('id', session.user.id).single().then(function (profile) {
        var name = profile.data && profile.data.full_name ? profile.data.full_name.split(' ')[0] : '';
        document.querySelectorAll('[data-member-name]').forEach(function (el) {
          el.textContent = name || 'there';
        });
      });
      document.body.classList.add('is-member-ready');
    });
  }

  document.querySelectorAll('[data-sign-out]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      db.auth.signOut().then(function () { window.location.href = pageUrl(LOGIN_PAGE); });
    });
  });

});
