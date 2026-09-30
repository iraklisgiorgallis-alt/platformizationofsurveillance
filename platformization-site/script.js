/* ------------------------------------------------------------
   Platformization of Surveillance: behaviour
    1. helpers             7. figure viewer + magnifier
    2. your trace          8. video
    3. reveal on scroll    9. Figure 1 data flow
    4. barcode strips     10. graphs (hand-drawn SVG)
    5. contents + progress 11. NHS redaction strip
    6. citations
   ------------------------------------------------------------ */

(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var SVG_NS = "http://www.w3.org/2000/svg";
  var COLOR = {
    gov: "#b53a1f",
    govLight: "#e3a08c",
    com: "#2f5f96",
    ink: "#1b1a17",
    inkSoft: "#46433c",
    paper: "#f2f0ea"
  };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function html(tag, className, parent, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      return ((h >>> 0) % 1000) / 1000;
    };
  }

  /* ---------- 2. your trace ----------
     The page keeps a visible log of what the reader does on it:
     a small reminder of the argument, since every visit is a data trace.
     It lives in this tab only and is never stored or sent anywhere. */

  var trace = (function () {
    var box = $(".trace");
    var count = 0, last = { label: "", t: 0 }, entries = [];
    var n = box ? $(".trace__n", box) : null;
    var topN = $(".topbar__trace-n");
    var list = box ? $(".trace__log", box) : null;
    var stripBox = box ? $(".trace__strip", box) : null;
    var strip = stripBox ? el("svg", { viewBox: "0 0 200 16", preserveAspectRatio: "none", focusable: "false" }, stripBox) : null;
    var rand = seeded("reader");
    var bars = [], listeners = [];

    function stamp(d) {
      function p(v) { return (v < 10 ? "0" : "") + v; }
      return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }

    function draw() {
      if (!strip) return;
      strip.innerHTML = "";
      var x = 200;
      for (var i = bars.length - 1; i >= 0 && x > 0; i--) {
        x -= bars[i].w;
        el("rect", { x: x, y: bars[i].tall ? 0 : 3, width: bars[i].w - bars[i].gap, height: bars[i].tall ? 16 : 13 }, strip);
      }
    }

    function add(label) {
      var now = Date.now();
      if (label === last.label && now - last.t < 2500) return;
      last = { label: label, t: now };
      count++;
      listeners.forEach(function (fn) { fn(label); });
      if (n) n.textContent = count;
      if (topN) topN.textContent = count;
      bars.push({ w: 2 + Math.floor(rand() * 4) + 2, gap: 1 + Math.floor(rand() * 2), tall: rand() > 0.8 });
      if (bars.length > 120) bars.shift();
      draw();
      entries.unshift({ t: new Date(), label: label });
      if (entries.length > 30) entries.pop();
      if (list && !list.hidden) render();
      if (box) {
        box.classList.remove("is-ping");
        void box.offsetWidth;
        box.classList.add("is-ping");
      }
    }

    function render() {
      list.innerHTML = "";
      entries.forEach(function (e) {
        var li = html("li", "", list);
        html("time", "", li, stamp(e.t));
        html("span", "", li, e.label);
      });
    }

    if (box) {
      var toggle = $(".trace__toggle", box);
      toggle.addEventListener("click", function () {
        var open = list.hidden;
        list.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        toggle.textContent = open ? "Hide the log" : "Show the log";
        if (open) {
          render();
          var inner = box.closest(".rail__inner");
          if (inner && inner.scrollHeight > inner.clientHeight && getComputedStyle(inner).position === "sticky") {
            inner.scrollTo({ top: inner.scrollHeight, behavior: "smooth" });
          }
        }
      });
    }

    /* things worth recording that don't belong to one component */
    var marks = [25, 50, 75, 100], passed = {};
    window.addEventListener("scroll", function () {
      var d = document.documentElement;
      var p = (window.scrollY / Math.max(1, d.scrollHeight - window.innerHeight)) * 100;
      marks.forEach(function (m) {
        if (!passed[m] && p >= m - 0.5) { passed[m] = true; add("Scrolled " + m + "% of the page"); }
      });
    }, { passive: true });
    document.addEventListener("copy", function () { add("Copied some text"); });
    document.addEventListener("visibilitychange", function () {
      add(document.hidden ? "Left the tab" : "Came back to the tab");
    });
    [1, 3, 5].forEach(function (min) {
      setTimeout(function () { add(min + (min === 1 ? " minute" : " minutes") + " on the page"); }, min * 60000);
    });
    setTimeout(function () { add("Opened the page"); }, 400);

    return { add: add, on: function (fn) { listeners.push(fn); } };
  })();

  /* ---------- 3. reveal on scroll ---------- */

  var pending = [];

  function show(t) {
    if (t.classList.contains("is-in")) return;
    t.classList.add("is-in");
    if (io) io.unobserve(t);
    var i = pending.indexOf(t);
    if (i > -1) pending.splice(i, 1);
    (t._onIn || []).forEach(function (fn) { fn(); });
    t._onIn = [];
  }

  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) show(en.target); });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }) : null;

  function reveal(node, fn) {
    if (fn) (node._onIn = node._onIn || []).push(fn);
    if (!io || reduceMotion) { show(node); return; }
    if (node.classList.contains("is-in")) { if (fn) fn(); node._onIn = []; return; }
    pending.push(node);
    io.observe(node);
  }

  /* anything already scrolled past (a fast scroll, a jump from the contents)
     is shown straight away, so no figure is ever left blank above the reader */
  function sweep() {
    var limit = window.innerHeight;
    pending.slice().forEach(function (n) { if (n.getBoundingClientRect().top < limit) show(n); });
  }
  var sweepTick = false;
  window.addEventListener("scroll", function () {
    if (!sweepTick) { sweepTick = true; requestAnimationFrame(function () { sweepTick = false; sweep(); }); }
  }, { passive: true });

  if (reduceMotion) document.documentElement.classList.add("still");

  /* ---------- 4. barcode strips ---------- */

  $$(".barcode").forEach(function (box) {
    var rand = seeded(box.getAttribute("data-barcode") || "trace");
    var svg = el("svg", { viewBox: "0 0 1000 20", preserveAspectRatio: "none", focusable: "false" }, box);
    var x = 0;
    while (x < 1000) {
      var w = 1 + Math.floor(rand() * 4.2);
      var tall = rand() > 0.82;
      el("rect", { x: x, y: tall ? 0 : 4, width: w, height: tall ? 20 : 16 }, svg);
      x += w + 1 + Math.floor(rand() * 5);
    }
    reveal(box);
  });

  $$(".opening, .flow, .plate, .pipe, .timeline, .tape, .takeaways, .part__head, .answer").forEach(function (n) { reveal(n); });

  /* the key terms: pointing at a term in the question lights its meaning, and back */
  $$("[data-term]").forEach(function (n) {
    var term = n.getAttribute("data-term");
    var pair = $$("[data-term='" + term + "']");
    function on() { pair.forEach(function (p) { p.classList.add("is-on"); }); }
    function off() { pair.forEach(function (p) { p.classList.remove("is-on"); }); }
    n.addEventListener("pointerenter", on);
    n.addEventListener("pointerleave", off);
    if (n.classList.contains("hl")) {
      n.addEventListener("pointerenter", function () { trace.add("Looked up “" + n.textContent + "”"); });
    }
  });

  /* ---------- 5. contents rail + reading progress ---------- */

  var railLinks = $$(".rail__list a");
  var targets = railLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
  var railFill = $(".rail__fill");
  var topFill = $(".topbar__fill");
  var ticking = false;
  var lastActive = -1;

  function onScroll() {
    ticking = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (railFill) railFill.style.height = (p * 100).toFixed(2) + "%";
    if (topFill) topFill.style.width = (p * 100).toFixed(2) + "%";

    var line = window.innerHeight * 0.3;
    var current = 0;
    targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= line) current = i; });
    railLinks.forEach(function (a, i) {
      var on = i === current;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
    if (current !== lastActive) {
      if (lastActive !== -1) trace.add("Reached " + railLinks[current].textContent.replace(/\s+/g, " ").trim());
      lastActive = current;
    }
  }

  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  var toggle = $(".topbar__toggle");
  var rail = $(".rail");
  if (toggle && rail) {
    toggle.addEventListener("click", function () {
      var open = !rail.classList.contains("is-open");
      rail.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Contents";
    });
    railLinks.forEach(function (a) {
      a.addEventListener("click", function () {
        if (rail.classList.contains("is-open")) {
          rail.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
          toggle.textContent = "Contents";
        }
      });
    });
  }

  /* ---------- 6. citations ----------
     Each number opens its source in a new tab. Sources listed without
     a web address stay plain numbers. Hovering either shows the entry. */

  var peek = $(".peek");
  var hideTimer = null;

  $$(".cite").forEach(function (a, i) {
    a.id = "cite-" + (i + 1);
    var ref = document.getElementById("ref-" + a.getAttribute("data-ref"));
    if (!ref) return;
    var linked = a.tagName === "A";
    a.setAttribute("aria-label", "Source " + a.textContent + (linked ? " (opens in a new tab)" : ""));

    if (!ref.querySelector(".back-link")) {
      var back = document.createElement("a");
      back.className = "back-link";
      back.href = "#" + a.id;
      back.textContent = "↩";
      back.setAttribute("aria-label", "Back to the text");
      ref.appendChild(back);
    }

    function show() {
      clearTimeout(hideTimer);
      peek.innerHTML = "";
      html("span", "peek__no", peek, "Source " + a.textContent);
      var body = ref.cloneNode(true);
      var b = body.querySelector(".back-link");
      if (b) b.remove();
      var wrap = html("div", "", peek);
      while (body.firstChild) wrap.appendChild(body.firstChild);
      peek.hidden = false;
      var r = a.getBoundingClientRect();
      var w = peek.offsetWidth;
      var left = Math.max(12, Math.min(window.scrollX + r.left - 16, window.scrollX + document.documentElement.clientWidth - w - 12));
      var top = window.scrollY + r.bottom + 10;
      if (r.bottom + peek.offsetHeight + 20 > window.innerHeight) top = window.scrollY + r.top - peek.offsetHeight - 10;
      peek.style.left = left + "px";
      peek.style.top = top + "px";
      trace.add("Looked up source " + a.textContent);
    }
    function hide() { hideTimer = setTimeout(function () { peek.hidden = true; }, 160); }

    a.addEventListener("mouseenter", show);
    a.addEventListener("focus", show);
    a.addEventListener("mouseleave", hide);
    a.addEventListener("blur", hide);
    a.addEventListener("click", function () {
      if (!linked) return;
      peek.hidden = true;
      trace.add("Opened source " + a.textContent);
    });
  });

  /* Links inside the page scroll to their target instead of changing the
     address, so nothing navigates away when the page is shown inside a
     preview frame. Links to other sites always open in a new tab. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (href.charAt(0) === "#") {
      var target = href === "#top" ? document.getElementById("top") : document.getElementById(href.slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    } else if (/^https?:/.test(href) && !a.target) {
      a.target = "_blank";
      a.rel = "noopener";
    }
  });

  if (peek) {
    peek.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    peek.addEventListener("mouseleave", function () { peek.hidden = true; });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && peek) peek.hidden = true; });

  /* ---------- 7. figure viewer + magnifier ---------- */

  var box = $(".lightbox");
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  $$(".plate__zoom").forEach(function (btn) {
    var img = btn.querySelector("img");
    var label = (btn.getAttribute("aria-label") || "").replace("Enlarge ", "");

    if (box && typeof box.showModal === "function") {
      btn.addEventListener("click", function () {
        var cap = btn.closest("figure").querySelector("figcaption").cloneNode(true);
        $$(".cites", cap).forEach(function (s) { s.remove(); });
        $(".lightbox__img", box).src = img.currentSrc || img.src;
        $(".lightbox__img", box).alt = img.alt;
        $(".lightbox__cap", box).textContent = cap.textContent.trim();
        box.showModal();
        trace.add("Enlarged " + label);
      });
    }

    if (!finePointer) return;
    var lens = null, Z = 2.4, S = 170;
    var figEl = btn.closest("figure");
    /* figures with an explore layer only magnify when the reader switches to it */
    function lensOn() { return !figEl.hasAttribute("data-explore") || figEl.classList.contains("is-magnify"); }
    function ensureLens() {
      if (!lens) {
        lens = html("span", "lens", btn);
        lens.setAttribute("aria-hidden", "true");
        lens.style.backgroundImage = "url(\"" + (img.currentSrc || img.src) + "\")";
      }
    }
    btn.addEventListener("pointerenter", function () {
      if (!lensOn()) return;
      ensureLens();
      lens.hidden = false;
      trace.add("Inspected " + label + " with the magnifier");
    });
    btn.addEventListener("pointermove", function (e) {
      if (!lensOn()) { if (lens) lens.hidden = true; return; }
      ensureLens();
      var ir = img.getBoundingClientRect(), br = btn.getBoundingClientRect();
      var x = e.clientX - ir.left, y = e.clientY - ir.top;
      if (x < 0 || y < 0 || x > ir.width || y > ir.height) { lens.hidden = true; return; }
      lens.hidden = false;
      lens.style.width = lens.style.height = S + "px";
      lens.style.left = (e.clientX - br.left - S / 2) + "px";
      lens.style.top = (e.clientY - br.top - S / 2) + "px";
      lens.style.backgroundSize = (ir.width * Z) + "px " + (ir.height * Z) + "px";
      lens.style.backgroundPosition = (-(x * Z - S / 2)) + "px " + (-(y * Z - S / 2)) + "px";
    });
    btn.addEventListener("pointerleave", function () { if (lens) lens.hidden = true; });
  });
  if (box) box.addEventListener("click", function (e) { if (e.target === box) box.close(); });

  /* ---------- 8. video ----------
     One clip, built into the page. The buttons beside it jump to the
     moments quoted in the text; the one playing is marked. */

  var tape = $(".tape");
  var video = tape ? $(".tape__video", tape) : null;
  if (video) {
    var marks = $$(".tape__mark", tape);
    var times = marks.map(function (m) { return parseFloat(m.getAttribute("data-t")); });

    marks.forEach(function (m, i) {
      m.addEventListener("click", function () {
        video.currentTime = times[i];
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
        trace.add("Jumped to " + $("time", m).textContent + " in the Karp clip");
      });
    });

    var lastNow = -1;
    video.addEventListener("timeupdate", function () {
      var t = video.currentTime, now = -1;
      times.forEach(function (s, i) { if (t >= s) now = i; });
      if (now !== lastNow) {
        marks.forEach(function (m, i) { m.classList.toggle("is-now", i === now); });
        lastNow = now;
      }
      marks.forEach(function (m, i) {
        var end = i < times.length - 1 ? times[i + 1] : video.duration || times[i] + 15;
        var p = t <= times[i] ? 0 : t >= end ? 100 : (t - times[i]) / (end - times[i]) * 100;
        m.style.setProperty("--p", p.toFixed(1) + "%");
      });
    });
    video.addEventListener("play", function () { tape.classList.add("is-playing"); trace.add("Played the Karp clip"); });
    video.addEventListener("pause", function () { tape.classList.remove("is-playing"); });
    video.addEventListener("ended", function () { tape.classList.remove("is-playing"); trace.add("Watched the Karp clip to the end"); });
  }

  /* ---------- 9. Figure 1: the data flow ----------
     Hover a stage to see where data goes from there; each stage
     links to the section of the script that discusses it. */

  var flow = $(".flow__body");
  if (flow) {
    var steps = Array.prototype.slice.call(flow.children);  /* columns, nodes and arrows, in order */
    $$(".flow__node", flow).forEach(function (node) {
      var sec = node.getAttribute("href").replace("#s", "").replace("-", ".");
      html("span", "flow__go", node, "→ " + sec);
      node.setAttribute("title", "Go to section " + sec);

      var stepEl = node.parentNode === flow ? node : node.parentNode;
      var idx = steps.indexOf(stepEl);
      node.addEventListener("pointerenter", function () {
        flow.classList.add("is-tracing");
        steps.forEach(function (s, i) { s.classList.toggle("on-path", i >= idx); });
        $$(".flow__col--sources .flow__node", flow).forEach(function (s) { s.classList.toggle("on-path", s === node); });
      });
      node.addEventListener("pointerleave", function () {
        flow.classList.remove("is-tracing");
        steps.forEach(function (s) { s.classList.remove("on-path"); });
        $$(".flow__node", flow).forEach(function (s) { s.classList.remove("on-path"); });
      });
      node.addEventListener("click", function () {
        trace.add("Followed the data from “" + node.firstChild.textContent.trim() + "” to " + sec);
      });
    });
  }

  /* ---------- 10. graphs ---------- */

  var tip = $(".tip");

  function showTip(evt, lines, anchor) {
    tip.innerHTML = "";
    lines.forEach(function (line, i) {
      if (i === 0) { html("b", "", tip, line.text); return; }
      var row = html("div", "tip__row", tip);
      if (line.color) { var k = html("i", "", row); k.style.background = line.color; }
      html("span", "", row, line.text);
    });
    tip.hidden = false;
    var x, y;
    if (evt && evt.clientX != null && evt.type.indexOf("pointer") === 0) {
      x = evt.clientX + 14; y = evt.clientY + 14;
    } else {
      var r = anchor.getBoundingClientRect();
      x = r.left + r.width / 2 + 10; y = r.top + 8;
    }
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var vw = document.documentElement.clientWidth;
    if (x + w > vw - 8) x = x - w - 28;
    if (y + h > window.innerHeight - 8) y = y - h - 28;
    tip.style.left = (window.scrollX + Math.max(8, x)) + "px";
    tip.style.top = (window.scrollY + Math.max(8, y)) + "px";
  }
  function hideTip() { tip.hidden = true; }

  function money(v, digits) {
    var d = digits == null ? 1 : digits;
    var s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return (v < 0 ? "−$" : "$") + s + "M";
  }
  function money0(v) { return money(v, 0); }
  function thousands(v) { return Math.round(v).toLocaleString("en-US"); }
  function pct(v) { return Math.round(v) + "%"; }

  function niceStep(range, count) {
    var raw = range / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  }

  /* bar with a 4px rounded data end and a square base */
  function barPath(x, y, w, h, roundTop) {
    var r = Math.min(4, w / 2, Math.abs(h));
    if (h <= 0) return "";
    if (roundTop) {
      return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
        "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
    }
    return "M" + x + "," + y + "V" + (y + h - r) + "Q" + x + "," + (y + h) + " " + (x + r) + "," + (y + h) +
      "H" + (x + w - r) + "Q" + (x + w) + "," + (y + h) + " " + (x + w) + "," + (y + h - r) + "V" + y + "Z";
  }
  function barPathRight(x, y, w, h) {
    var r = Math.min(4, h / 2, w);
    if (w <= 0) return "";
    return "M" + x + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) +
      "V" + (y + h - r) + "Q" + (x + w) + "," + (y + h) + " " + (x + w - r) + "," + (y + h) + "H" + x + "Z";
  }

  function tagOf(fig) { var t = $(".graph__tag", fig); return t ? t.textContent.trim() : "a graph"; }

  function legend(fig, items) {
    var bx = $(".graph__legend", fig);
    if (!bx || bx.classList.contains("graph__legend--none")) return;
    bx.innerHTML = "";
    items.forEach(function (it) {
      var k = html("span", "key", bx);
      var sw = html("i", "", k);
      sw.style.background = it.color;
      html("span", "", k, it.name);
    });
  }

  function table(fig, head, rows) {
    var old = $(".graph__table", fig);
    if (old) old.remove();
    var d = html("details", "graph__table");
    html("summary", "", d, "Show the numbers");
    var t = html("table", "", d);
    var tr = html("tr", "", html("thead", "", t));
    head.forEach(function (h) { html("th", "", tr, h); });
    var tb = html("tbody", "", t);
    rows.forEach(function (r) {
      var row = html("tr", "", tb);
      r.forEach(function (c) { html("td", "", row, c); });
    });
    d.addEventListener("toggle", function () { if (d.open) trace.add("Opened the numbers behind " + tagOf(fig)); });
    fig.appendChild(d);
  }

  function bindHover(svg, hit, marks, lines, fig) {
    function on(e) {
      svg.classList.add("is-hovering");
      marks.forEach(function (m) { m.classList.add("is-on"); });
      showTip(e, lines, hit);
      trace.add("Hovered over " + tagOf(fig) + ": " + lines[0].text);
    }
    function off() {
      svg.classList.remove("is-hovering");
      marks.forEach(function (m) { m.classList.remove("is-on"); });
      hideTip();
    }
    hit.addEventListener("pointermove", on);
    hit.addEventListener("pointerleave", off);
    hit.addEventListener("focus", on);
    hit.addEventListener("blur", off);
  }

  /* numbers that count up the first time a graph scrolls into view */
  function countUp(fig) {
    if (reduceMotion) return;
    $$("[data-v]", fig).forEach(function (t) {
      var to = parseFloat(t.getAttribute("data-v"));
      var f = t._f || function (v) { return String(Math.round(v)); };
      var t0 = null, dur = 900;
      function frame(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);
        t.textContent = f(to * e);
        if (k < 1) requestAnimationFrame(frame); else t.textContent = f(to);
      }
      requestAnimationFrame(frame);
    });
  }

  function valueLabel(parent, x, y, anchor, spec, cls) {
    var t = el("text", { x: x, y: y, "text-anchor": anchor || "middle", "class": cls || "vlabel" }, parent);
    t.textContent = spec.f(spec.v);
    t.setAttribute("data-v", spec.v);
    t._f = spec.f;
    return t;
  }

  /* Column chart: single, stacked (2 series) or signed. Each column grows from the baseline. */
  function columns(fig, cfg) {
    var canvas = $(".graph__canvas", fig);
    canvas.innerHTML = "";
    var W = Math.max(260, canvas.clientWidth);
    var H = cfg.height || 250;
    var n = cfg.categories.length;
    var twoLine = (W - (cfg.left || 46)) / n < 58 && cfg.categories.some(function (c) { return c.indexOf(" ") > 0; });
    var m = { t: 24, r: 8, b: twoLine ? 40 : 28, l: cfg.left || 46 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;

    var totals = cfg.categories.map(function (_, i) {
      return cfg.stacked ? cfg.series.reduce(function (s, se) { return s + se.values[i]; }, 0) : cfg.series[0].values[i];
    });
    var lo = Math.min(0, Math.min.apply(null, totals));
    var hi = cfg.max != null ? cfg.max : Math.max(0, Math.max.apply(null, totals));
    var step = cfg.step || niceStep(hi - lo, cfg.ticks || 4);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    function y(v) { return m.t + ph - ((v - lo) / (hi - lo)) * ph; }

    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, focusable: "false" }, canvas);
    var g = el("g", {}, svg);

    for (var v = lo; v <= hi + 1e-9; v += step) {
      var yy = Math.round(y(v)) + 0.5;
      el("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, "class": Math.abs(v) < 1e-9 ? "axis" : "grid" }, g);
      var t = el("text", { x: m.l - 8, y: yy + 3.5, "text-anchor": "end", "class": "tick" }, g);
      t.textContent = cfg.tick ? cfg.tick(v) : thousands(v);
    }

    var band = pw / n;
    var bw = Math.min(24, band * 0.6);
    var base = y(0);

    cfg.categories.forEach(function (cat, i) {
      var cx = m.l + band * i + band / 2;
      var x = cx - bw / 2;
      var marks = [];
      var col = el("g", { "class": "col" }, g);
      col.style.transformOrigin = cx + "px " + base + "px";
      col.style.transitionDelay = (i * 70) + "ms";

      if (cfg.stacked) {
        var acc = 0;
        cfg.series.forEach(function (se, si) {
          var val = se.values[i];
          var y0 = y(acc), y1 = y(acc + val);
          var last = si === cfg.series.length - 1;
          var h = y0 - y1 - (si > 0 ? 2 : 0);
          marks.push(el("path", { d: barPath(x, y1, bw, h, last), fill: se.color, "class": "mark" }, col));
          acc += val;
        });
      } else {
        var val1 = cfg.series[0].values[i];
        var top = val1 >= 0 ? y(val1) : y(0);
        var hh = Math.abs(y(val1) - y(0));
        marks.push(el("path", { d: barPath(x, top, bw, hh, val1 >= 0), fill: cfg.series[0].color, "class": "mark" }, col));
      }

      var lab = el("text", { x: cx, y: H - (twoLine ? 20 : 8), "text-anchor": "middle", "class": "tick" }, g);
      if (twoLine && cat.indexOf(" ") > 0) {
        var parts = cat.split(" ");
        el("tspan", { x: cx, dy: 0 }, lab).textContent = parts[0];
        el("tspan", { x: cx, dy: 13 }, lab).textContent = parts.slice(1).join(" ");
      } else {
        lab.textContent = cat;
      }

      if (cfg.label && cfg.label[i]) {
        var tv = totals[i];
        var ly = tv >= 0 ? y(tv) - 7 : y(tv) + 15;
        var anchor = cfg.labelAnchor ? cfg.labelAnchor(i, n) : "middle";
        var lx = anchor === "end" ? cx + bw / 2 : cx;
        valueLabel(g, lx, ly, anchor, cfg.label[i]);
      }

      var hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: ph, "class": "hit", tabindex: "0" }, svg);
      var lines = cfg.tooltip(i);
      hit.setAttribute("aria-label", lines.map(function (l) { return l.text; }).join(", "));
      bindHover(svg, hit, marks, lines, fig);
    });

    if (cfg.annotate) cfg.annotate(svg, { m: m, band: band, y: y, W: W, H: H, ph: ph });
  }

  /* One horizontal bar split into parts; it fills from the left. */
  function splitBar(fig, cfg) {
    var canvas = $(".graph__canvas", fig);
    canvas.innerHTML = "";
    var W = Math.max(260, canvas.clientWidth);
    var H = 86;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, focusable: "false" }, canvas);
    var total = cfg.parts.reduce(function (s, p) { return s + p.value; }, 0);
    var x = 0, y = 30, bh = 24;
    var grow = el("g", { "class": "grow-x" }, svg);
    grow.style.transformOrigin = "0px " + y + "px";
    cfg.parts.forEach(function (p, i) {
      var w = (p.value / total) * W - (i < cfg.parts.length - 1 ? 2 : 0);
      var last = i === cfg.parts.length - 1;
      var path = last ? barPathRight(x, y, Math.max(w, 3), bh) : "M" + x + "," + y + "h" + w + "v" + bh + "h" + (-w) + "Z";
      var mark = el("path", { d: path, fill: p.color, "class": "mark" }, grow);
      var t = el("text", { x: i === 0 ? 0 : W, y: 18, "text-anchor": i === 0 ? "start" : "end", "class": "vlabel" }, svg);
      t.textContent = p.label;
      var hit = el("rect", { x: last && w < 14 ? W - 14 : x, y: y - 6, width: Math.max(w, 14), height: bh + 12, "class": "hit", tabindex: "0" }, svg);
      var lines = [{ text: money0(p.value) }, { text: p.name, color: p.color }, { text: Math.round(p.value / total * 100) + "% of the rise" }];
      hit.setAttribute("aria-label", p.name + ", " + money0(p.value));
      bindHover(svg, hit, [mark], lines, fig);
      x += w + 2;
    });
    var tt = el("text", { x: 0, y: H - 6, "class": "tick" }, svg);
    tt.textContent = "Total rise: " + money0(total);
  }

  /* Horizontal bars, one per category; they grow from the left. */
  function hbars(fig, cfg) {
    var canvas = $(".graph__canvas", fig);
    canvas.innerHTML = "";
    var W = Math.max(240, canvas.clientWidth);
    var rowH = 54;
    var H = cfg.rows.length * rowH + 12;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, focusable: "false" }, canvas);
    var max = Math.max.apply(null, cfg.rows.map(function (r) { return r.value; }));
    var room = W - 58;
    cfg.rows.forEach(function (r, i) {
      var y0 = i * rowH + 22;
      var t = el("text", { x: 8, y: y0 - 8, "class": "tick" }, svg);
      t.textContent = r.name;
      var w = (r.value / max) * room;
      var grow = el("g", { "class": "grow-x" }, svg);
      grow.style.transformOrigin = "1px " + y0 + "px";
      grow.style.transitionDelay = (i * 150) + "ms";
      var mark = el("path", { d: barPathRight(1, y0, w, 20), fill: r.color, "class": "mark" }, grow);
      valueLabel(svg, 1 + w + 7, y0 + 15, "start", { v: r.value, f: function (v) { return "+" + Math.round(v) + "%"; } });
      var hit = el("rect", { x: 0, y: y0 - 18, width: W, height: rowH - 4, "class": "hit", tabindex: "0" }, svg);
      var lines = [{ text: "+" + r.value + "%" }, { text: r.name, color: r.color }, { text: "year on year, Q2 2026" }];
      hit.setAttribute("aria-label", r.name + ", up " + r.value + " percent");
      bindHover(svg, hit, [mark], lines, fig);
    });
    el("line", { x1: 0.5, x2: 0.5, y1: 8, y2: H, "class": "axis" }, svg);
  }

  /* Unit chart: squares drop in one by one, then the court's ruling is stamped on top. */
  function waffle(fig, cfg) {
    var canvas = $(".graph__canvas", fig);
    canvas.innerHTML = "";
    var W = Math.max(260, canvas.clientWidth);
    var cols = W < 520 ? 14 : 28;
    var gap = 3;
    var size = Math.min(21, Math.floor((W - gap * (cols - 1)) / cols));
    var total = cfg.groups.reduce(function (s, g) { return s + g.count; }, 0);
    var rows = Math.ceil(total / cols);
    var H = rows * (size + gap) + 4;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, focusable: "false" }, canvas);
    var k = 0;
    cfg.groups.forEach(function (grp) {
      var marks = [];
      for (var j = 0; j < grp.count; j++, k++) {
        var cx = (k % cols) * (size + gap);
        var cy = Math.floor(k / cols) * (size + gap);
        var sq = el("rect", { x: cx, y: cy, width: size, height: size, rx: 2, fill: grp.color, "class": "mark sq" }, svg);
        sq.style.transitionDelay = (k * 7) + "ms";
        marks.push(sq);
      }
      var lines = [{ text: "≈ " + thousands(grp.count * cfg.per) + " uses a year" }, { text: grp.name, color: grp.color }];
      marks.forEach(function (mk) { bindHover(svg, mk, marks, lines, fig); });
    });

    /* the stamp sits over the red block */
    var redRows = Math.floor(cfg.groups[0].count / cols);
    var gridW = cols * (size + gap) - gap;
    var cy0 = (redRows * (size + gap)) / 2;
    var sw = Math.min(gridW * 0.78, 340), sh = 58;
    var st = el("g", { "class": "stamp" }, svg);
    st.style.transformOrigin = (gridW / 2) + "px " + cy0 + "px";
    el("rect", { x: gridW / 2 - sw / 2, y: cy0 - sh / 2, width: sw, height: sh, rx: 3, "class": "stamp__box" }, st);
    el("rect", { x: gridW / 2 - sw / 2 + 4, y: cy0 - sh / 2 + 4, width: sw - 8, height: sh - 8, rx: 2, "class": "stamp__inner" }, st);
    var t1 = el("text", { x: gridW / 2, y: cy0 - 2, "text-anchor": "middle", "class": "stamp__big" }, st);
    t1.textContent = sw < 260 ? "UNCONSTITUTIONAL" : "RULED UNCONSTITUTIONAL";
    var t2 = el("text", { x: gridW / 2, y: cy0 + 16, "text-anchor": "middle", "class": "stamp__small" }, st);
    t2.textContent = "BVerfG · 16 FEB 2023";
  }

  /* ---------- data (from the filings and the judgment cited under each graph) ---------- */

  var years = ["2019", "2020", "2021", "2022", "2023", "2024", "2025"];
  var gov = [345.5, 610.2, 897.4, 1071.8, 1222.2, 1569.6, 2402.3];
  var com = [397.0, 482.5, 644.5, 834.1, 1002.8, 1295.9, 2073.2];
  var net = [-588.1, -1166.4, -520.4, -373.7, 209.8, 462.2, 1625.0];
  var quarters = ["Q3 '24", "Q4 '24", "Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25", "Q1 '26", "Q2 '26"];
  var usgov = [320, 343, 373, 426, 486, 570, 687, 809];

  function controls(fig, options, current, onPick) {
    var row = $(".graph__controls", fig);
    if (!row) {
      row = html("div", "graph__controls");
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Change the view");
      fig.insertBefore(row, $(".graph__legend", fig));
    }
    row.innerHTML = "";
    options.forEach(function (o) {
      var b = html("button", "graph__switch", row, o.label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(o.id === current));
      b.addEventListener("click", function () {
        if (o.id === current) return;
        onPick(o.id);
        /* replay the growth so the change reads as a change */
        fig.classList.add("redraw");
        void fig.offsetWidth;
        fig.classList.remove("redraw");
      });
    });
  }

  var segmentView = "amounts";

  var charts = {
    segments: function (fig) {
      var share = segmentView === "share";
      controls(fig, [{ id: "amounts", label: "Amounts" }, { id: "share", label: "Share of each year" }], segmentView, function (id) {
        segmentView = id;
        trace.add("Switched Graph A to " + (id === "share" ? "shares" : "amounts"));
        charts.segments(fig);
      });
      legend(fig, [{ name: "Government", color: COLOR.gov }, { name: "Commercial", color: COLOR.com }]);
      var tot = years.map(function (_, i) { return gov[i] + com[i]; });
      var gv = share ? gov.map(function (v, i) { return v / tot[i] * 100; }) : gov;
      var cv = share ? com.map(function (v, i) { return v / tot[i] * 100; }) : com;
      columns(fig, {
        categories: years,
        stacked: true,
        series: [{ name: "Government", color: COLOR.gov, values: gv }, { name: "Commercial", color: COLOR.com, values: cv }],
        max: share ? 100 : null,
        step: share ? 25 : 1000,
        tick: share ? function (v) { return v + "%"; } : thousands,
        label: share ? null : { 6: { v: tot[6], f: money } },
        labelAnchor: function (i, n) { return i === n - 1 ? "end" : "middle"; },
        tooltip: function (i) {
          return share ? [
            { text: years[i] + ": " + (gov[i] / tot[i] * 100).toFixed(1) + "% government" },
            { text: "Government " + (gov[i] / tot[i] * 100).toFixed(1) + "%", color: COLOR.gov },
            { text: "Commercial " + (com[i] / tot[i] * 100).toFixed(1) + "%", color: COLOR.com }
          ] : [
            { text: years[i] + ": " + money(tot[i]) },
            { text: "Government " + money(gov[i]), color: COLOR.gov },
            { text: "Commercial " + money(com[i]), color: COLOR.com }
          ];
        },
        annotate: share ? function (svg, g) {
          var y50 = Math.round(g.y(50)) + 0.5;
          el("line", { x1: g.m.l, x2: g.W - g.m.r, y1: y50, y2: y50, "class": "axis half" }, svg);
        } : null
      });
      table(fig, ["Year", "Government ($M)", "Commercial ($M)", "Total ($M)", "Government share"], years.map(function (y, i) {
        return [y, gov[i].toFixed(1), com[i].toFixed(1), tot[i].toFixed(1), (gov[i] / tot[i] * 100).toFixed(1) + "%"];
      }));
    },

    netincome: function (fig) {
      columns(fig, {
        categories: years,
        series: [{ name: "Net income", color: COLOR.ink, values: net }],
        step: 500,
        tick: function (v) { return v === 0 ? "0" : (v < 0 ? "−" : "") + thousands(Math.abs(v)); },
        label: { 1: { v: net[1], f: money }, 6: { v: net[6], f: money } },
        labelAnchor: function (i, n) { return i === n - 1 ? "end" : "middle"; },
        tooltip: function (i) { return [{ text: money(net[i]) }, { text: years[i] + (net[i] < 0 ? " · loss" : " · profit"), color: COLOR.ink }]; }
      });
      table(fig, ["Year", "Net income (loss), $M"], years.map(function (y, i) { return [y, net[i].toFixed(1)]; }));
    },

    existing: function (fig) {
      legend(fig, [{ name: "From existing government customers", color: COLOR.gov }, { name: "From new government customers", color: COLOR.govLight }]);
      splitBar(fig, {
        parts: [
          { name: "Existing government customers", value: 795, color: COLOR.gov, label: "Existing customers  $795M · 98%" },
          { name: "New government customers", value: 13, color: COLOR.govLight, label: "New  $13M" }
        ]
      });
      table(fig, ["Source of the rise", "US$ millions"], [["Existing government customers", "795"], ["New government customers", "13"], ["Total rise in government revenue", "808"]]);
    },

    quarterly: function (fig) {
      columns(fig, {
        categories: quarters,
        series: [{ name: "US government revenue", color: COLOR.gov, values: usgov }],
        step: 200,
        max: 900,
        label: { 0: { v: 320, f: money0 }, 7: { v: 809, f: money0 } },
        labelAnchor: function (i, n) { return i === n - 1 ? "end" : "middle"; },
        tooltip: function (i) {
          var lines = [{ text: "$" + usgov[i] + "M" }, { text: quarters[i] + " · US government", color: COLOR.gov }];
          if (i > 0) lines.push({ text: "+" + Math.round((usgov[i] / usgov[i - 1] - 1) * 100) + "% on the previous quarter" });
          if (i > 0) lines.push({ text: "×" + (usgov[i] / usgov[0]).toFixed(2) + " since Q3 '24" });
          return lines;
        },
        annotate: function (svg, g) {
          var x = Math.round(g.m.l + g.band * 2) + 0.5;
          el("line", { x1: x, x2: x, y1: g.m.t - 6, y2: g.m.t + g.ph, "class": "axis" }, svg);
          var t = el("text", { x: x + 6, y: g.m.t + 4, "class": "vlabel vlabel--soft" }, svg);
          t.textContent = "Jan 2025: Trump takes office";
        }
      });
      table(fig, ["Quarter", "US government revenue ($M)"], quarters.map(function (q, i) { return [q, String(usgov[i])]; }));
    },

    usshare: function (fig) {
      var cats = ["2019", "2025", "Q2 2026"], vals = [40, 74, 81];
      columns(fig, {
        categories: cats,
        series: [{ name: "US share", color: COLOR.ink, values: vals }],
        max: 100,
        step: 25,
        left: 38,
        tick: function (v) { return v + "%"; },
        label: { 0: { v: 40, f: pct }, 1: { v: 74, f: pct }, 2: { v: 81, f: pct } },
        tooltip: function (i) { return [{ text: vals[i] + "%" }, { text: cats[i] + " · share of revenue from the US", color: COLOR.ink }]; }
      });
      table(fig, ["Period", "US share of revenue"], cats.map(function (c, i) { return [c, vals[i] + "%"]; }));
    },

    growth: function (fig) {
      legend(fig, [{ name: "Commercial", color: COLOR.com }, { name: "Government", color: COLOR.gov }]);
      hbars(fig, { rows: [
        { name: "US commercial revenue", value: 149, color: COLOR.com },
        { name: "US government revenue", value: 90, color: COLOR.gov }
      ] });
      table(fig, ["Segment", "Growth, Q2 2026 vs Q2 2025"], [["US commercial revenue", "+149%"], ["US government revenue", "+90%"]]);
    },

    waffle: function (fig) {
      legend(fig, [{ name: "Preventing future offences (≈12,000): ruled unconstitutional", color: COLOR.gov }, { name: "Averting a present danger (≈2,000)", color: COLOR.inkSoft }]);
      waffle(fig, { per: 100, groups: [
        { name: "To prevent future criminal offences: the power the Court found unconstitutional", count: 120, color: COLOR.gov },
        { name: "To avert a present danger", count: 20, color: COLOR.inkSoft }
      ] });
      table(fig, ["Legal power used", "Uses a year"], [["Preventing future criminal offences (ruled unconstitutional)", "≈12,000"], ["Averting a present danger", "≈2,000"], ["Total", "≈14,000"]]);
    }
  };

  function drawAll() {
    $$("[data-chart]").forEach(function (fig) {
      var fn = charts[fig.getAttribute("data-chart")];
      if (fn) fn(fig);
    });
  }

  drawAll();
  $$("[data-chart]").forEach(function (fig) { reveal(fig, function () { countUp(fig); }); });

  var lastW = document.documentElement.clientWidth;
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var w = document.documentElement.clientWidth;
      if (w !== lastW) { lastW = w; hideTip(); drawAll(); }
    }, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);

  /* ---------- 11. NHS redaction strip ----------
     One line per page of the contract as it was first published. */

  var nhs = $$(".ledger li").filter(function (li) { return li.textContent.indexOf("417 of 586") > -1; })[0];
  if (nhs) {
    var wrap = html("span", "redact", nhs);
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", "586 pages: 417 blanked out, 169 readable");
    var rs = el("svg", { viewBox: "0 0 586 20", preserveAspectRatio: "none", focusable: "false" }, wrap);
    for (var p = 0; p < 586; p++) {
      var blank = p < 417;
      var r = el("rect", { x: p, y: blank ? 0 : 5, width: 0.72, height: blank ? 20 : 15, "class": blank ? "redact__off" : "redact__on" }, rs);
      r.style.transitionDelay = (p * 1.6) + "ms";
    }
    html("span", "redact__key", wrap, "each line is one page · black = blanked out");
    reveal(wrap);
    wrap.addEventListener("pointerenter", function () { trace.add("Looked at the blanked-out NHS contract"); });
  }

  /* ---------- 12. figures you can explore ----------
     Each source figure gets a light layer on top of it: points to hover
     or tap, buttons that pick out one part of it, and a short readout.
     The picture itself is untouched, and clicking it still enlarges it. */

  var holeId = 0;

  function explorer(fig, W, H) {
    var btn = $(".plate__zoom", fig);
    var strong = $("figcaption strong", fig);
    var name = strong ? strong.textContent.replace(/\.\s*$/, "") : "the figure";

    var stage = html("div", "plate__stage");
    btn.parentNode.insertBefore(stage, btn);
    stage.appendChild(btn);

    var layer = html("div", "layer", stage);
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", focusable: "false", "aria-hidden": "true" }, layer);
    var id = "hole-" + (++holeId);
    var mask = el("mask", { id: id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H }, el("defs", {}, svg));
    el("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }, mask);
    var holes = el("g", {}, mask);
    el("rect", { x: 0, y: 0, width: W, height: H, "class": "layer__dim", mask: "url(#" + id + ")" }, svg);
    var fx = el("g", { "class": "layer__fx" }, svg);
    var hud = html("p", "layer__hud");
    fig.insertBefore(hud, stage.nextSibling);
    hud.setAttribute("aria-live", "polite");
    var idle = (finePointer ? "Hover" : "Tap") + " a marker, or pick a button above";

    var bar = html("div", "explore");
    fig.insertBefore(bar, stage);
    html("span", "explore__label", bar, "Explore");
    var chips = html("div", "explore__chips", bar);
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Explore " + name);

    var timers = [], current = null, onReset = [], pins = [];

    var X = {
      fig: fig, W: W, H: H, fx: fx, layer: layer, stage: stage, name: name,
      img: $("img", btn),
      later: function (fn, ms) { timers.push(setTimeout(fn, ms)); },
      onReset: function (fn) { onReset.push(fn); },
      light: function (level) {
        fig.classList.toggle("is-lit", !!level);
        fig.classList.toggle("is-soft", level === "soft");
      },
      hole: function (s) {
        if (s.c) el("circle", { cx: s.c[0], cy: s.c[1], r: s.c[2], fill: "#000" }, holes);
        if (s.r) el("rect", { x: s.r[0], y: s.r[1], width: s.r[2], height: s.r[3], rx: 6, fill: "#000" }, holes);
      },
      ring: function (x, y, r, delay) {
        var c = el("circle", { cx: x, cy: y, r: r, "class": "ring" }, fx);
        if (delay) c.style.animationDelay = delay + "ms";
        return c;
      },
      line: function (x1, y1, x2, y2, cls) {
        return el("line", { x1: x1, y1: y1, x2: x2, y2: y2, "class": cls || "" }, fx);
      },
      draw: function (node, len, dur, delay) {
        node.style.strokeDasharray = len + " " + len;
        node.style.strokeDashoffset = reduceMotion ? 0 : len;
        if (reduceMotion) return;
        node.getBoundingClientRect();
        node.style.transition = "stroke-dashoffset " + dur + "ms cubic-bezier(.3,.6,.2,1) " + (delay || 0) + "ms";
        requestAnimationFrame(function () { requestAnimationFrame(function () { node.style.strokeDashoffset = 0; }); });
      },
      flag: function (x, y, text, side) {
        var f = html("span", "flag flag--" + (side || "r"), layer, text);
        f.style.left = (x / W * 100) + "%";
        f.style.top = (y / H * 100) + "%";
        return f;
      },
      say: function (text) {
        hud.textContent = text || idle;
        hud.classList.toggle("is-idle", !text);
      },
      reset: function (keepTimers) {
        if (!keepTimers) { timers.forEach(clearTimeout); timers = []; }
        holes.innerHTML = "";
        fx.innerHTML = "";
        $$(".flag", layer).forEach(function (f) { f.remove(); });
        X.light(false);
        X.say("");
        onReset.forEach(function (fn) { fn(); });
      },
      apply: function (fn, keepTimers) { X.reset(keepTimers); if (fn) fn(); },
      preview: function (fn) { X.apply(fn); },
      restore: function () { X.apply(current ? current.fn : null); },
      settle: function (fn) { current = { btn: null, fn: fn }; press(null); },
      chip: function (label, fn, opts) {
        opts = opts || {};
        var b = html("button", "explore__chip" + (opts.action ? " explore__chip--action" : ""), chips, label);
        b.type = "button";
        if (!opts.action) b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          magnify(false);
          if (opts.action) {
            current = null;
            press(null);
            X.apply(fn);
          } else {
            var on = !(current && current.btn === b);
            current = on ? { btn: b, fn: fn } : null;
            press(on ? b : null);
            X.apply(on ? fn : null);
          }
          trace.add("Explored " + name + ": " + label);
        });
        return b;
      },
      pin: function (x, y, o) {
        var p = html("button", "pin" + (o.cls ? " " + o.cls : ""), layer);
        p.type = "button";
        p.style.left = (x / W * 100) + "%";
        p.style.top = (y / H * 100) + "%";
        if (o.text) html("span", "", p, o.text);
        p.setAttribute("aria-label", o.lines.map(function (l) { return l.text; }).join(". "));
        pins.push({ el: p, chip: o.chip });
        var on = function (e) { if (o.show) X.preview(o.show); showTip(e, o.lines, p); };
        var off = function () { hideTip(); if (o.show) X.restore(); };
        p.addEventListener("pointerenter", on);
        p.addEventListener("focus", on);
        p.addEventListener("pointerleave", off);
        p.addEventListener("blur", off);
        p.addEventListener("click", function (e) {
          e.stopPropagation();
          if (o.chip && !(current && current.btn === o.chip)) o.chip.click();
          showTip(e, o.lines, p);
          trace.add("Pointed at " + o.lines[0].text + " in " + name);
        });
        return p;
      }
    };

    function press(b) {
      $$(".explore__chip[aria-pressed]", chips).forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      pins.forEach(function (p) { p.el.classList.toggle("is-on", !!b && p.chip === b); });
    }

    var magBtn = null;
    function magnify(on) {
      fig.classList.toggle("is-magnify", on);
      if (magBtn) magBtn.setAttribute("aria-pressed", String(on));
    }
    if (finePointer) {
      magBtn = html("button", "explore__chip explore__mag", bar, "Magnifier");
      magBtn.type = "button";
      magBtn.setAttribute("aria-pressed", "false");
      magBtn.addEventListener("click", function () {
        var on = !fig.classList.contains("is-magnify");
        if (on) { current = null; press(null); X.reset(); }
        magnify(on);
        trace.add((on ? "Picked up" : "Put down") + " the magnifier on " + name);
      });
    }

    X.say("");
    return X;
  }

  function clean(t) { return t.replace(/\s+/g, " ").trim().replace(/[,.;]$/, ""); }
  function two(n) { return (n < 10 ? "0" : "") + n; }

  var explorers = {

    /* Brayne's five shifts: each row lights up with its line in the list above */
    brayne: function (fig) {
      var X = explorer(fig, 1198, 622);
      var rows = [140, 237, 333, 430, 525], ends = [388, 536, 686, 835, 985], start = 268;
      var items = $$(".shifts li");
      X.onReset(function () { items.forEach(function (li) { li.classList.remove("is-lit"); }); });

      function row(i) {
        return function () {
          X.light(true);
          X.hole({ r: [58, rows[i] - 46, 1134, 92] });
          var track = X.line(start, rows[i], ends[i], rows[i], "draw");
          X.draw(track, ends[i] - start, 900);
          var dot = el("circle", { cx: start, cy: rows[i], r: 15, "class": "mover" }, X.fx);
          requestAnimationFrame(function () { requestAnimationFrame(function () {
            dot.style.transform = "translateX(" + (ends[i] - start) + "px)";
          }); });
          if (items[i]) {
            items[i].classList.add("is-lit");
            X.say(two(i + 1) + " · " + clean(items[i].textContent));
          }
        };
      }
      var chips = rows.map(function (_, i) { return X.chip(two(i + 1), row(i)); });
      rows.forEach(function (y, i) {
        X.pin(36, y, { text: two(i + 1), lines: [{ text: "Shift " + two(i + 1) }, { text: items[i] ? clean(items[i].textContent) : "" }], show: row(i), chip: chips[i] });
      });
      items.forEach(function (li, i) {
        li.addEventListener("pointerenter", function () { X.preview(row(i)); });
        li.addEventListener("pointerleave", function () { X.restore(); });
      });
      X.intro = function () {
        rows.forEach(function (_, i) { X.later(function () { X.apply(row(i), true); }, i * 1300); });
        X.later(function () { X.restore(); }, rows.length * 1300 + 400);
      };
      return X;
    },

    /* Qlik Sense: the three biggest hubs, and the members with no policing mandate */
    qlik: function (fig) {
      var X = explorer(fig, 1269, 792);
      var hubs = [
        { name: "Office for Data Analytics", n: 71, x: 849, y: 326, r: 150, side: "t" },
        { name: "Qlik Sense", n: 55, x: 838, y: 523, r: 150, side: "b" },
        { name: "Think Family", n: 48, x: 538, y: 480, r: 125, side: "l" }
      ];
      hubs.forEach(function (h) {
        var show = function () {
          X.light(true);
          X.hole({ c: [h.x, h.y, h.r] });
          X.ring(h.x, h.y, 20);
          X.ring(h.x, h.y, 20, 900);
          X.flag(h.x, h.y, h.n + " links", h.side);
          X.say(h.name + " · " + h.n + " links · one of the three largest hubs among at least 195 nodes");
        };
        var c = X.chip(h.name + " · " + h.n, show);
        X.pin(h.x, h.y, { cls: "pin--ring", lines: [{ text: h.name }, { text: h.n + " links" }], show: show, chip: c });
      });
      var outside = [
        { name: "Drug and alcohol service", x: 434, y: 155, r: 80, side: "t" },
        { name: "City council", x: 585, y: 392, r: 62, side: "r" }
      ];
      var showOutside = function () {
        X.light(true);
        outside.forEach(function (o, i) {
          X.hole({ c: [o.x, o.y, o.r] });
          X.ring(o.x, o.y, 16, i * 300);
          X.flag(o.x, o.y, o.name, o.side);
        });
        X.say("No policing mandate at all, yet feeding the same network");
      };
      var oc = X.chip("No policing mandate", showOutside);
      outside.forEach(function (o) {
        X.pin(o.x, o.y, { cls: "pin--ring", lines: [{ text: o.name }, { text: "no policing mandate" }], show: showOutside, chip: oc });
      });
      return X;
    },

    /* The Violence Reduction Unit: inputs stream into the centre */
    vru: function (fig) {
      var X = explorer(fig, 988, 714);
      var C = [606, 297];
      var care = [[661, 612], [614, 503], [425, 588], [891, 196], [432, 187], [903, 399]];
      var police = [[503, 56], [784, 408], [386, 77]];
      var all = care.concat(police, [[740, 33], [621, 36], [784, 144], [313, 172], [359, 282], [835, 301], [300, 385],
        [419, 385], [360, 488], [484, 485], [733, 517], [852, 507], [543, 598], [606, 297]]).filter(function (p) { return p[0] !== C[0] || p[1] !== C[1]; });

      function stream(pts, text) {
        return function () {
          X.light(true);
          X.hole({ c: [C[0], C[1], 46] });
          pts.forEach(function (p, i) {
            X.hole({ r: [p[0] - 118, p[1] - 22, 236, 56] });
            var l = X.line(p[0], p[1], C[0], C[1], "stream");
            l.style.animationDelay = (-i * 0.23) + "s";
            X.ring(p[0], p[1], 11, i * 90);
          });
          X.ring(C[0], C[1], 22);
          X.say(text);
        };
      }
      X.chip("Schools, health and social care", stream(care, "School, health and social-care records → Violence Reduction Unit"));
      X.chip("Police and crime", stream(police, "Police and crime records → the same unit"));
      var everything = stream(all, all.length + " inputs, one unit");
      X.chip("Every input", everything);
      X.intro = function () {
        everything();
        X.later(function () { X.restore(); }, 3600);
      };
      return X;
    },

    /* The FI card: what the card asks for, and how the points add up */
    fi: function (fig) {
      var X = explorer(fig, 1112, 629);
      var spots = [
        { x: 402, y: 30, r: [104, 10, 990, 148], title: "Persons with subject", note: "The card logs whoever is with the subject, not only the subject" },
        { x: 1066, y: 74, r: [771, 42, 322, 114], title: "Gang / moniker", note: "Gang affiliation: 5 points" },
        { x: 902, y: 447, r: [104, 416, 824, 62], title: "Date, time, location", note: "“It’s one point for every police contact”" }
      ];
      spots.forEach(function (s, i) {
        var show = function () {
          X.light(true);
          X.hole({ r: s.r });
          X.say(s.title + " · " + s.note);
        };
        var c = X.chip(s.title, show);
        X.pin(s.x, s.y, { text: String(i + 1), lines: [{ text: s.title }, { text: s.note }], show: show, chip: c });
      });
      tally(fig, X);
      return X;
    },

    /* Palantir's network view: the search spreads out from one person */
    network: function (fig) {
      var X = explorer(fig, 1186, 882);
      var C = [637, 395];
      var ents = [
        { k: "people", name: "Simon Bedleson", x: 222, y: 40, note: "appears in the same arrest" },
        { k: "people", name: "Grant Incognito", x: 222, y: 375, note: "colleague of" },
        { k: "people", name: "Jane Doe", x: 430, y: 560, note: "lover of · lives/lived with" },
        { k: "people", name: "John Doe", x: 578, y: 770, note: "lives/lived with · sibling of Jane Doe" },
        { k: "things", name: "Green Toyota Prius", x: 665, y: 45, note: "owner of" },
        { k: "things", name: "5569 W 3rd St.", x: 945, y: 95, note: "has employee" },
        { k: "things", name: "555-415-6543", x: 1060, y: 575, note: "operator of" },
        { k: "things", name: "555-531-0021", x: 865, y: 695, note: "operator of" },
        { k: "records", name: "Arrest: Guy Cross, Simon Bedleson", x: 470, y: 205, note: "appears in" },
        { k: "records", name: "Arrest: Guy Cross, stolen property", x: 1060, y: 305, note: "appears in" }
      ];
      ents.forEach(function (e) { e.d = Math.hypot(e.x - C[0], e.y - C[1]); });

      var search = function () {
        var img = X.img;
        var s = img.clientWidth / X.W;
        var max = Math.max(Math.hypot(C[0], C[1]), Math.hypot(X.W - C[0], C[1]), Math.hypot(C[0], X.H - C[1]), Math.hypot(X.W - C[0], X.H - C[1]));
        X.ring(C[0], C[1], 30);
        if (reduceMotion) { X.say(ents.length + " people, objects and records linked to Guy Cross"); return; }
        var sweep = el("circle", { cx: C[0], cy: C[1], r: 1, "class": "sweep" }, X.fx);
        var t0 = null, dur = 2600, found = 0;
        fig.classList.add("is-searching");
        function frame(ts) {
          if (!sweep.isConnected) { img.style.clipPath = ""; fig.classList.remove("is-searching"); return; }
          if (!t0) t0 = ts;
          var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 2.4);
          var r = e * max;
          sweep.setAttribute("r", r);
          img.style.clipPath = "circle(" + (r * s + 12) + "px at " + (C[0] * s) + "px " + (C[1] * s) + "px)";
          var n = ents.filter(function (en) { return en.d <= r; }).length;
          if (n !== found) { found = n; X.say("Searching around Guy Cross · " + n + " linked"); }
          if (k < 1) requestAnimationFrame(frame);
          else {
            img.style.clipPath = "";
            fig.classList.remove("is-searching");
            sweep.remove();
            X.say(ents.length + " people, objects and records linked to Guy Cross");
          }
        }
        requestAnimationFrame(frame);
      };
      X.onReset(function () { X.img.style.clipPath = ""; fig.classList.remove("is-searching"); });

      function group(k, text) {
        return function () {
          X.light(true);
          X.hole({ c: [C[0], C[1], 58] });
          ents.forEach(function (e, i) {
            if (e.k !== k) return;
            X.hole({ c: [e.x, e.y, 78] });
            X.ring(e.x, e.y, 26, i * 120);
          });
          X.say(text);
        };
      }
      X.chip("▶ Run the search", function () { search(); X.settle(null); }, { action: true });
      var chipFor = {
        people: X.chip("People", group("people", "People: a colleague, a partner, someone he lives or lived with, someone in the same arrest")),
        things: X.chip("Car, address, phones", group("things", "A car he owns, an employer’s address and two phones he operates")),
        records: X.chip("Arrest records", group("records", "Two arrests he appears in"))
      };
      ents.forEach(function (e) {
        X.pin(e.x, e.y, { cls: "pin--ring pin--sm", lines: [{ text: e.name }, { text: e.note }], chip: chipFor[e.k] });
      });
      X.intro = function () { search(); };
      return X;
    },

    /* ALPR: four sightings of one plate, replayed in the order they happened */
    alpr: function (fig) {
      var X = explorer(fig, 1310, 810);
      var scans = [
        { x: 371, y: 512, t: Date.UTC(2014, 5, 15, 14, 12, 32) },
        { x: 633, y: 297, t: Date.UTC(2014, 5, 15, 23, 42, 59) },
        { x: 156, y: 234, t: Date.UTC(2014, 7, 2, 5, 41, 12) },
        { x: 441, y: 346, t: Date.UTC(2015, 0, 1, 8, 0, 0) }
      ];
      var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      function when(t) { var d = new Date(t); return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()); }
      function gap(ms) {
        var h = ms / 3600000;
        if (h < 24) return Math.floor(h) + " h " + Math.round((h % 1) * 60) + " min later";
        return Math.floor(h / 24) + " days later";
      }
      function upTo(i, animate) {
        X.light("soft");
        for (var k = 0; k <= i; k++) {
          var s = scans[k];
          X.hole({ r: [s.x - 26, s.y - 52, 492, 78] });
          if (k > 0) {
            var p = scans[k - 1];
            var hop = X.line(p.x, p.y, s.x, s.y, "hop");
            if (animate && k === i) X.draw(hop, Math.hypot(s.x - p.x, s.y - p.y), 900);
          }
        }
        X.ring(scans[i].x, scans[i].y, 14);
        X.say("Scan " + (i + 1) + " of 4 · " + when(scans[i].t) + (i > 0 ? " · " + gap(scans[i].t - scans[i - 1].t) : ""));
      }
      var total = Math.round((scans[3].t - scans[0].t) / 86400000);
      var end = function () { upTo(3); X.say("One plate, 4 sightings, " + total + " days from first to last"); };
      X.chip("▶ Replay the scans", function () {
        scans.forEach(function (_, i) { X.later(function () { X.apply(function () { upTo(i, true); }, true); }, i * 1500); });
        X.later(function () { X.apply(end, true); X.settle(end); }, scans.length * 1500 + 600);
      }, { action: true });
      var chips = scans.map(function (_, i) {
        var c = X.chip(String(i + 1), function () { upTo(i, true); });
        c.setAttribute("aria-label", "Scan " + (i + 1));
        c.title = "Scan " + (i + 1);
        return c;
      });
      scans.forEach(function (s, i) {
        X.pin(s.x, s.y, { cls: "pin--sm", text: String(i + 1), lines: [{ text: "Scan " + (i + 1) + " of 4" }, { text: when(s.t) }], chip: chips[i] });
      });
      return X;
    }
  };

  /* Brayne's point system as a small counter beside the FI card */
  function tally(fig, X) {
    var box = html("div", "tally");
    fig.insertBefore(box, $("figcaption", fig));
    var head = html("div", "tally__head", box);
    html("span", "explore__label", head, "Point system");
    html("span", "tally__src", head, "from the paragraph above");
    var body = html("div", "tally__body", box);
    var factors = html("div", "tally__factors", body);
    var score = 0, stops = 0;
    ["Violent criminal history", "Gang affiliation", "Prior arrest with a handgun", "Parole/probation status"].forEach(function (f) {
      var b = html("button", "tally__factor", factors);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      html("i", "", b, "+5");
      html("span", "", b, f);
      b.addEventListener("click", function () {
        var on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        update();
        trace.add((on ? "Added " : "Removed ") + f.toLowerCase() + " on the FI point counter");
      });
    });
    var contact = html("div", "tally__contact", body);
    var stopBtn = html("button", "tally__stop", contact);
    stopBtn.type = "button";
    html("i", "", stopBtn, "+1");
    html("span", "", stopBtn, "Log a police contact");
    var stack = html("div", "tally__stack", contact);
    stack.setAttribute("aria-hidden", "true");
    var more = html("span", "tally__more", contact);
    var out = html("div", "tally__score", body);
    var n = html("span", "tally__n", out, "0");
    html("span", "tally__unit", out, "points");
    var loop = html("span", "tally__loop", out, "↻ feedback loop");
    var reset = html("button", "tally__reset", out, "Reset");
    reset.type = "button";
    var meter = html("div", "tally__meter", body);
    var fill = html("span", "", meter);
    n.setAttribute("aria-live", "polite");

    function update() {
      var f = $$(".tally__factor[aria-pressed=true]", factors).length * 5;
      score = f + stops;
      n.textContent = score;
      fill.style.width = Math.min(100, score / 40 * 100) + "%";
      box.classList.toggle("is-looping", stops >= 3);
      more.textContent = stops > 12 ? "+" + (stops - 12) : "";
      box.classList.remove("is-bump");
      void box.offsetWidth;
      box.classList.add("is-bump");
    }
    stopBtn.addEventListener("click", function () {
      stops++;
      if (stops <= 12) {
        var card = html("span", "tally__card", stack);
        card.style.setProperty("--r", ((stops * 37) % 13 - 6) + "deg");
        card.style.left = ((stops - 1) * 14) + "px";
      }
      update();
      trace.add("Logged police contact " + stops + " on the FI card");
    });
    reset.addEventListener("click", function () {
      stops = 0;
      stack.innerHTML = "";
      $$(".tally__factor", factors).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      update();
    });
  }

  $$("[data-explore]").forEach(function (fig) {
    var make = explorers[fig.getAttribute("data-explore")];
    if (!make) return;
    var X = make(fig);
    if (X && X.intro && !reduceMotion) {
      reveal(fig, function () { setTimeout(function () { if (!fig.classList.contains("is-lit")) X.intro(); }, 700); });
    }
  });

  /* ---------- 13. the desk behind the page ----------
     A measuring grid that drifts more slowly than the page, rulers and
     crop marks that follow the sheet, a crosshair that follows the
     cursor, and a red mark on the desk for every event in your trace. */

  (function () {
    var sheet = $(".doc"), page = $(".page");
    if (!sheet || !window.HTMLCanvasElement) return;
    var cv = document.createElement("canvas");
    cv.className = "backdrop";
    cv.setAttribute("aria-hidden", "true");
    document.body.insertBefore(cv, document.body.firstChild);
    var ctx = cv.getContext("2d");
    if (!ctx) return;

    var dpr = 1, vw = 0, vh = 0, on = false, queued = false;
    var mouse = null, marks = [];
    var DRIFT = reduceMotion ? 0 : 0.35;
    var MONO = "500 9px 'IBM Plex Mono', ui-monospace, Menlo, monospace";

    function size() {
      on = getComputedStyle(cv).display !== "none";
      dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = window.innerWidth;
      vh = window.innerHeight;
      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      cv.style.width = vw + "px";
      cv.style.height = vh + "px";
    }

    function request() {
      if (!on || queued) return;
      queued = true;
      requestAnimationFrame(draw);
    }

    function grid(step, colour, off) {
      ctx.strokeStyle = colour;
      ctx.beginPath();
      var x, y;
      for (x = 0.5; x < vw; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, vh); }
      for (y = -(off % step) + 0.5; y < vh; y += step) { ctx.moveTo(0, y); ctx.lineTo(vw, y); }
      ctx.stroke();
    }

    function draw(now) {
      queued = false;
      var off = window.scrollY * DRIFT;
      var r = sheet.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      ctx.lineWidth = 1;

      /* the grid, and a small cross where the major lines meet */
      grid(24, "rgba(170, 190, 210, 0.045)", off);
      grid(120, "rgba(170, 190, 210, 0.08)", off);
      ctx.strokeStyle = "rgba(210, 220, 230, 0.2)";
      ctx.beginPath();
      for (var gx = 0.5; gx < vw; gx += 120) {
        for (var gy = -(off % 120) + 0.5; gy < vh; gy += 120) {
          ctx.moveTo(gx - 4, gy); ctx.lineTo(gx + 5, gy);
          ctx.moveTo(gx, gy - 4); ctx.lineTo(gx, gy + 5);
        }
      }
      ctx.stroke();

      /* rulers down both edges of the sheet, measured in page pixels */
      var top = Math.max(r.top, 0), bottom = Math.min(r.bottom, vh);
      if (bottom > top) {
        ctx.font = MONO;
        ctx.textBaseline = "middle";
        var first = Math.ceil((top - r.top) / 10) * 10;
        ctx.beginPath();
        for (var d = first; r.top + d <= bottom; d += 10) {
          var y = Math.round(r.top + d) + 0.5;
          var len = d % 500 === 0 ? 14 : d % 100 === 0 ? 9 : 4;
          ctx.moveTo(r.left - 6, y); ctx.lineTo(r.left - 6 - len, y);
          ctx.moveTo(r.right + 6, y); ctx.lineTo(r.right + 6 + len, y);
        }
        ctx.strokeStyle = "rgba(210, 205, 195, 0.28)";
        ctx.stroke();
        ctx.fillStyle = "rgba(210, 205, 195, 0.4)";
        for (var d2 = Math.ceil((top - r.top) / 500) * 500; r.top + d2 <= bottom; d2 += 500) {
          var label = String(d2 / 100);
          while (label.length < 3) label = "0" + label;
          ctx.textAlign = "left";
          ctx.fillText(label, r.right + 24, r.top + d2);
        }
        /* where the reader is: a red caret on the left ruler */
        var mid = vh * 0.3;
        if (mid > r.top && mid < r.bottom) {
          ctx.fillStyle = "#d4573a";
          ctx.beginPath();
          ctx.moveTo(r.left - 5, mid);
          ctx.lineTo(r.left - 13, mid - 5);
          ctx.lineTo(r.left - 13, mid + 5);
          ctx.closePath();
          ctx.fill();
        }
      }

      /* crop marks at the sheet's corners */
      ctx.strokeStyle = "rgba(230, 225, 215, 0.45)";
      ctx.beginPath();
      [[r.left, r.top, -1, -1], [r.right, r.top, 1, -1], [r.left, r.bottom, -1, 1], [r.right, r.bottom, 1, 1]].forEach(function (c) {
        if (c[1] < -30 || c[1] > vh + 30) return;
        var x = Math.round(c[0] + c[2] * 10) + 0.5, y = Math.round(c[1] + c[3] * 10) + 0.5;
        ctx.moveTo(x, y); ctx.lineTo(x + c[2] * 16, y);
        ctx.moveTo(x, y); ctx.lineTo(x, y + c[3] * 16);
      });
      ctx.stroke();

      /* your trace, as marks on the desk joined in the order they happened */
      var t = now || performance.now(), moving = false;
      if (marks.length) {
        ctx.strokeStyle = "rgba(212, 87, 58, 0.28)";
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        marks.forEach(function (m, i) {
          var y = m.gy - off;
          if (i === 0) ctx.moveTo(m.x, y); else ctx.lineTo(m.x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        marks.forEach(function (m) {
          var y = m.gy - off;
          if (y < -20 || y > vh + 20) return;
          var age = (t - m.t) / 1000;
          ctx.fillStyle = age < 1.2 ? "#e0694a" : "rgba(212, 87, 58, 0.75)";
          ctx.fillRect(m.x - 2.5, y - 2.5, 5, 5);
          if (age < 1.2 && !reduceMotion) {
            moving = true;
            ctx.strokeStyle = "rgba(224, 105, 74, " + (1 - age / 1.2) + ")";
            ctx.beginPath();
            ctx.arc(m.x, y, 4 + age * 22, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      }

      /* the crosshair */
      if (mouse) {
        var inside = mouse.x > r.left && mouse.x < r.right && mouse.y > r.top && mouse.y < r.bottom;
        ctx.strokeStyle = "rgba(224, 105, 74, 0.32)";
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(0, mouse.y + 0.5); ctx.lineTo(vw, mouse.y + 0.5);
        ctx.moveTo(mouse.x + 0.5, 0); ctx.lineTo(mouse.x + 0.5, vh);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!inside) {
          ctx.strokeStyle = "rgba(224, 105, 74, 0.8)";
          ctx.strokeRect(mouse.x - 9.5, mouse.y - 9.5, 19, 19);
          ctx.font = MONO;
          ctx.fillStyle = "rgba(224, 105, 74, 0.9)";
          ctx.textAlign = mouse.x > vw - 150 ? "right" : "left";
          ctx.textBaseline = "top";
          var tx = mouse.x + (ctx.textAlign === "right" ? -16 : 16);
          ctx.fillText("TRACKING  X " + Math.round(mouse.x) + "  Y " + Math.round(mouse.y + window.scrollY), tx, mouse.y + 12);
        }
      }

      if (moving) request();
    }

    /* a free spot on the desk, beside the sheet, for a new mark */
    function spot() {
      var r = sheet.getBoundingClientRect(), p = page.getBoundingClientRect();
      var zones = [[r.right + 30, vw - 30], [16, Math.max(16, p.left - 16)]].filter(function (z) { return z[1] - z[0] >= 16; });
      if (!zones.length) zones = [[r.right + 12, vw - 8]];
      var z = zones[Math.floor(Math.random() * zones.length)];
      return { x: Math.round(z[0] + Math.random() * (z[1] - z[0])), y: 80 + Math.random() * Math.max(40, vh - 160) };
    }

    trace.on(function () {
      if (!on) return;
      var s = spot();
      marks.push({ x: s.x, gy: s.y + window.scrollY * DRIFT, t: performance.now() });
      if (marks.length > 80) marks.shift();
      request();
    });

    if (finePointer) {
      document.addEventListener("pointermove", function (e) { mouse = { x: e.clientX, y: e.clientY }; request(); }, { passive: true });
      document.documentElement.addEventListener("pointerleave", function () { mouse = null; request(); });
    }
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", function () { size(); request(); });
    size();
    request();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(request);
  })();
  /* ---------- 14. following the data, in the right-hand column ----------
     On wide screens the column beside the text carries a small copy of
     Figure 1 that marks which step of the chain the current section is
     about. It steps aside whenever a full-width figure passes by. */

  (function () {
    var doc = $(".doc");
    var nodes = $$(".flow__node");
    if (!doc || nodes.length !== 7) return;

    var lit = {
      "s1-1": [1, 3], "s1-2": [0, 2], "s1-3": [5], "s1-4": [3, 4],
      "s2-1": [4], "s2-2": [4], "s2-3": [5, 6], "s2-4": [4, 5],
      "takeaways": [0, 1, 2, 3, 4, 5, 6]
    };
    var order = ["s1-1", "s1-2", "s1-3", "s1-4", "s2-1", "s2-2", "s2-3", "s2-4", "takeaways", "appendix"];
    var secs = order.map(function (id) { return document.getElementById(id); });
    var titles = {};
    $$(".rail__list a").forEach(function (a) { titles[a.getAttribute("href").slice(1)] = a.textContent.replace(/\s+/g, " ").trim(); });

    var box = html("aside", "trail");
    box.setAttribute("aria-hidden", "true");
    var head = html("div", "trail__head", box);
    html("span", "trail__label", head, "Following the data");
    var no = html("span", "trail__no", head);
    var title = html("p", "trail__title", box);
    var list = html("ol", "trail__list", box);
    var rows = [[0, 1], [2], [3], [4], [5], [6]];
    var links = [];
    rows.forEach(function (r) {
      var li = html("li", "trail__row", list);
      r.forEach(function (i) {
        var src = nodes[i];
        var a = html("a", "trail__node" + (i === 4 ? " trail__node--platform" : "") + (i === 6 ? " trail__node--end" : ""), li, src.firstChild.textContent.trim());
        a.href = src.getAttribute("href");
        a.tabIndex = -1;
        links[i] = a;
      });
      li._idx = r;
    });
    document.body.appendChild(box);

    /* anything that spans the full width: figures, part headings, and the appendix onwards */
    var wides = $$(".doc .wide, .doc .part__head, .doc .back");
    var col = null, current = null;

    function measure() {
      var cs = getComputedStyle(doc);
      var cols = cs.gridTemplateColumns.split(" ").map(parseFloat);
      if (cs.display !== "grid" || cols.length < 2 || !(cols[1] >= 190)) { col = null; return; }
      var r = doc.getBoundingClientRect();
      col = {
        left: r.left + parseFloat(cs.paddingLeft) + cols[0] + parseFloat(cs.columnGap || 0),
        width: Math.min(cols[1], 272)
      };
      box.style.left = col.left + "px";
      box.style.width = col.width + "px";
      box.classList.toggle("trail--compact", col.width < 240);
    }

    function update() {
      if (!col) { box.classList.remove("is-on"); return; }
      var line = window.innerHeight * 0.3, id = null;
      secs.forEach(function (sec, i) { if (sec && sec.getBoundingClientRect().top <= line) id = order[i]; });
      var on = !!id && id !== "appendix";
      if (on && id !== current) {
        current = id;
        var set = lit[id] || [];
        links.forEach(function (a, i) { a.classList.toggle("is-lit", set.indexOf(i) > -1); });
        var lo = Math.min.apply(null, set), hi = Math.max.apply(null, set);
        $$(".trail__row", list).forEach(function (li) {
          var first = li._idx[0];
          li.classList.toggle("is-path", first > lo && li._idx[li._idx.length - 1] <= hi);
        });
        var t = titles[id] || "";
        var m = t.match(/^(\d\.\d)\s+(.*)$/);
        no.textContent = m ? m[1] : "";
        title.textContent = m ? m[2] : t;
      }
      /* stay out of the way of full-width blocks, and don't pop in for a
         moment in a short gap between two of them: a block coming up from
         below hides the panel well before it arrives */
      var covered = false;
      if (on) {
        var top = box.offsetTop, bottom = top + box.offsetHeight;
        var above = -Infinity, below = Infinity;
        covered = false;
        wides.forEach(function (w) {
          var r = w.getBoundingClientRect();
          if (r.bottom > top - 48 && r.top < bottom + 220) covered = true;
          if (r.bottom <= top) above = Math.max(above, r.bottom);
          if (r.top >= top) below = Math.min(below, r.top);
        });
        /* the stretch of text it would sit beside is too short to be worth it */
        if (below - above < box.offsetHeight + 640) covered = true;
      }
      box.classList.toggle("is-on", on && !covered);
    }

    var tick = false;
    window.addEventListener("scroll", function () {
      if (!tick) { tick = true; requestAnimationFrame(function () { tick = false; update(); }); }
    }, { passive: true });
    window.addEventListener("resize", function () { measure(); update(); });
    measure();
    update();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); update(); });
  })();
})();
