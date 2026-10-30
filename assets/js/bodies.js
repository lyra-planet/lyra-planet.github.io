// Home page rigid bodies (Matter.js, self-hosted, loaded on demand):
//   stack    the stack's chips live at the bottom of the window: drag, throw, resize the window, scroll
//   gravity  the corner button turns everything on screen into bodies that fall; press again (or Esc) to put them back
// Nothing runs under reduced motion or on phones (the head script leaves .physics off).
(() => {
  if (!document.documentElement.classList.contains("physics")) return;   // set in the head: off under reduced motion and on phones
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pit = document.querySelector(".pit"), stage = pit?.querySelector(".stage"), gbtn = document.querySelector(".grav");
  if (!pit && !gbtn) return;
  const STEP = 1000 / 60;
  // One tuning for both worlds. Matter's defaults are made for demos; on a page these settle faster and stay put:
  // a stronger solver, quicker sleep, more friction, and a mass ratio capped at 8:1 (with mass by area, the "CV"
  // link was 400 times lighter than the planet card, and a solver that iterates can't hold such a pile still).
  const SOLVER = { enableSleeping: true, positionIterations: 10, velocityIterations: 8 };
  const GRAVITY = 0.0018;                      // 1.8x Matter's default: a fall reads as a fall, not a float
  // Sleep uses Matter's own speed threshold and 45 calm steps: with a looser threshold, chips froze while still
  // sliding and jerked on when the next one landed
  const BODY = { restitution: 0.15, friction: 0.5, frictionStatic: 0.8, frictionAir: 0.01, sleepThreshold: 45 };
  const tune = (engine) => { engine.gravity.scale = GRAVITY; return engine; };
  const weigh = (b) => M.Body.setMass(b, clamp(b.area / 2500, 0.6, 4.8));
  let M = null;
  const load = () => M ? Promise.resolve(M) : new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = (pit || gbtn).dataset.engine;
    s.onload = () => ok((M = window.Matter));
    s.onerror = no;
    document.head.append(s);
  });
  let lastPointer = "mouse";                   // Safari's click has no pointerType; remember what pressed
  addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, { capture: true, passive: true });
  // Scroll position and speed, measured in the scroll event (reading scrollY inside a frame forces a layout).
  // The speed lives here, not in a loop: the chip loop sleeps when everything rests, and a loop that measures
  // speed from frame to frame sees zero on the frame a scroll wakes it.
  let SY = scrollY, SV = 0, lastScroll = 0;
  addEventListener("scroll", () => {
    const now = performance.now(), dt = now - lastScroll;
    SV = dt < 100 ? ((scrollY - SY) * 16.67) / Math.max(dt, 4) : 0;   // px per 60 fps frame
    SY = scrollY; lastScroll = now;
  }, { capture: true, passive: true });
  const scrollSpeed = () => (performance.now() - lastScroll > 80 ? 0 : SV);
  // Matter steps at a fixed 60 Hz. Each frame is drawn between the last two steps, so motion stays smooth on
  // 120 Hz screens instead of moving every other frame.
  const advance = (engine, bodies, acc, held, each) => {
    while (acc >= STEP) {
      if (held) M.Sleeping.set(held, false);   // a body in the hand never sleeps (it froze mid-drag when the hand slowed)
      if (each) each();
      for (const b of bodies) { b.px = b.position.x; b.py = b.position.y; b.pa = b.angle; }
      M.Engine.update(engine, STEP);
      acc -= STEP;
    }
    return acc;
  };
  const POSE = [0, 0, 0];                     // reused every call: a new array per body per frame was garbage-collector work
  const pose = (b, k) => {
    const still = b.px === undefined || b.isSleeping;
    POSE[0] = still ? b.position.x : b.px + (b.position.x - b.px) * k;
    POSE[1] = still ? b.position.y : b.py + (b.position.y - b.py) * k;
    POSE[2] = still ? b.angle : b.pa + (b.angle - b.pa) * k;
    return POSE;
  };
  const place = (b, p) => { M.Body.setPosition(b, p); b.px = undefined; };   // a teleport is not drawn as a streak
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
    ring.style.left = `${ringAt.x}px`; ring.style.top = typeof ringAt.y === "number" ? `${ringAt.y}px` : ringAt.y;
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

  // ---------- stack: chips that live at the bottom of the window ----------
  // The whole window is the box: the floor is its bottom edge, the walls its sides. Resizing the window moves
  // the walls, so the chips get pushed; scrolling moves the window over the page, so they feel the jolt.
  // Coordinates are measured up from the bottom edge (the floor is y = 0, the top of the window is y = -H) and
  // the chips are placed from the bottom in CSS, so when a phone's toolbar slides away and the window grows,
  // the pile rides the bottom edge at once instead of hanging in the air until a resize event moves the floor.
  const pitRun = (() => {
    if (!stage) return () => {};
    const layer = document.createElement("div");
    layer.className = "heap";
    let engine = null, items = [], bodies = [], walls = null, grab = null, grabbed = false, ceiling = null, born = 0, stirred = false;
    let running = false, last = 0, acc = 0, sv = 0, W = innerWidth, H = innerHeight;
    let box = { w: 0, h: 0, bl: 0, bt: 0 };      // the window and the gravity button's corner, measured on resize only
    const measure = () => {
      const g = gbtn && gbtn.getBoundingClientRect();
      box = { w: layer.clientWidth, h: layer.clientHeight, bl: g ? g.left : 0, bt: g ? g.top - layer.clientHeight : 0, bh: g ? g.height : 0 };
    };
    const T = 400, BIG = 20000, small = () => innerWidth < 640 || innerHeight < 520;

    const build = () => {
      const { Engine, Bodies, Composite } = M;
      engine && engines.delete(engine);
      engine = tune(Engine.create(SOLVER));
      engine.gravity.x = tiltG.x; engine.gravity.y = tiltG.y;
      engines.add(engine);
      ceiling = null;
      if (!layer.isConnected) { document.body.append(layer); layer.append(stage); pit.classList.add("armed"); }
      measure();
      W = box.w; H = box.h;                       // the layer's own box: innerWidth would count the scrollbar
      // phones (either way up) get eight chips: the gravity button takes part of a narrow floor. Picked once, at load:
      // a resize never takes chips away (dragging a window below 640 px used to hide 14 of them)
      const few = small();
      const all = [...stage.querySelectorAll("li")];
      all.forEach((el, i) => { el.hidden = few && i >= 8; el.style.transform = ""; });
      items = all.filter((el) => !el.hidden).map((el) => ({ el, w: el.offsetWidth, h: el.offsetHeight }));
      const wall = { isStatic: true };
      walls = {                                   // huge, so a resize only ever has to move the right wall
        floor: Bodies.rectangle(W / 2, T / 2, BIG, T, wall),
        left: Bodies.rectangle(-T / 2, 0, T, BIG, wall),
        right: Bodies.rectangle(W + T / 2, 0, T, BIG, wall),
      };
      // the gravity button is furniture: a block from the button to the window's corner, so chips pile on it and
      // can't slip into the gap beneath it. It is pinned to the corner: its size and height above the floor never change.
      if (gbtn) {
        const w = W + 40 - box.bl, h = 40 - box.bt;
        walls.button = Bodies.rectangle(box.bl + w / 2, box.bt + h / 2, w, h, { ...wall, chamfer: { radius: [box.bh / 2, 0, 0, 0] } });
        walls.button.centre = () => ({ x: box.bl + w / 2, y: box.bt + h / 2 });
      }
      Composite.add(engine.world, Object.values(walls));
      let y = -H - 10, x = 0;
      bodies = items.map((it) => {               // they rain in from just above the window, a few side by side per row
        if (x + it.w > W) { x = 0; y -= it.h + 10; }
        const cx = x + it.w / 2 + Math.random() * 12;
        x += it.w + 24 + Math.random() * 40;
        it.body = Bodies.rectangle(Math.min(cx, W - it.w / 2), y - Math.random() * 30, it.w, it.h, {
          // chips lie side by side: low friction lets them slide past each other, so a tap can make one hop
          ...BODY, restitution: 0.25, friction: 0.15, frictionStatic: 0.3, chamfer: { radius: it.h / 2 - 1 }, angle: (Math.random() - 0.5) * 0.6,
        });
        weigh(it.body);
        it.drawn = false;
        return it.body;
      });
      Composite.add(engine.world, bodies);
    };

    // the lid (the window's top edge) goes on once every chip has fallen in; after 4 s, stragglers are dropped back inside
    const lid = () => {
      if (ceiling) return;
      if (performance.now() - born < 4000 && !bodies.every((b) => b.bounds.min.y > -H)) return;
      for (const b of bodies) if (b.bounds.min.y < -H) place(b, { x: b.position.x, y: -H + 40 });
      ceiling = M.Bodies.rectangle(W / 2, -H - T / 2, BIG, T, { isStatic: true });
      M.Composite.add(engine.world, ceiling);
    };
    // the right wall, the lid and the button's block follow the window at up to 25 px a step, so a resize pushes
    // the chips instead of teleporting past them; the floor is the bottom edge and never moves
    const follow = () => {
      let moved = false;
      const step = (body, x, y) => {
        const p = body.position;
        if (p.x === x && p.y === y) return;
        M.Body.setPosition(body, { x: p.x + clamp(x - p.x, -25, 25), y: p.y + clamp(y - p.y, -25, 25) });
        moved = true;
      };
      step(walls.right, box.w + T / 2, walls.right.position.y);
      if (walls.button) { const c = walls.button.centre(); step(walls.button, c.x, c.y); }
      if (ceiling) step(ceiling, ceiling.position.x, -box.h - T / 2);
      W = walls.right.position.x - T / 2; H = ceiling ? -ceiling.position.y - T / 2 : box.h;
      if (moved) { bodies.forEach((b) => M.Sleeping.set(b, false)); stirred = true; }
    };
    // how far the walls are still behind the window
    const behind = () => Math.max(Math.abs(box.w + T / 2 - walls.right.position.x),
      walls.button ? Math.abs(walls.button.centre().x - walls.button.position.x) : 0,
      ceiling ? Math.abs(-box.h - T / 2 - ceiling.position.y) : 0);
    // safety net: anything that escapes (a hard throw, a fast resize) drops back in from the top
    const rescue = () => {
      for (const b of bodies) {
        const p = b.position;
        if (p.x > -60 && p.x < W + 60 && p.y < 60 && !(ceiling && p.y < -H - 60)) continue;
        place(b, { x: W / 2, y: -H + 40 });
        M.Body.setVelocity(b, { x: 0, y: 0 });
      }
    };
    // scrolling moves the window over the page: when it speeds up downward the chips feel lighter, and hop
    const inertia = () => {
      const v = scrollSpeed(), a = v - sv;
      sv = v;
      if (Math.abs(a) < 1.5) return;
      for (const b of bodies) {
        M.Sleeping.set(b, false);
        const vy = b.velocity.y - clamp(a, -40, 40) * 0.18;
        // a jolt lifts a chip about 50 px at most: no lift for one already rising, so frames of jolt don't stack
        M.Body.setVelocity(b, { x: b.velocity.x, y: a > 0 ? (b.velocity.y < -2 ? b.velocity.y : Math.max(vy, -7)) : vy });
      }
    };
    const sync = () => {
      const k = acc / STEP;
      for (const it of items) {
        const b = it.body;
        if (b.isSleeping && it.drawn) continue;
        it.drawn = b.isSleeping;                  // draw once more after it falls asleep, at its exact resting pose
        const [x, y, a] = pose(b, k);
        it.el.style.transform = `translate3d(${(x - it.w / 2).toFixed(1)}px, ${(y - it.h / 2).toFixed(1)}px, 0) rotate(${a.toFixed(3)}rad)`;
      }
    };
    const tick = (t) => {
      if (document.hidden) { running = false; return; }
      acc += Math.min(100, t - last); last = t;
      // the walls move inside the steps. A window that narrowed faster than they move (a quick drag, a snap to half
      // the screen) gets the extra steps in this frame, so no chip is left outside the window while they catch up:
      // at one step a frame, a snap from 1440 to 720 px kept 7 chips out of sight for half a second
      acc = Math.max(acc, Math.min(60, Math.ceil(behind() / 25)) * STEP);
      stirred = false;
      acc = advance(engine, bodies, acc, grab && grab.bodyB, follow);
      inertia(); lid(); rescue(); sync();
      if (!grab && !stirred && ceiling && bodies.every((b) => b.isSleeping)) { running = false; return; }   // all at rest: stop until poked
      requestAnimationFrame(tick);
    };
    const run = () => {
      if (running || !born) return;                // nothing moves before the drop
      running = true; last = performance.now(); acc = 0;
      requestAnimationFrame(tick);
    };

    // pointer -> world: x from the left edge, y up from the bottom edge (read in the event, where a layout read is cheap)
    const at = (e) => { const r = layer.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.bottom }; };
    const inside = (p) => ({ x: clamp(p.x, 6, W - 6), y: clamp(p.y, -H + 6, -6) });   // the hand stays in the window, so it can't drag a chip through a wall
    const hit = (p) => M.Query.point(bodies, p)[0];
    const ringAt = (p) => ({ x: p.x, y: `calc(100% + ${p.y}px)` });
    const pop = (p, reach, power) => { kick(bodies, p, reach, power, stage, ringAt(p)); run(); };

    stage.addEventListener("pointerdown", (e) => {
      grabbed = false;
      if (!engine || e.button > 0) return;
      const p = at(e), b = hit(p);
      if (!b) return;
      if (e.pointerType === "mouse") e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      grab = grabAt(engine, b, p);
      grab.from = p;
      layer.classList.add("grabbing");
      run();
    });
    stage.addEventListener("pointermove", (e) => {
      if (!grab) return;
      const p = at(e);
      grab.pointA = inside(p);
      if (Math.hypot(p.x - grab.from.x, p.y - grab.from.y) > 6) grabbed = true;
    });
    const release = () => {
      if (!grab) return;
      cap(grab.bodyB, 30);
      M.Composite.remove(engine.world, grab);
      grab = null;
      layer.classList.remove("grabbing");
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);   // on phones a vertical swipe on a chip scrolls the page instead
    // a click on a chip that wasn't dragged makes it hop and nudges its neighbours
    stage.addEventListener("click", (e) => { if (engine && !grabbed && !root.classList.contains("gravity")) pop(at(e), 120, 9); });
    // a press anywhere else in the window shakes the chips near it
    const nearby = (e) => {
      if (!engine || e.target.closest(".heap, .grav") || root.classList.contains("gravity")) return;
      const p = at(e);
      if (bodies.some((b) => Math.hypot(b.position.x - p.x, b.position.y - p.y) < 220)) { kick(bodies, p, 220, 14, stage, ringAt(p)); run(); }
    };
    addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") nearby(e); }, { passive: true });
    addEventListener("click", (e) => { if (lastPointer !== "mouse" && e.detail) nearby(e); }, { passive: true });

    // The chips fall 500 ms after the first view appears (the head script holds it until its fonts are in). Matter
    // is loaded and the world built before that, while the hero's entrance plays off the main thread, so the main
    // thread is free when they fall: loading and building at the moment of the drop took 80-120 ms of script on a
    // 4x slower CPU, and the first frames stuttered. Waiting for the load event (as before) also waited for the
    // planet and the italic: on a slow line, a second later.
    const drop = () => { born = performance.now(); run(); };
    const shown = new Promise((ok) => {
      const check = () => !root.classList.contains("fonts-wait") && (ok(performance.now()), true);
      if (!check()) new MutationObserver((_, o) => check() && o.disconnect()).observe(root, { attributes: true, attributeFilter: ["class"] });
    });
    const mono = () => document.fonts && document.fonts.load("400 1em 'IBM Plex Mono'");   // the chips are measured in it
    Promise.all([load(), shown.then(mono)]).then(build).then(() => shown)
      .then((t) => setTimeout(drop, t + 500 - performance.now())).catch(() => {});
    document.addEventListener("visibilitychange", () => run());
    addEventListener("scroll", () => run(), { passive: true });
    addEventListener("resize", () => { if (engine) { measure(); run(); } });
    return () => { bodies.forEach((b) => M.Sleeping.set(b, false)); run(); };
  })();

  // ---------- gravity mode ----------
  const PARTS = ".nav .brand, .nav nav > *, .kicker, .title span, .lede, .badges li, .cta .btn, .hero-art, .band-head p, .kpi, .band .chart, .band .table, .label, .hl,"
    + " .timeline li, .card, .paper, .aside, .oss li, .honor, .postlist li, .more, .foot p";
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
    root.classList.remove("restoring");
    // entrances end for good (restoring must not replay them), and every section counts as revealed
    root.classList.add("played");
    document.querySelectorAll(".reveal").forEach((r) => r.classList.add("in", "done"));
    root.classList.add("gravity");               // physics.js lets go of its transforms
    document.dispatchEvent(new Event("gravitychange"));
    const all = [...document.querySelectorAll(PARTS)];
    all.forEach((el) => (el.style.transform = ""));
    const W = innerWidth, H = innerHeight, rect = new Map();
    // read every box first and write nothing until done: a write between reads makes the next read restyle the whole page
    const els = all
      .filter((el) => { const r = el.getBoundingClientRect(); rect.set(el, r); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H; })
      .filter((el, _, arr) => !arr.some((o) => o !== el && o.contains(el)));
    const engine = tune(Engine.create(SOLVER));
    engine.gravity.x = tiltG.x; engine.gravity.y = tiltG.y;
    const items = els.map((el) => {
      const r = rect.get(el), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const body = Bodies.rectangle(cx, cy, r.width, r.height, {
        ...BODY, chamfer: { radius: Math.max(0, Math.min(14, r.height / 2 - 1, r.width / 2 - 1)) },
      });
      weigh(body);
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.03);   // a nudge, so a perfect stack still topples
      return { el, body, cx, cy, drawn: false };
    });
    items.forEach((it) => (it.el.style.willChange = "transform"));   // own layers: moving them then costs no repaint
    const top = Math.min(0, ...items.map((it) => it.body.bounds.min.y)) - 60, T = 400, wall = { isStatic: true };
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + T / 2, W + 2 * T, T, wall),
      Bodies.rectangle(-T / 2, (top + H) / 2, T, H - top + 2 * T, wall),
      Bodies.rectangle(W + T / 2, (top + H) / 2, T, H - top + 2 * T, wall),
      Bodies.rectangle(W / 2, top - T / 2, W + 2 * T, T, wall),
      ...items.map((it) => it.body),
    ]);
    engines.add(engine);
    G = { engine, items, bodies: items.map((it) => it.body), W, H, y: SY, grab: null, moved: false, from: null, running: false, last: 0, acc: 0 };
    listen(true);
    gbtn.setAttribute("aria-pressed", "true");
    gbtn.querySelector("span").textContent = "restore";
    gRun();
  };

  const gTick = (t) => {
    if (!G || !G.running) return;
    G.acc += Math.min(100, t - G.last); G.last = t;
    G.acc = advance(G.engine, G.bodies, G.acc, G.grab && G.grab.bodyB);
    const k = G.acc / STEP;
    for (const it of G.items) {
      const b = it.body;
      if (b.isSleeping && it.drawn) continue;
      it.drawn = b.isSleeping;
      const [x, y, a] = pose(b, k);
      it.el.style.transform = `translate(${(x - it.cx).toFixed(1)}px, ${(y - it.cy).toFixed(1)}px) rotate(${a.toFixed(3)}rad)`;
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
    G.held = G.items.find((it) => it.body === b).el;
    G.held.style.cursor = "grabbing";            // only the held element: a class on <html> would restyle the whole page
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
    G.held.style.cursor = "";
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
    root.classList.add("restoring");             // the band's panel and the button change back now, while things fly home
    items.forEach((it) => (it.el.style.cursor = ""));
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
      st.forEach((s) => (s.el.style.transform = ""));
      root.classList.remove("restoring");
      // drop the layers a moment later, once the page has stood still (doing it on the last frame re-rendered the text)
      setTimeout(() => { if (!G) st.forEach((s) => (s.el.style.willChange = "")); }, 1500);
      root.classList.remove("gravity");
      document.dispatchEvent(new Event("gravitychange"));
    };
    requestAnimationFrame(home);
  }

  if (gbtn) {
    gbtn.addEventListener("click", (e) => { e.stopPropagation(); gbtn.classList.add("idle"); G ? gravityOff() : gravityOn().catch(() => {}); });
    // its falling square plays three times, then rests (cutting it off by a timer made the button jump a pixel)
    gbtn.querySelector("i")?.addEventListener("animationend", () => gbtn.classList.add("idle"));
  }

  // ---------- tilt ----------
  // Android sends orientation events right away; iOS sends nothing until the page asks, which needs a tap: the
  // first tap on a chip or on the gravity button asks
  let asked = false;
  const askTilt = () => {
    if (asked || typeof window.DeviceOrientationEvent?.requestPermission !== "function") return;
    asked = true;
    DeviceOrientationEvent.requestPermission().catch(() => {});
  };
  stage?.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") askTilt(); });
  gbtn?.addEventListener("click", askTilt);
  const tilt = () => addEventListener("deviceorientation", (e) => {
    if (e.beta == null) return;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    const th = (((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI) / 180;
    const x = Math.sin(g) * Math.cos(b), y = Math.sin(b);                    // gravity in screen coordinates, portrait
    const gx = x * Math.cos(th) + y * Math.sin(th), gy = -x * Math.sin(th) + y * Math.cos(th);
    if (Math.abs(gx - tiltG.x) + Math.abs(gy - tiltG.y) < 0.04) return;
    tiltG.x = gx; tiltG.y = gy;
    for (const en of engines) { en.gravity.x = gx; en.gravity.y = gy; M.Composite.allBodies(en.world).forEach((bd) => M.Sleeping.set(bd, false)); }
    pitRun(); gRun();
  });
  if (matchMedia("(pointer: coarse)").matches && "DeviceOrientationEvent" in window) tilt();
})();
