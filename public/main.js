(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  var TOOLS = [
    "search_orders", "issue_refund", "send_email", "get_customer",
    "update_address", "cancel_subscription", "create_ticket", "Finish"
  ];

  // Illustrative only. Weights follow TOOLS order and are normalized to probabilities.
  var TASKS = [
    { text: "Refund the customer's most recent order", prior: [], weights: [62, 21, 1, 9, 1, 1, 4, 1] },
    { text: "Refund the customer's most recent order", prior: ["search_orders"], weights: [2, 78, 8, 4, 1, 1, 5, 1] },
    { text: "Cancel my subscription and confirm by email", prior: ["cancel_subscription"], weights: [1, 2, 74, 5, 1, 2, 1, 14] },
    { text: "Update the shipping address on my account", prior: ["get_customer", "update_address"], weights: [1, 1, 9, 2, 2, 1, 3, 81] }
  ];

  // Dome geometry, in SVG user units. Slots are angles from vertical; rank 1 sits at the zenith.
  var CX = 500, CY = 470, R = 360;
  var SLOTS = [0, 20, -20, 40, -40, 60, -60, 78];
  var LABEL_GAP = 22;

  var TIMING = { type: 32, stagger: 70, holdUnranked: 600, score: 850, glide: 1100, hold: 3000, fade: 450 };

  var dome = document.getElementById("dome");
  var taskText = document.getElementById("task-text");
  var priorEl = document.getElementById("prior-calls");
  var status = document.getElementById("demo-status");
  var needle = document.getElementById("needle");
  var ring = document.getElementById("ring");
  var list = document.getElementById("tool-list");
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  if (!dome || !taskText || !priorEl || !status || !needle || !ring || !list) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    parent.appendChild(el);
    return el;
  }

  function normalize(weights) {
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var probs = {};
    TOOLS.forEach(function (name, i) { probs[name] = weights[i] / total; });
    return probs;
  }

  function ranked(probs) {
    return TOOLS.slice().sort(function (a, b) { return probs[b] - probs[a]; });
  }

  function shuffled(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    }
    return copy;
  }

  // requestAnimationFrame, with a timer fallback for environments that never paint frames.
  function nextFrame(cb) {
    var done = false;
    function fire() {
      if (done) return;
      done = true;
      cb(performance.now());
    }
    requestAnimationFrame(fire);
    setTimeout(fire, 34);
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // ---- Dome renderer ----

  var raysG = document.getElementById("rays");
  var pointsG = document.getElementById("points");
  var labelsG = document.getElementById("labels");

  var nodes = {};
  TOOLS.forEach(function (name) {
    var label = svg("text", { "class": "label", "text-anchor": "middle", "dominant-baseline": "middle" }, labelsG);
    label.textContent = name;
    nodes[name] = {
      angle: 0,
      ray: svg("line", { "class": "ray", x1: CX, y1: CY, pathLength: 1 }, raysG),
      pt: svg("circle", { "class": "pt", r: 4 }, pointsG),
      label: label,
      prob: svg("text", { "class": "prob", "text-anchor": "middle", "dominant-baseline": "middle" }, labelsG),
      width: 0
    };
  });

  function measure() {
    TOOLS.forEach(function (name) {
      try { nodes[name].width = nodes[name].label.getComputedTextLength(); } catch (e) { nodes[name].width = name.length * 7.8; }
    });
  }

  function position(name, deg) {
    var n = nodes[name];
    var rad = deg * Math.PI / 180;
    var s = Math.sin(rad), c = Math.cos(rad);
    var px = CX + R * s, py = CY - R * c;
    n.angle = deg;
    n.ray.setAttribute("x2", px);
    n.ray.setAttribute("y2", py);
    n.pt.setAttribute("cx", px);
    n.pt.setAttribute("cy", py);
    // Push the label outward along the ray, then sideways by half its width so it never sits on the arc.
    var lx = px + s * LABEL_GAP + s * n.width / 2;
    var ly = py - c * LABEL_GAP;
    n.label.setAttribute("x", lx);
    n.label.setAttribute("y", ly);
    n.prob.setAttribute("x", lx);
    n.prob.setAttribute("y", ly - 18);
  }

  function placeAll(order) {
    order.forEach(function (name, i) { position(name, SLOTS[i]); });
  }

  function glide(order, duration) {
    var from = {};
    TOOLS.forEach(function (n) { from[n] = nodes[n].angle; });
    var to = {};
    order.forEach(function (n, i) { to[n] = SLOTS[i]; });
    if (duration <= 0) {
      placeAll(order);
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var start = null;
      function frame(ts) {
        if (start === null) start = ts;
        var t = Math.min((ts - start) / duration, 1);
        var e = easeInOut(t);
        TOOLS.forEach(function (n) { position(n, from[n] + (to[n] - from[n]) * e); });
        if (t < 1) nextFrame(frame); else resolve();
      }
      nextFrame(frame);
    });
  }

  function setRays(probs) {
    var max = probs ? Math.max.apply(null, TOOLS.map(function (n) { return probs[n]; })) : 1;
    TOOLS.forEach(function (n) {
      var len = probs ? 0.08 + 0.84 * (probs[n] / max) : 0;
      nodes[n].ray.style.strokeDashoffset = String(1 - len);
    });
  }

  function setShown(name, shown) {
    nodes[name].pt.classList.toggle("shown", shown);
    nodes[name].label.classList.toggle("shown", shown);
  }

  function setRankedDome(order, probs) {
    order.forEach(function (name, i) {
      var n = nodes[name];
      var isTop = !!probs && i < 3;
      var isFirst = !!probs && i === 0;
      [n.pt, n.label, n.ray].forEach(function (el) {
        el.classList.toggle("top", isTop);
        el.classList.toggle("first", isFirst);
      });
      n.prob.textContent = isTop ? probs[name].toFixed(2) : "";
      n.prob.classList.toggle("shown", isTop);
    });
    needle.classList.toggle("shown", !!probs);
    ring.classList.remove("pulse");
    if (probs) {
      void ring.getBoundingClientRect();
      ring.classList.add("pulse");
    }
  }

  // ---- Compact list, shown instead of dome labels on narrow screens ----

  var rows = {};
  var listOrder = TOOLS;
  TOOLS.forEach(function (name) {
    var li = document.createElement("li");
    li.className = "row";
    li.innerHTML = '<span class="rank"></span><span class="name"></span><span class="row-prob"></span>';
    li.querySelector(".name").textContent = name;
    list.appendChild(li);
    rows[name] = li;
  });

  function rowHeight() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--row");
    return parseFloat(v) || 36;
  }

  function placeList(order, instant) {
    listOrder = order;
    if (instant) list.classList.add("no-move");
    var h = rowHeight();
    order.forEach(function (name, i) { rows[name].style.transform = "translateY(" + i * h + "px)"; });
    if (instant) {
      void list.offsetHeight;
      list.classList.remove("no-move");
    }
  }

  function setRankedList(order, probs) {
    order.forEach(function (name, i) {
      var li = rows[name];
      li.classList.toggle("top", !!probs && i < 3);
      li.classList.toggle("first", !!probs && i === 0);
      li.querySelector(".rank").textContent = probs ? String(i + 1) : "";
      li.querySelector(".row-prob").textContent = probs && i < 3 ? probs[name].toFixed(2) : "";
    });
  }

  // ---- Shared timeline ----

  function setStatus(text, done) {
    status.textContent = text || " ";
    status.classList.toggle("done", !!done);
  }

  function setPrior(prior) {
    priorEl.textContent = "";
    if (!prior.length) {
      priorEl.textContent = "none";
      return;
    }
    prior.forEach(function (name) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = name;
      priorEl.appendChild(chip);
    });
  }

  function typeText(text) {
    taskText.textContent = "";
    var i = 0;
    return new Promise(function (resolve) {
      (function step() {
        if (i >= text.length) return resolve();
        taskText.textContent += text.charAt(i++);
        setTimeout(step, TIMING.type);
      })();
    });
  }

  function resetAll() {
    setRankedDome(TOOLS, null);
    setRankedList(TOOLS, null);
    setRays(null);
    setStatus("", false);
    priorEl.textContent = "";
    TOOLS.forEach(function (n) { setShown(n, false); rows[n].classList.remove("shown"); });
    var start = shuffled(TOOLS);
    placeAll(start);
    placeList(start, true);
  }

  async function play(task) {
    var probs = normalize(task.weights);
    var order = ranked(probs);

    resetAll();
    await typeText(task.text);
    setPrior(task.prior);
    await wait(250);

    var appear = shuffled(TOOLS);
    for (var i = 0; i < appear.length; i++) {
      setShown(appear[i], true);
      rows[appear[i]].classList.add("shown");
      await wait(TIMING.stagger);
    }
    await wait(TIMING.holdUnranked);

    setStatus("scoring every tool at once", false);
    setRays(probs);
    await wait(TIMING.score);

    placeList(order, false);
    labelsG.classList.add("gliding");
    await glide(order, TIMING.glide);
    labelsG.classList.remove("gliding");
    setRankedDome(order, probs);
    setRankedList(order, probs);
    setStatus("ranked in one pass", true);
    await wait(TIMING.hold);

    TOOLS.forEach(function (n) { setShown(n, false); rows[n].classList.remove("shown"); });
    setRankedDome(TOOLS, null);
    setRays(null);
    await wait(TIMING.fade);
  }

  // Reduced motion: show each finished ranking without animating.
  function showStatic(task) {
    var probs = normalize(task.weights);
    var order = ranked(probs);
    taskText.textContent = task.text;
    setPrior(task.prior);
    placeAll(order);
    placeList(order, true);
    setRays(probs);
    TOOLS.forEach(function (n) { setShown(n, true); rows[n].classList.add("shown"); });
    setRankedDome(order, probs);
    setRankedList(order, probs);
    setStatus("ranked in one pass", true);
  }

  window.addEventListener("resize", function () { placeList(listOrder, true); });

  async function run() {
    measure();
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
      measure();
    }
    placeAll(TOOLS);
    for (var i = 0; ; i++) {
      var task = TASKS[i % TASKS.length];
      if (reduceMotion.matches) {
        showStatic(task);
        await wait(TIMING.hold * 2);
      } else {
        await play(task);
      }
    }
  }

  run();
})();
