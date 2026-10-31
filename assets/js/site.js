// lyra-planet.github.io: theme toggle, CV print button, home-page motion, live Claude Code usage chart.
(() => {
  const root = document.documentElement;
  const dark = () => (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";

  // The new theme spreads from the button in a circle (a view transition: the old page is a still picture underneath),
  // instead of every colour on the page cutting over in one frame. Without view transitions, or with reduced motion,
  // it switches at once. "themechange" tells the canvases to repaint once the new colours are in.
  const theme = document.querySelector(".theme");
  theme?.addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    const flip = () => {
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* private mode: ignore */ }
      document.dispatchEvent(new Event("themechange"));
    };
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return flip();
    const r = theme.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.classList.add("theming");                 // colour transitions off: the circle is the transition
    const vt = document.startViewTransition(flip);
    vt.ready.then(() => root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(.4, 0, .2, 1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
    vt.finished.finally(() => root.classList.remove("theming"));
  });
  document.querySelector(".print")?.addEventListener("click", () => window.print());

  // ---- frame meter: add #fps to the address; frames per second and the slowest frame of the last second ----
  if (/fps/.test(location.hash)) {
    const box = document.createElement("div");
    box.className = "fps";
    document.body.append(box);
    let n = 0, worst = 0, t0 = performance.now(), prev = t0;
    const f = (t) => {
      n++; worst = Math.max(worst, t - prev); prev = t;
      if (t - t0 >= 1000) {
        box.textContent = `${Math.round((n * 1000) / (t - t0))} fps\nworst ${Math.round(worst)} ms\n${devicePixelRatio}x ${innerWidth}x${innerHeight}`;
        n = 0; worst = 0; t0 = t;
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  // ---- home motion; with reduced motion everything lands on its final state at once ----
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = (t) => 1 - (1 - t) ** 3;
  const tween = (ms, step) => {
    if (calm) return step(1);
    const t0 = performance.now();
    const tick = (now) => { const t = Math.min(1, (now - t0) / ms); step(ease(t)); if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  // sections fade in once; callbacks registered with onReveal run at that moment
  const io = "IntersectionObserver" in window && new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    setTimeout(() => e.target.classList.add("done"), 2200);   // its stagger has played: never again
    io.unobserve(e.target);
    (e.target._cbs || []).forEach((f) => f());
  }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  const onReveal = (el, f) => {
    const sec = el.closest(".reveal");
    if (!sec || !io || sec.classList.contains("in")) return f();
    (sec._cbs ||= []).push(f);
  };
  // a post's paragraphs below the first screen rise in as they scroll into view (the first few rise with the header)
  for (const el of document.querySelectorAll(".prose > :nth-child(n+4)")) if (el.getBoundingClientRect().top > innerHeight) el.classList.add("reveal");
  document.querySelectorAll(".reveal").forEach((el) => io ? io.observe(el) : el.classList.add("in"));
  // a post link morphs into the post's title on the next page (a view transition): leave a note so its letters don't
  // also drop in (the head script reads it)
  if ("onpagereveal" in window) addEventListener("click", (e) => {
    const a = e.target.closest?.('a[style*="view-transition-name"]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) try { sessionStorage.setItem("morph", new URL(a.href).pathname); } catch (err) { /* private mode */ }
  });
  // the hero's entrance (letters, rises, growing bars) is over by ~3 s: mark it, so nothing can replay it
  addEventListener("load", () => setTimeout(() => root.classList.add("played"), 3200), { once: true });

  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = +el.dataset.count, dec = +el.dataset.dec || 0, suf = el.dataset.suffix || "";
    onReveal(el, () => tween(1400, (k) => { el.textContent = (end * k).toFixed(dec) + suf; }));
  });

  // typewriter: delete the current phrase, type the next one
  const rot = document.querySelector(".rotator");
  if (rot) {
    const words = JSON.parse(rot.dataset.words);
    let w = 0;
    const swap = () => {
      const next = words[(w = (w + 1) % words.length)];
      if (calm) { rot.textContent = next; return setTimeout(swap, 3000); }
      const out = setInterval(() => {
        rot.textContent = rot.textContent.slice(0, -1);
        if (rot.textContent) return;
        clearInterval(out);
        let i = 0;
        const type = setInterval(() => { rot.textContent = next.slice(0, ++i); if (i === next.length) { clearInterval(type); setTimeout(swap, 2400); } }, 70);
      }, 35);
    };
    setTimeout(swap, 2600);
  }

  document.querySelectorAll(".spot").forEach((c) => c.addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${e.clientX - r.left}px`);
    c.style.setProperty("--my", `${e.clientY - r.top}px`);
  }));

  // reading scrollHeight inside a frame, after the physics loops wrote styles, recomputed the page's style every
  // scroll frame: the page height is read on load and resize only, the scroll position in the scroll event
  const bar = document.querySelector(".progress i");
  if (bar) {
    let queued = false, max = 1, y = scrollY;
    const measure = () => { const h = document.documentElement; max = Math.max(1, h.scrollHeight - h.clientHeight); y = scrollY; draw(); };
    const draw = () => { queued = false; bar.style.transform = `scaleX(${(y / max).toFixed(4)})`; };
    addEventListener("scroll", () => { y = scrollY; if (!queued) { queued = true; requestAnimationFrame(draw); } }, { passive: true });
    addEventListener("resize", measure);
    addEventListener("load", measure, { once: true });
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(document.body);
    measure();
  }

  const box = document.querySelector(".usage");
  if (!box) return;

  const fmt = (n, d) => {
    for (const [div, suf] of [[1e9, "B"], [1e6, "M"], [1e3, "k"]]) {
      if (n >= div) { const v = n / div; return v.toFixed(d ?? (v < 10 ? 2 : v < 100 ? 1 : 0)) + suf; }
    }
    return String(n);
  };
  const iso = (d) => d.toISOString().slice(0, 10);
  // one formatter for every date: toLocaleDateString builds a new one per call, ~40 calls a chart (55 ms on a 4x slower CPU)
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
  const label = (s) => day.format(new Date(s + "T00:00:00Z"));

  // the numbers baked in at build time draw at once; the live file then replaces them without counting up again
  let data = null;
  const seed = box.querySelector(".usage-seed");
  if (seed) try { data = JSON.parse(seed.textContent); kpis(data, true); table(data); chart(data); } catch (e) { data = null; }
  addEventListener("resize", () => data && chart(data));
  fetch(box.dataset.src, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((u) => {
      const fresh = !data;
      if (!fresh && u.generated_at === data.generated_at) return;
      data = u; kpis(u, fresh); table(u); chart(u);
    })
    .catch(() => { if (!data) box.querySelector(".kpis").innerHTML = '<p class="note">Live numbers could not be loaded right now.</p>'; });

  function kpis(u, countUp) {
    const t = u.totals;
    const cells = [
      ["hero-kpi", t.total, (v) => fmt(v), `tokens since ${label(u.days[0].date)}`],
      ["", t.output, (v) => fmt(v), "output tokens"],
      ["", t.requests, (v) => fmt(v, 1), "API calls"],
      ["", t.sessions, (v) => Math.round(v).toLocaleString("en-US"), "sessions"],
      ["", 100 * t.cache_read / t.total, (v) => `${v.toFixed(1)}%`, "served from cache"],
    ];
    const el = box.querySelector(".kpis");
    el.innerHTML = cells.map(([c, v, f, l]) => `<div class="kpi ${c}"><b>${f(v)}</b><span>${l}</span></div>`).join("");
    const bs = el.querySelectorAll("b");
    if (countUp) onReveal(el, () => tween(1600, (k) => cells.forEach(([, v, f], i) => { bs[i].textContent = f(v * k); })));
  }

  function table(u) {
    const rows = [...u.days].reverse().map((d) =>
      `<tr><td>${d.date}</td><td>${fmt(d.total)}</td><td>${fmt(d.output)}</td><td>${d.requests.toLocaleString("en-US")}</td><td>${d.sessions}</td></tr>`).join("");
    box.querySelector(".table div").innerHTML =
      `<table><thead><tr><th>Date</th><th>Total</th><th>Output</th><th>API calls</th><th>Sessions</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function niceTicks(v, target = 4) {
    const raw = v / target, e = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((k) => k * e).find((s) => s >= raw);
    return Array.from({ length: Math.ceil(v / step) + 1 }, (_, i) => i * step);
  }

  let drawn = 0;
  function chart(u) {
    const svg = box.querySelector(".chart svg"), tip = box.querySelector(".tip");
    const W = svg.clientWidth || 800, H = 220, L = 44, B = 24, T = 18;
    const byDate = Object.fromEntries(u.days.map((d) => [d.date, d]));
    // window: from the first logged day to today, at least 14 and at most 30 days
    const end = new Date(u.generated_at.slice(0, 10) + "T00:00:00Z");
    const n = Math.min(30, Math.max(14, Math.round((end - new Date(u.days[0].date + "T00:00:00Z")) / 864e5) + 2));
    const days = Array.from({ length: n }, (_, i) => { const d = new Date(end); d.setUTCDate(d.getUTCDate() - n + 1 + i); return iso(d); });
    const vals = days.map((d) => byDate[d]?.total || 0);
    const ticks = niceTicks(Math.max(...vals, 1)), top = ticks[ticks.length - 1];
    const ch = H - B - T, slot = (W - L) / days.length, y = (v) => T + ch - (ch * v) / top;
    let s = "";
    for (const v of ticks) {
      s += `<line class="${v ? "gridline" : "baseline"}" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v ? fmt(v, Number.isInteger(v / 1e9) ? 0 : 1) : "0"}</text>`;
    }
    vals.forEach((v, i) => {
      if (!v) return;
      const w = Math.min(slot - 4, 30), x = L + i * slot + (slot - w) / 2, h = Math.max(2, (ch * v) / top), r = Math.min(4, w / 2, h);
      s += `<path class="bar" style="--i:${i}" d="M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + w - r} Q${x + w},${y(0) - h} ${x + w},${y(0) - h + r} V${y(0)} Z"/>`;
    });
    const p = vals.indexOf(Math.max(...vals));
    if (vals[p]) s += `<text class="peak" x="${L + p * slot + slot / 2}" y="${y(vals[p]) - 7}" text-anchor="middle">${fmt(vals[p])}</text>`;
    for (const i of [0, n >> 1, n - 1]) s += `<text class="tick" x="${L + i * slot + slot / 2}" y="${H - 4}" text-anchor="middle">${label(days[i])}</text>`;
    s += `<line class="cross" x1="0" x2="0" y1="${T}" y2="${y(0)}" visibility="hidden"/>`;
    days.forEach((d, i) => {
      s += `<rect class="hit" data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${ch}" tabindex="0" aria-label="${label(d)}: ${fmt(vals[i])} tokens"/>`;
    });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.classList.toggle("grow", !drawn++);   // bars grow only on the first draw, not on every resize
    svg.innerHTML = s;

    const cross = svg.querySelector(".cross");
    const show = (i) => {
      const d = byDate[days[i]], cx = L + i * slot + slot / 2;
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      tip.innerHTML = d
        ? `${label(days[i])}<br>${fmt(d.total)} tokens · ${fmt(d.output)} out<br>${d.requests.toLocaleString("en-US")} calls · ${d.sessions} sessions`
        : `${label(days[i])}<br>no sessions`;
      tip.style.left = `${(cx / W) * 100}%`;
      tip.style.transform = cx > W * 0.75 ? "translate(-100%, -110%)" : cx < W * 0.2 ? "translate(0, -110%)" : "";   // 靠边就往里翻，别被裁掉
      tip.style.top = `${y(vals[i])}px`;
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
    svg.querySelectorAll(".hit").forEach((h) => {
      const i = +h.dataset.i;
      h.addEventListener("mouseenter", () => show(i));
      h.addEventListener("focus", () => show(i));
      h.addEventListener("mouseleave", hide);
      h.addEventListener("blur", hide);
    });
  }
})();
