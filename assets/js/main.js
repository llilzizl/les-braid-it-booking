document.addEventListener('DOMContentLoaded', function () {

  /* ---------------- Portfolio lightbox ---------------- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.portfolio-item'));
  var lightbox = document.querySelector('.lightbox');

  if (items.length && lightbox) {
    var lbImg = lightbox.querySelector('.lightbox-img');
    var lbCaption = lightbox.querySelector('.lightbox-caption');
    var lbInfoBtn = lightbox.querySelector('.lightbox-info-btn');
    var lbInfoPanel = lightbox.querySelector('.lightbox-info-panel');
    var closeBtn = lightbox.querySelector('.lightbox-close');
    var prevBtn = lightbox.querySelector('.lightbox-prev');
    var nextBtn = lightbox.querySelector('.lightbox-next');
    var currentIndex = 0;

    function renderSlide(index) {
      currentIndex = (index + items.length) % items.length;
      var item = items[currentIndex];
      var fullSrc = item.getAttribute('data-full') || item.querySelector('img').src;
      var caption = item.getAttribute('data-caption') || '';
      var info = item.getAttribute('data-info') || '';

      lbImg.src = fullSrc;
      lbImg.alt = caption;
      lbCaption.textContent = caption;

      lbInfoPanel.classList.remove('is-open');
      if (info) {
        lbInfoBtn.style.display = 'flex';
        lbInfoPanel.textContent = info;
      } else {
        lbInfoBtn.style.display = 'none';
      }
    }

    function openLightbox(index) {
      renderSlide(index);
      lightbox.classList.add('is-open');
      document.body.classList.add('lightbox-active');
      lightbox.setAttribute('aria-hidden', 'false');
    }

    function closeLightbox() {
      lightbox.classList.remove('is-open');
      document.body.classList.remove('lightbox-active');
      lightbox.setAttribute('aria-hidden', 'true');
    }

    items.forEach(function (item, index) {
      item.addEventListener('click', function () {
        openLightbox(index);
      });
    });

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    prevBtn.addEventListener('click', function () { renderSlide(currentIndex - 1); });
    nextBtn.addEventListener('click', function () { renderSlide(currentIndex + 1); });
    lbInfoBtn.addEventListener('click', function () {
      lbInfoPanel.classList.toggle('is-open');
    });

    document.addEventListener('keydown', function (e) {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') renderSlide(currentIndex - 1);
      if (e.key === 'ArrowRight') renderSlide(currentIndex + 1);
    });

    /* swipe support on the stage */
    var stage = lightbox.querySelector('.lightbox-stage');
    var touchStartX = null;
    stage.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 40) {
        diff < 0 ? renderSlide(currentIndex + 1) : renderSlide(currentIndex - 1);
      }
      touchStartX = null;
    });
  }

  /* ---------------- Contact page: tab toggle + info popovers ---------------- */
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('.tab[data-target]'));
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-target');
      var target = document.getElementById(targetId);

      tabButtons.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      document.querySelectorAll('.form-section').forEach(function (s) { s.classList.remove('is-active'); });

      btn.setAttribute('aria-pressed', 'true');
      if (target) {
        target.classList.add('is-active');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  if (tabButtons.length) {
    var hash = window.location.hash.replace('#', '');
    if (hash === 'classes' || hash === 'collab') {
      var target = tabButtons.filter(function (b) { return b.getAttribute('data-target') === hash; })[0];
      if (target) target.click();
    }
  }

  var infoToggles = Array.prototype.slice.call(document.querySelectorAll('.info-toggle[data-info-target]'));
infoToggles.forEach(function (btn) {
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var panel = document.getElementById(btn.getAttribute('data-info-target'));
    var isCurrentlyOpen = panel.classList.contains('is-open');

    // close every info panel first
    infoToggles.forEach(function (otherBtn) {
      var otherPanel = document.getElementById(otherBtn.getAttribute('data-info-target'));
      if (otherPanel) otherPanel.classList.remove('is-open');
    });

    // then reopen this one, unless it was already open (so clicking it again closes it)
    if (panel && !isCurrentlyOpen) panel.classList.add('is-open');
  });
});

  /* ---------------- Mobile nav toggle ---------------- */
  var navToggle = document.querySelector('.nav-toggle');
  var mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      mainNav.classList.toggle('is-open');
    });
  }

});
