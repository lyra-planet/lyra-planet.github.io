// Home page physics, real time, for mouse and touch. Spring effects live here; Matter.js bodies
// (the stack box and gravity mode) are in bodies.js.
//   field    the page's dot grid: the pointer pushes dots, a click or tap sends a shockwave, a scroll makes it sway
//   letters  the title hangs on springs: drag or flick a letter and the neighbours follow
//   springs  cards tilt toward the pointer, sink when pressed and wobble when let go
//   pixels   pixel icons assemble as they scroll in and scatter when touched
//   string   the timeline is a string you can pluck; its dots ride on it
//   bars     chart bars are coupled springs: brush across them and a ripple runs through
// Each loop stops when things come to rest. None of it runs under reduced motion.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.add("physics");
  const DPR = Math.min(2, devicePixelRatio || 1);
  const css = (k) => getComputedStyle(root).getPropertyValue(k).trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const held = () => root.classList.contains("gravity");     // gravity mode owns element transforms while it is on
  let lastPointer = "mouse";
  addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, { capture: true, passive: true });

  // rAF loop that stops when step(dt) returns false; dt is in 60 fps frames, so 120 Hz screens run at the same speed
  const loop = (step) => {
    let on = false, last = 0;
    const tick = (t) => {
      const dt = clamp((t - last) / 16.67, 0.25, 3);
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
  const field = document.querySelector(".field");
  if (field) {
    const ctx = field.getContext("2d"), G = 22, R = 120;
    const live = new Map();                      // only dots the pointer or a wave displaced carry state, keyed by grid cell in page coordinates
    const key = (c, r) => r * 4096 + c;
    const get = (c, r) => { const k = key(c, r); let d = live.get(k); if (!d) live.set(k, (d = { ox: 0, oy: 0, vx: 0, vy: 0 })); return d; };
    const batches = Array.from({ length: 32 }, () => []);   // 4 colours x 8 alpha levels, one fill() each
    let W = 0, H = 0, styles = [], waves = [], ptr = null, sy = scrollY, sv = 0, gy = 0, gv = 0;
    const paint = () => {
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a = hex(css("--axis")), c = hex(css("--clay"));
      styles = [0, 0.4, 0.7, 1].flatMap((t) => Array.from({ length: 8 }, (_, l) => `rgba(${a.map((v, i) => Math.round(v + (c[i] - v) * t))},${(l + 1) / 8})`));
    };
    const size = () => { W = innerWidth; H = innerHeight; field.width = W * DPR; field.height = H * DPR; };
    // faint everywhere, brightest in an ellipse behind the hero
    const glow = (x, y) => { const h = Math.min(H, 900); return Math.max(0.3, 1 - Math.hypot((x - 0.75 * W) / (0.8 * W), (y - 0.25 * h) / (0.7 * h)) / 0.75); };
    const view = () => ({ top: Math.floor(scrollY / G), rows: Math.ceil(H / G) + 1, cols: Math.ceil(W / G) });
    const sheet = (x) => 0.55 + 0.45 * Math.sin((Math.PI * x) / W);   // the middle of the sheet lags more than its edges

    const step = (dt) => {
      const { top, rows, cols } = view(), damp = 0.86 ** dt;
      // the grid is fixed to the page: when a scroll speeds up or stops, the sheet lags and overshoots
      const v = scrollY - sy, a = v - sv;
      sy = scrollY; sv = v;
      if (Math.abs(a) > 1) gv += clamp(a, -40, 40) * 0.12;
      gv = (gv - 0.05 * gy * dt) * damp; gy += gv * dt;
      if (Math.abs(gy) + Math.abs(gv) < 0.05) gy = gv = 0;
      if (ptr) {
        const px = ptr.x, py = ptr.y + scrollY;
        for (let r = Math.max(0, Math.floor((py - R) / G)); r <= Math.ceil((py + R) / G); r++)
          for (let c = Math.max(0, Math.floor((px - R) / G)); c <= Math.min(cols, Math.ceil((px + R) / G)); c++) {
            const d0 = live.get(key(c, r));
            const dx = c * G + G / 2 + (d0 ? d0.ox : 0) - px, dy = r * G + G / 2 + (d0 ? d0.oy : 0) - py;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            if (dist >= R) continue;
            const f = (1 - dist / R) ** 2 * 1.5 * dt, d = d0 || get(c, r);
            d.vx += (dx / dist) * f; d.vy += (dy / dist) * f;
          }
      }
      for (const w of waves) {                   // a ring 36 px wide moving out at 9 px per frame
        w.t += dt;
        const rad = w.t * 9, fade = 1 - w.t / 70, reach = rad + 36;
        for (let r = Math.max(top, Math.floor((w.y - reach) / G)); r <= Math.min(top + rows, Math.ceil((w.y + reach) / G)); r++)
          for (let c = Math.max(0, Math.floor((w.x - reach) / G)); c <= Math.min(cols, Math.ceil((w.x + reach) / G)); c++) {
            const dx = c * G + G / 2 - w.x, dy = r * G + G / 2 - w.y, dist = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.abs(dist - rad);
            if (k >= 36) continue;
            const f = (1 - k / 36) * 2.2 * fade * dt, d = get(c, r);
            d.vx += (dx / dist) * f; d.vy += (dy / dist) * f;
          }
      }
      waves = waves.filter((w) => w.t < 70);
      let moving = waves.length > 0 || v !== 0 || gy !== 0;
      for (const [k, d] of live) {
        d.vx = (d.vx - 0.05 * d.ox * dt) * damp; d.vy = (d.vy - 0.05 * d.oy * dt) * damp;
        d.ox = clamp(d.ox + d.vx * dt, -32, 32); d.oy = clamp(d.oy + d.vy * dt, -32, 32);
        const sp = Math.abs(d.vx) + Math.abs(d.vy);
        if (sp > 0.02) moving = true;
        if (sp + Math.abs(d.ox) + Math.abs(d.oy) < 0.05) live.delete(k);   // settled dots land exactly on the grid
      }
      draw();
      return moving;
    };

    const draw = () => {
      const { top, rows, cols } = view();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const b of batches) b.length = 0;
      for (let c = 0; c <= cols; c++) {
        const x = c * G + G / 2, lag = gy * sheet(x);
        for (let r = top; r <= top + rows; r++) {
          const y = r * G + G / 2, d = live.get(key(c, r)), e = d ? Math.abs(d.ox) + Math.abs(d.oy) : 0;
          const al = Math.min(7, Math.round(Math.min(1, glow(x, y) + e / 25) * 8) - 1);
          if (al < 0) continue;
          batches[Math.min(3, (e / 5) | 0) * 8 + al].push(x + (d ? d.ox : 0), y - scrollY + lag + (d ? d.oy : 0));
        }
      }
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
    const point = (x, y) => { ptr = { x, y }; start(); };
    const wave = (x, y) => { waves.push({ x, y: y + scrollY, t: 0 }); start(); };
    addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") point(e.clientX, e.clientY); }, { passive: true });
    addEventListener("touchmove", (e) => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    addEventListener("touchend", () => { ptr = null; start(); }, { passive: true });
    root.addEventListener("mouseleave", () => { ptr = null; start(); });
    // mouse: a wave on every press; touch: only on a tap, so starting a scroll doesn't set one off
    addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") wave(e.clientX, e.clientY); }, { passive: true });
    addEventListener("click", (e) => { if (lastPointer !== "mouse" && e.detail) wave(e.clientX, e.clientY); }, { passive: true });
    addEventListener("scroll", start, { passive: true });
    addEventListener("resize", () => { size(); start(); });
    onTheme(() => { paint(); draw(); });
    size(); paint(); draw();
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
      host.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") burst(ic, 3.5); });
      host.addEventListener("pointerdown", (e) => burst(ic, 5, ...cell(ic, e)));
      ic.px.addEventListener("pointermove", (e) => {   // the cursor parts the pixels it passes through
        if (e.pointerType !== "mouse") return;
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
    const N = 32, A = 40, BAND = 26, MAX = 26, ys = new Float32Array(N), vs = new Float32Array(N), HAND = [0.25, 0.6, 1, 0.6, 0.25];
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "string");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<defs><linearGradient id="string-ink" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color: var(--clay)"/><stop offset="1" style="stop-color: var(--blue)"/></linearGradient></defs><path/>';
    tl.prepend(svg);
    const path = svg.querySelector("path"), grad = svg.querySelector("linearGradient");
    const lis = [...tl.querySelectorAll(":scope > li")];
    let flat = true, L = 1, grab = null, prevW = null;
    const layout = () => {
      flat = getComputedStyle(tl).gridTemplateColumns.split(" ").length > 1;   // a row on desktop, a column on phones
      L = Math.max(1, flat ? tl.clientWidth : tl.clientHeight);
      svg.classList.toggle("down", !flat);
      svg.setAttribute("viewBox", flat ? `0 0 ${L} ${2 * A}` : `0 0 ${2 * A} ${L}`);
      grad.setAttribute("x2", flat ? L : 0); grad.setAttribute("y2", flat ? 0 : L);
    };
    const at = (u) => { const f = clamp((u / L) * (N - 1), 0, N - 1), i = Math.min(N - 2, Math.floor(f)), t = f - i; return ys[i] * (1 - t) + ys[i + 1] * t; };
    const draw = () => {
      let d = "";
      for (let i = 0; i < N; i++) {
        const u = ((i / (N - 1)) * L).toFixed(1), w = (A + ys[i]).toFixed(2);
        d += (i ? "L" : "M") + (flat ? `${u},${w}` : `${w},${u}`);
      }
      path.setAttribute("d", d);
      for (const li of lis) {                      // each dot rides the string where it crosses it
        const w = at(flat ? li.offsetLeft + 8 : li.offsetTop + 12).toFixed(2);
        li.style.setProperty("--sx", flat ? "0px" : `${w}px`);
        li.style.setProperty("--sy", flat ? `${w}px` : "0px");
      }
    };
    const step = (dt) => {
      const n = Math.ceil(dt * 2), h = dt / n;     // wave equation, two sub-steps per frame for stability
      for (let s = 0; s < n; s++) {
        for (let i = 1; i < N - 1; i++) vs[i] = (vs[i] + (ys[i - 1] + ys[i + 1] - 2 * ys[i]) * 2.5 * h) * 0.94 ** h;
        if (grab) HAND.forEach((wt, j) => {        // the hand pulls a few points toward it through a spring, never teleports them
          const i = grab.k + j - 2;
          if (i > 0 && i < N - 1) vs[i] = (vs[i] + (grab.w - ys[i]) * 0.5 * wt * h) * 0.7 ** (wt * h);
        });
        for (let i = 1; i < N - 1; i++) {
          ys[i] += vs[i] * h;
          if (Math.abs(ys[i]) > MAX) { ys[i] = Math.sign(ys[i]) * MAX; vs[i] *= -0.3; }   // hits a fret: bounces back and loses energy
        }
      }
      let e = 0;
      for (let i = 0; i < N; i++) e += Math.abs(ys[i]) + Math.abs(vs[i]);
      if (!grab && e < 0.05 * N) { ys.fill(0); vs.fill(0); }
      draw();
      return !!grab || e >= 0.05 * N;
    };
    const start = loop(step);
    const pluck = (u, amp) => {                    // a triangle pulled out at u, then let go
      const k = clamp(Math.round((u / L) * (N - 1)), 1, N - 2);
      for (let i = 1; i < N - 1; i++) ys[i] += amp * (i <= k ? i / k : (N - 1 - i) / (N - 1 - k));
      start();
    };
    const rel = (e) => {
      const r = tl.getBoundingClientRect();
      return flat ? { u: e.clientX - r.left, w: e.clientY - r.top - 8 } : { u: e.clientY - r.top, w: e.clientX - r.left - 8 };
    };
    // mouse: the string catches when the pointer crosses it, follows it, and snaps free past 30 px
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const { u, w } = rel(e), k = clamp(Math.round((u / L) * (N - 1)), 1, N - 2), over = u > 0 && u < L && Math.abs(w) < BAND;
      if (grab && !over) { grab = null; start(); }
      else if (grab) { grab = { k, w: clamp(w, -MAX, MAX) }; start(); }
      else if (over && prevW !== null && (Math.sign(w - ys[k]) !== Math.sign(prevW - ys[k]) || Math.abs(w - ys[k]) < 3)) { grab = { k, w: clamp(w, -MAX, MAX) }; start(); }
      prevW = over ? w : null;
    }, { passive: true });
    tl.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { const { u, w } = rel(e); pluck(u, clamp(w, -1, 1) * 18 || 18); } });
    once(tl, () => setTimeout(() => pluck(L * 0.3, 20), 500), "0px 0px -20% 0px");
    addEventListener("resize", () => { layout(); draw(); });
    layout(); draw();
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
