(function () {
  "use strict";

  var TOOLS = [
    "search_orders", "issue_refund", "send_email", "get_customer",
    "update_address", "cancel_subscription", "create_ticket", "Finish"
  ];

  // Illustrative only. Weights follow TOOLS order and are normalized to probabilities.
  var TASKS = [
    {
      text: "Refund the customer's most recent order",
      prior: [],
      weights: [62, 21, 1, 9, 1, 1, 4, 1]
    },
    {
      text: "Refund the customer's most recent order",
      prior: ["search_orders"],
      weights: [2, 78, 8, 4, 1, 1, 5, 1]
    },
    {
      text: "Cancel my subscription and confirm by email",
      prior: ["cancel_subscription"],
      weights: [1, 2, 74, 5, 1, 2, 1, 14]
    },
    {
      text: "Update the shipping address on my account",
      prior: ["get_customer", "update_address"],
      weights: [1, 1, 9, 2, 2, 1, 3, 81]
    }
  ];

  var TIMING = { type: 32, stagger: 70, holdUnranked: 650, score: 600, reorder: 950, hold: 2800, fade: 450 };
  var BAR_SCALE = 0.85;

  var list = document.getElementById("tool-list");
  var taskText = document.getElementById("task-text");
  var priorEl = document.getElementById("prior-calls");
  var status = document.getElementById("demo-status");
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  if (!list || !taskText || !priorEl || !status) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var currentOrder = TOOLS;

  var rows = {};
  TOOLS.forEach(function (name) {
    var li = document.createElement("li");
    li.className = "row";
    li.innerHTML = '<span class="rank"></span><span class="name"></span>' +
      '<span class="track"><span class="bar"></span></span><span class="prob"></span>';
    li.querySelector(".name").textContent = name;
    list.appendChild(li);
    rows[name] = li;
  });

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
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

  function rowHeight() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--row");
    return parseFloat(v) || 42;
  }

  function place(order, instant) {
    currentOrder = order;
    if (instant) list.classList.add("no-move");
    var h = rowHeight();
    order.forEach(function (name, i) {
      rows[name].style.transform = "translateY(" + i * h + "px)";
    });
    if (instant) {
      void list.offsetHeight;
      list.classList.remove("no-move");
    }
  }

  function setBars(probs) {
    TOOLS.forEach(function (name) {
      var width = probs ? Math.min(probs[name] / BAR_SCALE, 1) * 100 : 0;
      rows[name].querySelector(".bar").style.width = width + "%";
    });
  }

  function setRanked(order, probs) {
    order.forEach(function (name, i) {
      var li = rows[name];
      var isTop = !!probs && i < 3;
      li.classList.toggle("top", isTop);
      li.classList.toggle("first", !!probs && i === 0);
      li.querySelector(".rank").textContent = probs ? String(i + 1) : "";
      li.querySelector(".prob").textContent = isTop ? probs[name].toFixed(2) : "";
    });
  }

  function setStatus(text, done) {
    status.textContent = text;
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

  async function play(task) {
    var probs = normalize(task.weights);
    var order = ranked(probs);

    setRanked(TOOLS, null);
    setBars(null);
    setStatus("", false);
    priorEl.textContent = "";
    place(shuffled(TOOLS), true);

    await typeText(task.text);
    setPrior(task.prior);
    await wait(250);

    var appearOrder = shuffled(TOOLS);
    for (var i = 0; i < appearOrder.length; i++) {
      rows[appearOrder[i]].classList.add("shown");
      await wait(TIMING.stagger);
    }
    await wait(TIMING.holdUnranked);

    setStatus("scoring", false);
    setBars(probs);
    await wait(TIMING.score);
    place(order, false);
    await wait(TIMING.reorder);
    setRanked(order, probs);
    setStatus("ranked in one pass", true);
    await wait(TIMING.hold);

    TOOLS.forEach(function (name) { rows[name].classList.remove("shown"); });
    await wait(TIMING.fade);
  }

  // Reduced motion: show each finished ranking without animating.
  function showStatic(task) {
    var probs = normalize(task.weights);
    var order = ranked(probs);
    taskText.textContent = task.text;
    setPrior(task.prior);
    place(order, true);
    setBars(probs);
    setRanked(order, probs);
    setStatus("ranked in one pass", true);
    TOOLS.forEach(function (name) { rows[name].classList.add("shown"); });
  }

  window.addEventListener("resize", function () { place(currentOrder, true); });

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
