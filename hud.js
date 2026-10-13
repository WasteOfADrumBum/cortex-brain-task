// Cortex drawing helpers: ring clock and bar chart.
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

  return { ringClock, bars };
})();
