/* flow.js · Od Zera Do Playera
   One continuous scroll over one night. The page is an ordinary document:
   every section scrolls in normal flow, nothing slides over anything and
   nothing stops the page. Behind it, a fixed WebGL night (world.js) changes its
   weather with scroll position, and two veils over it darken it under the
   shop. The layers of each section drift at their own rate as they pass.

   Also here, because they belong to this page and nowhere else:
   - the walk: the distance counting down, one excuse arriving with every metre,
     the excuses falling away before "Cześć.", and the hesitation detector
     (stop walking and they press in, the light dims, the distance creeps back),
   - the edge rail, the phone index, and Kamil's shorts playing in the phone.

   Without JS, or with reduced motion, none of the motion runs: the sections
   read top to bottom over still frames of the night. */
(function () {
  'use strict';

  var html = document.documentElement;
  var flow = document.querySelector('[data-flow]');
  if (!flow) return;

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // test switches: ?lite ?noworld ?nohes ?hq ?capture ?snap (no easing: every frame shows its exact state) ?cscale=0.6 ?demo
  var Q = location.search, NOHES = /nohes/.test(Q), HQ = /hq|capture|snap/.test(Q), CAPTURE = /capture/.test(Q), SNAP = /snap/.test(Q);
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var PHONE_MQ = matchMedia('(max-width: 760px)');
  function phone() { return PHONE_MQ.matches; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function val(x) { return typeof x === 'function' ? x() : x; }

  /* ------------------------------------------- testimonials: real or nothing
     The Opinie section ships only when it holds at least one real message.
     Empty frames are for reviewing the layout (?demo), never for visitors. */
  (function () {
    var op = document.getElementById('opinie');
    if (!op) return;
    var real = op.querySelectorAll('.proof:not(.proof--empty)').length;
    if (real) { [].slice.call(op.querySelectorAll('.proof--empty')).forEach(function (el) { el.remove(); }); return; }
    if (/demo/.test(Q)) return;
    op.remove();
    [].slice.call(document.querySelectorAll('[data-opt="opinie"]')).forEach(function (el) { el.remove(); });
  })();

  /* ----------------------------------------- Kamil's shorts in the phone
     They play muted while the phone is on screen, one after another, and pause
     when it leaves. The first tap turns the sound on and starts that short from
     the beginning; after that a tap pauses and plays. Nothing loads until the
     phone is near. With reduced motion or Data Saver nothing plays by itself. */
  (function () {
    var reel = document.querySelector('[data-reel]');
    if (!reel) return;
    var video = reel.querySelector('[data-reel-video]');
    var tap = reel.querySelector('[data-reel-tap]');
    var sound = reel.querySelector('[data-reel-sound]');
    var title = reel.querySelector('[data-reel-title]');
    var hintEl = reel.querySelector('[data-reel-hint]');
    var items = [].slice.call(reel.querySelectorAll('[data-reel-go]'));
    if (!video || !items.length) return;
    var fills = items.map(function (bt) { return bt.querySelector('b'); });
    var AUTO = !REDUCED && !(navigator.connection && navigator.connection.saveData);
    var cur = 0, inView = false, userPaused = false, loaded = false;
    if (!AUTO && hintEl) hintEl.textContent = 'Dotknij, żeby obejrzeć';
    function select(k, play) {
      cur = k;
      var bt = items[k], t = bt.getAttribute('data-title');
      items.forEach(function (x, j) { x.setAttribute('aria-current', j === k ? 'true' : 'false'); });
      fills.forEach(function (f, j) { f.style.transform = 'scaleX(' + (j < k ? 1 : 0) + ')'; });
      if (title) title.textContent = t;
      video.poster = bt.getAttribute('data-poster');
      video.setAttribute('aria-label', 'Short Kamila: ' + t + ' (z napisami)');
      reel.style.setProperty('--poster', 'url(' + bt.getAttribute('data-poster') + ')');
      if (loaded) { video.src = bt.getAttribute('data-src'); video.load(); }
      if (play) start();
    }
    function load() {
      if (loaded) return;
      loaded = true;
      video.preload = 'auto';
      video.src = items[cur].getAttribute('data-src');
    }
    function start() { load(); var pr = video.play(); if (pr && pr.catch) pr.catch(function () {}); }
    function sync() {
      var on = !video.muted;
      reel.classList.toggle('is-sound', on);
      reel.classList.toggle('is-paused', video.paused && (userPaused || !AUTO));
      sound.setAttribute('aria-pressed', String(on));
      sound.setAttribute('aria-label', on ? 'Wycisz' : 'Włącz dźwięk');
      tap.setAttribute('aria-label', video.muted ? 'Włącz dźwięk i oglądaj od początku' : video.paused ? 'Odtwórz' : 'Pauza');
    }
    video.muted = true;
    select(0, false);
    tap.addEventListener('click', function () {
      if (video.muted) { video.muted = false; userPaused = false; load(); try { video.currentTime = 0; } catch (e) {} start(); }
      else if (video.paused) { userPaused = false; start(); }
      else { userPaused = true; video.pause(); }
      sync();
    });
    sound.addEventListener('click', function () {
      video.muted = !video.muted;
      if (video.paused && !userPaused) start();
      sync();
    });
    items.forEach(function (bt, k) { bt.addEventListener('click', function () { userPaused = false; select(k, true); sync(); }); });
    video.addEventListener('ended', function () { select((cur + 1) % items.length, (inView || !video.muted) && !userPaused); });
    video.addEventListener('timeupdate', function () {
      if (video.duration) fills[cur].style.transform = 'scaleX(' + Math.min(1, video.currentTime / video.duration).toFixed(3) + ')';
    });
    ['play', 'pause', 'volumechange'].forEach(function (ev) { video.addEventListener(ev, sync); });
    if ('IntersectionObserver' in window) {
      // start fetching a little before the phone arrives
      new IntersectionObserver(function (es) { if (es[0].isIntersecting && AUTO) load(); }, { rootMargin: '60% 0px' }).observe(reel);
      new IntersectionObserver(function (es) {
        inView = es[0].intersectionRatio >= 0.35;
        if (inView && AUTO && !userPaused) start();
        else if (!inView && !video.paused) video.pause();
        sync();
      }, { threshold: [0, 0.35, 0.6] }).observe(reel);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden && !video.paused) video.pause(); });
    sync();
  })();

  /* ------------------------------------------------------ phone index sheet */
  var toggle = document.querySelector('[data-toggle]');
  var sheet = document.getElementById('sheet');
  function closeSheet() { if (!sheet || sheet.hidden) return; sheet.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  if (toggle && sheet) {
    toggle.addEventListener('click', function () {
      var open = sheet.hidden;
      sheet.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) { var a = sheet.querySelector('a'); if (a) a.focus(); }
    });
    sheet.addEventListener('click', function (e) { if (e.target.closest('a')) closeSheet(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) { closeSheet(); toggle.focus(); } });
    document.addEventListener('click', function (e) { if (!sheet.hidden && !sheet.contains(e.target) && !toggle.contains(e.target)) closeSheet(); });
  }

  /* ------------------------------------------------- where am I (both modes) */
  var secEls = [].slice.call(document.querySelectorAll('[data-layer]'));
  var links = [].slice.call(document.querySelectorAll('.index a'));
  var ticks = [].slice.call(document.querySelectorAll('.ticks b'));
  var hereLabel = document.querySelector('[data-here]');
  var ctas = [].slice.call(document.querySelectorAll('.edge [data-cta]'));
  var topMark = document.querySelector('.edge--top');
  var hereIdx = -1;
  function markHere(i) {
    if (i === hereIdx || i < 0) return;
    hereIdx = i;
    var id = secEls[i].id;
    links.forEach(function (a) {
      var j = secEls.indexOf(document.getElementById(a.getAttribute('href').slice(1)));
      a.classList.toggle('is-here', j === i);
      a.classList.toggle('is-laid', j >= 0 && j < i);
      if (j === i) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    ticks.forEach(function (b, j) { b.classList.toggle('on', j < i); b.classList.toggle('here', j === i); });
    if (hereLabel) {
      var a0 = links.filter(function (a) { return a.getAttribute('href') === '#' + id; })[0];
      hereLabel.textContent = a0 ? a0.textContent.trim() : '';
    }
    // the edge CTA steps aside where the page already makes that same ask
    var quiet = id === 'noc' || id === 'droga' || id === 'player';
    ctas.forEach(function (a) { a.setAttribute('aria-hidden', quiet ? 'true' : 'false'); a.tabIndex = quiet ? -1 : 0; a.style.opacity = quiet ? '0' : ''; a.style.pointerEvents = quiet ? 'none' : ''; });
    if (topMark) { topMark.style.opacity = id === 'noc' ? '0' : ''; topMark.style.pointerEvents = id === 'noc' ? 'none' : ''; }
  }

  if (REDUCED) {
    // A plain document: anchors scroll natively and the night stays still.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) markHere(secEls.indexOf(en.target)); });
      }, { rootMargin: '-49% 0px -50% 0px' });
      secEls.forEach(function (el) { io.observe(el); });
    }
    return;
  }

  /* ================================================================ MOTION */
  html.classList.add('deck-on');
  var night = document.querySelector('[data-night]');
  var canvas = night && night.querySelector('.world');
  var poster = night && night.querySelector('.world-poster');
  var veilFlat = night && night.querySelector('[data-veil="flat"]');
  var veilSide = night && night.querySelector('[data-veil="side"]');

  /* ---------------------------------------------------------------- world */
  var world = window.NightWorld && canvas && !/noworld/.test(Q)
    ? window.NightWorld.create(canvas, /lite/.test(Q) ? { scale: 0.32 } : /cscale=/.test(Q) ? { scale: parseFloat(Q.split('cscale=')[1]) } : {})
    : null;
  if (!world) html.classList.add('no-webgl');
  if (world && HQ) window.__world = world;   // for the lab scripts (?snap, ?hq, ?capture)
  var perf = { n: 0, ema: 0 };

  var BASE = { rain: 0.55, fog: 0.42, clear: 0, focus: 0.34, warm: 0.38, drain: 0.2, dolly: 0, tx: 0.17, ty: -0.03, targetOn: 0, speed: 1, exposure: 1, dim: 0, street: -0.12, lights: 0, dropX: 0.76, dropY: 0.96, dropR: phone() ? 0.05 : 0.082, dropOn: 0 };
  function S(o) { var s = {}, k; for (k in BASE) s[k] = BASE[k]; for (k in o) s[k] = o[k]; return s; }
  function mix(a, b, t) { var o = {}; for (var k in a) o[k] = lerp(a[k], b[k], t); return o; }
  var WS = {
    noc:    [S({}), S({ rain: 0.62, fog: 0.5, focus: 0.3, warm: 0.3, drain: 0.32 })],
    ty:     [S({ rain: 0.86, fog: 0.72, focus: 0.2, warm: 0.06, drain: 0.82, street: -0.16 }), S({ rain: 0.95, fog: 0.8, focus: 0.16, warm: 0, drain: 0.9, street: -0.16 })],
    // the rain all but stops and one drop takes the whole passage to run down the glass
    prawda: [S({ rain: 0.24, fog: 0.82, focus: 0.2, warm: 0.08, drain: 0.7, speed: 0.4, street: -0.16, exposure: 1.18, dropOn: 1, dropY: 0.9 }), S({ rain: 0.1, fog: 0.78, focus: 0.22, warm: 0.12, drain: 0.62, speed: 0.12, street: -0.16, exposure: 1.18, dropOn: 1, dropY: 0.14 })],
    player: [S({ rain: 0, fog: 0, clear: 1, focus: 0.6, warm: 1, drain: 0, street: -0.16, exposure: 1.06, lights: 1 }), S({ rain: 0, fog: 0, clear: 1, focus: 0.66, warm: 1, drain: 0, street: -0.16, exposure: 1.1, lights: 1 })]
  };
  function walkState(P) {
    var hello = smooth(0.84, 0.95, P);
    return S({
      rain: lerp(0.4, 0, smooth(0.55, 0.9, P)),
      fog: lerp(0.3, 0, smooth(0.45, 0.9, P)),
      clear: hello,
      focus: lerp(lerp(0.42, 0.2, smooth(0.08, 0.7, P)), 0.62, hello),
      lights: smooth(0.85, 0.99, P),
      warm: lerp(0.16, 1, smooth(0.8, 0.96, P)),
      drain: lerp(0.55, 0, smooth(0.78, 0.95, P)),
      dolly: easeInOut(clamp((P - 0.03) / 0.85, 0, 1)) * 0.94,
      targetOn: smooth(0, 0.1, P) * (1 - hello * 0.3),
      tx: phone() ? 0.05 : 0.17, ty: -0.03,
      street: -0.14,
      exposure: lerp(0.96, 1.08, hello)
    });
  }
  // After "Cześć." the city stays lit, softly out of focus under the shop, and
  // the camera eases back from her light until the close shows the whole street.
  function after(d0, d1) {
    return function (s) {
      var d = lerp(d0, d1, s.p);
      return S({ rain: 0, fog: 0.06, clear: 0.85, focus: 0.5, warm: 0.92, drain: 0, lights: 1, exposure: 0.96, street: -0.16,
        dolly: d, targetOn: lerp(0.55, 0.12, 1 - d / 0.94), tx: phone() ? 0.05 : 0.17, ty: -0.03 });
    };
  }
  var P = 0;   // progress through the walk, 0..1
  // The photo behind the glass: one night in five frames (world.js plates).
  // cold rainy street (Noc, Ty, Prawda) -> inside the bar, walking up to her
  // (the walk) -> the bar after "Cześć." (Kamil, under the veil) -> a table
  // after hours (1:1) -> the same street two hours later, warm (the close).
  // Each entry: plate name, its share within the section, the focus point in
  // plate uv (y down) and the zoom. Phones get the portrait of the cold street.
  var PLATE_URL = 'assets/plates/';
  function cold() { return phone() ? 'street-cold-portrait' : 'street-cold'; }
  function pv(name, w, cx, cy, zoom) { return { name: name, w: w, cx: cx, cy: cy, zoom: zoom }; }
  // the walk: a slow push toward her at the far end of the bar, then a cut (a
  // dissolve under the rain and fog) to two metres behind her, holding on her
  function walkPlates() {
    var d = smooth(0.48, 0.62, P), z = smooth(0.10, 0.56, P);
    return [
      pv('bar-far', 1 - d, lerp(0.55, 0.62, z), lerp(0.50, 0.36, z), 1 + 0.75 * z),
      pv('bar-near', d, 0.58, 0.50, lerp(1.0, 1.18, smooth(0.60, 0.90, P)))
    ];
  }
  // per section: the night's state, the flat veil (darkness), the side veil
  // (a darker left edge, or a darker lower half on a phone, for the copy) and
  // the plates behind it
  var SEC = {
    noc:       { w: function (s) { return mix(WS.noc[0], WS.noc[1], clamp((s.p - 0.5) * 2, 0, 1)); }, flat: 0, side: function () { return phone() ? 0.5 : 0.58; },
                 plates: function (s) { return [pv(cold(), 1, 0.5, 0.5, lerp(1.0, 1.05, clamp((s.p - 0.5) * 2, 0, 1)))]; } },
    ty:        { w: function (s) { return mix(WS.ty[0], WS.ty[1], s.p); }, flat: 0.34, side: 0.42,
                 plates: function (s) { return [pv(cold(), 1, 0.5, 0.5, lerp(1.05, 1.10, s.p))]; } },
    prawda:    { w: function (s) { return mix(WS.prawda[0], WS.prawda[1], smooth(0.15, 0.85, s.p)); }, flat: 0.1, side: function () { return phone() ? 0.7 : 0.94; },
                 plates: function () { return [pv(cold(), 1, 0.5, 0.5, 1.10)]; } },
    podejscie: { w: function () { return walkState(P); }, flat: 0, side: function () { return phone() ? 0.42 : lerp(0.42, 0.16, smooth(0.84, 0.95, P)); },
                 plates: walkPlates },
    kamil:     { w: after(0.84, 0.62), flat: 0.78, side: 0.3, plates: function () { return [pv('bar-near', 1, 0.58, 0.5, 1)]; } },
    opinie:    { w: after(0.62, 0.5), flat: 0.84, side: 0.2, plates: function () { return [pv('bar-near', 1, 0.58, 0.5, 1)]; } },
    droga:     { w: after(0.5, 0.25), flat: 0.86, side: 0.18, plates: function () { return [pv('table', 1, 0.62, 0.55, 1)]; } },
    // the table shows through here, so the flat veil is lighter and the side veil carries the copy
    jeden:     { w: after(0.25, 0.06), flat: 0.45, side: 0.6, plates: function (s) { return [pv('table', 1, 0.62, 0.55, lerp(1.0, 1.05, s.p))]; } },
    player:    { w: function (s) { return mix(WS.player[0], WS.player[1], s.p); }, flat: 0, side: 0.62,
                 plates: function (s) { return [pv('street-warm', 1, phone() ? 0.7 : 0.5, 0.5, lerp(1.06, 1.0, s.p))]; } }
  };
  var slotNames = [null, null];   // the plate each world.js slot holds

  /* --------------------------------------------------------------- pointer */
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  if (FINE) {
    window.addEventListener('pointermove', function (e) {
      tmx = (e.clientX / window.innerWidth) * 2 - 1;
      tmy = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  /* -------------------------------------------------------- what moves */
  function inSticky(el) { return !!el.closest('[data-sticky]'); }
  var secs = secEls.map(function (el) { return { el: el, id: el.id, def: SEC[el.id] || SEC.droga, top: 0, h: 0, cov: 0, p: 0 }; });
  var byId = {};
  secs.forEach(function (s) { byId[s.id] = s; });

  var heroPlanes = {};
  [].slice.call(flow.querySelectorAll('[data-plane]')).forEach(function (el) { heroPlanes[el.getAttribute('data-plane')] = { el: el, last: '' }; });
  // planes: data-depth is a speed (positive drifts faster than the page, so it
  // reads as nearer; negative lags behind, so it reads as further away);
  // data-travel is the same thing given directly in vh
  var planes = [].slice.call(flow.querySelectorAll('[data-depth], [data-travel]')).filter(function (el) {
    return !inSticky(el) && !el.hasAttribute('data-plane');
  }).map(function (el) {
    return { el: el, d: parseFloat(el.getAttribute('data-depth')) || 0, t: parseFloat(el.getAttribute('data-travel')) || 0, top: 0, h: 0, last: '' };
  });
  // copy arrives out of the dark as it rises into view and sinks back into it
  // at the very top of the screen
  var fades = [].slice.call(flow.querySelectorAll('[data-sc-copy], [data-fade]')).filter(function (el) {
    return !inSticky(el) && !el.closest('[data-notes]') && !el.closest('[data-still]');
  }).map(function (el) { return { el: el, top: 0, h: 0, lo: null, ly: null }; });
  var notesBox = flow.querySelector('[data-notes]');
  var nb = { top: 0, h: 0 };
  var notes = notesBox ? [].slice.call(notesBox.querySelectorAll('.note')).map(function (el) { return { el: el, lo: null, lt: null }; }) : [];
  var lines = [].slice.call(flow.querySelectorAll('[data-line]')).map(function (el) { return { el: el, top: 0, lo: null, ly: null }; });
  var reveals = [].slice.call(flow.querySelectorAll('[data-reveal]')).map(function (el) { return { el: el, top: 0, lo: null, ly: null, on: null }; });
  var walkCopy = fades.filter(function (f) { return !!f.el.closest('[data-walk]') && !f.el.hasAttribute('data-fade'); });
  var hudZ = [0.84, 0.95], duck = 0;
  var routeLine = flow.querySelector('.route__line'), routeFill = flow.querySelector('[data-route-fill]');
  var rl = { top: 0, h: 1, last: '' };

  /* ---------------------------------------------------------------- layout
     Everything is measured once, from the untransformed page, and then driven
     from scroll position alone: no layout reads while scrolling. */
  var vw = 0, vh = 0, lastSy = null, lastW = 0, lastH = 0;
  function measure() {
    vw = window.innerWidth; vh = window.innerHeight; lastW = vw; lastH = vh;
    planes.forEach(function (p) { p.el.style.transform = ''; p.last = ''; });
    fades.forEach(function (f) { f.el.style.translate = ''; f.ly = null; });
    notes.forEach(function (n) { n.el.style.transform = ''; n.lt = null; });
    lines.forEach(function (l) { l.el.style.translate = ''; l.ly = null; });
    reveals.forEach(function (r) { r.el.style.translate = ''; r.ly = null; });
    var sy0 = window.scrollY;
    function put(o, el) { var r = el.getBoundingClientRect(); o.top = r.top + sy0; o.h = r.height; }
    secs.forEach(function (s) { put(s, s.el); });
    planes.forEach(function (p) { put(p, p.el); });
    fades.forEach(function (f) { put(f, f.el); });
    lines.forEach(function (l) { put(l, l.el); });
    reveals.forEach(function (r) { put(r, r.el); });
    if (notesBox) put(nb, notesBox);
    if (routeLine) put(rl, routeLine);
    // where the distance readout sits on screen while the walk is under way
    if (hud) hudZ = [hud.offsetTop / vh, (hud.offsetTop + hud.offsetHeight) / vh];
    lastSy = null;
  }

  /* ------------------------------------------- the walk and its signature */
  var walk = byId.podejscie;
  var distEl = document.querySelector('[data-dist]');
  var hud = document.querySelector('[data-hud]');
  var hint = document.querySelector('[data-hint]');
  var exBox = document.querySelector('[data-excuses]');
  var EXCUSES = ['Pewnie ma chłopaka.', 'Jest z koleżankami. Nie teraz.', 'Co ja w ogóle powiem?', 'Wyjdę na dziwaka.', 'Za chwilę. Jeszcze jeden drink.', 'Ona jest poza moim zasięgiem.', 'Wszyscy będą patrzeć.', 'Może następnym razem.'];
  // offsets from the centre of the screen (vw, vh) and a small tilt, so the
  // pile looks thrown, not laid out. The walk's lines scroll past in front, so
  // each excuse lands where the line on screen at that moment is not: the first
  // ones below "Masz dwie sekundy...", the later ones above "Idź.". On a phone
  // every excuse gets its own band of the screen.
  var SPOT = [[20, 20, -3], [-12, 27, 2.5], [4, 3, 1.5], [24, -17, -2], [-16, -12, -1.5], [30, 4, 3], [12, 30, -2.5], [-8, 12, 1]];
  var SPOT_PH = [[6, 19, -3], [-6, 27.5, 2.5], [4, 2, 1.5], [-5, -15, -2], [6, -23.5, -1.5], [-4, -32, 3], [-6, 10.5, -2.5], [5, -6.5, 1]];
  // The distance counts down from 12 m to 0 m between these two points of the
  // walk. One excuse arrives every time it drops a metre, from 11 m to 4 m, and
  // at 2 m they all fall away: by then you are already there.
  var D0 = 0.15, D1 = 0.9;
  function atMetre(m) { return D0 + (1 - (m + 0.5) / 12) * (D1 - D0); }
  var EX_AT = EXCUSES.map(function (_, k) { return atMetre(11 - k); });
  var FALL_AT = atMetre(2);
  var ex = EXCUSES.map(function (t) {
    var p = document.createElement('p');
    p.className = 'excuse';
    p.textContent = t;
    exBox.appendChild(p);
    return { el: p, inV: 0, fall: 0, falling: false, drop: false, lo: null, lt: null };
  });
  function shownByScroll() {
    if (P >= FALL_AT) return 0;
    var c = 0;
    for (var k = 0; k < EX_AT.length; k++) if (P >= EX_AT[k]) c = k + 1;
    return c;
  }

  var hes = { on: false, n: 0, since: 0, lastAdd: 0, extra: 0 };
  var hesK = 0;
  var lastScrollAt = performance.now();
  var stuck = false;
  function release() {
    if (!hes.on) return;
    var c = shownByScroll();
    for (var k = c; k < Math.min(ex.length, c + hes.n); k++) ex[k].drop = true;
    hes.on = false; hes.n = 0; hes.extra = 0;
    if (hint) hint.classList.remove('on');
  }
  function hesitate(now) {
    var eligible = stuck && P > 0.1 && P < FALL_AT - 0.01 && !NOHES;
    if (!eligible) { release(); return; }
    if (!hes.on && now - lastScrollAt > 1300) { hes.on = true; hes.since = now; hes.n = 0; hes.lastAdd = now - 820; }
    if (!hes.on) return;
    // standing still: the excuses you have not even reached yet arrive anyway
    if (shownByScroll() + hes.n < ex.length && now - hes.lastAdd > 820) { hes.n++; hes.lastAdd = now; }
    hes.extra = Math.min(6, Math.floor((now - hes.since) / 1500));
    if (hint) hint.classList.toggle('on', now - hes.since > 1700);
  }
  function exTf(k, e, press) {
    var p = phone() ? SPOT_PH[k] : SPOT[k];
    var f2 = e.fall * e.fall;
    return 'translate(calc(-50% + ' + p[0] + 'vw), calc(-50% + ' + (p[1] + f2 * 60).toFixed(2) + 'vh + ' + ((1 - e.inV) * 16).toFixed(1) + 'px)) rotate(' +
      (p[2] + (k % 2 ? 1 : -1) * (8 + k * 3) * e.fall).toFixed(2) + 'deg) scale(' + ((0.94 + 0.06 * e.inV) * (1 + press * 0.035)).toFixed(4) + ')';
  }
  function excuses(dt) {
    var c = shownByScroll(), allFall = P >= FALL_AT, gone = 1 - smooth(FALL_AT + 0.03, FALL_AT + 0.09, P);
    for (var k = 0; k < ex.length; k++) {
      var e = ex[k];
      var want = !allFall && (k < c || (hes.on && k < c + hes.n));
      if (e.falling) {
        e.fall = Math.min(1, e.fall + dt / 0.65);
        if (e.fall >= 1) { e.inV = 0; if (want) { e.falling = false; e.fall = 0; } }
      } else if (e.inV > 0.04 && (allFall || (e.drop && k >= c))) {
        // (an extra that the walk itself has reached by now stays up instead of falling)
        e.falling = true; e.fall = 0;
      } else {
        e.inV += ((want ? 1 : 0) - e.inV) * (1 - Math.exp(-dt * (want ? 9 : 7)));
        if (Math.abs(e.inV - (want ? 1 : 0)) < 0.002) e.inV = want ? 1 : 0;
      }
      e.drop = false;
      // past 2 m the walk itself clears them too, however slow the frames are
      var o = e.inV * (1 - e.fall * e.fall) * gone;
      var so = o.toFixed(3);
      if (so !== e.lo) { e.lo = so; e.el.style.opacity = so; }
      if (o > 0.001 || e.lt === null) {
        var tf = exTf(k, e, hesK);
        if (tf !== e.lt) { e.lt = tf; e.el.style.transform = tf; }
      }
    }
  }

  /* -------------------------------------------------------------- the frame */
  var lastNow = 0, frameN = 0, pendingDt = 0, capY = null;
  var vfLast = '', vsLast = '', fillLast = '', hudLast = '';
  function frame(now) {
    requestAnimationFrame(frame);
    if (!CAPTURE) tick(now);
  }
  // ?capture: the recorder drives time itself, one exact frame per call.
  if (CAPTURE) window.__tick = function (now) { var y0 = window.scrollY; if (capY !== y0) { capY = y0; lastScrollAt = now; release(); } tick(now); };

  function tick(now) {
    if (window.innerWidth !== lastW || Math.abs(window.innerHeight - lastH) > 160) measure();
    else vh = window.innerHeight;   // the phone's URL bar: only the window changes, not the page
    var rawDt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
    var dt = Math.min(0.05, rawDt);
    lastNow = now;
    var sy = window.scrollY;
    var jumped = lastSy === null || Math.abs(sy - lastSy) > vh * 0.6;
    lastSy = sy;
    mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
    var ph = phone();

    // ---- where every section is
    var mid = sy + vh * 0.5, here = 0;
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i], a = s.top - sy;
      s.cov = Math.max(0, Math.min(a + s.h, vh) - Math.max(a, 0)) / vh;
      s.p = clamp((sy + vh - s.top) / (s.h + vh), 0, 1);
      if (s.top <= mid) here = i;
    }
    markHere(here);

    // ---- the walk
    P = clamp((sy - walk.top) / Math.max(1, walk.h - vh), 0, 1);
    stuck = sy >= walk.top - 1 && sy <= walk.top + walk.h - vh + 1;
    hesitate(now);
    hesK += ((hes.on ? 1 : 0) - hesK) * (1 - Math.exp(-dt * (hes.on ? 2.2 : 6)));
    if (walk.cov > 0 || hesK > 0.001) excuses(Math.min(0.12, rawDt));
    if (distEl) {
      var dist = Math.max(0, Math.round(12 * (1 - clamp((P - D0) / (D1 - D0), 0, 1)))) + hes.extra;
      if (distEl.textContent !== String(dist)) distEl.textContent = String(dist);
    }
    if (hud) {
      // the distance ducks out of the way while one of the walk's lines passes over it
      var over = 0;
      for (var w = 0; w < walkCopy.length; w++) {
        var wc = walkCopy[w], wt = (wc.top - sy) / vh, wb = (wc.top + wc.h - sy) / vh;
        if (wb > hudZ[0] - 0.03 && wt < hudZ[1] + 0.03) { over = 1; break; }
      }
      duck += (over - duck) * (1 - Math.exp(-dt * 10));
      var ho = ((1 - smooth(0.86, 0.91, P)) * (1 - 0.85 * duck)).toFixed(3);
      if (ho !== hudLast) { hudLast = ho; hud.style.opacity = ho; }
    }

    // ---- the night: every section on screen votes by how much of it you see
    var acc = {}, k, wsum = 0, vf = 0, vs = 0;
    for (k in BASE) acc[k] = 0;
    for (i = 0; i < secs.length; i++) {
      var sc = secs[i];
      if (sc.cov <= 0) continue;
      var st = sc.def.w(sc);
      for (k in acc) acc[k] += st[k] * sc.cov;
      wsum += sc.cov;
      vf += val(sc.def.flat) * sc.cov;
      vs += val(sc.def.side) * sc.cov;
    }
    if (wsum > 0) { for (k in acc) acc[k] /= wsum; vf /= wsum; vs /= wsum; } else acc = S({});
    if (hesK > 0.001) {
      acc.dim = 0.42 * hesK;
      acc.targetOn *= 1 - 0.6 * hesK;
      acc.dolly = Math.max(0, acc.dolly - 0.02 * hes.extra * hesK);
    }
    var hl = clamp(sy / vh, 0, 1.4);
    acc.parX = mx * 0.012;
    acc.parY = -my * 0.008 - hl * 0.025;
    if (world) {
      // ---- the plates: every section on screen weighs its photos by coverage;
      // the top two go to the slots. A slot keeps its plate until that plate's
      // weight is about 0 and another needs the slot, so nothing ever jumps.
      // The next section's plates start loading one section early.
      var pacc = {}, list, en, ww, e;
      for (i = 0; i < secs.length; i++) {
        var ps = secs[i];
        if (ps.cov <= 0) continue;
        for (var j = i; j <= i + 1 && j < secs.length; j++) {
          if (!secs[j].def.plates) continue;
          list = secs[j].def.plates(secs[j]);
          for (e = 0; e < list.length; e++) {
            en = list[e];
            world.plate(en.name, PLATE_URL + en.name + '.webp');
            ww = j === i ? en.w * ps.cov : 0;
            if (ww <= 0) continue;
            var pa = pacc[en.name] || (pacc[en.name] = { w: 0, cx: 0, cy: 0, zoom: 0 });
            pa.w += ww; pa.cx += en.cx * ww; pa.cy += en.cy * ww; pa.zoom += en.zoom * ww;
          }
        }
      }
      var order = Object.keys(pacc).sort(function (a, b) { return pacc[b].w - pacc[a].w; });
      for (i = 0; i < 2; i++) {
        var held = slotNames[i];
        if (held && pacc[held] && pacc[held].w > 0.002) continue;
        for (e = 0; e < order.length && e < 2; e++) if (order[e] !== slotNames[1 - i]) { slotNames[i] = order[e]; break; }
      }
      var pA = slotNames[0] && pacc[slotNames[0]], pB = slotNames[1] && pacc[slotNames[1]];
      var wA = pA ? pA.w : 0, wB = pB ? pB.w : 0;
      world.use(slotNames[0], slotNames[1]);
      acc.plateMix = wA + wB > 0 ? wB / (wA + wB) : 0;
      if (wA > 0) { acc.viewAx = pA.cx / wA; acc.viewAy = pA.cy / wA; acc.viewAz = pA.zoom / wA; }
      if (wB > 0) { acc.viewBx = pB.cx / wB; acc.viewBy = pB.cy / wB; acc.viewBz = pB.zoom / wB; }
      if (jumped || SNAP) world.jump(acc); else world.set(acc);
      frameN++;
      // under the shop the night is mostly veiled: half the frames are plenty
      if (vf > 0.72 && frameN % 2) pendingDt += dt;
      else {
        world.renderOnce(dt + pendingDt);
        pendingDt = 0;
        // Adaptive quality: a phone that cannot hold ~35fps gets a softer night
        // rather than a stuttering page. Only ever steps down.
        if (!HQ && !jumped && vf <= 0.72) {
          perf.n++;
          perf.ema = perf.ema ? perf.ema * 0.92 + dt * 0.08 : dt;
          if (perf.n > 40 && perf.ema > 0.029 && world.scale() > 0.36) { world.setScale(world.scale() * 0.8); perf.n = 0; perf.ema = 0; }
        }
      }
    } else if (poster) {
      var img = acc.warm > 0.6 ? 'assets/world-player.jpg' : 'assets/world-hero.jpg';
      if (poster.getAttribute('data-img') !== img) { poster.setAttribute('data-img', img); poster.style.backgroundImage = 'url(' + img + ')'; }
    }
    var svf = vf.toFixed(3), svs = vs.toFixed(3);
    if (veilFlat && svf !== vfLast) { vfLast = svf; veilFlat.style.opacity = svf; }
    if (veilSide && svs !== vsLast) { vsLast = svs; veilSide.style.opacity = svs; }

    // ---- hero: one push, four rates. The zero rises away, the player stays.
    if (hl < 1.4 || jumped) {
      var hp = heroPlanes;
      if (hp.far) set(hp.far, 'translate3d(' + (mx * -7).toFixed(1) + 'px,' + (-hl * 12 + my * -4).toFixed(2) + 'vh,0) scale(' + (1 + hl * 0.03).toFixed(4) + ')');
      if (hp.near) set(hp.near, 'translate3d(' + (mx * -16).toFixed(1) + 'px,' + (hl * 10 + my * -8).toFixed(2) + 'vh,0) scale(' + (1 + hl * 0.05).toFixed(4) + ')');
      if (hp.subject) set(hp.subject, 'translate3d(' + (mx * -11).toFixed(1) + 'px,' + (hl * 6).toFixed(2) + 'vh,0) scale(' + (1 + hl * 0.04).toFixed(4) + ')');
      if (hp.orbs) set(hp.orbs, 'translate3d(' + (mx * -34).toFixed(1) + 'px,' + (-hl * 30 + my * -14).toFixed(2) + 'vh,0)');
    }

    // ---- planes: nearer layers slide a little faster than the page, further
    // ones a little slower. Small numbers on purpose: depth, not seasickness.
    var kT = ph ? 5 : 9, kTr = ph ? 0.6 : 1;
    for (i = 0; i < planes.length; i++) {
      var pl = planes[i];
      var c = (pl.top + pl.h / 2 - sy - vh / 2) / vh;
      if (c > 1.8 || c < -1.8) continue;
      c = clamp(c, -1.3, 1.3);
      var travel = pl.t ? pl.t * kTr : pl.d * kT;
      var tf = 'translate3d(' + (FINE ? (mx * -pl.d * 10).toFixed(1) : '0') + 'px,' + (c * travel).toFixed(2) + 'vh,0)';
      if (tf !== pl.last) { pl.last = tf; pl.el.style.transform = tf; }
    }

    // ---- copy rises out of the dark
    for (i = 0; i < fades.length; i++) {
      var f = fades[i];
      var t = (f.top - sy) / vh, b = (f.top + f.h - sy) / vh;
      var aIn = smooth(0.98, 0.8, t);
      var o = aIn * (0.32 + 0.68 * smooth(-0.04, 0.2, b));
      var so = o > 0.995 ? '' : o.toFixed(3);
      var sl = aIn > 0.995 ? '' : '0 ' + ((1 - aIn) * 26).toFixed(1) + 'px';
      if (so !== f.lo) { f.lo = so; f.el.style.opacity = so; }
      if (sl !== f.ly) { f.ly = sl; f.el.style.translate = sl; }
    }

    // ---- Ty: the notes land one on top of the last as the pile rises
    if (notesBox) {
      var rel = (nb.top - sy) / vh;
      for (i = 0; i < notes.length; i++) {
        var n = notes[i], at = 0.84 - i * 0.115;
        var on = smooth(at, at - 0.09, rel);
        var newer = i < notes.length - 1 ? smooth(at - 0.115, at - 0.2, rel) : 0;
        var no = (on * (1 - newer * 0.12)).toFixed(3);
        var nt = 'translate3d(0,' + ((1 - on) * 30).toFixed(1) + 'px,0) rotate(' + ((i % 2 ? 1.2 : -1) * (1 - on * 0.6)).toFixed(2) + 'deg) scale(' + (1.03 - on * 0.03).toFixed(4) + ')';
        if (no !== n.lo) { n.lo = no; n.el.style.opacity = no; }
        if (nt !== n.lt) { n.lt = nt; n.el.style.transform = nt; }
      }
    }

    // ---- Prawda: the second line arrives a beat after the first
    for (i = 0; i < lines.length; i++) {
      var l = lines[i], lt = (l.top - sy) / vh;
      var lo = smooth(0.66, 0.5, lt);
      var slo = lo > 0.995 ? '' : lo.toFixed(3), sly = lo > 0.995 ? '' : '0 ' + ((1 - lo) * 0.4).toFixed(3) + 'em';
      if (slo !== l.lo) { l.lo = slo; l.el.style.opacity = slo; }
      if (sly !== l.ly) { l.ly = sly; l.el.style.translate = sly; }
    }

    // ---- Droga: each step comes up onto the route, and the route draws itself
    for (i = 0; i < reveals.length; i++) {
      var r = reveals[i], rt = (r.top - sy) / vh;
      var ra = smooth(0.97, 0.76, rt);
      var sro = ra > 0.995 ? '' : ra.toFixed(3), sry = ra > 0.995 ? '' : '0 ' + ((1 - ra) * 44).toFixed(1) + 'px';
      if (sro !== r.lo) { r.lo = sro; r.el.style.opacity = sro; }
      if (sry !== r.ly) { r.ly = sry; r.el.style.translate = sry; }
      var ron = rt < 0.56;
      if (ron !== r.on) { r.on = ron; r.el.classList.toggle('is-on', ron); }
    }
    if (routeFill) {
      var fill = clamp((sy + vh * 0.56 - rl.top) / Math.max(1, rl.h), 0, 1).toFixed(4);
      if (fill !== fillLast) { fillLast = fill; routeFill.style.transform = 'scaleY(' + fill + ')'; }
    }
  }
  function set(o, tf) { if (o.last !== tf) { o.last = tf; o.el.style.transform = tf; } }

  window.addEventListener('scroll', function () {
    if (CAPTURE) return;
    lastScrollAt = performance.now();
    release();
  }, { passive: true });

  /* ------------------------------------------------- navigation and focus */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var s = byId[a.getAttribute('href').slice(1)];
    if (!s) return;
    e.preventDefault();
    closeSheet();
    window.scrollTo({ top: s.id === 'noc' ? 0 : Math.round(s.top), behavior: 'smooth' });
    try { history.replaceState(null, '', '#' + s.id); } catch (err) { /* framed viewers may refuse it */ }
    // keyboard activation: move focus to the section too, so Tab carries on from there
    if (e.detail === 0) { s.el.setAttribute('tabindex', '-1'); s.el.focus({ preventScroll: true }); }
  });
  // Focus that lands where copy is still rising out of the dark (the bottom
  // edge) or sinking into it (the top edge) is brought to the middle.
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el || !el.getBoundingClientRect || el.closest('.edge, .sheet') || el.hasAttribute('data-layer')) return;
    // keyboard focus only: a click or a tap must never move the page
    try { if (!el.matches(':focus-visible')) return; } catch (err) { /* old browser: carry on */ }
    requestAnimationFrame(function () {
      var r = el.getBoundingClientRect(), h = window.innerHeight;
      if (r.top < h * 0.12 || r.bottom > h * 0.8) {
        window.scrollTo({ top: Math.max(0, Math.round(window.scrollY + r.top + r.height / 2 - h * 0.45)), behavior: 'instant' });
      }
    });
  });

  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener('load', measure);
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); }).observe(flow);
  requestAnimationFrame(frame);
  window.addEventListener('pageshow', function () { lastSy = null; });
})();
