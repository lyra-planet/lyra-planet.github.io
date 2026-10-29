// Home page physics, all real-time and pointer/touch driven:
//   1. a spring field of dots behind the hero: the pointer pushes them, a click or tap sends a shockwave
//   2. the title letters hang on springs: drag or flick one and the neighbours follow
//   3. the stack is a box of chips (Matter.js, loaded on demand): drag, throw, kick, scroll to shake, tilt a phone
// Each loop runs only while something moves. Nothing here runs under reduced motion.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.classList.add("physics");
  const DPR = Math.min(2, devicePixelRatio || 1);
  const css = (k) => getComputedStyle(root).getPropertyValue(k).trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

  // ---------- 1. dot field ----------
  const field = document.querySelector(".field");
  if (field) {
    const ctx = field.getContext("2d"), GAP = 22, R = 120;
    let W = 0, H = 0, dots = [], waves = [], ptr = null, ink = [];
    const mix = (a, b, t) => {
      const ch = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
      return `rgb(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t))})`;
    };
    const paint = () => { const a = css("--axis"), c = css("--clay"); ink = [0, 0.4, 0.7, 1].map((t) => mix(a, c, t)); };
    const size = () => {
      if (field.clientWidth === W && field.clientHeight === H) return;
      W = field.clientWidth; H = field.clientHeight;
      field.width = W * DPR; field.height = H * DPR;
      dots = [];
      for (let y = GAP / 2; y < H; y += GAP) for (let x = GAP / 2; x < W; x += GAP) {
        // same fade as the CSS fallback: an ellipse centred top right
        const a = 1 - Math.hypot((x - 0.75 * W) / (0.8 * W), (y - 0.25 * H) / (0.7 * H)) / 0.75;
        if (a > 0.03) dots.push({ x, y, a, ox: 0, oy: 0, vx: 0, vy: 0, e: 0 });
      }
    };
    const draw = () => {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (let b = 0; b < 4; b++) {            // four colour buckets by displacement, from grid grey to clay
        ctx.fillStyle = ink[b];
        const s = 2 + b * 0.6;
        for (const d of dots) {
          if (Math.min(3, (d.e / 5) | 0) !== b) continue;
          ctx.globalAlpha = Math.min(1, d.a + d.e / 25);
          ctx.fillRect(d.x + d.ox - s / 2, d.y + d.oy - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
    };
    const step = (dt) => {
      let moving = waves.length > 0;
      for (const w of waves) w.t += dt;
      waves = waves.filter((w) => w.t < 70);
      const damp = 0.86 ** dt;
      for (const d of dots) {
        let ax = -0.05 * d.ox, ay = -0.05 * d.oy;   // spring home
        if (ptr) {
          const dx = d.x + d.ox - ptr.x, dy = d.y + d.oy - ptr.y;
          if (Math.abs(dx) < R && Math.abs(dy) < R) {
            const r = Math.sqrt(dx * dx + dy * dy) || 1;
            if (r < R) { const f = (1 - r / R) ** 2 * 1.5; ax += (dx / r) * f; ay += (dy / r) * f; }
          }
        }
        for (const w of waves) {                     // a ring 36 px wide moving out at 9 px per frame
          const dx = d.x - w.x, dy = d.y - w.y, r = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.abs(r - w.t * 9);
          if (k < 36) { const f = (1 - k / 36) * 2.2 * (1 - w.t / 70); ax += (dx / r) * f; ay += (dy / r) * f; }
        }
        d.vx = (d.vx + ax * dt) * damp; d.vy = (d.vy + ay * dt) * damp;
        d.ox += d.vx * dt; d.oy += d.vy * dt;
        d.e = Math.abs(d.ox) + Math.abs(d.oy);
        if (d.e + Math.abs(d.vx) + Math.abs(d.vy) > 0.05) moving = true;
      }
      if (!moving) for (const d of dots) if (d.e < 0.05) d.ox = d.oy = d.vx = d.vy = d.e = 0;   // settled dots land exactly on the grid
      draw();
      return moving;
    };
    const start = loop(step);
    const at = (x, y) => {
      const r = field.getBoundingClientRect();
      return y >= r.top && y <= r.bottom ? { x: x - r.left, y: y - r.top } : null;
    };
    const point = (x, y) => { const p = at(x, y); if (p || ptr) { ptr = p; start(); } };
    addEventListener("pointermove", (e) => point(e.clientX, e.clientY), { passive: true });
    addEventListener("touchmove", (e) => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    addEventListener("touchend", () => { ptr = null; start(); }, { passive: true });
    root.addEventListener("mouseleave", () => { ptr = null; start(); });
    addEventListener("pointerdown", (e) => { const p = at(e.clientX, e.clientY); if (p) { waves.push({ ...p, t: 0 }); start(); } }, { passive: true });
    addEventListener("resize", () => { size(); draw(); });
    onTheme(() => { paint(); draw(); });
    size(); paint(); draw();
  }

  // ---------- 2. springy title ----------
  const letters = [...document.querySelectorAll(".title span")].map((el) => ({ el, x: 0, y: 0, vx: 0, vy: 0, drag: null }));
  if (letters.length) {
    const rubber = (v) => Math.sign(v) * 260 * (1 - Math.exp(-Math.abs(v) / 260));   // pulling harder gives less
    const step = (dt) => {
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
      el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !s.drag) { s.vy -= 4; start(); } });
    });
  }

  // ---------- 3. stack box ----------
  const pit = document.querySelector(".pit");
  const stage = pit?.querySelector(".stage");
  if (!stage) return;
  let M = null, engine = null, items = [], bodies = [], grab = null, grabbed = false, ceiling = null, born = 0;
  let visible = false, running = false, last = 0, acc = 0, sy = scrollY, sv = 0, W = 0, H = 0;
  const load = () => M ? Promise.resolve(M) : new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = pit.dataset.engine;
    s.onload = () => ok((M = window.Matter));
    s.onerror = no;
    document.head.append(s);
  });

  const build = () => {
    const { Engine, Bodies, Composite } = M;
    engine && Composite.clear(engine.world, false);
    engine = Engine.create({ enableSleeping: true });
    ceiling = null; born = performance.now();
    pit.classList.add("armed");
    W = stage.clientWidth;
    items = [...stage.children].map((el) => ({ el, w: el.offsetWidth, h: el.offsetHeight }));
    // the settled pile is about 1.3x the chips' own area; twice that leaves room to throw things around
    const area = items.reduce((a, it) => a + it.w * it.h, 0);
    H = Math.round(clamp((area / W) * 2, 260, 420));
    stage.style.height = `${H}px`;
    const T = 200, wall = { isStatic: true };
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + T / 2, W + 2 * T, T, wall),
      Bodies.rectangle(-T / 2, (H - 1600) / 2, T, H + 1600 + T, wall),        // side walls reach far up: chips spawn above the box
      Bodies.rectangle(W + T / 2, (H - 1600) / 2, T, H + 1600 + T, wall),
    ]);
    let y = 0;
    bodies = items.map((it) => {
      y -= it.h + 6;
      it.body = Bodies.rectangle(it.w / 2 + Math.random() * Math.max(1, W - it.w), y, it.w, it.h, {
        chamfer: { radius: it.h / 2 - 1 }, angle: (Math.random() - 0.5) * 0.6,
        restitution: 0.3, friction: 0.2, frictionAir: 0.012, density: 0.002,
      });
      it.drawn = false;
      return it.body;
    });
    Composite.add(engine.world, bodies);
    run();
  };

  // the lid goes on once every chip has fallen in; after 4 s, stragglers (gravity pointing up) are dropped back inside
  const lid = () => {
    if (ceiling) return;
    const late = performance.now() - born > 4000;
    if (!late && !bodies.every((b) => b.bounds.min.y > 0)) return;
    for (const b of bodies) if (b.bounds.min.y < 0) M.Body.setPosition(b, { x: b.position.x, y: 40 });
    ceiling = M.Bodies.rectangle(W / 2, -100, W + 400, 200, { isStatic: true });
    M.Composite.add(engine.world, ceiling);
  };

  // safety net: anything that escapes the box (a hard throw, a resize) drops back in from the top
  const rescue = () => {
    for (const b of bodies) {
      const p = b.position;
      if (p.x > -60 && p.x < W + 60 && p.y < H + 60 && !(ceiling && p.y < -60)) continue;
      M.Body.setPosition(b, { x: W / 2, y: 30 });
      M.Body.setVelocity(b, { x: 0, y: 0 });
    }
  };

  const sync = () => {
    for (const it of items) {
      const b = it.body;
      if (b.isSleeping && it.drawn) continue;
      it.drawn = true;
      it.el.style.transform = `translate3d(${(b.position.x - it.w / 2).toFixed(1)}px, ${(b.position.y - it.h / 2).toFixed(1)}px, 0) rotate(${b.angle.toFixed(3)}rad)`;
    }
  };

  const wake = () => bodies.forEach((b) => M.Sleeping.set(b, false));

  // the box moves with the page, so chips feel the scroll's acceleration (and hop when a fling stops)
  const inertia = () => {
    const v = scrollY - sy, a = v - sv;
    sy = scrollY; sv = v;
    if (Math.abs(a) < 1.5) return;
    for (const b of bodies) {
      M.Sleeping.set(b, false);
      M.Body.setVelocity(b, { x: b.velocity.x, y: b.velocity.y + clamp(a, -30, 30) * 0.1 });
    }
  };

  const tick = (t) => {
    if (!visible || document.hidden) { running = false; return; }
    acc += Math.min(100, t - last); last = t;
    while (acc >= 1000 / 60) { M.Engine.update(engine, 1000 / 60); acc -= 1000 / 60; }
    inertia(); lid(); rescue(); sync();
    if (!grab && ceiling && bodies.every((b) => b.isSleeping)) { running = false; return; }   // all at rest: stop until poked
    requestAnimationFrame(tick);
  };
  const run = () => {
    if (running || !engine || !visible) return;
    running = true; last = performance.now(); acc = 0; sy = scrollY; sv = 0;
    requestAnimationFrame(tick);
  };

  const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const inside = (p) => ({ x: clamp(p.x, 6, W - 6), y: clamp(p.y, 6, H - 6) });   // the hand stays in the box, so it can't drag a chip through a wall
  const hit = (p) => M.Query.point(bodies, p)[0];

  const boom = (p) => {
    const ring = document.createElement("i");
    ring.className = "boom";
    ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`;
    ring.addEventListener("animationend", () => ring.remove());
    stage.append(ring);
  };
  const kick = (p) => {
    for (const b of bodies) {
      const dx = b.position.x - p.x, dy = b.position.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > 220) continue;
      const f = (1 - d / 220) * 16;
      M.Sleeping.set(b, false);
      M.Body.setVelocity(b, { x: b.velocity.x + (dx / d) * f, y: b.velocity.y + (dy / d) * f - f * 0.7 });
      M.Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.4);
    }
    boom(p); run();
  };

  stage.addEventListener("pointerdown", (e) => {
    grabbed = false;
    if (!engine || e.button > 0) return;
    const p = local(e), b = hit(p);
    if (!b) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    grab = M.Constraint.create({ pointA: p, bodyB: b, pointB: { x: p.x - b.position.x, y: p.y - b.position.y }, stiffness: 0.2, damping: 0.1, length: 0 });
    M.Composite.add(engine.world, grab);
    M.Sleeping.set(b, false);
    grabbed = true;
    stage.classList.add("grabbing");
    run();
  });
  stage.addEventListener("pointermove", (e) => {
    if (!engine) return;
    const p = local(e);
    if (grab) grab.pointA = inside(p);
    else if (e.pointerType === "mouse") stage.classList.toggle("over", !!hit(p));
  });
  const release = () => {
    if (!grab) return;
    const b = grab.bodyB, v = b.velocity, s = Math.hypot(v.x, v.y);
    if (s > 30) M.Body.setVelocity(b, { x: (v.x * 30) / s, y: (v.y * 30) / s });   // keep throws from tunnelling through walls
    M.Composite.remove(engine.world, grab);
    grab = null;
    stage.classList.remove("grabbing");
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  // a touch that lands on a chip drags it; anywhere else the page scrolls as usual
  stage.addEventListener("touchstart", (e) => { if (grab) e.preventDefault(); }, { passive: false });
  stage.addEventListener("touchmove", (e) => { if (grab) e.preventDefault(); }, { passive: false });
  stage.addEventListener("click", (e) => { if (engine && !grabbed && !hit(local(e))) kick(local(e)); });

  // phones: gravity follows the device. iOS asks for permission, which needs a tap.
  const tiltBtn = pit.querySelector(".tilt");
  const tilt = () => addEventListener("deviceorientation", (e) => {
    if (e.beta == null) return;
    tiltBtn.hidden = true;                    // events are arriving, so no permission prompt is needed
    if (!engine) return;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    const th = (((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI) / 180;
    const x = Math.sin(g) * Math.cos(b), y = Math.sin(b);                    // gravity in screen coordinates, portrait
    const gx = x * Math.cos(th) + y * Math.sin(th), gy = -x * Math.sin(th) + y * Math.cos(th);
    if (Math.abs(gx - engine.gravity.x) + Math.abs(gy - engine.gravity.y) < 0.04) return;
    engine.gravity.x = gx; engine.gravity.y = gy;
    wake(); run();
  });
  // Android sends events right away; iOS sends nothing until the page asks, so it keeps the button
  if (matchMedia("(pointer: coarse)").matches && "DeviceOrientationEvent" in window) {
    tilt();
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      tiltBtn.hidden = false;
      tiltBtn.addEventListener("click", () => DeviceOrientationEvent.requestPermission()
        .then((s) => { if (s === "granted") tiltBtn.hidden = true; }).catch(() => {}));
    }
  }

  new IntersectionObserver(([e]) => { if (e.isIntersecting) load().catch(() => {}); }, { rootMargin: "600px 0px" }).observe(pit);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (!visible) return;
    if (engine) return run();
    Promise.all([load(), document.fonts && document.fonts.ready]).then(build).catch(() => {});
  }, { rootMargin: "0px 0px -20% 0px" }).observe(stage);
  document.addEventListener("visibilitychange", () => run());
  addEventListener("scroll", () => { if (engine && visible) run(); }, { passive: true });
  let w0 = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === w0 || !engine) return;      // phones fire resize when the URL bar slides; only width matters
    w0 = innerWidth;
    clearTimeout(build.t);
    build.t = setTimeout(() => { if (!grab) { items.forEach((it) => (it.el.style.transform = "")); pit.classList.remove("armed"); stage.style.height = ""; build(); } }, 300);
  });
})();
