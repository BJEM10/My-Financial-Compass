/* My Financial Compass — page behaviour.
   Classic script + IIFE, no modules, no animation library. The page is complete without it: this file
   is fetched after the first paint and only adds interaction. Motion lives in CSS (transitions and
   keyframes on transform/opacity); here a single rAF scroll loop feeds progress from cached geometry
   (no layout reads per frame) and IntersectionObservers flip classes. Every init is isolated in safe(). */
(function () {
  "use strict";

  var doc = document, root = doc.documentElement;
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BASE = doc.currentScript && doc.currentScript.src ? new URL(".", doc.currentScript.src).href : "";
  var BRASS = "#8A8558";
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var hasIO = "IntersectionObserver" in window;

  var DEBUG = /[?&]mfcdebug\b/.test(location.search);
  function safe(fn, name) {
    var t = DEBUG ? performance.now() : 0;
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
    if (DEBUG) console.log("[mfc] " + name + " " + (performance.now() - t).toFixed(1) + " ms");
  }
  function str(name) { var el = $('[data-str="' + name + '"]'); return el ? el.textContent : ""; }
  function headerH() { var h = $(".site-header"); return h ? h.offsetHeight : 64; }
  function onView(el, fn, opts) {
    if (!el) return;
    if (!hasIO) { fn(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); fn(en.target); } });
    }, opts || { threshold: 0.01 });
    io.observe(el);
  }

  var state = { introDone: false };

  /* ================================================================ 1. intro: CSS runs it, JS only closes it */
  function initIntro() {
    var full = root.classList.contains("intro-full"), short = root.classList.contains("intro-short");
    if (!full && !short) { state.introDone = true; return; }
    var skip = $("[data-intro-skip]");
    // The intro classes stay on <html> when it ends (removing a class from the root would restyle the whole
    // page): every keyframe uses 'backwards' fill, so each piece is back in its natural state by itself.
    function finish(e) {
      if (state.introDone) return;
      if (e) root.classList.remove("intro-full", "intro-short"); // skip: cut the animations short
      if (skip) skip.hidden = true;
      state.introDone = true;
      onScroll();
    }
    // the keyframes started with the first paint; close the intro when its last piece has landed
    var fcpEntry = performance.getEntriesByName ? performance.getEntriesByName("first-contentful-paint")[0] : null;
    var started = fcpEntry ? fcpEntry.startTime : performance.now();
    setTimeout(finish, Math.max(0, (full ? 2300 : 750) - (performance.now() - started)));
    if (full && skip) { skip.hidden = false; skip.addEventListener("click", finish, { once: true }); }
  }

  /* ================================================================ 2. one scroll loop: bearing, header, voyage, parallax, scrubs */
  var sections = $$("main > section[id]");
  var bearings = sections.map(function (s) { return +s.getAttribute("data-bearing") || 0; });
  var ports = $$(".voyage .port");
  var navLinks = $$(".nav a");
  var navMap = { home: "home", about: "about", values: "about", apart: "about", mission: "about", captain: "about", services: "services", contact: null, terms: "terms" };
  var voyage = $("[data-voyage]"), vProg = $("[data-voyage-progress]"), vShip = $("[data-voyage-ship]"), vTrack = voyage && $(".voyage-track", voyage);
  var miniStar = $("[data-mini-star]"), heroStar = $(".compass--hero .c-star");
  var heroInner = $(".hero-inner"), horizon = $(".horizon");
  var desktop = matchMedia("(min-width: 960px)");
  var geo = { tops: [], vh: innerHeight, docH: 0, heroH: 0, dark: [] };
  var scrubs = [];          // functions(y, vh) registered by the sections below
  var ticking = false, lastIdx = -1;

  function rect(el) { var r = el.getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; }
  function measure() {
    geo.vh = innerHeight;
    geo.docH = root.scrollHeight;
    geo.tops = sections.map(function (s) { return rect(s).top; });
    var hero = $("#home");
    geo.heroH = hero ? hero.offsetHeight : 0;
    geo.dark = [$("#about"), $("#captain"), $(".site-footer")].filter(Boolean).map(rect);
    geo.track = vTrack ? (desktop.matches ? vTrack.clientHeight - 28 : vTrack.clientWidth * 8 / 9) : 0;
    // section internals are measured lazily (see runNear): reading geometry inside a section that
    // content-visibility is still skipping would force the browser to lay it out right now
    measurers.forEach(function (m) { m.stale = true; m.top = rect(m.sec).top; });
    runNear(scrollY);
    onScroll();
  }
  var measurers = [];   // { sec, fn, stale, top }
  function runNear(y) {
    for (var n = 0; n < measurers.length; n++) {
      var m = measurers[n];
      if (m.stale && m.top < y + geo.vh * 1.25 && m.top > y - geo.vh * 6) { m.stale = false; safe(m.fn, "measure"); }
    }
  }
  var measureQueued = false;
  function queueMeasure() { if (!measureQueued) { measureQueued = true; requestAnimationFrame(function () { measureQueued = false; measure(); }); } }

  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  function update() {
    ticking = false;
    var y = scrollY, vh = geo.vh, probe = y + vh * .42;
    root.classList.toggle("is-compact", y > 24);
    if (!geo.tops.length) return; // not measured yet
    runNear(y);

    var i = 0, t = geo.tops;
    for (var k = 0; k < t.length; k++) if (t[k] <= probe) i = k;
    var nx = Math.min(i + 1, t.length - 1);
    var p = nx === i ? 0 : clamp((probe - t[i]) / ((t[nx] - t[i]) || 1), 0, 1);
    if (y + vh >= geo.docH - 4) { i = t.length - 1; p = 0; nx = i; }
    // The rose points to the bearing of the leg being sailed. It is measured from the top of the viewport
    // (not the 42% probe), so at the very top of the page it sits exactly like the logo: due north, 0°.
    var bi = 0;
    for (var q = 0; q < t.length; q++) if (t[q] <= y) bi = q;
    var bn = Math.min(bi + 1, t.length - 1);
    var bp = bn === bi ? 0 : clamp((y - t[bi]) / ((t[bn] - t[bi]) || 1), 0, 1);
    var bearing = bearings[bi] + (bearings[bn] - bearings[bi]) * bp;
    if (miniStar) miniStar.style.transform = "rotate(" + bearing.toFixed(1) + "deg)";
    if (heroStar && state.introDone && !reduced && y < geo.heroH) heroStar.style.transform = "rotate(" + bearing.toFixed(1) + "deg)";

    // voyage bar: evenly spaced ports, the ship sails from port i to port i+1
    if (voyage) {
      var f = (i + p) / Math.max(1, sections.length - 1);
      var vertical = desktop.matches;
      vProg.style.transform = vertical ? "scaleY(" + f.toFixed(4) + ")" : "scaleX(" + f.toFixed(4) + ")";
      vShip.style.transform = vertical ? "translate3d(0," + (f * geo.track).toFixed(1) + "px,0)" : "translate3d(" + (f * geo.track).toFixed(1) + "px,0,0)";
      if (i !== lastIdx) {
        ports.forEach(function (pt, n) {
          pt.classList.toggle("is-passed", n < i);
          pt.classList.toggle("is-current", n === i);
          if (n === i) pt.setAttribute("aria-current", "location"); else pt.removeAttribute("aria-current");
        });
        var key = navMap[sections[i].id];
        navLinks.forEach(function (a) { a.setAttribute("aria-current", String(a.getAttribute("href") === "#" + key)); });
        voyage.classList.toggle("is-docked", sections[i].id === "contact" || sections[i].id === "terms");
        lastIdx = i;
      }
    }
    // light ink for the voyage bar over the dark sections
    var mid = y + vh * .5, dark = false;
    geo.dark.forEach(function (r) { if (mid > r.top && mid < r.top + r.height) dark = true; });
    root.classList.toggle("on-dark", dark);

    // gentle parallax on the first screen
    if (!reduced && y < geo.heroH + 50) {
      var d = desktop.matches;
      if (heroInner) heroInner.style.transform = "translate3d(0," + (y * (d ? .14 : .06)).toFixed(1) + "px,0)";
      if (horizon) horizon.style.transform = "translate3d(0," + (y * (d ? .05 : .02)).toFixed(1) + "px,0)";
    }
    for (var s = 0; s < scrubs.length; s++) scrubs[s](y, vh);
  }

  function initScroll() {
    measure();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", queueMeasure);
    addEventListener("load", queueMeasure);
    desktop.addEventListener("change", queueMeasure);
    if ("ResizeObserver" in window) new ResizeObserver(queueMeasure).observe(doc.body);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(queueMeasure);
    // pause the hero's loops while it is off screen
    var hero = $("#home");
    if (hero && hasIO) new IntersectionObserver(function (e) { hero.classList.toggle("is-paused", !e[0].isIntersecting); }).observe(hero);
  }

  /* ================================================================ 3. reveals */
  function initReveals() {
    var els = $$(".reveal, [data-draw-line], [data-photo]");
    els.forEach(function (el) {
      var n = $$(":scope > .reveal", el.parentNode).indexOf(el);
      if (n > 0) el.style.setProperty("--i", Math.min(n, 4));
    });
    if (!hasIO) { els.forEach(function (e) { e.classList.add("is-in"); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.01, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (e) { io.observe(e); });
    setTimeout(function () {
      els.forEach(function (e) {
        if (e.classList.contains("is-in")) return;
        var s = e.closest("section") || e;
        if (s.getBoundingClientRect().top < innerHeight && e.getBoundingClientRect().top < innerHeight) e.classList.add("is-in");
      });
    }, 6000);
  }

  /* ================================================================ 4. headings: masked line reveal (tiny SplitText) */
  function wrapWords(el) {
    // keeps inline elements (em, strong, span.you) intact; splits only text nodes
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        var frag = doc.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function (w) {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(doc.createTextNode(" ")); return; }
          var s = doc.createElement("span"); s.className = "w"; s.textContent = w; frag.appendChild(s);
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1 && !node.classList.contains("w")) {
        node.classList.add("w");
      }
    });
    return $$(".w", el);
  }
  var splitDone = new WeakSet(), pending = [];
  function splitHeading(el) {
    if (splitDone.has(el)) return;
    if (el.getBoundingClientRect().top < innerHeight * .92) { splitDone.add(el); return; } // already on screen
    var original = el.innerHTML, words = wrapWords(el), lines = [], top = null;
    words.forEach(function (w) {
      var t = w.offsetTop;
      if (top === null || Math.abs(t - top) > 4) { lines.push([]); top = t; }
      lines[lines.length - 1].push(w.outerHTML);
    });
    el.innerHTML = lines.map(function (l, n) { return '<span class="line"><span class="line-in" style="--l:' + n + '">' + l.join(" ") + "</span></span>"; }).join("");
    el.classList.add("is-split");
    var rec = { el: el, original: original, done: false };
    pending.push(rec);
    onView(el, function () {
      if (rec.done) return;
      el.classList.add("is-revealed");
      setTimeout(function () {
        if (rec.done) return;
        rec.done = true; splitDone.add(el);
        el.classList.remove("is-split", "is-revealed");
        el.innerHTML = rec.original;
      }, 1200 + lines.length * 90);
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0 });
  }
  var splitIO = null;
  function initSplits() {
    if (reduced || !hasIO) return;
    if (!splitIO) {
      // measure a heading only when it is about to enter: no layout work for it at load
      splitIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { splitIO.unobserve(en.target); splitHeading(en.target); } });
      }, { rootMargin: "0px 0px 35% 0px", threshold: 0 });
    }
    $$("[data-split]").forEach(function (el) { if (!splitDone.has(el)) splitIO.observe(el); });
  }
  function resetPendingSplits() {
    pending.forEach(function (r) { if (!r.done) { r.done = true; r.el.classList.remove("is-split", "is-revealed"); r.el.innerHTML = r.original; } });
    pending = [];
  }

  /* ================================================================ 5. values: the star points N → E → S → W */
  // The values rose is the hero drawing cloned (before the intro touches it) instead of a second copy in
  // the HTML; its <use>/pattern references point at the hero's <defs>.
  var roseClone = null;
  function captureRose() {
    var h = $(".compass--hero");
    if (!h) return;
    roseClone = h.cloneNode(true);
    $$("defs", roseClone).forEach(function (d) { d.parentNode.removeChild(d); });
    roseClone.classList.remove("compass--hero");
    roseClone.classList.add("compass--values");
  }
  function initValues() {
    var section = $("#values"), stage = $("[data-values]"), slot = $("[data-values-rose]");
    if (!stage) return;
    if (slot && roseClone && !slot.firstChild) slot.appendChild(roseClone);
    var values = $$(".value", stage), star = $(".compass--values .c-star"), dias = $$(".compass--values .dia");
    var current = -1;
    function setActive(i) {
      if (i === current) return;
      current = i;
      values.forEach(function (v, k) { v.classList.toggle("is-active", k === i); });
      dias.forEach(function (d, k) { d.style.fill = d.style.stroke = k === i ? BRASS : ""; });
      if (star) star.style.transform = "rotate(" + i * 90 + "deg)";
    }
    stage.classList.add("values-live");
    setActive(0);
    var pinMQ = matchMedia("(min-width: 960px) and (min-height: 620px)");
    var g = { top: 0, h: 0, vt: [] };
    function pin() { section.classList.toggle("is-pinned", pinMQ.matches && !reduced); queueMeasure(); }
    pinMQ.addEventListener("change", pin);
    pin();
    measurers.push({ sec: section, stale: true, top: 0, fn: function () {
      var r = rect(section); g.top = r.top; g.h = r.height;
      g.vt = values.map(function (v) { return rect(v).top; });
    } });
    scrubs.push(function (y, vh) {
      if (!g.h || y + vh < g.top || y > g.top + g.h) return;
      var i;
      if (section.classList.contains("is-pinned")) {
        var p = clamp((y + 62 - g.top) / Math.max(1, g.h - vh), 0, 1); // 62 = the sticky offset in CSS
        i = p < .2 ? 0 : p < .45 ? 1 : p < .7 ? 2 : 3;
      } else {
        i = 0;
        g.vt.forEach(function (t, k) { if (t < y + vh * .58) i = k; });
      }
      setActive(i);
    });
  }

  /* ================================================================ 6. what sets us apart: the route between legs */
  var layoutRoute = function () {};
  function initLegs() {
    var legs = $("[data-legs]");
    if (!legs) return;
    var svg = $("[data-legs-route]", legs), base = $(".route-base", svg), ink = $(".route-ink", svg);
    var marks = $$(".leg-mark", legs);
    ink.setAttribute("pathLength", "1");
    ink.style.strokeDasharray = "1";
    ink.style.strokeDashoffset = reduced ? "0" : "1";
    var g = { top: 0, h: 0 };
    layoutRoute = function () {
      var b = legs.getBoundingClientRect();
      if (!b.width) return;
      var pts = marks.map(function (m) { var r = m.getBoundingClientRect(); return [r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top]; });
      var horizontal = pts.length > 1 && Math.abs(pts[1][0] - pts[0][0]) > 40;
      var d = "M" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], c = pts[i];
        if (horizontal) {
          // run along the top of the previous leg (above its text), then drop into the next waypoint from above
          var dx = c[0] - a[0];
          d += "C" + (a[0] + dx * .8).toFixed(1) + " " + a[1].toFixed(1) + " " + c[0].toFixed(1) + " " + a[1].toFixed(1) + " " + c[0].toFixed(1) + " " + c[1].toFixed(1);
        } else {
          d += "L" + c[0].toFixed(1) + " " + c[1].toFixed(1);
        }
      }
      var last = pts[pts.length - 1];
      if (!horizontal) d += "L" + last[0].toFixed(1) + " " + b.height.toFixed(1); // on phones the route keeps sailing down
      svg.setAttribute("viewBox", "0 0 " + b.width.toFixed(1) + " " + b.height.toFixed(1));
      base.setAttribute("d", d); ink.setAttribute("d", d);
      g.top = b.top + scrollY; g.h = b.height;
    };
    measurers.push({ sec: legs.closest("section"), stale: true, top: 0, fn: layoutRoute });
    if (reduced) return;
    var lastOff = -1;
    scrubs.push(function (y, vh) {
      if (!g.h || y + vh < g.top || y > g.top + g.h + vh) return;
      var off = 1 - clamp((y + vh * .78 - g.top) / Math.max(1, g.h * .85), 0, 1);
      if (Math.abs(off - lastOff) > .002) { ink.style.strokeDashoffset = off.toFixed(4); lastOff = off; }
    });
  }

  /* ================================================================ 7. mission: lights up word by word */
  var missionWords = [];
  function initMission() {
    var el = $("[data-words]");
    if (!el) return;
    missionWords = wrapWords(el);
    var g = { top: 0, h: 0 }, lit = -1;
    if (!initMission.bound) {
      initMission.bound = true;
      measurers.push({ sec: el.closest("section"), stale: true, top: 0, fn: function () { var r = rect(el); g.top = r.top; g.h = r.height; } });
      scrubs.push(function (y, vh) {
        if (!g.h || y + vh < g.top - vh || y > g.top + g.h + vh) return;
        var p = clamp((y + vh * .8 - g.top) / (g.h + vh * .32), 0, 1);
        var n = Math.round(p * missionWords.length);
        if (n === lit) return;
        lit = n;
        missionWords.forEach(function (w, k) { w.classList.toggle("is-lit", k < n); });
      });
      initMission.reset = function () { lit = -1; };
    } else if (initMission.reset) initMission.reset();
    queueMeasure();
  }

  /* ================================================================ 8. captain: counters */
  function initCounters() {
    if (reduced) return;
    $$("[data-count]").forEach(function (el) {
      var n = +el.getAttribute("data-count");
      var sec = el.closest("section");
      if (sec && sec.getBoundingClientRect().top < innerHeight) return; // already on screen
      el.textContent = "0";
      onView(el, function () {
        var t0 = performance.now(), dur = 1800;
        (function tick(t) {
          var k = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
          el.textContent = String(Math.round(n * e));
          if (k < 1) requestAnimationFrame(tick);
        })(t0);
      }, { threshold: 0.2 });
    });
  }

  /* ================================================================ 9. contact: the ship reaches port */
  function initPort() {
    var harbor = $(".harbor");
    if (!harbor) return;
    onView(harbor, function () { harbor.classList.add("is-arrived"); }, { threshold: 0.25 });
  }

  /* ================================================================ 10. services: opening a row changes the page height */
  function initServices() {
    var ledger = $("[data-ledger]");
    if (!ledger) return;
    ledger.addEventListener("toggle", function () { queueMeasure(); }, true); // toggle doesn't bubble
  }

  /* ================================================================ 11. contact form */
  function initForm() {
    var form = $("[data-form]");
    if (!form) return;
    var status = $("[data-form-status]", form);
    var ts = $("[data-form-ts]", form);
    if (ts) ts.value = String(Date.now());
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var checks = [
      { el: form.elements.first_name, ok: function (v) { return v.trim().length > 0; } },
      { el: form.elements.last_name, ok: function (v) { return v.trim().length > 0; } },
      { el: form.elements.email, ok: function (v) { return emailRe.test(v.trim()); } },
      // optional: blank is fine, otherwise 7–15 digits in any format
      { el: form.elements.phone, ok: function (v) { var d = v.replace(/\D/g, "").length; return !v.trim() || (d >= 7 && d <= 15 && /^[\d\s().+-]+$/.test(v.trim())); } },
      { el: form.elements.message, ok: function (v) { return v.trim().length > 0; } }
    ];
    function mark(field, bad) {
      var wrap = field.closest(".field");
      if (wrap) wrap.classList.toggle("is-invalid", bad);
      field.setAttribute("aria-invalid", String(bad));
    }
    function validate() {
      var first = null;
      checks.forEach(function (c) { var bad = !c.ok(c.el.value); mark(c.el, bad); if (bad && !first) first = c.el; });
      return first;
    }
    checks.forEach(function (c) { c.el.addEventListener("input", function () { if (c.el.getAttribute("aria-invalid") === "true" && c.ok(c.el.value)) mark(c.el, false); }); });
    // "See our Privacy Policy": open that panel of the terms before jumping to it
    form.addEventListener("click", function (e) {
      var a = e.target.closest("[data-open-privacy]"), p = $("#privacy");
      if (a && p) p.open = true;
    });
    function say(msg, kind) { status.className = "form-status" + (kind ? " is-" + kind : ""); status.textContent = msg; }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.classList.contains("is-sending")) return;
      var bad = validate();
      if (bad) { say(str("summary"), "error"); bad.focus(); return; }
      form.classList.add("is-sending");
      say(str("sending"));
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { if (!res.ok || !d.ok) throw new Error("send"); }); })
        .then(function () {
          form.reset();
          if (ts) ts.value = String(Date.now());
          say(str("success"), "ok");
        })
        .catch(function () { say(str("error"), "error"); })
        .then(function () { form.classList.remove("is-sending"); });
    });
    // without JavaScript the PHP answers with a redirect back here: ?sent=1 / ?sent=0
    var sent = /[?&]sent=([01])/.exec(location.search);
    if (sent) say(str(sent[1] === "1" ? "success" : "error"), sent[1] === "1" ? "ok" : "error");
  }

  /* ================================================================ 12. mobile menu */
  function initMenu() {
    var btn = $("[data-menu-toggle]"), menu = $("[data-menu]");
    if (!btn || !menu) return;
    var label = $(".menu-toggle-label", btn);
    var outside = [$("main"), $(".site-footer"), $(".voyage")].filter(Boolean);
    function isOpen() { return !menu.hidden; }
    function open() {
      menu.hidden = false;
      root.classList.add("menu-open");
      btn.setAttribute("aria-expanded", "true");
      if (label) label.textContent = str("close");
      outside.forEach(function (el) { el.inert = true; });
      var first = $("a", menu); if (first) first.focus();
    }
    function close(focusBtn) {
      menu.hidden = true;
      root.classList.remove("menu-open");
      btn.setAttribute("aria-expanded", "false");
      if (label) label.textContent = str("menu");
      outside.forEach(function (el) { el.inert = false; });
      if (focusBtn) btn.focus();
    }
    btn.addEventListener("click", function () { isOpen() ? close(true) : open(); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) close(false); });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) close(true); });
    // the menu button disappears at the same width as in critical.css (.menu-toggle)
    matchMedia("(min-width: 1100px)").addEventListener("change", function (m) { if (m.matches && isOpen()) close(false); });
    state.menuLabel = function () { if (label) label.textContent = isOpen() ? str("close") : str("menu"); };
  }

  /* ================================================================ 13. language: EN / ES */
  var dictPromise = null;
  function loadDict() {
    if (window.__MFC_I18N__) return Promise.resolve(window.__MFC_I18N__);
    if (dictPromise) return dictPromise;
    dictPromise = new Promise(function (resolve, reject) {
      var s = doc.createElement("script");
      s.src = BASE + "i18n.js?v=20261026c";
      s.onload = function () { window.__MFC_I18N__ ? resolve(window.__MFC_I18N__) : reject(new Error("i18n")); };
      s.onerror = function () { dictPromise = null; reject(new Error("i18n")); };
      doc.head.appendChild(s);
    });
    return dictPromise;
  }
  function htmlText(html) { var t = doc.createElement("textarea"); t.innerHTML = html; return t.value; }
  function applyDict(d) {
    $$("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (!(k in d)) return;
      if (el.tagName === "TITLE") doc.title = htmlText(d[k]);
      else el.innerHTML = d[k];
    });
    $$("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":"), attr = p[0].trim(), k = (p[1] || "").trim();
        if (k in d) el.setAttribute(attr, htmlText(d[k]));
      });
    });
    setYear(); // the copyright line came back with the year written in the HTML
  }
  // footer copyright: the HTML says the build year; the visitor's clock keeps it current
  // (only forward, so a device with a wrong clock can't show an older year)
  function setYear() {
    var y = new Date().getFullYear();
    $$("[data-year]").forEach(function (el) { if (y > parseInt(el.textContent, 10)) el.textContent = String(y); });
  }
  var switching = false;
  function setLang(lang) {
    if (switching || lang === root.lang) return;
    switching = true;
    var opts = $$("[data-set-lang]");
    loadDict().then(function (all) {
      // keep the reader's place: remember where the section under the header sits
      var hh = headerH(), anchor = null, before = 0;
      for (var i = 0; i < sections.length; i++) {
        var r = sections[i].getBoundingClientRect();
        if (r.bottom > hh + 1) { anchor = sections[i]; before = r.top; break; }
      }
      root.classList.add("i18n-fade");
      return wait(reduced ? 0 : 130).then(function () {
        resetPendingSplits();
        applyDict(all[lang]);
        root.lang = lang;
        opts.forEach(function (o) { if (o.getAttribute("data-set-lang") === lang) o.setAttribute("aria-current", "true"); else o.removeAttribute("aria-current"); });
        if (state.menuLabel) state.menuLabel();
        try { localStorage.setItem("mfc-lang", lang); } catch (e) {}
        try {
          var u = new URL(location.href);
          u.searchParams.set("lang", lang);
          u.searchParams.delete("sent");
          history.replaceState(null, "", u.pathname + u.search + u.hash);
        } catch (e) {}
        safe(initMission, "mission");
        measure();
        if (anchor) {
          var delta = anchor.getBoundingClientRect().top - before;
          if (Math.abs(delta) > 1) {
            root.style.scrollBehavior = "auto";
            scrollTo(0, scrollY + delta);
            root.style.scrollBehavior = "";
          }
        }
        safe(initSplits, "splits");
        root.classList.remove("i18n-fade");
      });
    }).catch(function (e) { console.warn("[i18n]", e); })
      .then(function () { switching = false; });
  }
  function initLang() {
    var box = $("[data-lang-switch]");
    if (!box) return;
    // the options are real links to the other language's page; with JavaScript the text swaps in place
    var warm = function () { loadDict().catch(function () {}); };
    box.addEventListener("pointerenter", warm, { once: true });
    box.addEventListener("focusin", warm, { once: true });
    box.addEventListener("touchstart", warm, { once: true, passive: true });
    box.addEventListener("click", function (e) {
      var o = e.target.closest("[data-set-lang]");
      if (!o) return;
      e.preventDefault();
      setLang(o.getAttribute("data-set-lang"));
    });
  }

  /* ================================================================ 14. late assets: the display face
     Fraunces is only used below the first screen, so its @font-face is added here, after the first paint,
     and never competes with the LCP. */
  function initLateAssets() {
    var css = "";
    [["normal", "fraunces-normal-latin"], ["italic", "fraunces-italic-latin"]].forEach(function (f) {
      css += '@font-face{font-family:"Fraunces";font-style:' + f[0] + ';font-weight:300 600;font-display:swap;src:url("' + BASE + "assets/fonts/" + f[1] + '.woff2") format("woff2")}';
    });
    var st = doc.createElement("style");
    st.textContent = css;
    doc.head.appendChild(st);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(queueMeasure);
  }

  /* ================================================================ boot
     The hero only needs the scroll loop, the intro close and the controls. Everything below the fold is
     set up when the browser is idle, one small task at a time. */
  function boot() {
    // tiny and needed at once: close the intro on time, request the late assets
    safe(initIntro, "intro");
    safe(initLateAssets, "assets");
    // the rest, one short task each (nothing here may block the main thread for long)
    var tasks = [[initScroll, "scroll"], [initLang, "lang"], [initMenu, "menu"], [captureRose, "rose"], [initReveals, "reveals"],
      [initForm, "form"], [initServices, "services"], [initValues, "values"], [initLegs, "legs"], [initMission, "mission"],
      [initCounters, "counters"], [initPort, "port"], [initSplits, "splits"], [setYear, "year"]];
    var idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 16); };
    idle(function next() {
      var t = tasks.shift();
      if (!t) { queueMeasure(); return; }
      safe(t[0], t[1]);
      idle(next, { timeout: 250 });
    }, { timeout: 250 });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
