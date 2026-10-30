// Home page physics, real time, for mouse and touch. Spring effects live here; Matter.js bodies
// (the stack box and gravity mode) are in bodies.js.
//   field    the page's dot grid: the pointer pushes dots, a click or tap sends a shockwave, a scroll makes it sway
//   letters  the title hangs on springs: drag or flick a letter and the neighbours follow
//   springs  cards tilt toward the pointer, sink when pressed and wobble when let go
//   pixels   pixel icons assemble as they scroll in and scatter when touched
//   string   the timeline is a string you can pluck; its dots ride on it
//   bars     chart bars are coupled springs: brush across them and a ripple runs through
//   scroll   every block of text and every box hangs on a spring while the page scrolls
// Each loop stops when things come to rest. None of it runs under reduced motion.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.add("physics");
  const css = (k) => getComputedStyle(root).getPropertyValue(k).trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const held = () => root.classList.contains("gravity");     // gravity mode owns element transforms while it is on
  let lastPointer = "mouse";
  addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, { capture: true, passive: true });
  // scroll position, read once per scroll event: reading scrollY inside a frame, after other loops wrote
  // transforms, forces a synchronous style and layout pass
  let SY = scrollY, SV = 0, lastScroll = 0;
  addEventListener("scroll", () => {
    const now = performance.now(), dt = now - lastScroll;
    SV = dt < 100 ? ((scrollY - SY) * 16.67) / Math.max(dt, 4) : 0;   // px per 60 fps frame
    SY = scrollY; lastScroll = now;
  }, { capture: true, passive: true });
  const scrollSpeed = () => (performance.now() - lastScroll > 80 ? 0 : SV);

  // rAF loop that stops when step(dt) returns false; dt is in 60 fps frames, so 120 Hz screens run at the same speed
  const loop = (step) => {
    let on = false, last = 0;
    const tick = (t) => {
      const dt = clamp((t - last) / 16.67, 0.05, 3);
      last = t;
      on = step(dt);
      if (on) requestAnimationFrame(tick);
    };
    return () => { if (!on) { on = true; last = performance.now(); requestAnimationFrame(tick); } };
  };
  const onTheme = (f) => {
    document.querySelector(".theme")?.addEventListener("click", () => requestAnimationFrame(f));   // after site.js flips data-theme
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", f);
  };
  const once = (el, f, margin = "0px 0px -10% 0px") =>
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); f(); } }, { rootMargin: margin }).observe(el);

  // ---------- field ----------
  // The dot grid is a CSS pattern on an element as tall as the page (.grid): it scrolls with the page for free.
  // The canvas over it is the size of the window and holds only the dots that moved: each one covers its own
  // place with the page colour and is drawn where it went. Nothing moved, nothing drawn, scrolling included.
  const field = document.querySelector(".field");
  if (field) {
    const grid = document.querySelector(".grid") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "grid" }));
    const ctx = field.getContext("2d"), G = 22, R = 120;
    const live = new Map();                      // only displaced dots carry state, keyed by grid cell in page coordinates
    const key = (c, r) => r * 4096 + c;
    const get = (c, r) => { const k = key(c, r); let d = live.get(k); if (!d) live.set(k, (d = { ox: 0, oy: 0, vx: 0, vy: 0 })); return d; };
    const batches = Array.from({ length: 32 }, () => []);   // 4 colours x 8 alpha levels, one fill() each
    let W = 0, H = 0, styles = [], bg = "", waves = [], ptr = null, fx = [], lastBox = null;
    const paint = () => {
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a = hex(css("--axis")), c = hex(css("--clay"));
      styles = [0, 0.4, 0.7, 1].flatMap((t) => Array.from({ length: 8 }, (_, l) => `rgba(${a.map((v, i) => Math.round(v + (c[i] - v) * t))},${(l + 1) / 8})`));
      bg = css("--bg");
    };
    const size = () => {
      W = innerWidth; H = innerHeight; field.width = W; field.height = H; lastBox = [0, 0, W, H];
      fx = Array.from({ length: Math.ceil(W / G) + 2 }, (_, c) => ((c * G + G / 2 - 0.75 * W) / (0.8 * W)) ** 2);
      grid.style.setProperty("--gh", `${Math.min(H, 900)}px`);   // the glow behind the hero, same shape as glow() below
    };
    // faint everywhere, brightest in an ellipse behind the hero (the .grid CSS draws the same falloff)
    const glow = (c, y) => { const h = Math.min(H, 900); return Math.max(0.3, 1 - Math.sqrt(fx[c] + ((y - 0.25 * h) / (0.7 * h)) ** 2) / 0.75); };

    const step = (dt) => {
      const damp = 0.86 ** dt, cols = Math.ceil(W / G);
      if (ptr) {
        const px = ptr.x, py = ptr.y + SY;
        for (let r = Math.max(0, Math.floor((py - R) / G)); r <= Math.ceil((py + R) / G); r++)
          for (let c = Math.max(0, Math.floor((px - R) / G)); c <= Math.min(cols, Math.ceil((px + R) / G)); c++) {
            const d0 = live.get(key(c, r));
            const dx = c * G + G / 2 + (d0 ? d0.ox : 0) - px, dy = r * G + G / 2 + (d0 ? d0.oy : 0) - py;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist >= R) continue;
            const f = (1 - dist / R) ** 2 * 0.9 * dt, d = d0 || get(c, r);
            d.vx += (dx / dist) * f; d.vy += (dy / dist) * f;
          }
      }
      const top = Math.floor(SY / G), rows = Math.ceil(H / G) + 1;
      for (const w of waves) {                   // a ring 36 px wide moving out at 8 px per frame
        w.t += dt;
        const rad = w.t * 8, fade = 1 - w.t / 55, reach = rad + 36;
        for (let r = Math.max(top, Math.floor((w.y - reach) / G)); r <= Math.min(top + rows, Math.ceil((w.y + reach) / G)); r++)
          for (let c = Math.max(0, Math.floor((w.x - reach) / G)); c <= Math.min(cols, Math.ceil((w.x + reach) / G)); c++) {
            const dx = c * G + G / 2 - w.x, dy = r * G + G / 2 - w.y, dist = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.abs(dist - rad);
            if (k >= 36) continue;
            const f = (1 - k / 36) * 1.0 * fade * dt, d = get(c, r);
            d.vx += (dx / dist) * f; d.vy += (dy / dist) * f;
          }
      }
      waves = waves.filter((w) => w.t < 55);
      let moving = waves.length > 0;
      for (const [k, d] of live) {
        d.vx = (d.vx - 0.05 * d.ox * dt) * damp; d.vy = (d.vy - 0.05 * d.oy * dt) * damp;
        d.ox = clamp(d.ox + d.vx * dt, -14, 14); d.oy = clamp(d.oy + d.vy * dt, -14, 14);
        const sp = Math.abs(d.vx) + Math.abs(d.vy);
        if (sp > 0.02) moving = true;
        if (sp + Math.abs(d.ox) + Math.abs(d.oy) < 0.05) live.delete(k);   // settled: back in the pattern
      }
      draw();
      return moving || live.size > 0;
    };

    // Clear the box around this frame's and last frame's displaced dots, cover their places with the page colour,
    // draw them where they are.
    const draw = () => {
      if (!live.size && !lastBox) return;
      let box = null;
      for (const k of live.keys()) {
        const r = Math.floor(k / 4096), x = (k - r * 4096) * G + G / 2, y = r * G + G / 2 - SY;
        box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
      }
      if (box) box = [box[0] - 24, box[1] - 24, box[2] + 24, box[3] + 24];
      const u = box && lastBox ? [Math.min(box[0], lastBox[0]), Math.min(box[1], lastBox[1]), Math.max(box[2], lastBox[2]), Math.max(box[3], lastBox[3])] : box || lastBox;
      lastBox = box;
      if (!u) return;
      const [x0, y0, x1, y1] = [Math.max(0, u[0]), Math.max(0, u[1]), Math.min(W, u[2]), Math.min(H, u[3])];
      if (x1 <= x0 || y1 <= y0) return;
      ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      if (!live.size) return;
      for (const b of batches) b.length = 0;
      ctx.fillStyle = bg;
      ctx.beginPath();
      for (const [k, d] of live) {
        const r = Math.floor(k / 4096), c = k - r * 4096, x = c * G + G / 2, y = r * G + G / 2, sy0 = y - SY;
        if (sy0 < -40 || sy0 > H + 40 || c > Math.ceil(W / G)) continue;
        ctx.rect(x - 2, sy0 - 2, 4, 4);          // cover the pattern's dot at this cell
        const e = Math.abs(d.ox) + Math.abs(d.oy), al = Math.min(7, Math.round(Math.min(1, glow(c, y) + e / 50) * 8) - 1);
        if (al >= 0) batches[Math.min(3, (e / 3.5) | 0) * 8 + al].push(x + d.ox, sy0 + d.oy);
      }
      ctx.fill();
      batches.forEach((pts, i) => {              // colour runs from grid grey to clay as a dot is pushed further
        if (!pts.length) return;
        const s = 2 + (i >> 3) * 0.6, h = s / 2;
        ctx.fillStyle = styles[i];
        ctx.beginPath();
        for (let j = 0; j < pts.length; j += 2) ctx.rect(pts[j] - h, pts[j + 1] - h, s, s);
        ctx.fill();
      });
    };

    const start = loop(step);
    const point = (x, y) => { ptr = held() ? null : { x, y }; start(); };   // in gravity mode dragging must not repaint the background
    // waves start only from empty space: things with their own physics, links and buttons keep a press to themselves
    const OWN = ".timeline, .stage, .title, .chart, .card, .hl, .honor, .paper, .badges, .hero-art, a, button";
    let lastWave = 0;
    const wave = (x, y, target) => {
      if (target?.closest?.(OWN) || performance.now() - lastWave < 120) return;
      lastWave = performance.now();
      waves = [...waves.slice(-2), { x, y: y + SY, t: 0 }];      // at most three rings at once
      start();
    };
    addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") point(e.clientX, e.clientY); }, { passive: true });
    addEventListener("touchmove", (e) => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    addEventListener("touchend", () => { ptr = null; start(); }, { passive: true });
    root.addEventListener("mouseleave", () => { ptr = null; start(); });
    // mouse: a wave on every press; touch: only on a tap, so starting a scroll doesn't set one off
    addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") wave(e.clientX, e.clientY, e.target); }, { passive: true });
    addEventListener("click", (e) => { if (lastPointer !== "mouse" && e.detail) wave(e.clientX, e.clientY, e.target); }, { passive: true });
    // a wheel scroll slides the page under a resting cursor: that is not the pointer brushing the dots
    // (a finger scrolling does brush them: touchmove sets the pointer again)
    addEventListener("scroll", () => { if (lastPointer === "mouse") ptr = null; start(); }, { passive: true });
    addEventListener("resize", () => { size(); start(); });
    onTheme(() => { paint(); lastBox = [0, 0, W, H]; start(); });
    size(); paint();
  }

  // ---------- letters ----------
  const letters = [...document.querySelectorAll(".title span")].map((el) => ({ el, x: 0, y: 0, vx: 0, vy: 0, drag: null }));
  if (letters.length) {
    const rubber = (v) => Math.sign(v) * 260 * (1 - Math.exp(-Math.abs(v) / 260));   // pulling harder gives less
    const step = (dt) => {
      if (held()) { letters.forEach((s) => { s.x = s.y = s.vx = s.vy = 0; s.drag = null; }); return false; }
      let moving = false;
      const damp = 0.86 ** dt;
      letters.forEach((s, i) => {
        if (!s.drag) {
          // rest point = part of the neighbours' displacement, so the word moves like a chain
          const nb = [letters[i - 1], letters[i + 1]].filter(Boolean);
          const tx = (0.45 * nb.reduce((a, n) => a + n.x, 0)) / nb.length, ty = (0.45 * nb.reduce((a, n) => a + n.y, 0)) / nb.length;
          s.vx = (s.vx + (tx - s.x) * 0.09 * dt) * damp; s.vy = (s.vy + (ty - s.y) * 0.09 * dt) * damp;
          s.x += s.vx * dt; s.y += s.vy * dt;
        }
        const live = !!s.drag || Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.vx) + Math.abs(s.vy) > 0.05;
        moving ||= live;
        s.el.style.transform = live ? `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px) rotate(${clamp(s.vx * 1.5, -30, 30).toFixed(2)}deg)` : "";
      });
      if (!moving) letters.forEach((s) => { s.x = s.y = s.vx = s.vy = 0; s.el.style.transform = ""; });
      return moving;
    };
    const start = loop(step);
    letters.forEach((s) => {
      const el = s.el;
      el.addEventListener("pointerdown", (e) => {
        if (held()) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        s.drag = { px: e.clientX, py: e.clientY, rx: s.x, ry: s.y, t: e.timeStamp, moved: 0 };
        el.classList.add("held");
        start();
      });
      el.addEventListener("pointermove", (e) => {
        const d = s.drag;
        if (!d) return;
        const nx = rubber(d.rx + e.clientX - d.px), ny = rubber(d.ry + e.clientY - d.py);
        const k = Math.max(1, e.timeStamp - d.t) / 16.67;
        s.vx = 0.6 * ((nx - s.x) / k) + 0.4 * s.vx; s.vy = 0.6 * ((ny - s.y) / k) + 0.4 * s.vy;
        d.moved = Math.max(d.moved, Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py));
        s.x = nx; s.y = ny; d.t = e.timeStamp;
      });
      const drop = () => {
        if (!s.drag) return;
        if (s.drag.moved < 4) s.vy -= 6;          // a tap makes the letter hop
        s.vx = clamp(s.vx, -40, 40); s.vy = clamp(s.vy, -40, 40);
        s.drag = null;
        el.classList.remove("held");
        start();
      };
      el.addEventListener("pointerup", drop);
      el.addEventListener("pointercancel", drop);
      el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !s.drag && !held()) { s.vy -= 4; start(); } });
    });
  }

  // ---------- springs ----------
  // channels: rotateX, rotateY (deg), lift (px), scale
  const springs = [
    ...[...document.querySelectorAll(".hl, .card, .honor, .paper, .badges li, .hero-art")].map((el) => [el, true]),
    ...[...document.querySelectorAll(".btn, .theme")].map((el) => [el, false]),
  ].map(([el, tilt]) => {
    el.classList.add("spring");
    return { el, tilt, p: [0, 0, 0, 1], v: [0, 0, 0, 0], t: [0, 0, 0, 1] };
  });
  if (springs.length) {
    const active = new Set(), EPS = [0.05, 0.05, 0.05, 0.0005];
    const step = (dt) => {
      if (held()) { for (const s of active) { s.p = [0, 0, 0, 1]; s.v = [0, 0, 0, 0]; s.t = [0, 0, 0, 1]; } active.clear(); return false; }
      const damp = 0.8 ** dt;
      for (const s of active) {
        let rest = true;
        for (let i = 0; i < 4; i++) {
          s.v[i] = (s.v[i] + (s.t[i] - s.p[i]) * 0.14 * dt) * damp;
          s.p[i] += s.v[i] * dt;
          if (Math.abs(s.t[i] - s.p[i]) + Math.abs(s.v[i]) > EPS[i]) rest = false;
        }
        if (rest) { s.p = [...s.t]; s.v = [0, 0, 0, 0]; active.delete(s); }
        const [rx, ry, z, k] = s.p;
        s.el.style.transform = rx || ry || z || k !== 1
          ? `perspective(900px) translateY(${z.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${k.toFixed(4)})` : "";
      }
      return active.size > 0;
    };
    const start = loop(step);
    const go = (s) => { active.add(s); start(); };
    const aim = (s, e, deg) => {
      const r = s.el.getBoundingClientRect();
      s.t[0] = -((e.clientY - r.top) / r.height - 0.5) * deg;
      s.t[1] = ((e.clientX - r.left) / r.width - 0.5) * deg;
    };
    for (const s of springs) {
      const deg = s.tilt ? clamp(2400 / Math.max(1, s.el.offsetWidth), 3, 10) : 0;   // big cards tilt less
      s.el.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse" || held()) return;
        aim(s, e, deg); s.t[2] = s.tilt ? -4 : 0; go(s);
      });
      s.el.addEventListener("pointerleave", () => { s.t = [0, 0, 0, 1]; go(s); });
      s.el.addEventListener("pointerdown", (e) => {
        if (held()) return;
        if (e.pointerType !== "mouse") aim(s, e, deg * 1.2);
        s.t[3] = 0.95; go(s);
      });
      const up = (e) => {
        s.t[3] = 1; s.v[3] += 0.02;                 // let go: overshoot and wobble back
        if (e.pointerType !== "mouse") s.t[0] = s.t[1] = 0;
        go(s);
      };
      s.el.addEventListener("pointerup", up);
      s.el.addEventListener("pointercancel", up);
    }
  }

  // ---------- pixels ----------
  const icons = [...document.querySelectorAll(".px")].map((px) => ({
    px, cells: [...px.children].map((el, i) => ({ el, i, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 })).filter((c) => !c.el.classList.contains("p_")),
  }));
  if (icons.length) {
    const active = new Set();
    const step = (dt) => {
      const damp = 0.84 ** dt;
      for (const ic of active) {
        let moving = false;
        for (const c of ic.cells) {
          c.vx = (c.vx - c.x * 0.07 * dt) * damp; c.vy = (c.vy - c.y * 0.07 * dt) * damp; c.vr = (c.vr - c.r * 0.07 * dt) * damp;
          c.x = clamp(c.x + c.vx * dt, -40, 40); c.y = clamp(c.y + c.vy * dt, -40, 40); c.r += c.vr * dt;
          const m = Math.abs(c.x) + Math.abs(c.y) + Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.r) / 20;
          moving ||= m > 0.05;
          c.el.style.transform = m > 0.05 ? `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) rotate(${c.r.toFixed(0)}deg)` : "";
        }
        if (!moving) { for (const c of ic.cells) { c.x = c.y = c.vx = c.vy = c.r = c.vr = 0; c.el.style.transform = ""; } active.delete(ic); }
      }
      return active.size > 0;
    };
    const start = loop(step);
    // kick every cell away from (cx, cy), in cell units from the icon's top left
    const burst = (ic, power, cx = 4.5, cy = 4.5) => {
      for (const c of ic.cells) {
        const dx = (c.i % 10) - cx, dy = ((c.i / 10) | 0) - cy, d = Math.hypot(dx, dy) || 1, f = (power * (0.5 + Math.random())) / Math.sqrt(d);
        c.vx += (dx / d) * f + (Math.random() - 0.5) * power * 0.3;
        c.vy += (dy / d) * f + (Math.random() - 0.5) * power * 0.3;
        c.vr += (Math.random() - 0.5) * power * 6;
      }
      active.add(ic); start();
    };
    const cell = (ic, e) => { const r = ic.px.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 10 - 0.5, ((e.clientY - r.top) / r.height) * 10 - 0.5]; };
    icons.forEach((ic) => {
      const host = ic.px.closest(".card, .honor") || ic.px;
      once(ic.px, () => {                          // assemble from noise as it scrolls in
        for (const c of ic.cells) { c.x = (Math.random() - 0.5) * 70; c.y = (Math.random() - 0.5) * 70; c.r = (Math.random() - 0.5) * 180; }
        active.add(ic); start();
      });
      host.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !held()) burst(ic, 3.5); });
      host.addEventListener("pointerdown", (e) => { if (!held()) burst(ic, 5, ...cell(ic, e)); });
      ic.px.addEventListener("pointermove", (e) => {   // the cursor parts the pixels it passes through
        if (e.pointerType !== "mouse" || held()) return;
        const [px, py] = cell(ic, e);
        for (const c of ic.cells) {
          const dx = (c.i % 10) - px, dy = ((c.i / 10) | 0) - py, d = Math.hypot(dx, dy) || 1;
          if (d < 2.5) { c.vx += (dx / d) * (2.5 - d) * 0.8; c.vy += (dy / d) * (2.5 - d) * 0.8; }
        }
        active.add(ic); start();
      });
    });
  }

  // ---------- string ----------
  const tl = document.querySelector(".timeline");
  if (tl) {
    // Fixed sub-steps of 1/240 s whatever the screen's refresh rate: with steps that followed the frame time,
    // 120 Hz frame jitter pumped energy into the string's fastest mode and it never settled.
    const N = 32, A = 40, MAX = 12, H = 0.25, ys = new Float32Array(N), vs = new Float32Array(N), lap = new Float32Array(N);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "string");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<defs><linearGradient id="string-ink" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color: var(--clay)"/><stop offset="1" style="stop-color: var(--blue)"/></linearGradient></defs><path/>';
    tl.prepend(svg);
    const path = svg.querySelector("path"), grad = svg.querySelector("linearGradient");
    const lis = [...tl.querySelectorAll(":scope > li")];
    let flat = true, L = 1, acc = 0, prev = null, side = 0, lastStrum = 0, at0 = [];
    const layout = () => {
      flat = getComputedStyle(tl).gridTemplateColumns.split(" ").length > 1;   // a row on desktop, a column on phones
      L = Math.max(1, flat ? tl.clientWidth : tl.clientHeight);
      svg.classList.toggle("down", !flat);
      svg.setAttribute("viewBox", flat ? `0 0 ${L} ${2 * A}` : `0 0 ${2 * A} ${L}`);
      grad.setAttribute("x2", flat ? L : 0); grad.setAttribute("y2", flat ? 0 : L);
      at0 = lis.map((li) => (flat ? li.offsetLeft + 8 : li.offsetTop + 12));   // where each dot sits on the string; read once, not per frame
    };
    const at = (u) => { const f = clamp((u / L) * (N - 1), 0, N - 1), i = Math.min(N - 2, Math.floor(f)), t = f - i; return ys[i] * (1 - t) + ys[i + 1] * t; };
    const draw = () => {
      let d = "";
      for (let i = 0; i < N; i++) {
        const u = ((i / (N - 1)) * L).toFixed(1), w = (A + ys[i]).toFixed(2);
        d += (i ? "L" : "M") + (flat ? `${u},${w}` : `${w},${u}`);
      }
      path.setAttribute("d", d);
      lis.forEach((li, j) => {                     // each dot rides the string where it crosses it
        const w = at(at0[j]).toFixed(2);
        li.style.setProperty("--sx", flat ? "0px" : `${w}px`);
        li.style.setProperty("--sy", flat ? `${w}px` : "0px");
      });
    };
    const sub = () => {                            // one 1/240 s step: tension, damping that is stronger for short wiggles, motion
      for (let i = 1; i < N - 1; i++) lap[i] = vs[i - 1] + vs[i + 1] - 2 * vs[i];
      for (let i = 1; i < N - 1; i++) vs[i] = (vs[i] + ((ys[i - 1] + ys[i + 1] - 2 * ys[i]) * 2.5 + lap[i] * 0.3) * H) * 0.94 ** H;
      for (let i = 1; i < N - 1; i++) {
        ys[i] += vs[i] * H;
        if (Math.abs(ys[i]) > MAX) { ys[i] = Math.sign(ys[i]) * MAX; vs[i] = 0; }   // safety stop; a strum never gets here
      }
    };
    const step = (dt) => {
      acc = Math.min(acc + dt, 12 * H);
      while (acc >= H) { acc -= H; sub(); }
      let e = 0;
      for (let i = 0; i < N; i++) e += Math.abs(ys[i]) + Math.abs(vs[i]);
      const live = e >= 0.05 * N;
      if (!live) { ys.fill(0); vs.fill(0); acc = 0; }
      draw();
      return live;
    };
    const start = loop(step);
    // a strum: velocity into a few points around u, smooth, so it rings as one wave instead of a kink
    const strum = (u, speed) => {
      if (held()) return;
      const k = clamp(Math.round((u / L) * (N - 1)), 1, N - 2);
      [0.25, 0.6, 1, 0.6, 0.25].forEach((wt, j) => { const i = k + j - 2; if (i > 0 && i < N - 1) vs[i] += speed * wt; });
      start();
    };
    const rel = (e) => {
      const r = tl.getBoundingClientRect();
      return flat ? { u: e.clientX - r.left, w: e.clientY - r.top - 8 } : { u: e.clientY - r.top, w: e.clientX - r.left - 8 };
    };
    // mouse: going from one side of the line to the other strums it, harder the faster the pointer moves.
    // The 3 px either side of the line is a dead zone, so a hand resting on a dot never strums.
    // Only real motion counts: Chrome sends a pointermove with no movement after a wheel scroll.
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || (!e.movementX && !e.movementY)) return;
      const p = rel(e), was = prev;
      prev = p.u > 0 && p.u < L && Math.abs(p.w) < 40 ? p : null;
      if (!prev) { side = 0; return; }
      const s = p.w > 3 ? 1 : p.w < -3 ? -1 : 0;
      if (!s) return;
      if (side && s !== side && was && performance.now() - lastStrum >= 80) {
        lastStrum = performance.now();
        strum(p.u, s * clamp(Math.abs(p.w - was.w) * 0.8, 3, 9));
      }
      side = s;
    }, { passive: true });
    addEventListener("scroll", () => { prev = null; side = 0; }, { passive: true });
    // touch: only a tap strums; a swipe that starts on the timeline is a scroll
    tl.addEventListener("click", (e) => { if (lastPointer !== "mouse" && e.detail) strum(rel(e).u, rel(e).w < 0 ? -7 : 7); });
    addEventListener("resize", () => { layout(); draw(); });
    layout(); draw();
  }

  // ---------- scroll ----------
  // What blocks do while the page scrolls. Lessons that shaped this (1030):
  //  - The page scrolls natively. Lenis (smooth wheel on the main thread, effects in the same frame) is optional:
  //    it eases every wheel toward its target over ~0.5 s, which reads as drag ("scrolling has resistance", 1030).
  //    The jitter it removes (Mozilla, "Scroll-linked effects") hits effects that pin things against the scroll;
  //    a block trailing its own place starts trailing one frame late, which doesn't show.
  //  - Springs that differ per block wobble out of step and read as jelly; the look people build on purpose
  //    (GSAP ScrollSmoother's "lag", Codrops' Elastic Grid Scroll) is a time-based catch-up with no overshoot,
  //    spread symmetrically: the middle of a grid arrives first, its edges a little later.
  //  - Lenis advances by the time since its last raf() call, unclamped: a loop that paused while idle made the first
  //    notch after a pause land in one frame (120 px), then stall. While Lenis is on, the loop keeps ticking (an
  //    idle tick does no work), so every scroll starts from a fresh clock.
  // Several takes stay selectable with #lab in the address (or #scroll=bubble|grid|skew|none, #smooth):
  //   bubble  (default, chosen 1030) iOS Messages bubbles: one spring, held back by distance from the pointer
  //   grid    catch-up lag that grows from the centre of the content to its edges
  //   skew    the content leans with scroll speed and eases back
  //   none    blocks stay put;   and a separate switch for the smooth wheel (off by default)
  // Offsets go in the `translate` property, which stacks with the `transform` that hover tilt and gravity write.
  const SCROLLY = ".kicker, .title, .lede, .badges li, .cta .btn, .hero-art, .band, .label, .hl, .timeline, .card, .paper, .aside, .oss li, .honor, .postlist li, .more";
  const blocks = [...document.querySelectorAll(SCROLLY)].filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)))
    .map((el) => ({ el, top: 0, h: 0, cx: 0, dist: 0, y: 0, v: 0, shown: false }));
  const sections = [...document.querySelectorAll("main > section")];
  const MODES = ["bubble", "grid", "skew", "none"];
  const stored = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const fromHash = /scroll=(\w+)/.exec(location.hash)?.[1];
  let mode = MODES.includes(fromHash) ? fromHash : stored("scroll-mode");
  if (!MODES.includes(mode)) mode = "bubble";
  let smooth = /smooth/.test(location.hash) || stored("scroll-smooth") === "1";
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (blocks.length) {
    const MAXY = 48, TAU_EDGE = 0.035, TAU_V = 0.12;   // grid: lag in s at the content's edge (0 in its middle); speed smoothing in s
    const OMEGA = (2 * Math.PI * 1.6) / 60, ZETA = 0.85;   // bubble spring, per 60 fps frame
    let lenis = null, raf = 0, lastT = 0, last = SY, frozen = false, anchor = null, anchorX = null, skew = 0, vs = 0, skewShown = false, shown = 0, ds = 0;
    const clear = (b) => { b.el.style.translate = ""; b.y = b.v = 0; b.shown = false; };
    const clearSkew = () => { if (skewShown) sections.forEach((s) => (s.style.transform = "")); skewShown = false; };
    const place = () => {                         // page positions, read once and on resize; translate never moves layout
      for (const b of blocks) clear(b);
      const wrap = document.querySelector("main").getBoundingClientRect(), mid = wrap.left + wrap.width / 2, half = wrap.width / 2;
      for (const b of blocks) {
        const r = b.el.getBoundingClientRect();
        b.top = r.top + SY; b.h = r.height; b.cx = r.left + r.width / 2;
        b.dist = clamp(Math.abs(b.cx - mid) / half, 0, 1);   // 0 in the middle of the content, 1 at its edge
      }
      last = scrollPos();
    };
    const scrollPos = () => (lenis ? lenis.animatedScroll : SY);
    const useLenis = () => !coarse && smooth && window.Lenis;
    const setLenis = () => {
      if (useLenis() && !lenis) {
        lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: true });
        lenis.on("scroll", kick);
      } else if (!useLenis() && lenis) { lenis.destroy(); lenis = null; }
    };

    const frame = (t) => {
      raf = 0;
      const dt = clamp((t - (lastT || t - 16.7)) / 1000, 0.001, 0.05);
      lastT = t;
      if (lenis) lenis.raf(t);
      const H = innerHeight, W = innerWidth, pos = scrollPos(), lo = pos - 300, hi = pos + H + 300;
      let d = pos - last;
      last = pos;
      if (Math.abs(d) > 400 || frozen) d = 0;   // a jump (an anchor link, a restored position) is not a scroll
      let live = d !== 0 || (lenis && lenis.isScrolling) || vs !== 0 || ds !== 0;
      // smoothed scroll speed, px/s: a wheel arrives in notches, and following each notch made blocks pulse
      vs += (d / dt - vs) * (1 - Math.exp(-dt / TAU_V));
      if (Math.abs(vs) < 2 && !d) vs = 0;
      // the scroll per frame, spread over ~60 ms: where a scroll arrives in jumps (a mouse without smooth scrolling,
      // Page Down) the blocks are pushed by the same total, just not all in one frame
      ds += (d - ds) * (1 - Math.exp(-dt / 0.06));
      if (Math.abs(ds) < 0.01 && !d) ds = 0;
      if (mode === "skew") {
        const s = clamp(-vs / 500, -3, 3);
        if (Math.abs(s) > 0.01 || skewShown) {
          sections.forEach((sec) => (sec.style.transform = Math.abs(s) > 0.01 ? `skewY(${s.toFixed(2)}deg)` : ""));
          skewShown = Math.abs(s) > 0.01;
        }
        live ||= skewShown;
      } else if (skewShown) clearSkew();
      if ((mode === "grid" || mode === "bubble") && (d || vs || ds || shown)) {   // idle ticks skip the blocks entirely
        shown = 0;
        const ay = anchor ?? H / 2, ax = anchorX ?? W / 2, span = 1.8 * (W + H);
        const sub = Math.max(1, Math.round(dt * 120)), h = (dt * 60) / sub;
        for (const b of blocks) {
          if (b.top + b.h < lo || b.top > hi) { if (b.shown) clear(b); continue; }
          if (mode === "grid") {
            // a block trails by (its lag x the smoothed speed): every block in step, edges later than the middle,
            // easing home as the speed fades; tanh rounds off the cap instead of flattening against it
            b.y = MAXY * Math.tanh((TAU_EDGE * b.dist * vs) / MAXY);
          } else {
            if (ds) b.y = clamp(b.y + ds * Math.min(0.9, (Math.abs(b.cx - ax) + Math.abs(b.top + b.h / 2 - pos - ay)) / span), -MAXY, MAXY);
            for (let i = 0; i < sub; i++) { b.v += (-OMEGA * OMEGA * b.y - 2 * ZETA * OMEGA * b.v) * h; b.y += b.v * h; }
          }
          const moving = Math.abs(b.y) > 0.05 || Math.abs(b.v) > 0.02;
          live ||= moving;
          if (moving) { b.el.style.translate = `0 ${b.y.toFixed(1)}px`; b.shown = true; shown++; }
          else if (b.shown) clear(b);
        }
      } else if (mode !== "grid" && mode !== "bubble" && shown) { for (const b of blocks) if (b.shown) clear(b); shown = 0; }
      // with Lenis on, keep ticking so its clock never goes stale; otherwise stop once everything rests
      if ((live || (lenis && !document.hidden)) && !raf) raf = requestAnimationFrame(frame);
      else if (!live && !lenis) lastT = 0;
    };
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    addEventListener("scroll", kick, { passive: true });
    addEventListener("wheel", kick, { passive: true });
    const hand = (x, y) => { anchorX = x; anchor = y; };
    addEventListener("touchstart", (e) => hand(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    addEventListener("touchmove", (e) => hand(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hand(e.clientX, e.clientY); }, { passive: true });
    let rt = 0;
    addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(place, 200); });
    // gravity mode measures every element right after this event: hand it a page without offsets, and stop the wheel
    document.addEventListener("gravitychange", () => {
      frozen = held();
      if (frozen) { for (const b of blocks) clear(b); clearSkew(); lenis && lenis.stop(); }
      else { lenis && lenis.start(); place(); kick(); }
    });
    const setMode = (m, sm = smooth) => {
      mode = m; smooth = sm;
      try { localStorage.setItem("scroll-mode", m); localStorage.setItem("scroll-smooth", sm ? "1" : "0"); } catch (e) { /* private mode */ }
      for (const b of blocks) clear(b);
      clearSkew(); setLenis(); place(); kick();
      if (lab) {
        lab.querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.m === m)));
        lab.querySelector("[data-s]").setAttribute("aria-pressed", String(sm));
      }
    };
    // the comparison panel, only with #lab in the address
    let lab = null;
    if (/lab|scroll=|smooth/.test(location.hash)) {
      lab = document.createElement("div");
      lab.className = "lab";
      lab.innerHTML = '<span>scroll</span>' + MODES.map((m) => `<button type="button" data-m="${m}">${m}</button>`).join("")
        + '<span>|</span><button type="button" data-s>smooth wheel</button>';
      lab.addEventListener("click", (e) => {
        const t = e.target;
        if (t.dataset?.m) setMode(t.dataset.m);
        else if (t.hasAttribute?.("data-s")) setMode(mode, !smooth);
      });
      document.body.append(lab);
    }
    const boot = () => { setMode(mode); };
    if (document.fonts) document.fonts.ready.then(boot); else boot();
    addEventListener("load", place, { once: true });
  }

  // ---------- bars ----------
  const chart = document.querySelector(".band .chart");
  if (chart) {
    const s = new Float32Array(30), v = new Float32Array(30);
    let bars = [], last = -1;
    const step = (dt) => {
      const n = Math.ceil(dt), h = dt / n;
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < 30; i++) v[i] = (v[i] + (-0.08 * s[i] + 0.12 * ((s[i - 1] || 0) + (s[i + 1] || 0) - 2 * s[i])) * h) * 0.92 ** h;
        for (let i = 0; i < 30; i++) s[i] = clamp(s[i] + v[i] * h, -0.25, 0.25);
      }
      let e = 0;
      for (let i = 0; i < 30; i++) e += Math.abs(s[i]) + Math.abs(v[i]);
      const live = e > 0.003;
      if (!live) { s.fill(0); v.fill(0); }
      bars.forEach((b, i) => b && (b.style.transform = live ? `scaleY(${(1 + s[i]).toFixed(4)})` : ""));
      return live;
    };
    const start = loop(step);
    const poke = (e) => {
      if (held()) return;
      const i = +(e.target.dataset?.i ?? -1);
      if (i < 0 || i === last) return;
      last = i;
      bars = [];
      chart.querySelectorAll(".bar").forEach((b) => { bars[+b.style.getPropertyValue("--i")] = b; });   // the chart redraws on resize
      v[i] += 0.05;
      start();
    };
    chart.addEventListener("pointermove", poke);
    chart.addEventListener("pointerdown", (e) => { last = -1; poke(e); });
    chart.addEventListener("pointerleave", () => { last = -1; });
  }
})();
