// Home page rigid bodies (Matter.js, self-hosted, loaded on demand):
//   pit      the stack is a box of chips: drag, throw, kick empty space, scroll to shake
//   gravity  the corner button turns everything on screen into bodies that fall; press again (or Esc) to put them back
// On phones, gravity follows the device's tilt in both. Nothing runs under reduced motion.
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pit = document.querySelector(".pit"), stage = pit?.querySelector(".stage"), gbtn = document.querySelector(".grav");
  if (!pit && !gbtn) return;
  const STEP = 1000 / 60;
  let M = null;
  const load = () => M ? Promise.resolve(M) : new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = (pit || gbtn).dataset.engine;
    s.onload = () => ok((M = window.Matter));
    s.onerror = no;
    document.head.append(s);
  });
  const engines = new Set();                  // every live engine follows the same tilt
  const tiltG = { x: 0, y: 1 };

  // fling a body's neighbours away from p, and draw a ring there
  const kick = (bodies, p, reach, power, ringHost, ringAt) => {
    for (const b of bodies) {
      const dx = b.position.x - p.x, dy = b.position.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > reach) continue;
      const f = (1 - d / reach) * power;
      M.Sleeping.set(b, false);
      M.Body.setVelocity(b, { x: b.velocity.x + (dx / d) * f, y: b.velocity.y + (dy / d) * f - f * 0.7 });
      M.Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.4);
    }
    const ring = document.createElement("i");
    ring.className = "boom";
    ring.style.left = `${ringAt.x}px`; ring.style.top = `${ringAt.y}px`;
    ring.addEventListener("animationend", () => ring.remove());
    ringHost.append(ring);
  };
  // keep fast throws from tunnelling through walls
  const cap = (b, max) => { const v = b.velocity, s = Math.hypot(v.x, v.y); if (s > max) M.Body.setVelocity(b, { x: (v.x * max) / s, y: (v.y * max) / s }); };
  const grabAt = (engine, b, p) => {
    const c = M.Constraint.create({ pointA: p, bodyB: b, pointB: { x: p.x - b.position.x, y: p.y - b.position.y }, stiffness: 0.2, damping: 0.1, length: 0 });
    M.Composite.add(engine.world, c);
    M.Sleeping.set(b, false);
    return c;
  };

  // ---------- pit ----------
  const pitRun = (() => {
    if (!stage) return () => {};
    let engine = null, items = [], bodies = [], grab = null, grabbed = false, ceiling = null, born = 0;
    let visible = false, running = false, last = 0, acc = 0, sy = scrollY, sv = 0, W = 0, H = 0;

    const build = () => {
      const { Engine, Bodies, Composite } = M;
      engine && engines.delete(engine);
      engine = Engine.create({ enableSleeping: true });
      engine.gravity.x = tiltG.x; engine.gravity.y = tiltG.y;
      engines.add(engine);
      ceiling = null; born = performance.now();
      pit.classList.add("armed");
      W = stage.clientWidth;
      items = [...stage.querySelectorAll("li")].map((el) => ({ el, w: el.offsetWidth, h: el.offsetHeight }));
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
      if (performance.now() - born < 4000 && !bodies.every((b) => b.bounds.min.y > 0)) return;
      for (const b of bodies) if (b.bounds.min.y < 0) M.Body.setPosition(b, { x: b.position.x, y: 40 });
      ceiling = M.Bodies.rectangle(W / 2, -100, W + 400, 200, { isStatic: true });
      M.Composite.add(engine.world, ceiling);
    };
    // safety net: anything that escapes the box drops back in from the top
    const rescue = () => {
      for (const b of bodies) {
        const p = b.position;
        if (p.x > -60 && p.x < W + 60 && p.y < H + 60 && !(ceiling && p.y < -60)) continue;
        M.Body.setPosition(b, { x: W / 2, y: 30 });
        M.Body.setVelocity(b, { x: 0, y: 0 });
      }
    };
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
    const sync = () => {
      for (const it of items) {
        const b = it.body;
        if (b.isSleeping && it.drawn) continue;
        it.drawn = true;
        it.el.style.transform = `translate3d(${(b.position.x - it.w / 2).toFixed(1)}px, ${(b.position.y - it.h / 2).toFixed(1)}px, 0) rotate(${b.angle.toFixed(3)}rad)`;
      }
    };
    const tick = (t) => {
      if (!visible || document.hidden) { running = false; return; }
      acc += Math.min(100, t - last); last = t;
      while (acc >= STEP) { M.Engine.update(engine, STEP); acc -= STEP; }
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

    stage.addEventListener("pointerdown", (e) => {
      grabbed = false;
      if (!engine || e.button > 0) return;
      const p = local(e), b = hit(p);
      if (!b) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      grab = grabAt(engine, b, p);
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
      cap(grab.bodyB, 30);
      M.Composite.remove(engine.world, grab);
      grab = null;
      stage.classList.remove("grabbing");
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    // a touch that lands on a chip drags it; anywhere else the page scrolls as usual
    stage.addEventListener("touchstart", (e) => { if (grab) e.preventDefault(); }, { passive: false });
    stage.addEventListener("touchmove", (e) => { if (grab) e.preventDefault(); }, { passive: false });
    stage.addEventListener("click", (e) => {
      if (!engine || grabbed || root.classList.contains("gravity")) return;
      const p = local(e);
      if (!hit(p)) { kick(bodies, p, 220, 16, stage, p); run(); }
    });

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
    return () => { bodies.forEach((b) => M.Sleeping.set(b, false)); run(); };
  })();

  // ---------- gravity mode ----------
  const PARTS = ".nav .brand, .nav nav > *, .kicker, .title span, .lede, .badges li, .cta .btn, .hero-art, .band-head p, .kpi, .band .chart, .band .table, .label, .hl,"
    + " .timeline li, .card, .paper, .aside, .oss li, .honor, .pit, .postlist li, .more, .foot p";
  let G = null, homing = 0;
  const blockScroll = (e) => e.preventDefault();
  const blockKeys = (e) => {
    if (e.key === "Escape") return gravityOff();
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) && !e.target.closest?.("input, textarea")) e.preventDefault();
  };
  const pinScroll = () => { if (G && scrollY !== G.y) scrollTo(0, G.y); };
  const listen = (on) => {
    const f = on ? addEventListener : removeEventListener;
    f("wheel", blockScroll, { passive: false });
    f("touchmove", blockScroll, { passive: false });
    f("keydown", blockKeys);
    f("scroll", pinScroll);
    f("pointerdown", down, true);
    f("pointermove", move);
    f("pointerup", up);
    f("pointercancel", up);
    f("click", click, true);
    f("dragstart", blockScroll);
    f("resize", gravityOff);
  };

  let pending = false;
  const gravityOn = async () => {
    if (G || pending) return;
    pending = true;
    try { await load(); } finally { pending = false; }
    const { Engine, Bodies, Composite, Body } = M;
    homing++;                                    // cancel a restore that is still running
    root.classList.add("gravity");               // physics.js lets go of its transforms; reveals and entrances are forced to their end state
    const all = [...document.querySelectorAll(PARTS)];
    all.forEach((el) => (el.style.transform = ""));
    const W = innerWidth, H = innerHeight;
    const els = all
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H; })
      .filter((el, _, arr) => !arr.some((o) => o !== el && o.contains(el)));
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.x = tiltG.x; engine.gravity.y = tiltG.y;
    const items = els.map((el) => {
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const body = Bodies.rectangle(cx, cy, r.width, r.height, {
        chamfer: { radius: Math.max(0, Math.min(14, r.height / 2 - 1, r.width / 2 - 1)) },
        restitution: 0.2, friction: 0.4, frictionAir: 0.012, density: 0.001,
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);   // a nudge, so a perfect stack still topples
      el.style.willChange = "transform";                               // its own layer: moving it then costs no repaint
      return { el, body, cx, cy, drawn: false };
    });
    const top = Math.min(0, ...items.map((it) => it.body.bounds.min.y)) - 60, T = 400, wall = { isStatic: true };
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + T / 2, W + 2 * T, T, wall),
      Bodies.rectangle(-T / 2, (top + H) / 2, T, H - top + 2 * T, wall),
      Bodies.rectangle(W + T / 2, (top + H) / 2, T, H - top + 2 * T, wall),
      Bodies.rectangle(W / 2, top - T / 2, W + 2 * T, T, wall),
      ...items.map((it) => it.body),
    ]);
    engines.add(engine);
    G = { engine, items, bodies: items.map((it) => it.body), W, H, y: scrollY, grab: null, moved: false, from: null, running: false, last: 0, acc: 0 };
    listen(true);
    gbtn.setAttribute("aria-pressed", "true");
    gbtn.querySelector("span").textContent = "restore";
    gRun();
  };

  const gTick = (t) => {
    if (!G || !G.running) return;
    G.acc += Math.min(100, t - G.last); G.last = t;
    while (G.acc >= STEP) { M.Engine.update(G.engine, STEP); G.acc -= STEP; }
    for (const it of G.items) {
      const b = it.body;
      if (b.isSleeping && it.drawn) continue;
      it.drawn = true;
      it.el.style.transform = `translate(${(b.position.x - it.cx).toFixed(1)}px, ${(b.position.y - it.cy).toFixed(1)}px) rotate(${b.angle.toFixed(3)}rad)`;
    }
    if (!G.grab && G.bodies.every((b) => b.isSleeping)) { G.running = false; return; }
    requestAnimationFrame(gTick);
  };
  const gRun = () => {
    if (!G || G.running) return;
    G.running = true; G.last = performance.now(); G.acc = 0;
    requestAnimationFrame(gTick);
  };

  function down(e) {
    if (e.defaultPrevented || e.target.closest(".grav") || e.button > 0) return;
    G.moved = false;
    const p = { x: e.clientX, y: e.clientY }, b = M.Query.point(G.bodies, p)[0];
    if (!b || e.target.closest(".stage li")) return;   // chips in the box keep their own drag
    e.preventDefault();
    G.from = p;
    G.grab = grabAt(G.engine, b, p);
    root.classList.add("grabbing");
    gRun();
  }
  function move(e) {
    if (!G?.grab) return;
    const p = { x: clamp(e.clientX, 4, G.W - 4), y: clamp(e.clientY, 4, G.H - 4) };
    G.grab.pointA = p;
    if (Math.hypot(p.x - G.from.x, p.y - G.from.y) > 6) G.moved = true;
  }
  function up() {
    if (!G?.grab) return;
    cap(G.grab.bodyB, 40);
    M.Composite.remove(G.engine.world, G.grab);
    G.grab = null;
    root.classList.remove("grabbing");
  }
  // a drag is not a click; a click on empty space is a kick; a clean click on a link still opens it
  function click(e) {
    if (e.target.closest(".grav")) return;
    if (G.moved) { e.preventDefault(); e.stopPropagation(); G.moved = false; return; }
    const p = { x: e.clientX, y: e.clientY };
    if (e.detail && !M.Query.point(G.bodies, p)[0]) {
      e.preventDefault();
      kick(G.bodies, p, 320, 22, document.body, { x: p.x + scrollX, y: p.y + scrollY });
      gRun();
    }
  }

  // springs every element from where it landed back to its place in the layout
  function gravityOff() {
    if (!G) return;
    const { items, engine } = G;
    if (G.grab) M.Composite.remove(engine.world, G.grab);
    engines.delete(engine);
    G = null;
    listen(false);
    root.classList.remove("grabbing");
    gbtn.setAttribute("aria-pressed", "false");
    gbtn.querySelector("span").textContent = "gravity";
    const st = items.map(({ el, body: b, cx, cy }) => ({
      el, x: b.position.x - cx, y: b.position.y - cy, a: ((((b.angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI, vx: 0, vy: 0, va: 0,
    }));
    const me = ++homing;
    let last = performance.now();
    const home = (t) => {
      if (me !== homing) return;
      const dt = clamp((t - last) / 16.67, 0.25, 3), damp = 0.8 ** dt;
      last = t;
      let moving = false;
      for (const s of st) {
        s.vx = (s.vx - s.x * 0.07 * dt) * damp; s.vy = (s.vy - s.y * 0.07 * dt) * damp; s.va = (s.va - s.a * 0.07 * dt) * damp;
        s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
        if (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.a) * 100 > 0.3) moving = true;
        s.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.a.toFixed(4)}rad)`;
      }
      if (moving) return requestAnimationFrame(home);
      st.forEach((s) => { s.el.style.transform = ""; s.el.style.willChange = ""; });
      root.classList.remove("gravity");
    };
    requestAnimationFrame(home);
  }

  if (gbtn) gbtn.addEventListener("click", (e) => { e.stopPropagation(); G ? gravityOff() : gravityOn().catch(() => {}); });

  // ---------- tilt ----------
  // Android sends orientation events right away; iOS sends nothing until the page asks, so it keeps a button
  const tiltBtn = pit?.querySelector(".tilt");
  const tilt = () => addEventListener("deviceorientation", (e) => {
    if (e.beta == null) return;
    if (tiltBtn) tiltBtn.hidden = true;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    const th = (((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI) / 180;
    const x = Math.sin(g) * Math.cos(b), y = Math.sin(b);                    // gravity in screen coordinates, portrait
    const gx = x * Math.cos(th) + y * Math.sin(th), gy = -x * Math.sin(th) + y * Math.cos(th);
    if (Math.abs(gx - tiltG.x) + Math.abs(gy - tiltG.y) < 0.04) return;
    tiltG.x = gx; tiltG.y = gy;
    for (const en of engines) { en.gravity.x = gx; en.gravity.y = gy; M.Composite.allBodies(en.world).forEach((bd) => M.Sleeping.set(bd, false)); }
    pitRun(); gRun();
  });
  if (matchMedia("(pointer: coarse)").matches && "DeviceOrientationEvent" in window) {
    tilt();
    if (tiltBtn && typeof DeviceOrientationEvent.requestPermission === "function") {
      tiltBtn.hidden = false;
      tiltBtn.addEventListener("click", () => DeviceOrientationEvent.requestPermission()
        .then((s) => { if (s === "granted") tiltBtn.hidden = true; }).catch(() => {}));
    }
  }
})();
