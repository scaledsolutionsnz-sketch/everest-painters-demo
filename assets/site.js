/* Everest Painters — site behaviour */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- opening animation ---- */
  function closeIntro() { document.body.classList.add('intro-done'); }
  if (reduce) { closeIntro(); }
  else {
    window.addEventListener('load', function () { setTimeout(closeIntro, 620); });
    setTimeout(closeIntro, 2600); // safety net
  }

  /* ---- sticky nav state ---- */
  var nav = document.querySelector('.nav');
  var hero = document.querySelector('.hero');
  function onScroll() {
    if (!nav) return;
    var trigger = hero ? Math.min(window.innerHeight * 0.72, 620) : 30;
    nav.classList.toggle('nav--solid', window.scrollY > trigger);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- mobile drawer ---- */
  var burger = document.querySelector('.burger');
  var drawer = document.querySelector('.drawer');
  function closeMenu() { document.body.classList.remove('menu-open'); }
  if (burger && drawer) {
    burger.addEventListener('click', function () {
      document.body.classList.toggle('menu-open');
      burger.setAttribute('aria-expanded', document.body.classList.contains('menu-open') ? 'true' : 'false');
    });
    drawer.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeMenu();
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---- hero crossfade (paused under reduced motion) ---- */
  var slides = document.querySelectorAll('.hero__slide');
  if (slides.length > 1 && !reduce) {
    var i = 0;
    setInterval(function () {
      slides[i].classList.remove('on');
      i = (i + 1) % slides.length;
      slides[i].classList.add('on');
    }, 5600);
  }

  /* ---- scroll reveals ---- */
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduce) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });

    /* backstop: anything sitting in (or above) the viewport is shown even if the
       observer missed it after a lazy-image layout shift — nothing stays invisible */
    var sweep = function () {
      var h = window.innerHeight || 800;
      items.forEach(function (el) {
        if (el.classList.contains('in')) return;
        if (el.getBoundingClientRect().top < h * 0.94) el.classList.add('in');
      });
    };
    window.addEventListener('scroll', sweep, { passive: true });
    window.addEventListener('load', function () { setTimeout(sweep, 400); });
    setTimeout(sweep, 1400);
  }

  /* ---- Gmail compose links (address assembled in JS, never in the HTML) ---- */
  document.querySelectorAll('a[data-gmail]').forEach(function (a) {
    var to = a.getAttribute('data-user') + '@' + a.getAttribute('data-domain');
    a.href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to) +
      '&su=' + (a.getAttribute('data-su') || '') +
      '&body=' + (a.getAttribute('data-body') || '');
    a.target = '_blank';
    a.rel = 'noopener';
  });

  /* ---- current year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
