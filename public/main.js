(function () {
  "use strict";

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---- Figure 1: reveal the ranked rows once the figure scrolls into view ----

  var fig1 = document.getElementById("fig1");
  if (fig1 && !reduceMotion.matches && "IntersectionObserver" in window) {
    var rows = fig1.querySelectorAll(".resp li");
    rows.forEach(function (li, i) { li.style.transitionDelay = i * 70 + "ms"; });
    fig1.classList.add("reveal");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          fig1.classList.add("in");
          io.disconnect();
        }
      });
    }, { threshold: 0.35 });
    io.observe(fig1);
  }

  // ---- Sketch: writing the name versus scoring the toolbox ----

  // Real output from Figure 1, in the order the tools were sent.
  var HELM = [
    { name: "search_flights", prob: 0.080 },
    { name: "get_weather_forecast", prob: 0.768 },
    { name: "convert_currency", prob: 0.013 },
    { name: "book_hotel", prob: 0.044 },
    { name: "get_exchange_rates", prob: 0.044 },
    { name: "translate_text", prob: 0.003 },
    { name: "Finish", prob: 0.048 }
  ];
  var TOOL_NAMES = HELM.map(function (t) { return t.name; });

  // Schematic only: a valid name, then the rare invented one.
  var PASSES = [
    ["get", "_weather", "_fore", "cast"],
    ["get", "_weather", "_info"]
  ];

  var TIMING = { start: 500, score: 250, step: 560, hold: 2800, gap: 500 };

  var steps = document.getElementById("gen-steps");
  var verdict = document.getElementById("gen-verdict");
  var genCount = document.getElementById("gen-count");
  var helmRows = document.getElementById("helm-rows");
  var helmCount = document.getElementById("helm-count");
  if (!steps || !verdict || !genCount || !helmRows || !helmCount) return;

  var rowEls = {};
  HELM.forEach(function (t) {
    var li = document.createElement("li");
    li.innerHTML = '<span class="r"></span><span class="nm"></span><span class="bar"></span><span class="p"></span>';
    li.querySelector(".nm").textContent = t.name;
    li.querySelector(".p").textContent = t.prob.toFixed(3);
    helmRows.appendChild(li);
    rowEls[t.name] = li;
  });
  var maxProb = Math.max.apply(null, HELM.map(function (t) { return t.prob; }));
  var rankedOrder = HELM.slice().sort(function (a, b) { return b.prob - a.prob; });

  function rowHeight() {
    var first = helmRows.querySelector("li");
    return first ? first.getBoundingClientRect().height : 27;
  }

  function placeRows(order, instant) {
    if (instant) helmRows.classList.add("no-move");
    var h = rowHeight();
    order.forEach(function (t, i) { rowEls[t.name].style.transform = "translateY(" + i * h + "px)"; });
    if (instant) {
      void helmRows.offsetHeight;
      helmRows.classList.remove("no-move");
    }
  }

  function resetHelm() {
    helmRows.classList.remove("scored");
    helmCount.textContent = "";
    HELM.forEach(function (t) {
      var li = rowEls[t.name];
      li.classList.remove("first");
      li.querySelector(".r").textContent = "";
      li.querySelector(".bar").style.width = "0";
    });
    placeRows(HELM, true);
  }

  function scoreHelm() {
    helmRows.classList.add("scored");
    helmCount.textContent = "1 pass";
    rankedOrder.forEach(function (t, i) {
      var li = rowEls[t.name];
      li.classList.toggle("first", i === 0);
      li.querySelector(".r").textContent = String(i + 1);
      li.querySelector(".bar").style.width = (t.prob / maxProb) * 100 + "%";
    });
    placeRows(rankedOrder, false);
  }

  function addStep(index, text, isLast) {
    var li = document.createElement("li");
    var label = document.createElement("span");
    label.className = "step";
    label.textContent = "step " + (index + 1);
    var name = document.createElement("span");
    name.textContent = text;
    li.appendChild(label);
    li.appendChild(name);
    Array.prototype.forEach.call(steps.children, function (prev) { prev.lastChild.classList.add("done"); });
    steps.appendChild(li);
    if (isLast) li.lastChild.classList.remove("done");
  }

  function setVerdict(name) {
    var exists = TOOL_NAMES.indexOf(name) !== -1;
    verdict.textContent = exists ? "found in the toolbox" : "not in the toolbox";
    verdict.classList.toggle("bad", !exists);
  }

  async function playGeneration(pieces) {
    var text = "";
    for (var i = 0; i < pieces.length; i++) {
      text += pieces[i];
      addStep(i, text, i === pieces.length - 1);
      genCount.textContent = (i + 1) + (i === 0 ? " step" : " steps");
      await wait(TIMING.step);
    }
    setVerdict(text);
  }

  async function playHelm() {
    await wait(TIMING.score);
    scoreHelm();
  }

  async function play(pieces) {
    steps.textContent = "";
    verdict.textContent = "";
    genCount.textContent = "";
    resetHelm();
    await wait(TIMING.start);
    await Promise.all([playGeneration(pieces), playHelm()]);
    await wait(TIMING.hold);
  }

  function showStatic() {
    var pieces = PASSES[0];
    var text = "";
    steps.textContent = "";
    pieces.forEach(function (p, i) {
      text += p;
      addStep(i, text, i === pieces.length - 1);
    });
    genCount.textContent = pieces.length + " steps";
    setVerdict(text);
    resetHelm();
    scoreHelm();
  }

  window.addEventListener("resize", function () {
    placeRows(helmRows.classList.contains("scored") ? rankedOrder : HELM, true);
  });

  async function run() {
    if (reduceMotion.matches) {
      showStatic();
      return;
    }
    for (var i = 0; ; i++) {
      await play(PASSES[i % PASSES.length]);
      await wait(TIMING.gap);
    }
  }

  run();
})();
