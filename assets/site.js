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

  /* Run an interval only while `el` is on screen and the tab is visible. The
     hero crossfade and the quote rotator used to tick forever, compositing
     full-bleed images long after they had scrolled away. */
  function whileVisible(el, ms, tick) {
    var id = null;
    var onScreen = true;
    function start() { if (id === null && onScreen && !document.hidden) id = setInterval(tick, ms); }
    function stop() { if (id !== null) { clearInterval(id); id = null; } }
    if ('IntersectionObserver' in window && el) {
      new IntersectionObserver(function (es) {
        onScreen = es[0].isIntersecting;
        onScreen ? start() : stop();
      }, { threshold: 0 }).observe(el);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    start();
  }

  /* ---- hero crossfade (paused under reduced motion) ---- */
  var slides = document.querySelectorAll('.hero__slide');
  if (slides.length > 1 && !reduce) {
    var i = 0;
    whileVisible(slides[0].parentNode || slides[0], 5600, function () {
      slides[i].classList.remove('on');
      i = (i + 1) % slides.length;
      slides[i].classList.add('on');
    });
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
    /* Throttled to one rAF per frame and self-unbinding: reading
       getBoundingClientRect on every item on every scroll event forced a
       synchronous layout each frame, which is what made scrolling stutter. */
    var pending = false;
    var pool = items.slice ? items.slice() : Array.prototype.slice.call(items);
    var onScroll;
    var sweep = function () {
      pending = false;
      var h = window.innerHeight || 800;
      for (var i = pool.length - 1; i >= 0; i--) {
        var el = pool[i];
        if (el.classList.contains('in') || el.getBoundingClientRect().top < h * 0.94) {
          el.classList.add('in');
          pool.splice(i, 1);
        }
      }
      if (!pool.length && onScroll) window.removeEventListener('scroll', onScroll);
    };
    onScroll = function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(sweep);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
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
    whileVisible(rotq, 6200, function () {
      rotq.classList.add('swap');
      setTimeout(function () {
        qi = (qi + 1) % quotes.length;
        qt.textContent = quotes[qi].t;
        qw.textContent = quotes[qi].w;
        rotq.classList.remove('swap');
      }, 460);
    });
  }

  /* ---- current year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();

/* balanced masonry: exact row spans, columns end level, nothing cropped */
(function () {
  var gal = document.querySelector('.masonry');
  if (!gal) return;
  var items = Array.prototype.slice.call(gal.querySelectorAll('figure'));
  if (!items.length) return;
  var ROW = 6;

  function assign(h, cols, gap) {
    var order = h.map(function (v, i) { return { i: i, h: v }; })
                 .sort(function (a, b) { return b.h - a.h; });
    var col = new Array(h.length), tot = [], bucket = [];
    for (var c = 0; c < cols; c++) { tot.push(0); bucket.push([]); }
    order.forEach(function (it) {
      var s = 0;
      for (var c = 1; c < cols; c++) if (tot[c] < tot[s]) s = c;
      col[it.i] = s; bucket[s].push(it.i); tot[s] += it.h + gap;
    });
    for (var p = 0; p < 12; p++) {
      var hi = 0, lo = 0;
      for (var c = 1; c < cols; c++) { if (tot[c] > tot[hi]) hi = c; if (tot[c] < tot[lo]) lo = c; }
      var spread = tot[hi] - tot[lo];
      if (spread < 1 || bucket[hi].length < 2) break;
      var best = null;
      bucket[hi].forEach(function (idx) {
        var after = Math.abs((tot[hi] - h[idx]) - (tot[lo] + h[idx]));
        if (after < spread && (best === null || after < best.after)) best = { idx: idx, after: after };
      });
      if (!best) break;
      tot[hi] -= h[best.idx] + gap; tot[lo] += h[best.idx] + gap;
      bucket[hi].splice(bucket[hi].indexOf(best.idx), 1); bucket[lo].push(best.idx);
      col[best.idx] = lo;
    }
    return col;
  }

  function layout() {
    gal.classList.remove('is-packed');
    items.forEach(function (f) { f.style.gridColumn = ''; f.style.gridRowEnd = ''; });
    var cs = getComputedStyle(gal);
    var cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    if (cols < 2) return;
    var gap = parseFloat(cs.rowGap) || 0;
    var h = items.map(function (f) { return f.getBoundingClientRect().height; });
    if (!h.some(function (v) { return v > 1; })) return;
    var col = assign(h, cols, gap);
    gal.classList.add('is-packed');
    items.forEach(function (f, i) {
      f.style.gridColumn = String(col[i] + 1);
      f.style.gridRowEnd = 'span ' + Math.ceil(h[i] / ROW);
    });
  }

  var t;
  function schedule() { clearTimeout(t); t = setTimeout(layout, 90); }
  layout();
  window.addEventListener('load', layout);
  window.addEventListener('resize', schedule, { passive: true });
  items.forEach(function (f) {
    var img = f.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', schedule);
  });
})();
