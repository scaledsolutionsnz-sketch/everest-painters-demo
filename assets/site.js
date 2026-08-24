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
  if (nav) {
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        nav.classList.toggle('nav--solid', es[0].intersectionRatio < 0.3);
      }, { threshold: [0, 0.3, 1] }).observe(hero);
    } else {
      nav.classList.add('nav--solid');
    }
  }

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

  /* ---- rotating hero review ---- */
  var rotq = document.getElementById('rotq');
  if (rotq && !reduce) {
    var quotes = [
      { t: '"I can\'t speak highly enough of the beautiful job James did on the interior and exterior of my two storied house. He goes the extra mile."', w: 'Annie Trengrove \u00b7 Google review' },
      { t: '"As an interior designer I would definitely recommend Everest Painters. They provided the high quality finish I was looking for."', w: 'Clementine Wallace \u00b7 Google review' },
      { t: '"Quality workmanship, friendly reliable service and good value for money. I can without hesitation recommend them."', w: 'Iain Weir \u00b7 Google review' },
      { t: '"Extremely professional, quality work, honest hard workers at reasonable rates. Thank you for another quality job. 5 stars!"', w: 'Richelle Courtney \u00b7 Google review' }
    ];
    var qt = document.getElementById('rotqText');
    var qw = document.getElementById('rotqWho');
    var qi = 0;
    setInterval(function () {
      rotq.classList.add('swap');
      setTimeout(function () {
        qi = (qi + 1) % quotes.length;
        qt.textContent = quotes[qi].t;
        qw.textContent = quotes[qi].w;
        rotq.classList.remove('swap');
      }, 460);
    }, 6200);
  }

  /* ---- current year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
