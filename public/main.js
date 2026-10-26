(function () {
  "use strict";

  var TOOLS = [
    "search_orders", "issue_refund", "send_email", "get_customer",
    "update_address", "cancel_subscription", "create_ticket", "lookup_invoice"
  ];

  // Illustrative rankings for the demo only.
  var TASKS = [
    {
      text: "Refund the customer's most recent order",
      order: ["issue_refund", "search_orders", "lookup_invoice", "get_customer", "send_email", "create_ticket", "cancel_subscription", "update_address"],
      scores: ["0.94", "0.81", "0.42"]
    },
    {
      text: "Cancel my plan and confirm by email",
      order: ["cancel_subscription", "send_email", "get_customer", "lookup_invoice", "create_ticket", "issue_refund", "search_orders", "update_address"],
      scores: ["0.96", "0.77", "0.38"]
    },
    {
      text: "Ship my order to my new address instead",
      order: ["update_address", "search_orders", "get_customer", "send_email", "create_ticket", "lookup_invoice", "issue_refund", "cancel_subscription"],
      scores: ["0.91", "0.84", "0.46"]
    },
    {
      text: "Why was I charged twice this month?",
      order: ["lookup_invoice", "create_ticket", "get_customer", "issue_refund", "search_orders", "send_email", "cancel_subscription", "update_address"],
      scores: ["0.89", "0.63", "0.51"]
    }
  ];

  var TYPE_MS = 45;
  var STAGGER_MS = 90;
  var HOLD_UNRANKED_MS = 900;
  var HOLD_RANKED_MS = 3200;
  var FADE_MS = 500;

  var list = document.getElementById("tool-list");
  var taskText = document.getElementById("task-text");
  var status = document.getElementById("demo-status");
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  if (!list || !taskText || !status) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var rows = {};
  TOOLS.forEach(function (name) {
    var li = document.createElement("li");
    li.className = "tool";
    li.innerHTML = '<span class="rank"></span><span class="name"></span><span class="score"></span>';
    li.querySelector(".name").textContent = name;
    list.appendChild(li);
    rows[name] = li;
  });

  function rowHeight() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--row");
    return parseFloat(v) || 44;
  }

  var currentOrder = TOOLS;

  function place(order) {
    currentOrder = order;
    var h = rowHeight();
    order.forEach(function (name, i) {
      rows[name].style.transform = "translateY(" + i * h + "px)";
    });
  }

  // Jump rows to new positions without animating (used while they are hidden).
  function jump(order) {
    list.classList.add("no-move");
    place(order);
    void list.offsetHeight;
    list.classList.remove("no-move");
  }

  function shuffled(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    }
    return copy;
  }

  function setRanked(task, ranked) {
    task.order.forEach(function (name, i) {
      var li = rows[name];
      var isTop = ranked && i < 3;
      li.classList.toggle("top", isTop);
      li.classList.toggle("first", ranked && i === 0);
      li.querySelector(".rank").textContent = ranked ? String(i + 1) : "";
      li.querySelector(".score").textContent = isTop ? task.scores[i] : "";
    });
    status.textContent = ranked ? "ranked" : "ranking";
    status.classList.toggle("done", ranked);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function typeText(text) {
    taskText.textContent = "";
    var i = 0;
    return new Promise(function (resolve) {
      (function step() {
        if (i >= text.length) return resolve();
        taskText.textContent += text.charAt(i++);
        setTimeout(step, TYPE_MS);
      })();
    });
  }

  function showStatic(task) {
    taskText.textContent = task.text;
    place(task.order);
    TOOLS.forEach(function (name) { rows[name].classList.add("shown"); });
    setRanked(task, true);
  }

  async function run() {
    var index = 0;
    while (true) {
      var task = TASKS[index % TASKS.length];
      if (reduceMotion.matches) {
        showStatic(task);
        await wait(HOLD_RANKED_MS * 2);
        index++;
        continue;
      }

      setRanked(task, false);
      status.textContent = "";
      await typeText(task.text);
      status.textContent = "ranking";

      jump(shuffled(TOOLS));
      for (var i = 0; i < TOOLS.length; i++) {
        rows[TOOLS[(i * 3) % TOOLS.length]].classList.add("shown");
        await wait(STAGGER_MS);
      }
      await wait(HOLD_UNRANKED_MS);

      place(task.order);
      await wait(900);
      setRanked(task, true);
      await wait(HOLD_RANKED_MS);

      TOOLS.forEach(function (name) { rows[name].classList.remove("shown"); });
      await wait(FADE_MS);
      index++;
    }
  }

  window.addEventListener("resize", function () { jump(currentOrder); });

  run();
})();
