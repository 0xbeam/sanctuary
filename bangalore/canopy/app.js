(function () {
  "use strict";

  /* ── Species config ── */
  var SPECIES = {
    tabebuia:  { label: "Tabebuia Rosea",  color: "#ff3fa0", glow: "#ff3fa080" },
    gulmohar:  { label: "Gulmohar",         color: "#ff6633", glow: "#ff663380" },
    palm:      { label: "Palm",             color: "#40d6b0", glow: "#40d6b060" },
    ficus:     { label: "Ficus",            color: "#7ddf44", glow: "#7ddf4460" },
    silveroak: { label: "Silver Oak",       color: "#ccaa33", glow: "#ccaa3360" },
    conifer:   { label: "Conifer",          color: "#44aa66", glow: "#44aa6660" },
    tulip:     { label: "African Tulip",    color: "#ff5544", glow: "#ff554480" },
    raintree:  { label: "Rain Tree",        color: "#aa88ff", glow: "#aa88ff60" },
    neem:      { label: "Neem",             color: "#66dd88", glow: "#66dd8860" },
    mango:     { label: "Mango",            color: "#ffcc33", glow: "#ffcc3360" },
    jacaranda: { label: "Jacaranda",        color: "#9966ff", glow: "#9966ff60" },
    pongamia:  { label: "Pongamia",         color: "#88bb44", glow: "#88bb4460" },
    mahogany:  { label: "Mahogany",         color: "#cc6633", glow: "#cc663360" },
    cork:      { label: "Cork Tree",        color: "#ddaa77", glow: "#ddaa7760" },
    broad:     { label: "Broadleaf",        color: "#77cc88", glow: "#77cc8860" },
    u:         { label: "Unclassified",     color: "#6a7080", glow: "#6a708040" },
  };

  /* ── State ── */
  var data = null;
  var map = null;
  var baseTileLayer = null;
  var labelTileLayer = null;
  var treeLayerGroup = null;
  var parkLayerGroup = null;
  var waterLayerGroup = null;
  var canvasRenderer = null;
  var currentYear = 2026;
  var activeSpecies = new Set(Object.keys(SPECIES));
  var activeLayers = { trees: true, parks: true, water: true };
  var autoPlayInterval = null;
  var allLegendVisible = true;

  function formatNum(n) {
    return n.toLocaleString();
  }

  /* ── Intro ── */
  function animateIntroNumber(id, target, duration) {
    var el = document.getElementById(id);
    var start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(eased * target).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString();
    }
    requestAnimationFrame(step);
  }

  function setIntroProgress(pct) {
    document.getElementById("intro-bar").style.width = pct + "%";
  }

  function hideIntro() {
    var intro = document.getElementById("intro");
    intro.classList.add("fade-out");
    document.getElementById("map-container").classList.add("visible");
    setTimeout(function () {
      map.flyTo([12.9716, 77.5946], 12.5, {
        duration: 2.5,
        easeLinearity: 0.25,
      });
    }, 200);
    setTimeout(function () { intro.style.display = "none"; }, 1400);
  }

  /* ── Map ── */
  function initMap() {
    map = window.__map = L.map("map", {
      center: [12.9716, 77.5946],
      zoom: 11,
      minZoom: 10,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120,
    });

    canvasRenderer = L.canvas({ padding: 0.5, tolerance: 8 });

    var tileURL = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
    var labelURL = "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png";
    baseTileLayer = L.tileLayer(tileURL, { subdomains: "abcd", maxZoom: 20 }).addTo(map);
    labelTileLayer = L.tileLayer(labelURL, { subdomains: "abcd", maxZoom: 20, pane: "overlayPane" }).addTo(map);
  }

  /* ── Render trees (filtered by year) ── */
  function renderTrees() {
    if (treeLayerGroup) {
      map.removeLayer(treeLayerGroup);
      treeLayerGroup = null;
    }
    if (!activeLayers.trees) {
      document.getElementById("h-trees").textContent = "0";
      return;
    }

    var markers = [];
    var trees = data.t;
    var zoom = map.getZoom();
    var baseRadius = zoom >= 16 ? 5 : zoom >= 14 ? 4 : zoom >= 13 ? 3.2 : 2.2;

    for (var i = 0; i < trees.length; i++) {
      var t = trees[i];
      var treeYear = t[3];
      if (treeYear > currentYear) continue;

      var cat = t[2];
      if (!activeSpecies.has(cat)) continue;

      var sp = SPECIES[cat] || SPECIES.u;
      var isClassified = cat !== "u";
      var r = isClassified ? baseRadius + 1 : baseRadius;
      var opacity = isClassified ? 0.9 : 0.4;

      // Newly added trees in the current year get a brighter appearance
      var isNew = treeYear === currentYear;

      var m = L.circleMarker([t[0], t[1]], {
        renderer: canvasRenderer,
        radius: isNew ? r + 0.5 : r,
        fillColor: sp.color,
        fillOpacity: isNew ? 1 : opacity,
        stroke: isClassified,
        color: sp.color,
        weight: isClassified ? (isNew ? 4 : 3) : 0,
        opacity: isNew ? 0.5 : 0.3,
      });

      m._treeIdx = i;
      m.on("click", function (e) {
        showDetailCard(data.t[e.target._treeIdx]);
      });

      m.bindTooltip(
        '<div class="tip-name">' + sp.label + "</div>" +
        '<div class="tip-meta">' + t[0].toFixed(4) + ", " + t[1].toFixed(4) +
        " &middot; mapped " + treeYear + "</div>",
        { className: "tip", direction: "top", offset: [0, -6] }
      );
      markers.push(m);
    }

    treeLayerGroup = L.layerGroup(markers).addTo(map);
    document.getElementById("h-trees").textContent = formatNum(markers.length);
  }

  /* ── Detail card ── */
  function showDetailCard(treeData) {
    var sp = SPECIES[treeData[2]] || SPECIES.u;
    var card = document.getElementById("detail-card");
    document.getElementById("detail-dot").style.background = sp.color;
    document.getElementById("detail-dot").style.boxShadow = "0 0 16px " + sp.glow;
    document.getElementById("detail-species").textContent = sp.label;
    document.getElementById("detail-coords").textContent =
      treeData[0].toFixed(5) + "\u00b0N, " + treeData[1].toFixed(5) + "\u00b0E";
    document.getElementById("detail-year").textContent = "Mapped in " + treeData[3];
    card.classList.remove("hidden");
  }

  /* ── Render parks (filtered by year) ── */
  function renderParks() {
    if (parkLayerGroup) {
      map.removeLayer(parkLayerGroup);
      parkLayerGroup = null;
    }
    if (!activeLayers.parks) {
      document.getElementById("h-parks").textContent = "0";
      return;
    }

    var layers = [];
    var count = 0;

    for (var i = 0; i < data.p.length; i++) {
      var parkYear = data.py[i];
      if (parkYear > currentYear) continue;

      var coords = data.p[i];
      var name = data.pn[i];
      var latlngs = coords.map(function (c) { return [c[0], c[1]]; });
      var isNew = parkYear === currentYear;

      var poly = L.polygon(latlngs, {
        fill: false,
        stroke: true,
        color: isNew ? "rgba(46, 204, 113, 0.40)" : "rgba(46, 204, 113, 0.22)",
        weight: isNew ? 1.6 : 1.0,
        opacity: isNew ? 0.8 : 0.6,
        dashArray: "4 6",
        smoothFactor: 1.5,
        interactive: !!name,
      });

      if (name) {
        poly.bindTooltip(
          '<div class="tip-name">' + name + "</div>" +
          '<div class="tip-meta">Park / Garden &middot; mapped ' + parkYear + "</div>",
          { className: "tip", direction: "top", sticky: true }
        );
      }
      layers.push(poly);
      count++;
    }

    parkLayerGroup = L.layerGroup(layers).addTo(map);
    document.getElementById("h-parks").textContent = formatNum(count);
  }

  /* ── Render water (filtered by year) ── */
  function renderWater() {
    if (waterLayerGroup) {
      map.removeLayer(waterLayerGroup);
      waterLayerGroup = null;
    }
    if (!activeLayers.water) {
      document.getElementById("h-lakes").textContent = "0";
      return;
    }

    var layers = [];
    var count = 0;

    for (var i = 0; i < data.w.length; i++) {
      var waterYear = data.wy[i];
      if (waterYear > currentYear) continue;

      var coords = data.w[i];
      var name = data.wn[i];
      var latlngs = coords.map(function (c) { return [c[0], c[1]]; });
      var isNew = waterYear === currentYear;

      var poly = L.polygon(latlngs, {
        fillColor: "rgba(59, 130, 246, 0.28)",
        fillOpacity: isNew ? 0.12 : 0.06,
        stroke: true,
        color: isNew ? "rgba(59, 130, 246, 0.45)" : "rgba(59, 130, 246, 0.25)",
        weight: isNew ? 1.4 : 0.8,
        opacity: isNew ? 0.8 : 0.55,
        smoothFactor: 1.5,
        interactive: !!name,
      });

      if (name) {
        poly.bindTooltip(
          '<div class="tip-name">' + name + "</div>" +
          '<div class="tip-meta">Lake / Water Body &middot; mapped ' + waterYear + "</div>",
          { className: "tip", direction: "top", sticky: true }
        );
      }
      layers.push(poly);
      count++;
    }

    waterLayerGroup = L.layerGroup(layers).addTo(map);
    document.getElementById("h-lakes").textContent = formatNum(count);
  }

  /* ── Render all ── */
  function renderAll() {
    renderWater();
    renderParks();
    renderTrees();
    updateTimelineCounts();
  }

  /* ── Sparkline chart ── */
  function drawSparkline() {
    var canvas = document.getElementById("timeline-chart");
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    var w = rect.width;
    var h = rect.height;
    var tl = data.timeline;
    var years = Object.keys(tl).map(Number).sort(function(a,b){return a-b;});
    var minY = years[0];
    var maxY = years[years.length - 1];
    var numYears = maxY - minY;

    // Find max cumulative for scaling
    var maxVal = 0;
    years.forEach(function(y) {
      var total = tl[y].t + tl[y].p + tl[y].w;
      if (total > maxVal) maxVal = total;
    });

    ctx.clearRect(0, 0, w, h);

    var padding = 4;
    var barW = (w - padding * 2) / (numYears + 1);
    var usableH = h - 4;

    // Draw stacked bars for each year
    years.forEach(function(y) {
      var x = padding + (y - minY) * barW;
      var d = tl[y];
      var total = d.t + d.p + d.w;
      var barH = (total / maxVal) * usableH;

      var isActive = y <= currentYear;
      var isCurrent = y === currentYear;

      // Water (bottom)
      var wH = (d.w / maxVal) * usableH;
      ctx.fillStyle = isActive ? (isCurrent ? "rgba(59,130,246,0.8)" : "rgba(59,130,246,0.4)") : "rgba(59,130,246,0.08)";
      ctx.fillRect(x, h - wH, barW - 1, wH);

      // Parks (middle)
      var pH = (d.p / maxVal) * usableH;
      ctx.fillStyle = isActive ? (isCurrent ? "rgba(46,204,113,0.8)" : "rgba(46,204,113,0.4)") : "rgba(46,204,113,0.08)";
      ctx.fillRect(x, h - wH - pH, barW - 1, pH);

      // Trees (top)
      var tH = (d.t / maxVal) * usableH;
      ctx.fillStyle = isActive ? (isCurrent ? "rgba(244,63,158,0.8)" : "rgba(244,63,158,0.4)") : "rgba(244,63,158,0.08)";
      ctx.fillRect(x, h - wH - pH - tH, barW - 1, tH);
    });

    // Draw vertical indicator line for current year
    var lineX = padding + (currentYear - minY) * barW + barW / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lineX, 0);
    ctx.lineTo(lineX, h);
    ctx.stroke();
  }

  /* ── Update timeline counts ── */
  function updateTimelineCounts() {
    var tl = data.timeline;
    var d = tl[currentYear] || { t: 0, p: 0, w: 0 };
    document.getElementById("tc-trees").textContent = formatNum(d.t);
    document.getElementById("tc-parks").textContent = formatNum(d.p);
    document.getElementById("tc-water").textContent = formatNum(d.w);
  }

  /* ── Timeline slider ── */
  function applyYear(year) {
    currentYear = year;
    document.getElementById("time-display").textContent = year;
    drawSparkline();
    renderAll();
    buildLegend();
  }

  /* ── Auto-play ── */
  function toggleAutoPlay() {
    var btn = document.getElementById("time-play");
    var slider = document.getElementById("time-slider");
    var playIcon = btn.querySelector(".play-icon");
    var pauseIcon = btn.querySelector(".pause-icon");

    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
      btn.classList.remove("playing");
      playIcon.style.display = "";
      pauseIcon.style.display = "none";
      return;
    }

    btn.classList.add("playing");
    playIcon.style.display = "none";
    pauseIcon.style.display = "";

    // Start from beginning if at end
    var minYear = parseInt(slider.min, 10);
    var maxYear = parseInt(slider.max, 10);
    if (parseInt(slider.value, 10) >= maxYear) {
      slider.value = minYear;
      applyYear(minYear);
    }

    autoPlayInterval = setInterval(function () {
      var val = parseInt(slider.value, 10);
      if (val >= maxYear) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        btn.classList.remove("playing");
        playIcon.style.display = "";
        pauseIcon.style.display = "none";
        return;
      }
      val++;
      slider.value = val;
      applyYear(val);
    }, 700);
  }

  /* ── Legend ── */
  function buildLegend() {
    var container = document.getElementById("legend-items");
    container.innerHTML = "";

    var counts = {};
    data.t.forEach(function (t) {
      if (t[3] <= currentYear) {
        counts[t[2]] = (counts[t[2]] || 0) + 1;
      }
    });

    var keys = Object.keys(SPECIES).filter(function (k) { return counts[k] > 0; });
    keys.sort(function (a, b) {
      if (a === "u") return 1;
      if (b === "u") return -1;
      return (counts[b] || 0) - (counts[a] || 0);
    });

    keys.forEach(function (key) {
      var sp = SPECIES[key];
      var item = document.createElement("div");
      item.className = "legend-item";
      item.dataset.species = key;
      item.innerHTML =
        '<span class="legend-dot" style="background:' + sp.color + ';box-shadow:0 0 6px ' + sp.glow + '"></span>' +
        '<span>' + sp.label + '</span>' +
        '<span class="legend-count">' + (counts[key] || 0).toLocaleString() + '</span>';
      container.appendChild(item);
    });
  }

  /* ── Slider tick marks ── */
  function buildSliderTicks() {
    var container = document.getElementById("slider-ticks");
    var tl = data.timeline;
    var years = Object.keys(tl).map(Number).sort(function(a,b){return a-b;});
    var minY = years[0];
    var maxY = years[years.length - 1];

    // Show ticks every 2-3 years
    var tickYears = [];
    for (var y = minY; y <= maxY; y++) {
      if (y === minY || y === maxY || y % 3 === 0) {
        tickYears.push(y);
      }
    }

    container.innerHTML = "";
    tickYears.forEach(function (y) {
      var span = document.createElement("span");
      span.textContent = "'" + String(y).slice(2);
      container.appendChild(span);
    });
  }

  /* ── Controls ── */
  function setupControls() {
    // Layer pills
    document.querySelectorAll(".layer-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var layer = btn.dataset.layer;
        btn.classList.toggle("active");
        activeLayers[layer] = btn.classList.contains("active");
        if (layer === "trees") renderTrees();
        else if (layer === "parks") renderParks();
        else if (layer === "water") renderWater();
        updateTimelineCounts();
      });
    });

    // Timeline slider
    var slider = document.getElementById("time-slider");
    slider.addEventListener("input", function () {
      applyYear(parseInt(slider.value, 10));
    });

    // Auto-play
    document.getElementById("time-play").addEventListener("click", toggleAutoPlay);

    // Legend clicks
    document.getElementById("legend-items").addEventListener("click", function (e) {
      var item = e.target.closest(".legend-item");
      if (!item) return;
      var species = item.dataset.species;
      item.classList.toggle("dimmed");
      if (item.classList.contains("dimmed")) {
        activeSpecies.delete(species);
      } else {
        activeSpecies.add(species);
      }
      renderTrees();
    });

    // Legend toggle all
    document.getElementById("legend-toggle-all").addEventListener("click", function () {
      allLegendVisible = !allLegendVisible;
      document.querySelectorAll(".legend-item").forEach(function (item) {
        var species = item.dataset.species;
        if (allLegendVisible) {
          item.classList.remove("dimmed");
          activeSpecies.add(species);
        } else {
          item.classList.add("dimmed");
          activeSpecies.delete(species);
        }
      });
      this.textContent = allLegendVisible ? "All" : "None";
      renderTrees();
    });

    // Detail card close
    document.getElementById("detail-close").addEventListener("click", function () {
      document.getElementById("detail-card").classList.add("hidden");
    });
    map.on("click", function () {
      document.getElementById("detail-card").classList.add("hidden");
    });

    // Re-render trees on zoom
    map.on("zoomend", function () {
      if (activeLayers.trees) renderTrees();
    });

    // Redraw sparkline on resize
    window.addEventListener("resize", function () {
      drawSparkline();
    });
  }

  /* ── Init ── */
  async function init() {
    setIntroProgress(10);
    initMap();
    setIntroProgress(20);

    try {
      var resp = await fetch("./data.json");
      data = await resp.json();
    } catch (err) {
      console.error("Failed to load data:", err);
      return;
    }

    setIntroProgress(60);

    // Set slider range from data
    var slider = document.getElementById("time-slider");
    slider.min = data.m.yearMin;
    slider.max = data.m.yearMax;
    slider.value = data.m.yearMax;
    currentYear = data.m.yearMax;

    // Animate intro numbers
    animateIntroNumber("intro-trees", data.m.trees, 1400);
    animateIntroNumber("intro-parks", data.m.parks, 1400);
    animateIntroNumber("intro-lakes", data.m.water, 1400);

    setIntroProgress(80);

    // Render
    renderAll();
    buildLegend();
    buildSliderTicks();
    setupControls();
    drawSparkline();

    // Update header
    document.getElementById("h-trees").textContent = formatNum(data.m.trees);
    document.getElementById("h-parks").textContent = formatNum(data.m.parks);
    document.getElementById("h-lakes").textContent = formatNum(data.m.water);
    document.getElementById("time-display").textContent = currentYear;

    setIntroProgress(100);
    setTimeout(hideIntro, 2400);
  }

  init();
})();
