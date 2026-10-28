// lyra-planet.github.io: theme toggle, CV print button, live Claude Code usage chart.
(() => {
  const root = document.documentElement;
  const dark = () => (root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";

  document.querySelector(".theme")?.addEventListener("click", () => {
    const next = dark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* private mode: ignore */ }
  });
  document.querySelector(".print")?.addEventListener("click", () => window.print());

  const box = document.querySelector(".usage");
  if (!box) return;

  const fmt = (n, d) => {
    for (const [div, suf] of [[1e9, "B"], [1e6, "M"], [1e3, "k"]]) {
      if (n >= div) { const v = n / div; return v.toFixed(d ?? (v < 10 ? 2 : v < 100 ? 1 : 0)) + suf; }
    }
    return String(n);
  };
  const iso = (d) => d.toISOString().slice(0, 10);
  const label = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

  fetch(box.dataset.src, { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((u) => { kpis(u); table(u); chart(u); addEventListener("resize", () => chart(u)); })
    .catch(() => { box.querySelector(".kpis").innerHTML = '<p class="note">Live numbers could not be loaded right now.</p>'; });

  function kpis(u) {
    const t = u.totals;
    const cells = [
      ["hero-kpi", fmt(t.total), `tokens since ${label(u.days[0].date)}`],
      ["", fmt(t.output), "output tokens"],
      ["", fmt(t.requests, 1), "API calls"],
      ["", t.sessions.toLocaleString("en-US"), "sessions"],
      ["", `${(100 * t.cache_read / t.total).toFixed(1)}%`, "served from cache"],
    ];
    box.querySelector(".kpis").innerHTML = cells.map(([c, v, l]) => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`).join("") ;
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

  function chart(u) {
    const svg = box.querySelector(".chart svg"), tip = box.querySelector(".tip");
    const W = svg.clientWidth || 800, H = 220, L = 44, B = 24, T = 18;
    const byDate = Object.fromEntries(u.days.map((d) => [d.date, d]));
    const end = new Date(u.generated_at.slice(0, 10) + "T00:00:00Z");
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(end); d.setUTCDate(d.getUTCDate() - 29 + i); return iso(d); });
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
      const x = L + i * slot + 1, w = slot - 2, h = Math.max(2, (ch * v) / top), r = Math.min(4, w / 2, h);
      s += `<path class="bar" d="M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + w - r} Q${x + w},${y(0) - h} ${x + w},${y(0) - h + r} V${y(0)} Z"/>`;
    });
    const p = vals.indexOf(Math.max(...vals));
    if (vals[p]) s += `<text class="peak" x="${L + p * slot + slot / 2}" y="${y(vals[p]) - 7}" text-anchor="middle">${fmt(vals[p])}</text>`;
    for (const i of [0, 14, 29]) s += `<text class="tick" x="${L + i * slot + slot / 2}" y="${H - 4}" text-anchor="middle">${label(days[i])}</text>`;
    s += `<line class="cross" x1="0" x2="0" y1="${T}" y2="${y(0)}" visibility="hidden"/>`;
    days.forEach((d, i) => {
      s += `<rect class="hit" data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${ch}" tabindex="0" aria-label="${label(d)}: ${fmt(vals[i])} tokens"/>`;
    });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
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
