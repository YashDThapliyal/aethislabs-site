(function () {
  "use strict";

  var TOOLS = [
    "search_orders", "issue_refund", "send_email", "get_customer",
    "update_address", "cancel_subscription", "create_ticket", "lookup_invoice"
  ];

  var DESCRIPTIONS = {
    search_orders: "Find orders by customer, date, or status",
    issue_refund: "Refund a payment for an order",
    send_email: "Send an email to a customer",
    get_customer: "Look up a customer's account details",
    update_address: "Change the shipping address on an order",
    cancel_subscription: "Cancel a customer's subscription",
    create_ticket: "Open a support ticket for follow-up",
    lookup_invoice: "Find invoices and charges for an account"
  };

  // Illustrative only. Score weights follow TOOLS order and are normalized.
  var TASKS = [
    {
      text: "Refund the customer's most recent order",
      target: "issue_refund",
      misses: ["send_email", "create_ticket"],
      scores: [14, 71, 2, 4, 1, 1, 1, 6]
    },
    {
      text: "Cancel my plan and confirm by email",
      target: "cancel_subscription",
      misses: ["lookup_invoice", "issue_refund"],
      scores: [2, 3, 18, 6, 1, 66, 1, 3]
    },
    {
      text: "Ship my order to my new address instead",
      target: "update_address",
      misses: ["create_ticket"],
      scores: [12, 1, 2, 7, 74, 1, 2, 1]
    },
    {
      text: "Why was I charged twice this month?",
      target: "lookup_invoice",
      misses: ["issue_refund", "search_orders"],
      scores: [6, 9, 2, 8, 1, 1, 13, 60]
    }
  ];

  var TIMING = {
    type: 28,
    settle: 400,
    read: 90,
    reread: 55,
    hops: 5,
    hopStart: 70,
    hopGrowth: 1.3,
    call: 360,
    score: 550,
    reorder: 650,
    hold: 3000,
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

  function pickRandom(names) {
    return names[Math.floor(Math.random() * names.length)];
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
      log: el.querySelector("[data-log]"),
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

  function setScores(col, probs) {
    TOOLS.forEach(function (name) {
      var row = col.rows[name];
      var width = probs ? Math.min(probs[name] / BAR_SCALE, 1) * 100 : 0;
      row.querySelector(".bar").style.width = width + "%";
      row.querySelector(".p").textContent = probs ? probs[name].toFixed(2) : "";
    });
  }

  function setStatus(col, text, tone) {
    col.status.textContent = text;
    col.status.classList.toggle("good", tone === "good");
    col.status.classList.toggle("bad", tone === "bad");
  }

  function setLog(col, name, text) {
    col.log.textContent = "";
    if (name) {
      var strong = document.createElement("span");
      strong.className = "log-name";
      strong.textContent = name;
      col.log.appendChild(strong);
      col.log.appendChild(document.createTextNode(": "));
    }
    col.log.appendChild(document.createTextNode(text || ""));
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
    setLog(col, null, "");
    setStatus(col, "", null);
    TOOLS.forEach(function (name) {
      var row = col.rows[name];
      row.classList.remove("probe", "hit", "miss");
      row.querySelector(".mark").textContent = "";
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

  function callsLabel(n) {
    return n === 1 ? "right on call 1" : n + " calls to get it right";
  }

  // Walk the list one tool at a time, the way a model reads descriptions in its prompt.
  async function readTools(col, candidates, pace) {
    for (var i = 0; i < candidates.length; i++) {
      probe(col, candidates[i]);
      setLog(col, candidates[i], DESCRIPTIONS[candidates[i]]);
      await wait(pace);
    }
  }

  // Waver between a few options before committing to `landOn`.
  async function deliberate(col, candidates, landOn) {
    var delay = TIMING.hopStart;
    for (var i = 0; i < TIMING.hops; i++) {
      probe(col, pickRandom(candidates));
      await wait(delay);
      delay *= TIMING.hopGrowth;
    }
    probe(col, landOn);
    await wait(delay);
  }

  async function playBefore(task) {
    var col = cols.before;
    var sequence = task.misses.concat([task.target]);
    var tried = [];
    for (var i = 0; i < sequence.length; i++) {
      var pick = sequence[i];
      var candidates = TOOLS.filter(function (n) { return tried.indexOf(n) === -1; });
      setStatus(col, i === 0 ? "reading descriptions" : "re-reading", null);
      await readTools(col, candidates, i === 0 ? TIMING.read : TIMING.reread);
      setStatus(col, "deciding", null);
      setLog(col, null, "thinking about which tool fits...");
      await deliberate(col, candidates, pick);
      setStatus(col, "calling " + pick, null);
      setLog(col, null, "calling " + pick + "()");
      await wait(TIMING.call);
      var isHit = pick === task.target;
      markCall(col, pick, isHit);
      setLog(col, null, isHit ? "done" : "wrong tool, back to the list");
      tried.push(pick);
      await wait(TIMING.call);
    }
    setStatus(col, callsLabel(sequence.length), "bad");
  }

  async function playAfter(task) {
    var col = cols.after;
    var scores = normalize(task.scores);
    setStatus(col, "scoring", null);
    setLog(col, null, "scoring all " + TOOLS.length + " tools against the task");
    setScores(col, scores);
    await wait(TIMING.score);
    var order = sortedBy(scores);
    place(col, order, false);
    await wait(TIMING.reorder);
    probe(col, task.target);
    setStatus(col, "calling " + task.target, null);
    setLog(col, null, "calling " + task.target + "()");
    await wait(TIMING.call);
    markCall(col, task.target, true);
    setLog(col, null, "done");
    setStatus(col, callsLabel(1), "good");
  }

  async function play(task) {
    reset(cols.before);
    reset(cols.after);
    place(cols.before, TOOLS, true);
    place(cols.after, TOOLS, true);
    setScores(cols.after, null);

    await typeText(task.text);
    cols.before.list.classList.add("shown");
    cols.after.list.classList.add("shown");
    await wait(TIMING.settle);

    await Promise.all([playBefore(task), playAfter(task)]);
    await wait(TIMING.hold);

    cols.before.list.classList.remove("shown");
    cols.after.list.classList.remove("shown");
    await wait(TIMING.fade);
  }

  // Reduced motion: show each finished comparison without animating.
  function showStatic(task) {
    var scores = normalize(task.scores);
    var sequence = task.misses.concat([task.target]);
    reset(cols.before);
    reset(cols.after);
    taskText.textContent = task.text;
    place(cols.before, TOOLS, true);
    sequence.forEach(function (n) { markCall(cols.before, n, n === task.target); });
    setStatus(cols.before, callsLabel(sequence.length), "bad");
    place(cols.after, sortedBy(scores), true);
    setScores(cols.after, scores);
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
