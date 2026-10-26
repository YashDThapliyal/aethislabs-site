(function () {
  "use strict";

  var TOOLS = [
    "search_orders", "issue_refund", "send_email", "get_customer",
    "update_address", "cancel_subscription", "create_ticket", "lookup_invoice"
  ];

  // Illustrative only. Weights follow TOOLS order and are normalized to probabilities.
  var TASKS = [
    {
      text: "Refund the customer's most recent order",
      target: "issue_refund",
      misses: ["send_email", "create_ticket"],
      before: [16, 15, 12, 14, 9, 11, 12, 11],
      after: [14, 71, 2, 4, 1, 1, 1, 6]
    },
    {
      text: "Cancel my plan and confirm by email",
      target: "cancel_subscription",
      misses: ["lookup_invoice", "issue_refund"],
      before: [10, 12, 14, 15, 8, 13, 13, 15],
      after: [2, 3, 18, 6, 1, 66, 1, 3]
    },
    {
      text: "Ship my order to my new address instead",
      target: "update_address",
      misses: ["create_ticket"],
      before: [15, 9, 12, 16, 13, 10, 14, 11],
      after: [12, 1, 2, 7, 74, 1, 2, 1]
    },
    {
      text: "Why was I charged twice this month?",
      target: "lookup_invoice",
      misses: ["issue_refund", "search_orders"],
      before: [14, 15, 10, 13, 8, 12, 13, 15],
      after: [6, 9, 2, 8, 1, 1, 13, 60]
    }
  ];

  var TIMING = {
    type: 28,
    settle: 450,
    hops: 7,
    hopStart: 55,
    hopGrowth: 1.28,
    betweenCalls: 260,
    sharpen: 650,
    reorder: 700,
    hold: 2800,
    fade: 380
  };
  var BAR_SCALE = 0.75;

  var taskText = document.getElementById("task-text");
  var beforeEl = document.getElementById("col-before");
  var afterEl = document.getElementById("col-after");
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  if (!taskText || !beforeEl || !afterEl) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function normalize(weights) {
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var probs = {};
    TOOLS.forEach(function (name, i) { probs[name] = weights[i] / total; });
    return probs;
  }

  function sortedBy(probs) {
    return TOOLS.slice().sort(function (a, b) { return probs[b] - probs[a]; });
  }

  function pickWeighted(names, probs) {
    var total = names.reduce(function (sum, n) { return sum + probs[n]; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < names.length; i++) {
      r -= probs[names[i]];
      if (r <= 0) return names[i];
    }
    return names[names.length - 1];
  }

  function buildColumn(el) {
    var list = el.querySelector("[data-rows]");
    var rows = {};
    TOOLS.forEach(function (name) {
      var li = document.createElement("li");
      li.className = "row";
      li.innerHTML = '<span class="mark"></span><span class="name"></span>' +
        '<span class="track"><span class="bar"></span></span><span class="p"></span>';
      li.querySelector(".name").textContent = name;
      list.appendChild(li);
      rows[name] = li;
    });
    return {
      list: list,
      rows: rows,
      trail: el.querySelector("[data-trail]"),
      status: el.querySelector("[data-status]"),
      order: TOOLS
    };
  }

  var cols = { before: buildColumn(beforeEl), after: buildColumn(afterEl) };

  function rowHeight() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--row");
    return parseFloat(v) || 34;
  }

  function place(col, order, instant) {
    col.order = order;
    if (instant) col.list.classList.add("no-move");
    var h = rowHeight();
    order.forEach(function (name, i) {
      col.rows[name].style.transform = "translateY(" + i * h + "px)";
    });
    if (instant) {
      void col.list.offsetHeight;
      col.list.classList.remove("no-move");
    }
  }

  function setDist(col, probs) {
    TOOLS.forEach(function (name) {
      var row = col.rows[name];
      var width = Math.min(probs[name] / BAR_SCALE, 1) * 100;
      row.querySelector(".bar").style.width = width + "%";
      row.querySelector(".p").textContent = probs[name].toFixed(2);
    });
  }

  function setStatus(col, text, tone) {
    col.status.textContent = text;
    col.status.classList.toggle("good", tone === "good");
    col.status.classList.toggle("bad", tone === "bad");
  }

  function probe(col, name) {
    TOOLS.forEach(function (n) { col.rows[n].classList.toggle("probe", n === name); });
  }

  function markCall(col, name, isHit) {
    var row = col.rows[name];
    row.classList.remove("probe");
    row.classList.add(isHit ? "hit" : "miss");
    row.querySelector(".mark").textContent = isHit ? "✓" : "✗";
    var chip = document.createElement("span");
    chip.className = "chip " + (isHit ? "hit" : "miss");
    chip.textContent = name;
    col.trail.appendChild(chip);
  }

  function reset(col) {
    col.list.classList.remove("shown");
    col.trail.textContent = "";
    setStatus(col, "", null);
    TOOLS.forEach(function (name) {
      var row = col.rows[name];
      row.classList.remove("probe", "hit", "miss");
      row.querySelector(".mark").textContent = "";
    });
  }

  // Flicker across candidates in proportion to their probability, then land on `landOn`.
  async function sample(col, candidates, probs, landOn, hops) {
    var delay = TIMING.hopStart;
    for (var i = 0; i < hops; i++) {
      probe(col, pickWeighted(candidates, probs));
      await wait(delay);
      delay *= TIMING.hopGrowth;
    }
    probe(col, landOn);
    await wait(delay);
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

  function callsLabel(n) {
    return n === 1 ? "right on call 1" : n + " calls to get it right";
  }

  async function playBefore(task, probs) {
    var col = cols.before;
    var sequence = task.misses.concat([task.target]);
    var tried = [];
    setStatus(col, "sampling", null);
    for (var i = 0; i < sequence.length; i++) {
      var candidates = TOOLS.filter(function (n) { return tried.indexOf(n) === -1; });
      await sample(col, candidates, probs, sequence[i], TIMING.hops);
      markCall(col, sequence[i], sequence[i] === task.target);
      tried.push(sequence[i]);
      await wait(TIMING.betweenCalls);
    }
    setStatus(col, callsLabel(sequence.length), sequence.length > 1 ? "bad" : "good");
  }

  async function playAfter(task, probs) {
    var col = cols.after;
    setStatus(col, "ranking", null);
    await wait(TIMING.settle);
    setDist(col, probs);
    await wait(TIMING.sharpen);
    var order = sortedBy(probs);
    place(col, order, false);
    await wait(TIMING.reorder);
    setStatus(col, "sampling", null);
    await sample(col, order.slice(0, 3), probs, task.target, 3);
    markCall(col, task.target, true);
    setStatus(col, callsLabel(1), "good");
  }

  async function play(task) {
    var before = normalize(task.before);
    var after = normalize(task.after);

    reset(cols.before);
    reset(cols.after);
    place(cols.before, TOOLS, true);
    place(cols.after, TOOLS, true);
    setDist(cols.before, before);
    setDist(cols.after, before);

    await typeText(task.text);
    cols.before.list.classList.add("shown");
    cols.after.list.classList.add("shown");
    await wait(TIMING.settle);

    await Promise.all([playBefore(task, before), playAfter(task, after)]);
    await wait(TIMING.hold);

    cols.before.list.classList.remove("shown");
    cols.after.list.classList.remove("shown");
    await wait(TIMING.fade);
  }

  // Reduced motion: show each finished comparison without animating.
  function showStatic(task) {
    var before = normalize(task.before);
    var after = normalize(task.after);
    var sequence = task.misses.concat([task.target]);
    reset(cols.before);
    reset(cols.after);
    taskText.textContent = task.text;
    place(cols.before, TOOLS, true);
    setDist(cols.before, before);
    sequence.forEach(function (n) { markCall(cols.before, n, n === task.target); });
    setStatus(cols.before, callsLabel(sequence.length), "bad");
    place(cols.after, sortedBy(after), true);
    setDist(cols.after, after);
    markCall(cols.after, task.target, true);
    setStatus(cols.after, callsLabel(1), "good");
    cols.before.list.classList.add("shown");
    cols.after.list.classList.add("shown");
  }

  window.addEventListener("resize", function () {
    place(cols.before, cols.before.order, true);
    place(cols.after, cols.after.order, true);
  });

  async function run() {
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
