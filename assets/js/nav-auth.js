/* ==========================================================
   Les Braid It: navigation account links
   - Signed out:  shows "Login"
   - Signed in:   shows "My account"
   - Admin:       also shows "Admin" (only for accounts marked is_admin)

   The links are only a convenience. The database rules are what
   actually protect the admin page and everyone's data.

   Load order on every page:
   supabase-js, supabase-config.js, nav-auth.js, main.js, member.js
   ========================================================== */
(function () {
  var cfg = window.LBI_SUPABASE || {};
  var CACHE_KEY = 'lbi-nav-role';          // remembers the role so the nav does not flicker

  // One shared Supabase connection for the whole page (main.js and member.js reuse it)
  var db = null;
  if (window.supabase && cfg.url && cfg.anonKey) {
    db = window.LBI_DB || (window.LBI_DB = window.supabase.createClient(cfg.url, cfg.anonKey));
  }

  function readCache() {
    try { return window.localStorage.getItem(CACHE_KEY); } catch (e) { return null; }
  }

  function writeCache(role) {
    try {
      if (role) window.localStorage.setItem(CACHE_KEY, role);
      else window.localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* private browsing: the nav still works, it just may flicker */ }
  }

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  // role: null (signed out), 'member' or 'admin'
  function apply(role) {
    var list = document.querySelector('.main-nav ul');
    if (!list) return;

    var loginItem = list.querySelector('.nav-login');
    var adminItem = list.querySelector('.nav-admin');

    if (loginItem) {
      var link = loginItem.querySelector('a');
      link.textContent = role ? 'My account' : 'Login';
      link.setAttribute('href', role ? 'member-dashboard.html' : 'login.html');
      var onThisPage = currentPage() === link.getAttribute('href') ||
        (!role && currentPage() === 'reset-password.html');
      if (onThisPage) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    if (role === 'admin' && !adminItem) {
      adminItem = document.createElement('li');
      adminItem.className = 'nav-admin';
      var adminLink = document.createElement('a');
      adminLink.setAttribute('href', 'admin.html');
      adminLink.textContent = 'Admin';
      adminItem.appendChild(adminLink);
      list.insertBefore(adminItem, loginItem || null);
    } else if (role !== 'admin' && adminItem) {
      adminItem.remove();
    }
  }

  function verify() {
    if (!db) return;

    db.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;
      if (!session) {
        writeCache(null);
        apply(null);
        return;
      }
      apply(readCache() === 'admin' ? 'admin' : 'member');
      return db.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
        .then(function (res) {
          if (res.error) return;           // keep what is showing if the check fails
          var role = res.data && res.data.is_admin ? 'admin' : 'member';
          writeCache(role);
          apply(role);
        });
    }).catch(function () { /* offline: leave the nav as it is */ });

    db.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') {
        writeCache(null);
        apply(null);
      }
    });
  }

  function init() {
    // Show the remembered state straight away, then confirm it with Supabase.
    // With no connection configured the link stays as plain "Login".
    apply(db ? readCache() : null);
    verify();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
