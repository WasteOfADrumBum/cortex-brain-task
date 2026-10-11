// Cortex HUD drawing helpers: SVG core, gauges, rings, ring clock, bar chart.
const HUD = (() => {
  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Angles in degrees, 0 = 12 o'clock, clockwise.
  function point(cx, cy, r, deg) {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  }
  function arc(cx, cy, r, a0, a1) {
    if (a1 - a0 >= 360) a1 = a0 + 359.99;
    const [x0, y0] = point(cx, cy, r, a0);
    const [x1, y1] = point(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  // ---------- Brain core (arc-reactor style) ----------
  function buildCore(svg) {
    const C = 250;
    const defs = el("defs", {}, svg);
    const glow = el("filter", { id: "core-glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: "4", result: "b" }, glow);
    const merge = el("feMerge", {}, glow);
    el("feMergeNode", { in: "b" }, merge);
    el("feMergeNode", { in: "SourceGraphic" }, merge);
    const dots = el("pattern", { id: "core-dots", width: "8", height: "8", patternUnits: "userSpaceOnUse" }, defs);
    el("circle", { cx: "4", cy: "4", r: "0.9", fill: "rgba(170,225,255,0.35)" }, dots);
    const fade = el("radialGradient", { id: "core-fade" }, defs);
    el("stop", { offset: "0%", "stop-color": "#0d2a40", "stop-opacity": "0.95" }, fade);
    el("stop", { offset: "100%", "stop-color": "#03080e", "stop-opacity": "0.95" }, fade);

    // Halo network dots
    const halo = el("g", { class: "spin-slow", opacity: "0.55" }, svg);
    for (let i = 0; i < 70; i++) {
      const a = (i * 137.5) % 360;
      const r = 236 + ((i * 53) % 22);
      const [x, y] = point(C, C, r, a);
      el("circle", { cx: x, cy: y, r: i % 7 === 0 ? 1.8 : 1, fill: "#bfe9ff" }, halo);
    }

    // Outer tick ring
    const ticks = el("g", { class: "spin-slow" }, svg);
    for (let i = 0; i < 120; i++) {
      const a = i * 3;
      const major = i % 10 === 0;
      const [x0, y0] = point(C, C, 222, a);
      const [x1, y1] = point(C, C, major ? 208 : 215, a);
      el("line", { x1: x0, y1: y0, x2: x1, y2: y1, stroke: major ? "#8fe9ff" : "rgba(143,233,255,0.35)", "stroke-width": major ? 2 : 1 }, ticks);
    }

    // Outer bracket ring
    const outer = el("g", { class: "spin-rev", filter: "url(#core-glow)" }, svg);
    [[-40, 40], [60, 120], [140, 220], [240, 300], [320, 340]].forEach(([a0, a1], i) => {
      el("path", { d: arc(C, C, 200, a0, a1), fill: "none", stroke: "#43d9ff", "stroke-width": i % 2 ? 3 : 6, opacity: 0.9 }, outer);
    });

    // Segmented band (health)
    const band = el("g", { id: "core-band" }, svg);
    for (let i = 0; i < 36; i++) {
      el("path", { d: arc(C, C, 176, i * 10 + 1, i * 10 + 9), fill: "none", stroke: "rgba(67,217,255,0.12)", "stroke-width": 22, "data-seg": i }, band);
    }

    // Amber accent arc
    const accent = el("g", { class: "spin-fast" }, svg);
    el("path", { d: arc(C, C, 152, 200, 250), fill: "none", stroke: "#ffb547", "stroke-width": 3, filter: "url(#core-glow)" }, accent);
    for (let i = 0; i < 5; i++) {
      const [x, y] = point(C, C, 152, 300 + i * 9);
      el("circle", { cx: x, cy: y, r: 2.5, fill: "#ffb547" }, accent);
    }

    // Inner bright ring
    el("circle", { cx: C, cy: C, r: 140, fill: "none", stroke: "#8fe9ff", "stroke-width": 5, filter: "url(#core-glow)", class: "pulse" }, svg);
    const dashed = el("g", { class: "spin-rev" }, svg);
    el("circle", { cx: C, cy: C, r: 128, fill: "none", stroke: "rgba(143,233,255,0.6)", "stroke-width": 1.5, "stroke-dasharray": "2 6" }, dashed);

    // Core disc
    el("circle", { cx: C, cy: C, r: 120, fill: "url(#core-fade)" }, svg);
    el("circle", { cx: C, cy: C, r: 120, fill: "url(#core-dots)" }, svg);
  }

  // Light up `fraction` of the band segments, tinted by tone.
  function setCoreHealth(svg, fraction, tone) {
    const colors = { ok: "#43d9ff", warn: "#ffb547", bad: "#ff6b78", idle: "rgba(67,217,255,0.12)" };
    const segs = svg.querySelectorAll("#core-band path");
    const lit = Math.round(segs.length * Math.max(0, Math.min(1, fraction)));
    segs.forEach((p, i) => {
      const on = tone !== "idle" && i < lit;
      p.setAttribute("stroke", on ? colors[tone] : colors.idle);
      p.setAttribute("opacity", on ? 0.55 + 0.45 * (i / segs.length) : 1);
    });
  }

  // ---------- Speedometer gauge ----------
  const SWEEP0 = -125, SWEEP1 = 125;
  function gauge(host, { label, max, steps = 5 }) {
    const wrap = document.createElement("div");
    wrap.className = "gauge";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", `${label}: no data`);
    const svg = el("svg", { viewBox: "0 0 200 150", "aria-hidden": "true" });
    wrap.appendChild(svg);
    el("path", { class: "g-track", d: arc(100, 100, 78, SWEEP0, SWEEP1) }, svg);
    const val = el("path", { class: "g-val tone-cyan", d: arc(100, 100, 78, SWEEP0, SWEEP0 + 0.1) }, svg);
    const numbers = el("g", {}, svg);
    for (let i = 0; i <= steps * 4; i++) {
      const a = SWEEP0 + ((SWEEP1 - SWEEP0) * i) / (steps * 4);
      const major = i % 4 === 0;
      const [x0, y0] = point(100, 100, 66, a);
      const [x1, y1] = point(100, 100, major ? 56 : 61, a);
      el("line", { class: `g-tick${major ? " major" : ""}`, x1: x0, y1: y0, x2: x1, y2: y1 }, svg);
    }
    const needle = el("g", { class: "g-needle" }, svg);
    el("line", { x1: 100, y1: 108, x2: 100, y2: 36 }, needle);
    el("circle", { class: "g-hub", cx: 100, cy: 100, r: 7 }, svg);

    const readout = document.createElement("div");
    readout.className = "gauge-readout";
    readout.setAttribute("aria-hidden", "true");
    readout.innerHTML = `<div class="gauge-value">--</div><div class="gauge-label"></div><div class="gauge-note"></div>`;
    readout.querySelector(".gauge-label").textContent = label;
    wrap.appendChild(readout);
    host.appendChild(wrap);

    let curMax = max;
    function drawNumbers() {
      numbers.replaceChildren();
      for (let i = 0; i <= steps; i++) {
        const a = SWEEP0 + ((SWEEP1 - SWEEP0) * i) / steps;
        const [x, y] = point(100, 100, 46, a);
        const t = el("text", { class: "g-num", x, y: y + 3 }, numbers);
        t.textContent = Math.round((curMax * i) / steps);
      }
    }
    drawNumbers();

    return {
      set(value, { text, note = "", tone = "cyan", max: newMax } = {}) {
        if (newMax && newMax !== curMax) { curMax = newMax; drawNumbers(); }
        const v = value == null ? 0 : Math.max(0, Math.min(curMax, value));
        const a = SWEEP0 + ((SWEEP1 - SWEEP0) * v) / curMax;
        val.setAttribute("d", arc(100, 100, 78, SWEEP0, Math.max(a, SWEEP0 + 0.1)));
        val.setAttribute("class", `g-val tone-${tone}`);
        needle.style.transform = `rotate(${a}deg)`;
        const vEl = readout.querySelector(".gauge-value");
        vEl.textContent = text ?? (value == null ? "--" : String(value));
        vEl.className = `gauge-value tone-${tone}`;
        readout.querySelector(".gauge-note").textContent = note;
        wrap.setAttribute("aria-label", `${label}: ${value == null ? "no data" : vEl.textContent}${note ? `, ${note}` : ""}`);
      },
    };
  }

  // ---------- Progress ring ----------
  function ring(host, label) {
    const wrap = document.createElement("div");
    wrap.className = "ring";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", `${label}: no data`);
    const svg = el("svg", { viewBox: "0 0 60 60", "aria-hidden": "true" });
    const R = 25, LEN = 2 * Math.PI * R;
    el("circle", { class: "r-track", cx: 30, cy: 30, r: R }, svg);
    const v = el("circle", { class: "r-val", cx: 30, cy: 30, r: R, "stroke-dasharray": LEN, "stroke-dashoffset": LEN }, svg);
    wrap.appendChild(svg);
    const text = document.createElement("div");
    text.className = "ring-text";
    text.setAttribute("aria-hidden", "true");
    text.innerHTML = "<b>--</b><span></span>";
    text.querySelector("span").textContent = label;
    wrap.appendChild(text);
    host.appendChild(wrap);
    return {
      set(fraction) {
        const f = Math.max(0, Math.min(1, fraction));
        v.setAttribute("stroke-dashoffset", (LEN * (1 - f)).toFixed(2));
        text.querySelector("b").textContent = `${Math.floor(f * 100)}%`;
        wrap.setAttribute("aria-label", `${label}: ${Math.floor(f * 100)}% elapsed`);
      },
    };
  }

  // ---------- Ring clock ----------
  function ringClock(host) {
    // The time itself is HTML layered over the ring (see .ring-face), so it can use the display font.
    const svg = el("svg", { viewBox: "0 0 140 140", "aria-hidden": "true" });
    host.prepend(svg);
    el("circle", { class: "rc-track", cx: 70, cy: 70, r: 62 }, svg);
    for (let i = 0; i < 12; i++) {
      const [x0, y0] = point(70, 70, 52, i * 30);
      const [x1, y1] = point(70, 70, 47, i * 30);
      el("line", { class: "rc-tick", x1: x0, y1: y0, x2: x1, y2: y1 }, svg);
    }
    const sec = el("path", { class: "rc-sec" }, svg);
    const min = el("path", { class: "rc-min" }, svg);
    return {
      set(date) {
        const s = date.getSeconds() + date.getMilliseconds() / 1000;
        sec.setAttribute("d", arc(70, 70, 62, 0, Math.max(0.5, s * 6)));
        min.setAttribute("d", arc(70, 70, 56, 0, Math.max(0.5, (date.getMinutes() + s / 60) * 6)));
      },
    };
  }

  // ---------- Bar chart ----------
  function bars(host, counts, labels) {
    const W = 600, H = 110, pad = 18;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
    const max = Math.max(1, ...counts);
    const bw = W / counts.length;
    counts.forEach((c, i) => {
      const h = c === 0 ? 2 : Math.max(4, ((H - pad - 6) * c) / max);
      el("rect", { class: `bar${i === counts.length - 1 ? " today" : ""}`, x: i * bw + 2, y: H - pad - h, width: bw - 4, height: h, rx: 1.5 }, svg);
    });
    el("line", { class: "base", x1: 0, y1: H - pad + 1, x2: W, y2: H - pad + 1 }, svg);
    labels.forEach(([i, txt]) => {
      const t = el("text", { class: "lbl", x: Math.min(W - 30, i * bw + 2), y: H - 3 }, svg);
      t.textContent = txt;
    });
    host.replaceChildren(svg);
  }

  return { buildCore, setCoreHealth, gauge, ring, ringClock, bars };
})();
