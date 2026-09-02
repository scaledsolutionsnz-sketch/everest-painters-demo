/* ==========================================================================
   Artifex Decor — content overlay + in-place editor
   --------------------------------------------------------------------------
   View mode  (every visitor): reads site_content from Supabase over plain
                               REST and applies it to [data-cms] elements.
                               No dependencies, ~2KB of work.
   Edit mode  (?cms=edit + a signed-in session): loads supabase-js, adds the
                               toolbar and the side panel, uploads images.

   Element contract, written by the annotator:
     data-cms          stable key, e.g. "index.services.h3_2"
     data-cms-type     text | textnodes | image | attr:<name>
     data-cms-href     present on tel:/mailto: links, makes the href editable
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.CMS_CONFIG || {};
  var TABLE = 'site_content';
  var CACHE_KEY = 'artifex.cms.v1';
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

  var configured = !!(CFG.url && CFG.anonKey && !/PASTE_YOUR/.test(CFG.anonKey));
  var elCache = null;

  /* ---------------------------------------------------------------- utils */

  function nodes() {
    if (!elCache) {
      elCache = [].slice.call(document.querySelectorAll('[data-cms]'));
    }
    return elCache;
  }

  function typeOf(el) {
    return el.getAttribute('data-cms-type') || 'text';
  }

  /** Direct (non-nested) text of an element, ignoring icon children. */
  function directText(el) {
    var out = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) out += n.nodeValue.trim() + ' ';
    }
    return out.trim();
  }

  /** Write text back into the first real text node, leaving icons intact. */
  function setDirectText(el, value) {
    var first = null;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      if (!first) { first = n; n.nodeValue = value; }
      else n.nodeValue = '';
    }
    if (!first) el.appendChild(document.createTextNode(value));
  }

  /* ------------------------------------------------------------- defaults */

  function snapshotDefaults() {
    nodes().forEach(function (el) {
      if (el.__cmsDefault) return;
      var t = typeOf(el);
      if (t === 'image') {
        el.__cmsDefault = {
          src: el.getAttribute('src'),
          srcset: el.getAttribute('srcset'),
          sizes: el.getAttribute('sizes'),
          alt: el.getAttribute('alt') || ''
        };
      } else if (t.indexOf('attr:') === 0) {
        el.__cmsDefault = { v: el.getAttribute(t.slice(5)) || '' };
      } else if (t === 'textnodes') {
        el.__cmsDefault = { v: directText(el), href: el.getAttribute('href') };
      } else {
        el.__cmsDefault = { v: el.innerHTML, href: el.getAttribute('href') };
      }
    });
  }

  /* -------------------------------------------------------------- applying */

  function applyOne(el, rec) {
    var t = typeOf(el);
    if (t === 'image') {
      if (rec.src) {
        // A replacement is a single file, so the responsive set no longer
        // describes it. Drop srcset/sizes or the browser keeps the original.
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
        el.setAttribute('src', rec.src);
      }
      if (rec.alt != null) el.setAttribute('alt', rec.alt);
      return;
    }
    if (t.indexOf('attr:') === 0) {
      if (rec.v != null) el.setAttribute(t.slice(5), rec.v);
      return;
    }
    if (rec.v != null) {
      if (t === 'textnodes') setDirectText(el, rec.v);
      else el.innerHTML = rec.v;
    }
    if (rec.href) el.setAttribute('href', rec.href);
  }

  function restoreDefault(el) {
    var d = el.__cmsDefault;
    if (!d) return;
    var t = typeOf(el);
    if (t === 'image') {
      el.setAttribute('src', d.src);
      if (d.srcset) el.setAttribute('srcset', d.srcset); else el.removeAttribute('srcset');
      if (d.sizes) el.setAttribute('sizes', d.sizes); else el.removeAttribute('sizes');
      el.setAttribute('alt', d.alt);
    } else if (t.indexOf('attr:') === 0) {
      el.setAttribute(t.slice(5), d.v);
    } else if (t === 'textnodes') {
      setDirectText(el, d.v);
      if (d.href) el.setAttribute('href', d.href);
    } else {
      el.innerHTML = d.v;
      if (d.href) el.setAttribute('href', d.href);
    }
  }

  /**
   * @param {Object} map        key -> record
   * @param {boolean} authoritative  when true, keys absent from the map are
   *                                 reset to their HTML default (so deleting
   *                                 a row in Supabase really does revert).
   */
  function applyAll(map, authoritative) {
    nodes().forEach(function (el) {
      var rec = map[el.getAttribute('data-cms')];
      if (rec) applyOne(el, rec);
      else if (authoritative) restoreDefault(el);
    });
    document.documentElement.setAttribute('data-cms-ready', '1');
  }

  /* ------------------------------------------------------------- transport */

  function rowsToMap(rows) {
    var m = {};
    (rows || []).forEach(function (r) { m[r.key] = r.data || {}; });
    return m;
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; }
    catch (e) { return null; }
  }

  function writeCache(map) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch (e) { /* private mode */ }
  }

  function fetchContent() {
    if (!configured) return Promise.resolve(null);
    return fetch(CFG.url + '/rest/v1/' + TABLE + '?select=key,data', {
      headers: { apikey: CFG.anonKey, Authorization: 'Bearer ' + CFG.anonKey },
      cache: 'no-store'
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    snapshotDefaults();

    var cached = readCache();
    if (cached) applyAll(cached, false);          // instant, avoids the flash
    else document.documentElement.setAttribute('data-cms-ready', '1');

    fetchContent().then(function (rows) {
      if (rows) {
        var map = rowsToMap(rows);
        writeCache(map);
        applyAll(map, true);                      // network wins
      }
      if (/[?&]cms=edit\b/.test(location.search)) startEditor();
    });
  }

  /* ==========================================================================
     Edit mode
     ========================================================================== */

  var sb = null;            // supabase client
  var pending = {};         // key -> record  (null means "reset to default")
  var current = null;       // element being edited

  function loadSDK() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = SDK;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load supabase-js')); };
      document.head.appendChild(s);
    });
  }

  function startEditor() {
    if (!configured) {
      alert('CMS is not configured yet. Fill in assets/cms-config.js first.');
      return;
    }
    loadSDK().then(function () {
      sb = window.supabase.createClient(CFG.url, CFG.anonKey);
      return sb.auth.getSession();
    }).then(function (res) {
      if (!res || !res.data || !res.data.session) {
        location.href = 'admin.html?next=' + encodeURIComponent(location.pathname + location.search);
        return;
      }
      injectEditorCSS();
      buildToolbar(res.data.session.user);
      armElements();
    }).catch(function (err) {
      alert('Editor failed to start: ' + err.message);
    });
  }

  function injectEditorCSS() {
    var css = [
      ':root{--cms-accent:#B2542B}',
      'html.cms-on{scroll-padding-top:120px}',
      'body.cms-on{padding-top:56px!important}',
      '.cms-bar{position:fixed;inset:0 0 auto 0;height:56px;z-index:2147483000;',
      '  background:#15181A;color:#F0F1EF;display:flex;align-items:center;gap:14px;',
      '  padding:0 16px;font:500 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      '  box-shadow:0 2px 18px rgba(0,0,0,.28)}',
      '.cms-bar__brand{font-weight:700;letter-spacing:.02em;margin-right:4px}',
      '.cms-bar__brand span{color:var(--cms-accent)}',
      '.cms-bar__pages{display:flex;gap:10px;margin-left:6px}',
      '.cms-bar__pages a{color:rgba(240,241,239,.66);text-decoration:none;font-size:13px}',
      '.cms-bar__pages a:hover,.cms-bar__pages a.on{color:#fff}',
      '.cms-bar__sp{flex:1}',
      '.cms-bar__hint{color:rgba(240,241,239,.55);font-size:12.5px}',
      '.cms-btn{border:0;border-radius:8px;padding:9px 15px;font:600 13px/1 inherit;cursor:pointer;',
      '  background:rgba(240,241,239,.12);color:#F0F1EF;transition:background .15s}',
      '.cms-btn:hover{background:rgba(240,241,239,.2)}',
      '.cms-btn--go{background:var(--cms-accent);color:#fff}',
      '.cms-btn--go:hover{background:#C4602F}',
      '.cms-btn[disabled]{opacity:.45;cursor:default}',
      '[data-cms].cms-hot{outline:2px dashed rgba(178,84,43,.55);outline-offset:2px;cursor:pointer}',
      '[data-cms].cms-hot:hover{outline:2px solid var(--cms-accent);background:rgba(178,84,43,.07)}',
      '[data-cms].cms-live{outline:2px solid #5D6544!important}',
      '[data-cms].cms-sel{outline:3px solid var(--cms-accent)!important;outline-offset:3px}',
      '.cms-panel{position:fixed;top:56px;right:0;bottom:0;width:380px;max-width:92vw;z-index:2147482999;',
      '  background:#fff;border-left:1px solid #CFD4CF;box-shadow:-18px 0 44px -30px rgba(30,24,21,.5);',
      '  display:flex;flex-direction:column;font:400 14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      '  transform:translateX(100%);transition:transform .25s cubic-bezier(.22,.61,.36,1)}',
      '.cms-panel.on{transform:none}',
      '.cms-panel__hd{padding:16px 18px 12px;border-bottom:1px solid #E3E6E2}',
      '.cms-panel__hd h3{margin:0 0 4px;font:700 15px/1.3 inherit;color:#15181A}',
      '.cms-panel__key{font:400 11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8A9296;word-break:break-all}',
      '.cms-panel__bd{padding:16px 18px;overflow:auto;flex:1}',
      '.cms-panel__ft{padding:12px 18px;border-top:1px solid #E3E6E2;display:flex;gap:8px}',
      '.cms-f{margin-bottom:16px}',
      '.cms-f label{display:block;font:600 12px/1.4 inherit;color:#4B5358;margin-bottom:6px;',
      '  text-transform:uppercase;letter-spacing:.06em}',
      '.cms-f textarea,.cms-f input[type=text]{width:100%;border:1px solid #CFD4CF;border-radius:8px;',
      '  padding:10px 12px;font:400 14px/1.55 inherit;color:#15181A;background:#fff;resize:vertical}',
      '.cms-f textarea:focus,.cms-f input:focus{outline:2px solid var(--cms-accent);outline-offset:-1px;border-color:transparent}',
      '.cms-f textarea{min-height:110px}',
      '.cms-drop{border:2px dashed #CFD4CF;border-radius:10px;padding:18px;text-align:center;color:#4B5358;cursor:pointer}',
      '.cms-drop.over{border-color:var(--cms-accent);background:rgba(178,84,43,.06)}',
      '.cms-thumb{width:100%;border-radius:8px;border:1px solid #E3E6E2;margin-bottom:10px;display:block}',
      '.cms-note{font-size:12.5px;color:#8A9296;margin:-8px 0 14px}',
      '.cms-btn2{border:1px solid #CFD4CF;background:#fff;border-radius:8px;padding:9px 14px;',
      '  font:600 13px/1 inherit;color:#15181A;cursor:pointer}',
      '.cms-btn2:hover{border-color:#15181A}',
      '.cms-btn2--warn{color:#8F401C;border-color:#E7CBBC}',
      '.cms-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483001;',
      '  background:#15181A;color:#F0F1EF;padding:11px 18px;border-radius:999px;font:600 13px/1 inherit;',
      '  opacity:0;transition:opacity .2s}',
      '.cms-toast.on{opacity:1}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'cms-editor-css';
    s.textContent = css;
    document.head.appendChild(s);
    document.documentElement.classList.add('cms-on');
    document.body.classList.add('cms-on');
  }

  var bar, saveBtn, panel, toast;

  function buildToolbar(user) {
    bar = document.createElement('div');
    bar.className = 'cms-bar';
    var here = location.pathname.split('/').pop() || 'index.html';
    var pages = ['index.html', 'gallery.html', 'terms.html', 'privacy.html'];
    bar.innerHTML =
      '<div class="cms-bar__brand">Artifex <span>CMS</span></div>' +
      '<nav class="cms-bar__pages">' + pages.map(function (p) {
        return '<a href="' + p + '?cms=edit"' + (p === here ? ' class="on"' : '') + '>' +
          p.replace('.html', '') + '</a>';
      }).join('') + '</nav>' +
      '<span class="cms-bar__hint">Click any text or image to edit</span>' +
      '<div class="cms-bar__sp"></div>' +
      '<button class="cms-btn" id="cmsDiscard">Discard</button>' +
      '<button class="cms-btn cms-btn--go" id="cmsSave" disabled>Save</button>' +
      '<button class="cms-btn" id="cmsExit">Exit</button>' +
      '<button class="cms-btn" id="cmsOut" title="' + (user && user.email ? user.email : '') +
      '">Sign out</button>';
    document.body.appendChild(bar);

    saveBtn = bar.querySelector('#cmsSave');
    saveBtn.addEventListener('click', save);
    bar.querySelector('#cmsDiscard').addEventListener('click', discard);
    bar.querySelector('#cmsExit').addEventListener('click', function () {
      if (Object.keys(pending).length && !confirm('You have unsaved changes. Leave anyway?')) return;
      location.href = location.pathname;
    });
    bar.querySelector('#cmsOut').addEventListener('click', function () {
      if (Object.keys(pending).length && !confirm('You have unsaved changes. Sign out anyway?')) return;
      pending = {};
      sb.auth.signOut().then(function () { location.href = location.pathname; });
    });

    panel = document.createElement('aside');
    panel.className = 'cms-panel';
    panel.innerHTML =
      '<div class="cms-panel__hd"><h3 id="cmsTitle">Nothing selected</h3>' +
      '<div class="cms-panel__key" id="cmsKey"></div></div>' +
      '<div class="cms-panel__bd" id="cmsBody"></div>' +
      '<div class="cms-panel__ft">' +
      '<button class="cms-btn2 cms-btn2--warn" id="cmsReset">Reset to original</button>' +
      '<div style="flex:1"></div>' +
      '<button class="cms-btn2" id="cmsClose">Close</button></div>';
    document.body.appendChild(panel);
    panel.querySelector('#cmsClose').addEventListener('click', closePanel);
    panel.querySelector('#cmsReset').addEventListener('click', resetCurrent);

    toast = document.createElement('div');
    toast.className = 'cms-toast';
    document.body.appendChild(toast);

    window.addEventListener('beforeunload', function (e) {
      if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(say._t);
    say._t = setTimeout(function () { toast.classList.remove('on'); }, 2200);
  }

  function armElements() {
    nodes().forEach(function (el) {
      if (el.closest && el.closest('.cms-bar, .cms-panel')) return;
      el.classList.add('cms-hot');
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openPanel(el);
      }, true);
    });
    // <title> and <meta> live in the head; surface them from the toolbar.
    var metas = nodes().filter(function (el) {
      return /\.meta\./.test(el.getAttribute('data-cms'));
    });
    if (metas.length) {
      var b = document.createElement('button');
      b.className = 'cms-btn';
      b.textContent = 'SEO';
      b.addEventListener('click', function () { openPanel(metas[0], metas); });
      bar.insertBefore(b, bar.querySelector('#cmsDiscard'));
    }
  }

  function markDirty() {
    var n = Object.keys(pending).length;
    saveBtn.disabled = !n;
    saveBtn.textContent = n ? 'Save (' + n + ')' : 'Save';
  }

  function record(el, rec) {
    var key = el.getAttribute('data-cms');
    pending[key] = rec;
    el.classList.add('cms-live');
    markDirty();
  }

  function closePanel() {
    panel.classList.remove('on');
    if (current) current.classList.remove('cms-sel');
    current = null;
  }

  function resetCurrent() {
    if (!current) return;
    var key = current.getAttribute('data-cms');
    restoreDefault(current);
    pending[key] = null;                 // null = delete the row on save
    current.classList.add('cms-live');
    markDirty();
    openPanel(current);                  // refresh the fields
    say('Reset — save to publish');
  }

  function discard() {
    if (!Object.keys(pending).length) return;
    if (!confirm('Discard all unsaved changes on this page?')) return;
    location.reload();
  }

  /* ------------------------------------------------------------ the panel */

  function openPanel(el, group) {
    if (current) current.classList.remove('cms-sel');
    current = el;
    el.classList.add('cms-sel');
    panel.classList.add('on');

    var key = el.getAttribute('data-cms');
    var t = typeOf(el);
    panel.querySelector('#cmsKey').textContent = key;
    panel.querySelector('#cmsTitle').textContent =
      t === 'image' ? 'Image' : /\.meta\./.test(key) ? 'Page SEO' : 'Text';

    var body = panel.querySelector('#cmsBody');
    body.innerHTML = '';

    if (t === 'image') buildImageFields(body, el);
    else if (group) group.forEach(function (g) { buildTextField(body, g, true); });
    else buildTextField(body, el, false);

    if (!/\.meta\./.test(key)) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function fieldWrap(parent, label) {
    var f = document.createElement('div');
    f.className = 'cms-f';
    f.innerHTML = '<label>' + label + '</label>';
    parent.appendChild(f);
    return f;
  }

  function currentRecord(el) {
    var key = el.getAttribute('data-cms');
    if (pending[key]) return pending[key];
    var t = typeOf(el);
    if (t === 'image') return { src: el.getAttribute('src'), alt: el.getAttribute('alt') || '' };
    if (t.indexOf('attr:') === 0) return { v: el.getAttribute(t.slice(5)) || '' };
    if (t === 'textnodes') return { v: directText(el), href: el.getAttribute('href') };
    return { v: el.innerHTML, href: el.getAttribute('href') };
  }

  function buildTextField(parent, el, labelled) {
    var t = typeOf(el);
    var rec = currentRecord(el);
    var key = el.getAttribute('data-cms');
    var label = labelled
      ? (key.indexOf('.title') > -1 ? 'Browser / search title' : 'Search description')
      : 'Text';

    var f = fieldWrap(parent, label);
    var ta = document.createElement('textarea');
    ta.value = rec.v == null ? '' : rec.v;
    if (t === 'text' && /<[a-z]/i.test(ta.value)) {
      var note = document.createElement('p');
      note.className = 'cms-note';
      note.textContent = 'This block contains formatting tags — keep them if you want the styling.';
      f.appendChild(note);
    }
    f.appendChild(ta);

    ta.addEventListener('input', function () {
      var next = { v: ta.value };
      var href = f.__href ? f.__href.value : null;
      if (href) next.href = href;
      applyOne(el, next);
      record(el, next);
    });

    if (el.hasAttribute('data-cms-href')) {
      var hf = fieldWrap(parent, 'Link (tel: or mailto:)');
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = el.getAttribute('href') || '';
      hf.appendChild(inp);
      f.__href = inp;
      inp.addEventListener('input', function () {
        var next = { v: ta.value, href: inp.value };
        applyOne(el, next);
        record(el, next);
      });
    }
  }

  function buildImageFields(parent, el) {
    var rec = currentRecord(el);

    var thumb = document.createElement('img');
    thumb.className = 'cms-thumb';
    thumb.src = el.getAttribute('src');
    parent.appendChild(thumb);

    var f = fieldWrap(parent, 'Replace image');
    var drop = document.createElement('div');
    drop.className = 'cms-drop';
    drop.textContent = 'Drop an image here, or click to choose';
    f.appendChild(drop);

    var note = document.createElement('p');
    note.className = 'cms-note';
    note.textContent = 'JPG, PNG or WebP. Large photos are uploaded as-is, so save them under about 1MB first.';
    parent.appendChild(note);

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    parent.appendChild(input);

    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) upload(input.files[0], el, thumb, drop);
    });
    ['dragenter', 'dragover'].forEach(function (n) {
      drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (n) {
      drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) upload(file, el, thumb, drop);
    });

    var af = fieldWrap(parent, 'Alt text (describes the photo)');
    var alt = document.createElement('input');
    alt.type = 'text';
    alt.value = rec.alt || el.getAttribute('alt') || '';
    af.appendChild(alt);
    alt.addEventListener('input', function () {
      var next = currentRecord(el);
      next.alt = alt.value;
      applyOne(el, next);
      record(el, next);
    });
  }

  function upload(file, el, thumb, drop) {
    if (!/^image\//.test(file.type)) { say('That is not an image'); return; }
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    var name = el.getAttribute('data-cms').replace(/[^a-z0-9._-]/gi, '_') +
      '-' + Date.now() + '.' + ext;
    drop.textContent = 'Uploading…';
    sb.storage.from(CFG.bucket || 'site-images')
      .upload(name, file, { cacheControl: '31536000', upsert: false })
      .then(function (res) {
        if (res.error) throw res.error;
        var url = sb.storage.from(CFG.bucket || 'site-images').getPublicUrl(name).data.publicUrl;
        var next = currentRecord(el);
        next.src = url;
        applyOne(el, next);
        record(el, next);
        thumb.src = url;
        drop.textContent = 'Drop an image here, or click to choose';
        say('Image uploaded — save to publish');
      })
      .catch(function (err) {
        drop.textContent = 'Drop an image here, or click to choose';
        say('Upload failed: ' + (err.message || err));
      });
  }

  /* -------------------------------------------------------------- saving */

  function save() {
    var keys = Object.keys(pending);
    if (!keys.length) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    var upserts = [];
    var deletes = [];
    keys.forEach(function (k) {
      if (pending[k] === null) deletes.push(k);
      else {
        var el = document.querySelector('[data-cms="' + CSS.escape(k) + '"]');
        upserts.push({ key: k, data: pending[k], type: el ? typeOf(el) : 'text' });
      }
    });

    var jobs = [];
    if (upserts.length) jobs.push(sb.from(TABLE).upsert(upserts, { onConflict: 'key' }));
    if (deletes.length) jobs.push(sb.from(TABLE).delete().in('key', deletes));

    Promise.all(jobs).then(function (results) {
      var bad = results.filter(function (r) { return r && r.error; });
      if (bad.length) throw bad[0].error;
      pending = {};
      nodes().forEach(function (el) { el.classList.remove('cms-live'); });
      markDirty();
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      say('Saved — the live site is updated');
    }).catch(function (err) {
      markDirty();
      say('Save failed: ' + (err.message || err));
    });
  }

  /* ------------------------------------------------------------------ go */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
