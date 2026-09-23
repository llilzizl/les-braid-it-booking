document.addEventListener('DOMContentLoaded', function () {

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
      { label: 'Waist/Hip length', extra: '+£40 · +1hr 30 mins' }
    ] },
    'Small Layered Knotless Braids': { price: 150, hrs: '6 hrs', hairNote: 'Hair included in the price.', addons: [
      { label: 'Colour #1' }, { label: 'Colour #1B' }, { label: 'Colour #2' }, { label: 'Colour #4' },
      { label: 'Other colour (add description/reference to booking form)' },
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
    'Straight Pick & Drop Boho Braids': { price: 140, hrs: '6.5 hrs', hairNote: 'Hair included in the price.', addons: [
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
    'Fulani Crotchet': { price: 60, hrs: '2.25 hrs', addons: [] },
    "The 'Perfect' Sew In Classes": { price: 650, hrs: '~8 hrs', hairNote: 'Hair not included — please bring your own. Equipment included.', addons: [
      { label: '2 Part Sew In', extra: '+£200' },
      { label: 'Flip Over', extra: '+£200' },
      { label: 'Both 2 Part Sew In and Flip Over', extra: '+£350' }
    ] }
  };

  /* ---------------- Booking page: sort + filter services ---------------- */
  var serviceGrid = document.querySelector('.booking-service-grid');
  var serviceSort = document.getElementById('serviceSort');
  var serviceFilter = document.getElementById('serviceFilter');

  if (serviceGrid) {
    var serviceCards = Array.prototype.slice.call(serviceGrid.querySelectorAll('.booking-service-card'));

    var applyServiceControls = function () {
      var sortValue = serviceSort ? serviceSort.value : 'popular';
      var filterValue = serviceFilter ? serviceFilter.value : 'all';

      var visible = serviceCards.filter(function (card) {
        return filterValue === 'all' || card.getAttribute('data-category') === filterValue;
      });

      visible.sort(function (a, b) {
        if (sortValue === 'price-asc') return Number(a.getAttribute('data-price')) - Number(b.getAttribute('data-price'));
        if (sortValue === 'price-desc') return Number(b.getAttribute('data-price')) - Number(a.getAttribute('data-price'));
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
      var calendarCard = availability.querySelector('.calendar-card');
      (calendarCard || availability).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------------- Booking page: calendar navigation ---------------- */
  var calendarGrid = document.querySelector('.calendar-grid');
  var calendarHeading = document.querySelector('.calendar-heading h3');
  var calendarNavBtns = Array.prototype.slice.call(document.querySelectorAll('.calendar-heading .lightbox-nav'));
  var prevMonthBtn = calendarNavBtns[0];
  var nextMonthBtn = calendarNavBtns[1];
  var timeOptionsHeading = document.querySelector('.time-options-heading');
  var timeOptionsContainer = document.querySelector('.time-options');
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var AVAILABLE_DAYS = [1, 2, 4, 5, 8, 11, 14, 16, 21, 24, 29];
  var TIME_POOL = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];
  var calendarDate = new Date(2026, 8, 1);

  function displayTime(value) {
    var parts = value.split(':');
    return parseInt(parts[0], 10) + ':' + parts[1];
  }

  function timesForDay(day) {
    var count = 4 + (day % 3);
    var start = (day * 2) % (TIME_POOL.length - count);
    return TIME_POOL.slice(start, start + count);
  }

  function resetTimeOptions() {
    if (!timeOptionsContainer) return;
    timeOptionsContainer.innerHTML = '';
    if (timeOptionsHeading) timeOptionsHeading.textContent = 'Select a date to see available times';
  }

  function renderTimeOptions(day, monthLabel) {
    if (!timeOptionsContainer) return;
    var times = timesForDay(day);
    if (timeOptionsHeading) timeOptionsHeading.textContent = 'Available times for ' + monthLabel + ' ' + day;
    timeOptionsContainer.innerHTML = times.map(function (t) {
      return '<label class="time-option"><input type="radio" name="time" value="' + t + '">' + displayTime(t) + '</label>';
    }).join('');
  }

  function renderCalendar() {
    if (!calendarGrid || !calendarHeading) return;
    var year = calendarDate.getFullYear();
    var month = calendarDate.getMonth();
    var monthLabel = MONTH_NAMES[month] + ' ' + year;
    calendarHeading.textContent = monthLabel;
    calendarGrid.setAttribute('aria-label', monthLabel + ' calendar');

    var html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) {
      return '<span class="weekday">' + d + '</span>';
    }).join('');

    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    for (var i = 0; i < firstDay; i++) html += '<span></span>';
    for (var day = 1; day <= daysInMonth; day++) {
      html += AVAILABLE_DAYS.indexOf(day) !== -1
        ? '<button class="is-available" type="button">' + day + '</button>'
        : '<span>' + day + '</span>';
    }

    calendarGrid.innerHTML = html;
    resetTimeOptions();
  }

  if (calendarGrid) {
    renderCalendar();

    calendarGrid.addEventListener('click', function (e) {
      if (e.target.tagName !== 'BUTTON') return;
      Array.prototype.slice.call(calendarGrid.querySelectorAll('button')).forEach(function (btn) { btn.classList.remove('is-selected'); });
      e.target.classList.add('is-selected');
      renderTimeOptions(parseInt(e.target.textContent, 10), MONTH_NAMES[calendarDate.getMonth()]);
    });

    if (prevMonthBtn) prevMonthBtn.addEventListener('click', function () {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      renderCalendar();
    });
    if (nextMonthBtn) nextMonthBtn.addEventListener('click', function () {
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

});
