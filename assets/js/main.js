document.addEventListener('DOMContentLoaded', function () {

  /* ---------------- Background decoration ----------------
     Chosen by the data-decor attribute on <body>:
       data-decor="swirl" (home)    -> glowing swirl, assets/js/swirls.js
       data-decor="neon"  (booking) -> neon sparkle field, assets/js/neon-sparkles.js
       no data-decor (all others)   -> floating sparkles, assets/js/sparkles.js */
  var decorScripts = {
    swirl: 'assets/js/swirls.js',
    neon: 'assets/js/neon-sparkles.js'
  };
  var decorScript = document.createElement('script');
  decorScript.src = decorScripts[document.body.getAttribute('data-decor')] || 'assets/js/sparkles.js';
  document.body.appendChild(decorScript);

  /* ---------------- Service detail page: image gallery ---------------- */
  Array.prototype.slice.call(document.querySelectorAll('.service-gallery')).forEach(function (gallery) {
    var img = gallery.querySelector('img');
    var prevBtn = gallery.querySelector('.service-gallery-prev');
    var nextBtn = gallery.querySelector('.service-gallery-next');
    var images = (gallery.getAttribute('data-images') || '').split('|').filter(Boolean);
    if (!img || images.length < 2) return;
    var index = 0;

    function renderGalleryImage() { img.src = images[index]; }

    if (prevBtn) prevBtn.addEventListener('click', function () {
      index = (index - 1 + images.length) % images.length;
      renderGalleryImage();
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      index = (index + 1) % images.length;
      renderGalleryImage();
    });
  });

  /* ---------------- Service detail page: click image to enlarge ---------------- */
  var serviceGalleryImgs = Array.prototype.slice.call(document.querySelectorAll('.service-gallery img'));
  var serviceLightbox = document.querySelector('.lightbox');
  if (serviceGalleryImgs.length && serviceLightbox) {
    var slImg = serviceLightbox.querySelector('.lightbox-img');
    var slCaption = serviceLightbox.querySelector('.lightbox-caption');
    var slClose = serviceLightbox.querySelector('.lightbox-close');

    function openServiceLightbox(sourceImg) {
      slImg.src = sourceImg.src;
      slImg.alt = sourceImg.alt;
      if (slCaption) slCaption.textContent = sourceImg.alt;
      serviceLightbox.classList.add('is-open');
      serviceLightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lightbox-active');
    }

    function closeServiceLightbox() {
      serviceLightbox.classList.remove('is-open');
      serviceLightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lightbox-active');
    }

    serviceGalleryImgs.forEach(function (img) {
      img.addEventListener('click', function () { openServiceLightbox(img); });
    });
    if (slClose) slClose.addEventListener('click', closeServiceLightbox);
    serviceLightbox.addEventListener('click', function (e) {
      if (e.target === serviceLightbox) closeServiceLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (serviceLightbox.classList.contains('is-open') && e.key === 'Escape') closeServiceLightbox();
    });
  }

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
    if (panel && !isCurrentlyOpen) {
      panel.classList.add('is-open');
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});

  /* ---------------- Booking page: services data ---------------- */
  var SERVICES = {
    'Extra Small Layered Box Braid': { price: 200, hrs: '7.5 hrs', hairNote: 'Hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #1B' }, { label: 'Colour #2' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' },
      { label: 'Ombre', extra: '+£15 · +30 mins' },
      { label: 'Waist/Hip length', extra: '+£40 · +1hr 30 mins' }
    ] },
    'Small Layered Knotless Braids': { price: 150, hrs: '6 hrs', hairNote: 'Hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #1B' }, { label: 'Colour #2' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' },
      { label: 'Ombre', extra: '+£15 · +30 mins' },
      { label: 'Waist/Hip length', extra: '+£35 · +1hr' }
    ] },
    'Smedium Layered Knotless Braids': { price: 130, hrs: '5 hrs', hairNote: 'Hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #1B' }, { label: 'Colour #2' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' },
      { label: 'Waist/Hip length', extra: '+£30 · +40 mins' }
    ] },
    "The 'Perfect' U Part Install": { price: 90, hrs: '4 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'Layers' }, { label: 'Curls' }, { label: 'Crimp' }, { label: 'Straighten' }
    ] },
    "The 'Perfect' Sew In": { price: 130, hrs: '5 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'Layers' }, { label: 'Curls' }, { label: 'Crimp' }, { label: 'Straighten' },
      { label: '2 Part Sew In', extra: '+£50 · +1hr' },
      { label: 'Flip Over', extra: '+£30 · +30 mins' }
    ] },
    'Flip Over (Minimal leave out - Ivy Method)': { price: 120, hrs: '4 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'Layers' }, { label: 'Curl' }, { label: 'Define curls' }, { label: 'Crimp' }, { label: 'Straighten' }
    ] },
    'Micro Braids w/Sew In': { price: 130, hrs: '6 hrs', hairNote: 'Braiding hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #1B' }, { label: 'Colour #2' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' }
    ] },
    'Fulani Sew In': { price: 85, hrs: '3 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'No gel' }, { label: 'Crimp' }, { label: 'Curl' }, { label: 'Define curls' }, { label: 'Straighten' }, { label: 'Layers' }
    ] },
    'Cassie Sew In': { price: 85, hrs: '3 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'No gel' }, { label: 'Crimp' }, { label: 'Curl' }, { label: 'Define curls' }, { label: 'Straighten' }, { label: 'Layers' }
    ] },
    'Patewo/Shuku and Base': { price: 100, hrs: '4 hrs', hairNote: 'Hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #2' }, { label: 'Colour #1B' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' },
      { label: 'French Curl (hair included)', extra: '+£10' }
    ] },
    'Small Lemonade Braids': { price: 100, hrs: '4 hrs', hairNote: 'Hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #2' }, { label: 'Colour #1B' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' },
      { label: '5–6 rows of braids in the back', extra: '+£10 · +20 mins' }
    ] },
    'Straight Pick & Drop Boho Braids': { price: 140, hrs: '6.5 hrs', hairNote: 'Braiding hair included in the price.', addons: [
      { label: 'Layers' }
    ] },
    "'Cassie' Small Knotless BOHO French Curl": { price: 110, hrs: '5 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'No gel' }, { label: 'Bangs' }
    ] },
    'Small Knotless BOHO French Curl': { price: 130, hrs: '7 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'No gel' }, { label: 'Bangs' }
    ] },
    'Smedium Knotless BOHO French Curl': { price: 120, hrs: '5.5 hrs', hairNote: 'Hair not included — please bring your own.', addons: [
      { label: 'No gel' }, { label: 'Bangs' }
    ] },
    'Fulani Style': { price: 30, hrs: '1.5 hrs', addons: [
      { label: 'No gel' }, { label: 'Marley hair (included)', extra: '+£5' }
    ] },
    'Flat Twist': { price: 30, hrs: '2 hrs', addons: [
      { label: 'No gel' }, { label: 'Marley hair (included)', extra: '+£5' }
    ] },
    'Small Mini Twist / Mini Braids': { price: 40, hrs: '2 hrs', addons: [
      { label: 'No gel' }, { label: 'Marley hair (included)', extra: '+£5' }
    ] },
    'Shuku/Patewo (and Base)': { price: 30, hrs: '1.5 hrs', addons: [
      { label: 'No gel' }, { label: 'Marley hair (included)', extra: '+£5' }
    ] },
    'Extra Small Layered Braids Takedown': { price: 55, hrs: '3 hrs', hairNote: 'Wash & blow dry included.', addons: [] },
    "The 'Perfect' Sew In Takedown": { price: 30, hrs: '2 hrs', hairNote: 'Wash & blow dry included.', addons: [] },
    'Fulani Crochet': { price: 60, hrs: '2.25 hrs', addons: [] },
    "The 'Perfect' Sew In Classes": { comingSoon: true, hairNote: 'Hair not included — please bring your own. Equipment included.', addons: [
      { label: '2 Part Sew In' },
      { label: 'Flip Over' },
      { label: 'Both 2 Part Sew In and Flip Over' }
    ] }
  };

  /* ---------------- Booking page: sort + filter services ---------------- */
  var serviceGrid = document.querySelector('.booking-service-grid');
  var serviceSort = document.getElementById('serviceSort');
  var serviceFilter = document.getElementById('serviceFilter');

  if (serviceGrid) {
    var serviceCards = Array.prototype.slice.call(serviceGrid.querySelectorAll('.booking-service-card'));
    var siteLogo = document.querySelector('.site-header .logo');
    var defaultLogo = siteLogo ? { src: siteLogo.getAttribute('src'), alt: siteLogo.alt } : null;

    var applyServiceControls = function () {
      var sortValue = serviceSort ? serviceSort.value : 'popular';
      var filterValue = serviceFilter ? serviceFilter.value : 'all';

      // Classes belong to the academy, so show the academy logo while that category is filtered
      if (siteLogo) {
        var isClasses = filterValue === 'Classes';
        siteLogo.setAttribute('src', isClasses ? 'assets/images/acadamy-logo.png' : defaultLogo.src);
        siteLogo.alt = isClasses ? 'Les Braid It Academy' : defaultLogo.alt;
      }

      var visible = serviceCards.filter(function (card) {
        return filterValue === 'all' || card.getAttribute('data-category') === filterValue;
      });

      visible.sort(function (a, b) {
        if (sortValue === 'price-asc' || sortValue === 'price-desc') {
          // Cards with no price yet ("coming soon") always go last.
          var priceA = a.getAttribute('data-price'), priceB = b.getAttribute('data-price');
          if (!priceA || !priceB) return (priceA ? 0 : 1) - (priceB ? 0 : 1);
          return sortValue === 'price-asc' ? priceA - priceB : priceB - priceA;
        }
        var popularA = a.getAttribute('data-popular') === 'true' ? 0 : 1;
        var popularB = b.getAttribute('data-popular') === 'true' ? 0 : 1;
        return popularA - popularB;
      });

      serviceCards.forEach(function (card) { card.hidden = true; });
      visible.forEach(function (card) {
        card.hidden = false;
        serviceGrid.appendChild(card);
      });
    };

    if (serviceSort) serviceSort.addEventListener('change', applyServiceControls);
    if (serviceFilter) serviceFilter.addEventListener('change', applyServiceControls);

    // Pre-select a category when linked from the home page, e.g. booking.html?category=Weave%20Styles
    var categoryParam = new URLSearchParams(window.location.search).get('category');
    if (serviceFilter && categoryParam) {
      var matchingOption = Array.prototype.slice.call(serviceFilter.options).filter(function (opt) {
        return opt.value === categoryParam;
      })[0];
      if (matchingOption) serviceFilter.value = categoryParam;
    }

    applyServiceControls();
  }

  /* ---------------- Booking page: add-ons and availability ---------------- */
  var bookingModal = document.querySelector('.booking-modal');
  var openBookingBtns = Array.prototype.slice.call(document.querySelectorAll('.open-booking-modal'));
  var closeBookingBtn = document.querySelector('.booking-modal-close');
  var continueBookingBtn = document.querySelector('.continue-booking');
  var availability = document.querySelector('.availability');
  var selectedAddons = document.querySelector('.selected-addons');
  var selectedServiceName = document.querySelector('.selected-service-name');
  var modalServiceName = document.querySelector('.modal-service-name');
  var modalServicePrice = document.querySelector('.modal-service-price');
  var modalServiceHrs = document.querySelector('.modal-service-hrs');
  var modalServiceHairNote = document.querySelector('.modal-service-hair-note');
  var addonsLabel = document.querySelector('.addons-label');
  var addonList = document.querySelector('.addon-list');
  var selectedService = null;

  function closeBookingModal() {
    if (!bookingModal) return;
    bookingModal.classList.remove('is-open');
    bookingModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-active');
  }

  function renderAddons(addons) {
    if (!addonList) return;
    addonList.innerHTML = '';
    var hasAddons = addons && addons.length;
    if (addonsLabel) addonsLabel.hidden = !hasAddons;
    addonList.hidden = !hasAddons;
    if (!hasAddons) return;
    addons.forEach(function (addon) {
      var label = document.createElement('label');
      label.className = 'addon-option';
      var extraAttr = addon.extra ? ' data-extra="' + addon.extra + '"' : '';
      label.innerHTML = '<span><input type="checkbox" value="' + addon.label + '"' + extraAttr + '>' + addon.label + '</span><span>' + (addon.extra || '') + '</span>';
      addonList.appendChild(label);
    });
  }

  function parseAddonPrice(extra) {
    var match = extra && extra.match(/£(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  function parseAddonHours(extra) {
    if (!extra) return 0;
    var hrMatch = extra.match(/(\d+(?:\.\d+)?)\s*hr/);
    var minMatch = extra.match(/(\d+)\s*min/);
    var hours = hrMatch ? parseFloat(hrMatch[1]) : 0;
    var minutes = minMatch ? parseFloat(minMatch[1]) : 0;
    return hours + minutes / 60;
  }

  function formatDuration(totalHours) {
    var totalMinutes = Math.round(totalHours * 60);
    var hrs = Math.floor(totalMinutes / 60);
    var mins = totalMinutes % 60;
    if (mins === 0) return hrs + (hrs === 1 ? ' hr' : ' hrs');
    if (mins === 30) return (hrs + 0.5) + ' hrs';
    var parts = [];
    if (hrs) parts.push(hrs + (hrs === 1 ? 'hr' : 'hrs'));
    parts.push(mins + ' mins');
    return parts.join(' ');
  }

  function updateModalTotals() {
    if (!selectedService) return;
    var service = SERVICES[selectedService] || {};
    var baseHoursMatch = service.hrs && service.hrs.match(/(\d+(?:\.\d+)?)/);
    var totalPrice = service.price || 0;
    var totalHours = baseHoursMatch ? parseFloat(baseHoursMatch[1]) : 0;

    Array.prototype.slice.call(addonList.querySelectorAll('input:checked')).forEach(function (input) {
      var extra = input.getAttribute('data-extra');
      totalPrice += parseAddonPrice(extra);
      totalHours += parseAddonHours(extra);
    });

    if (service.comingSoon) {
      if (modalServicePrice) modalServicePrice.textContent = 'Price coming soon';
      if (modalServiceHrs) modalServiceHrs.textContent = '· Time coming soon';
      return;
    }
    if (modalServicePrice) modalServicePrice.textContent = '£' + totalPrice;
    if (modalServiceHrs) modalServiceHrs.textContent = totalHours ? '· ' + formatDuration(totalHours) : '';
  }

  if (addonList) {
    addonList.addEventListener('change', updateModalTotals);
  }

  if (bookingModal && openBookingBtns.length) {
    openBookingBtns.forEach(function (openBookingBtn) {
      openBookingBtn.addEventListener('click', function () {
        selectedService = openBookingBtn.getAttribute('data-service');
        var service = SERVICES[selectedService] || {};
        if (selectedServiceName) selectedServiceName.textContent = selectedService;
        if (modalServiceName) modalServiceName.textContent = selectedService;
        if (modalServiceHairNote) modalServiceHairNote.textContent = service.hairNote || '';
        renderAddons(service.addons);
        updateModalTotals();
        bookingModal.classList.add('is-open');
        bookingModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('lightbox-active');
      });
    });
    closeBookingBtn.addEventListener('click', closeBookingModal);
    bookingModal.addEventListener('click', function (e) {
      if (e.target === bookingModal) closeBookingModal();
    });
  }

  /* ---------------- Booking page: custom style request modal ---------------- */
  var customModal = document.querySelector('.custom-modal');
  var openCustomModalBtns = Array.prototype.slice.call(document.querySelectorAll('.open-custom-modal'));
  var closeCustomModalBtn = document.querySelector('.custom-modal-close');

  function closeCustomModal() {
    if (!customModal) return;
    customModal.classList.remove('is-open');
    customModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-active');
  }

  if (customModal && openCustomModalBtns.length) {
    openCustomModalBtns.forEach(function (openCustomModalBtn) {
      openCustomModalBtn.addEventListener('click', function () {
        customModal.classList.add('is-open');
        customModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('lightbox-active');
      });
    });
    if (closeCustomModalBtn) closeCustomModalBtn.addEventListener('click', closeCustomModal);
    customModal.addEventListener('click', function (e) {
      if (e.target === customModal) closeCustomModal();
    });
  }

  if (continueBookingBtn && availability) {
    continueBookingBtn.addEventListener('click', function () {
      var chosen = Array.prototype.slice.call(document.querySelectorAll('.addon-option input:checked'));
      selectedAddons.textContent = chosen.length ? 'Add-ons: ' + chosen.map(function (input) { return input.value; }).join(', ') : 'No add-ons selected';
      closeBookingModal();
      availability.classList.add('is-visible');
      renderCalendar();
      var calendarCard = availability.querySelector('.calendar-card');
      (calendarCard || availability).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

/* ---------------- Booking page: calendar (live availability from Supabase) ---------------- */
  var calendarGrid = document.querySelector('.calendar-grid');
  var calendarHeading = document.querySelector('.calendar-heading h3');
  var calendarNavBtns = Array.prototype.slice.call(document.querySelectorAll('.calendar-heading .lightbox-nav'));
  var prevMonthBtn = calendarNavBtns[0];
  var nextMonthBtn = calendarNavBtns[1];
  var timeOptionsHeading = document.querySelector('.time-options-heading');
  var timeOptionsContainer = document.querySelector('.time-options');
  var bookingForm = document.querySelector('.booking-details-form');
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Booking rules. Change these numbers to change the rules.
  var MIN_NOTICE_DAYS = 4;       // earliest bookable day is today + 4 days
  var MAX_MONTHS_AHEAD = 1;      // latest bookable day is 1 month from today
  var SLOT_STEP_MINUTES = 30;    // a start time every 30 minutes
  var DEFAULT_BUFFER_MINUTES = 15;

  // One shared Supabase connection for the calendar and the booking form
  var sharedConfig = window.LBI_SUPABASE || {};
  var sharedDb = null;
  if (window.supabase && sharedConfig.url && sharedConfig.anonKey) {
    sharedDb = window.LBI_DB || window.supabase.createClient(sharedConfig.url, sharedConfig.anonKey);
  }

  var workingHours = null;   // working_hours rows, keyed by day of week (0 = Sunday)
  var serviceRules = {};     // services rows, keyed by style name
  var rulesPromise = null;
  var availableSlots = {};   // day of month -> list of start times
  var renderToken = 0;
  var selectedDay = null;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function toMinutes(t) { var p = String(t).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function minutesToTime(m) { return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }

  function displayTime(value) {
    var parts = value.split(':');
    return parseInt(parts[0], 10) + ':' + parts[1];
  }

  function bookingWindow() {
    var now = new Date();
    return {
      first: new Date(now.getFullYear(), now.getMonth(), now.getDate() + MIN_NOTICE_DAYS),
      last: new Date(now.getFullYear(), now.getMonth() + MAX_MONTHS_AHEAD, now.getDate())
    };
  }

  var calendarDate = (function () {
    var w = bookingWindow();
    return new Date(w.first.getFullYear(), w.first.getMonth(), 1);
  })();

  // How long the chosen style (plus any add-ons) takes, and the gap needed after it
  function currentBooking() {
    if (!selectedService) return null;
    var service = SERVICES[selectedService] || {};
    var match = service.hrs && service.hrs.match(/(\d+(?:\.\d+)?)/);
    var hours = match ? parseFloat(match[1]) : 0;
    if (addonList) {
      Array.prototype.slice.call(addonList.querySelectorAll('input:checked')).forEach(function (input) {
        hours += parseAddonHours(input.getAttribute('data-extra'));
      });
    }
    var rule = serviceRules[selectedService];
    return {
      duration: Math.round(hours * 60),
      buffer: rule && rule.buffer_minutes != null ? rule.buffer_minutes : DEFAULT_BUFFER_MINUTES
    };
  }

  function loadRules() {
    if (rulesPromise) return rulesPromise;
    rulesPromise = Promise.all([
      sharedDb.from('working_hours').select('*'),
      sharedDb.from('services').select('name, buffer_minutes, deposit_amount')
    ]).then(function (results) {
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      workingHours = {};
      (results[0].data || []).forEach(function (row) { workingHours[row.day_of_week] = row; });
      (results[1].data || []).forEach(function (row) { serviceRules[row.name] = row; });
    }).catch(function (err) {
      rulesPromise = null;
      throw err;
    });
    return rulesPromise;
  }

  function loadMonthData(year, month) {
    var from = dateKey(new Date(year, month, 1));
    var to = dateKey(new Date(year, month + 1, 0));
    return Promise.all([
      sharedDb.from('blocked_dates').select('blocked_date').gte('blocked_date', from).lte('blocked_date', to),
      sharedDb.rpc('get_busy_slots', { from_date: from, to_date: to })
    ]).then(function (results) {
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      var blocked = {};
      var busy = {};
      (results[0].data || []).forEach(function (row) { blocked[row.blocked_date] = true; });
      (results[1].data || []).forEach(function (row) {
        var start = toMinutes(row.start_time);
        (busy[row.booking_date] = busy[row.booking_date] || []).push({ start: start, end: start + row.block_minutes });
      });
      return { blocked: blocked, busy: busy };
    });
  }

  // Start times on one date: inside working hours, not blocked, not clashing with another booking
  function slotsForDate(date, need, data) {
    var key = dateKey(date);
    var hours = workingHours[date.getDay()];
    if (!hours || !hours.is_open || !hours.open_time || !hours.close_time) return [];
    if (data.blocked[key]) return [];
    var open = toMinutes(hours.open_time);
    var close = toMinutes(hours.close_time);
    var busy = data.busy[key] || [];
    var slots = [];
    for (var start = open; start + need.duration <= close; start += SLOT_STEP_MINUTES) {
      var end = start + need.duration + need.buffer;
      var clash = false;
      for (var i = 0; i < busy.length; i++) {
        if (start < busy[i].end && end > busy[i].start) { clash = true; break; }
      }
      if (!clash) slots.push(minutesToTime(start));
    }
    return slots;
  }

  function updateNavButtons() {
    var w = bookingWindow();
    var thisMonth = calendarDate.getFullYear() * 12 + calendarDate.getMonth();
    var firstMonth = w.first.getFullYear() * 12 + w.first.getMonth();
    var lastMonth = w.last.getFullYear() * 12 + w.last.getMonth();
    if (prevMonthBtn) { prevMonthBtn.disabled = thisMonth <= firstMonth; prevMonthBtn.style.opacity = prevMonthBtn.disabled ? 0.3 : 1; }
    if (nextMonthBtn) { nextMonthBtn.disabled = thisMonth >= lastMonth; nextMonthBtn.style.opacity = nextMonthBtn.disabled ? 0.3 : 1; }
  }

  function resetTimeOptions(message) {
    if (!timeOptionsContainer) return;
    timeOptionsContainer.innerHTML = '';
    if (timeOptionsHeading) timeOptionsHeading.textContent = message || 'Select a date to see available times';
    if (bookingForm) bookingForm.hidden = true;
  }

  function renderTimeOptions(day, monthLabel) {
    if (!timeOptionsContainer) return;
    var times = availableSlots[day] || [];
    if (timeOptionsHeading) timeOptionsHeading.textContent = 'Available times for ' + monthLabel + ' ' + day;
    timeOptionsContainer.innerHTML = times.map(function (t) {
      return '<label class="time-option"><input type="radio" name="time" value="' + t + '">' + displayTime(t) + '</label>';
    }).join('');
    if (bookingForm) bookingForm.hidden = true;
  }

  function drawGrid(year, month) {
    var html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) {
      return '<span class="weekday">' + d + '</span>';
    }).join('');
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    for (var i = 0; i < firstDay; i++) html += '<span></span>';
    for (var day = 1; day <= daysInMonth; day++) {
      html += availableSlots[day]
        ? '<button class="is-available" type="button">' + day + '</button>'
        : '<span>' + day + '</span>';
    }
    calendarGrid.innerHTML = html;
  }

  function renderCalendar() {
    if (!calendarGrid || !calendarHeading) return;
    var year = calendarDate.getFullYear();
    var month = calendarDate.getMonth();
    var monthLabel = MONTH_NAMES[month] + ' ' + year;
    calendarHeading.textContent = monthLabel;
    calendarGrid.setAttribute('aria-label', monthLabel + ' calendar');

    var token = ++renderToken;
    selectedDay = null;
    availableSlots = {};
    drawGrid(year, month);
    updateNavButtons();

    if (!sharedDb || !selectedService) {
      resetTimeOptions(selectedService ? 'Online booking is not available right now' : 'Choose a style to see available dates');
      return;
    }
    resetTimeOptions('Checking availability...');

    Promise.all([loadRules(), loadMonthData(year, month)]).then(function (results) {
      if (token !== renderToken) return;   // the person has already moved on
      var data = results[1];
      var need = currentBooking();         // read again now the gap for this style is known
      var w = bookingWindow();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var count = 0;
      for (var day = 1; day <= daysInMonth; day++) {
        var date = new Date(year, month, day);
        if (date < w.first || date > w.last) continue;
        var slots = slotsForDate(date, need, data);
        if (slots.length) { availableSlots[day] = slots; count++; }
      }
      drawGrid(year, month);
      resetTimeOptions(count ? 'Select a date to see available times' : 'No available dates this month. Try another month.');
    }).catch(function (err) {
      if (token !== renderToken) return;
      console.error('Availability failed to load:', err);
      resetTimeOptions('Could not load availability. Please refresh the page and try again.');
    });
  }

  if (calendarGrid) {
    renderCalendar();

    calendarGrid.addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') return;
      Array.prototype.slice.call(calendarGrid.querySelectorAll('button')).forEach(function (btn) { btn.classList.remove('is-selected'); });
      e.target.classList.add('is-selected');
      selectedDay = parseInt(e.target.textContent, 10);
      renderTimeOptions(selectedDay, MONTH_NAMES[calendarDate.getMonth()]);
    });

    if (prevMonthBtn) prevMonthBtn.addEventListener('click', function () {
      if (prevMonthBtn.disabled) return;
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      renderCalendar();
    });
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', function () {
      if (nextMonthBtn.disabled) return;
      calendarDate.setMonth(calendarDate.getMonth() + 1);
      renderCalendar();
    });
  }
  /* ---------------- Booking page: time slot selection ---------------- */
  if (timeOptionsContainer) {
    timeOptionsContainer.addEventListener('change', function (e) {
      if (e.target.tagName !== 'INPUT') return;
      Array.prototype.slice.call(timeOptionsContainer.querySelectorAll('.time-option')).forEach(function (opt) { opt.classList.remove('is-selected'); });
      e.target.closest('.time-option').classList.add('is-selected');
      if (bookingForm) {
        bookingForm.hidden = false;
        if (typeof refreshSubmitLabel === 'function') refreshSubmitLabel();
      }
    });
  }

  /* ---------------- Booking: your details + save to Supabase ---------------- */
  if (bookingForm) {
    var bookingStatus = bookingForm.querySelector('.member-status');
    var lbiConfig = window.LBI_SUPABASE || {};
    var bookingDb = null;
    var bookingMemberId = null;
    if (window.supabase && lbiConfig.url && lbiConfig.anonKey) {
       bookingDb = sharedDb;
    }

    var showBookingStatus = function (message, type) {
      bookingStatus.textContent = message;
      bookingStatus.className = 'member-status is-' + (type || 'error');
      bookingStatus.hidden = false;
    };

    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    // Button text shows the deposit for the chosen style, e.g. "Pay £20 deposit"
    var submitLabel = function () {
      var rule = serviceRules[selectedService];
      var amount = rule && rule.deposit_amount != null ? Number(rule.deposit_amount) : null;
      return amount ? 'Pay £' + amount + ' deposit to book' : 'Continue to payment';
    };
    var resetSubmit = function () {
      var btn = bookingForm.querySelector('[type="submit"]');
      btn.disabled = !bookingDb;
      btn.textContent = submitLabel();
    };
    var refreshSubmitLabel = function () {
      var btn = bookingForm.querySelector('[type="submit"]');
      if (!btn.disabled) btn.textContent = submitLabel();
    };

    // Coming back from the payment page (back button, or cancelled)
    window.addEventListener('pageshow', function (event) { if (event.persisted && bookingDb) resetSubmit(); });
    if (/[?&]cancelled=1/.test(window.location.search)) {
      var cancelNote = document.createElement('p');
      cancelNote.className = 'member-status is-info';
      cancelNote.setAttribute('role', 'status');
      cancelNote.textContent = 'Payment cancelled, so no booking was made. Your time was not reserved. You can choose a time and try again.';
      bookingForm.parentNode.insertBefore(cancelNote, bookingForm.parentNode.firstChild);
    }

    if (!bookingDb) {
      showBookingStatus('Online booking is being set up and will be available soon. Please get in touch on the contact page to book.', 'info');
      bookingForm.querySelector('[type="submit"]').disabled = true;
    } else {
      // Logged in members: fill in their details and link the booking to their account
      bookingDb.auth.getSession().then(function (result) {
        var session = result.data.session;
        if (!session) return;
        var details = session.user.user_metadata || {};
        bookingMemberId = session.user.id;
        if (!bookingForm.fullname.value) bookingForm.fullname.value = details.full_name || '';
        if (!bookingForm.email.value) bookingForm.email.value = session.user.email || '';
        if (!bookingForm.phone.value) bookingForm.phone.value = details.phone || '';
      });
    }

    bookingForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!bookingDb) return;
      bookingStatus.hidden = true;

      var time = timeOptionsContainer.querySelector('input:checked');
      var name = bookingForm.fullname.value.trim();
      var email = bookingForm.email.value.trim();
      var phone = bookingForm.phone.value.trim();
      if (!selectedService || !selectedDay || !time) return showBookingStatus('Please choose a service, date and time first.');
      if (!name) return showBookingStatus('Please enter your full name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return showBookingStatus('Please enter a valid email address.');
      if (!phone) return showBookingStatus('Please enter your phone number.');

      var addons = Array.prototype.slice.call(addonList.querySelectorAll('input:checked')).map(function (input) { return input.value; });
      var submitBtn = bookingForm.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait…';

      var chosen = currentBooking() || {};
      var details = {
        name: name,
        email: email,
        phone: phone,
        service: selectedService,
        addons: addons.length ? addons.join(', ') : '',
        duration: chosen.duration,
        date: calendarDate.getFullYear() + '-' + pad(calendarDate.getMonth() + 1) + '-' + pad(selectedDay),
        time: time.value
      };

      // The server re-checks every rule, saves the unpaid booking, and returns a Stripe payment page
      bookingDb.auth.getSession().then(function (result) {
        var session = result.data && result.data.session;
        return fetch(lbiConfig.url + '/functions/v1/create-checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': lbiConfig.anonKey,
            'Authorization': 'Bearer ' + (session ? session.access_token : lbiConfig.anonKey)
          },
          body: JSON.stringify(details)
        });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
      }).then(function (out) {
        if (out.ok && out.body.url) {
          submitBtn.textContent = 'Taking you to payment…';
          window.location.href = out.body.url;
          return;
        }
        resetSubmit();
        showBookingStatus(out.body.error || 'Something went wrong and your booking wasn’t saved. Please try again.');
        // A time that was just taken: refresh the calendar so it disappears
        if (out.body.code === 'slot_taken' || out.body.code === 'date_unavailable') {
          renderCalendar();
        }
      }).catch(function () {
        resetSubmit();
        showBookingStatus('Could not reach the booking service. Please check your connection and try again.');
      });
    });
  }

  var editBookingBtn = document.querySelector('[data-edit-booking]');
  if (editBookingBtn && bookingModal) {
    editBookingBtn.addEventListener('click', function () {
      bookingModal.classList.add('is-open');
      bookingModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lightbox-active');
    });
  }

  /* ---------------- Policies page: filter sections ---------------- */
  var policyFilterBtns = Array.prototype.slice.call(document.querySelectorAll('.policy-filters .tab[data-filter]'));
  var policySections = Array.prototype.slice.call(document.querySelectorAll('[data-category]'));

  if (policyFilterBtns.length && policySections.length) {
    policyFilterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var filterValue = btn.getAttribute('data-filter');

        policyFilterBtns.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');

        policySections.forEach(function (section) {
          section.hidden = filterValue !== 'all' && section.getAttribute('data-category') !== filterValue;
        });

        if (filterValue !== 'all') {
          var target = policySections.filter(function (section) { return section.getAttribute('data-category') === filterValue; })[0];
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // A link like policies.html#hair-prep opens straight on that tab
    var policyHash = window.location.hash.replace('#', '');
    var hashBtn = policyFilterBtns.filter(function (b) { return b.getAttribute('data-filter') === policyHash; })[0];
    if (hashBtn) hashBtn.click();
  }

  /* ---------------- Book buttons: show the full style name on one line ---------------- */
  // Each button starts at its normal size and shrinks its own text just enough to fit.
  var bookButtons = Array.prototype.slice.call(document.querySelectorAll('.service-book-now'));
  var MIN_BOOK_TEXT = 9; // px: smallest size before we let the text wrap instead
  function fitBookButtons() {
    bookButtons.forEach(function (btn) {
      btn.style.fontSize = '';
      btn.classList.remove('is-wrapped');
      if (!btn.offsetWidth) return; // hidden right now, checked again on resize
      var cs = getComputedStyle(btn);
      var space = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // Measure the text on one line in a hidden copy with the same font
      var probe = document.createElement('span');
      probe.textContent = btn.textContent;
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;' +
        'font:' + cs.font + ';letter-spacing:' + cs.letterSpacing + ';text-transform:' + cs.textTransform;
      document.body.appendChild(probe);
      var textWidth = probe.getBoundingClientRect().width;
      probe.remove();
      var size = parseFloat(cs.fontSize);
      if (textWidth <= space - 2) return;
      var fitted = Math.floor(size * space / textWidth * 4) / 4 - 0.25; // a little room to spare
      if (fitted >= MIN_BOOK_TEXT) btn.style.fontSize = fitted + 'px';
      else btn.classList.add('is-wrapped');
    });
  }
  if (bookButtons.length) {
    fitBookButtons();
    window.addEventListener('resize', fitBookButtons);
    window.addEventListener('load', fitBookButtons);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBookButtons);
  }

  /* ---------------- Mobile nav toggle ---------------- */
  var navToggle = document.querySelector('.nav-toggle');
  var mainNav = document.querySelector('.main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', mainNav.classList.contains('is-open') ? 'true' : 'false');
    });
  }


  /* ---------------- Before / after slider ---------------- */
  document.querySelectorAll('.before-after').forEach(function (slider) {
    var range = slider.querySelector('.before-after-range');
    if (!range) return;
    range.addEventListener('input', function () {
      slider.style.setProperty('--pos', range.value + '%');
    });
  });

});
