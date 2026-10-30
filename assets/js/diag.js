// #diag in the address: an on-device check for phones. The page scrolls itself down and back while every frame
// is timed, once as it is and once with each moving part switched off, and the results land in a table to
// screenshot. Desktop emulation can't show what a real iPhone does (rAF at 60 against 120 Hz scrolling, Low
// Power Mode's 30 fps cap, how Safari paints), so this asks the phone.
(() => {
  const root = document.documentElement;
  const PARTS = [
    ["全开", []],
    ["关星球", ["d-planet"]],
    ["关标签", ["d-chips"]],
    ["关卡片浮动", ["d-float"]],
    ["关背景点阵", ["d-field"]],
    ["关背景网格", ["d-grid"]],
    ["关图层提示", ["d-layers"]],
    ["全关", ["d-planet", "d-chips", "d-float", "d-field", "d-grid", "d-layers"]],
  ];
  const style = document.createElement("style");
  style.textContent = `
    .d-planet .planet > * { display: none !important; }
    .d-chips .heap { display: none !important; }
    .d-field .field { display: none !important; }
    .d-grid .grid { display: none !important; }
    .d-layers * { will-change: auto !important; }
    .diag { position: fixed; z-index: 99; left: 8px; right: 8px; top: calc(8px + env(safe-area-inset-top, 0px)); max-width: 420px;
      padding: 10px 12px; border-radius: 12px; background: rgba(20,20,19,.92); color: #faf9f5; font: 12px/1.5 var(--mono); }
    .diag button { font: inherit; color: inherit; background: #d97757; border: 0; border-radius: 6px; padding: 5px 10px; margin: 6px 6px 0 0; }
    .diag .hand button { background: #45443f; } .diag .hand button[aria-pressed="true"] { background: #d97757; }
    .diag table { border-collapse: collapse; margin-top: 6px; width: 100%; }
    .diag td { padding: 1px 6px 1px 0; white-space: nowrap; } .diag td + td { text-align: right; }`;
  document.head.append(style);

  const box = document.createElement("div");
  box.className = "diag";
  const ver = (document.querySelector('script[src*="physics."]')?.src.match(/physics\.([0-9a-f]{7})/) || [])[1] || "?";
  box.innerHTML = `<div>build ${ver} · ${devicePixelRatio}x ${innerWidth}×${innerHeight}<br>${(navigator.userAgent.match(/OS [\d_]+|Android [\d.]+/) || [""])[0].replace(/_/g, ".")}</div>
    <div class="out">点「开始」，页面会自己上下滚 8 轮，约 30 秒，别碰屏幕；跑完截这个框。</div>
    <button type="button" data-go>开始</button><button type="button" data-x>关闭</button>
    <div class="hand">手动试：点亮 = 关掉这一项，然后用手指滑<br>${PARTS.slice(1, -1).map(([n], i) => `<button type="button" data-i="${i + 1}" aria-pressed="false">${n.slice(1)}</button>`).join("")}</div>`;
  document.body.append(box);
  const out = box.querySelector(".out");

  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const frames = (ms) => new Promise((ok) => {
    const gaps = [];
    let start = 0, last = 0;
    const f = (t) => {
      if (!start) start = last = t;
      else { gaps.push(t - last); last = t; }
      if (t - start < ms) requestAnimationFrame(f); else ok(gaps);
    };
    requestAnimationFrame(f);
  });
  // a frame counts as late when it took more than 1.5 of the median frame (a 60 Hz phone: over 25 ms)
  const sum = (gaps) => {
    const sorted = [...gaps].sort((a, b) => a - b), mid = sorted[sorted.length >> 1] || 16.7, total = gaps.reduce((a, b) => a + b, 0);
    return { fps: Math.round((gaps.length / total) * 1000), worst: Math.round(sorted[sorted.length - 1] || 0), late: gaps.filter((g) => g > mid * 1.5).length };
  };
  const pass = async () => {
    scrollTo(0, 0);
    await wait(700);
    const run = frames(3200);
    scrollTo({ top: Math.min(1800, document.body.scrollHeight - innerHeight), behavior: "smooth" });
    await wait(1600);
    scrollTo({ top: 0, behavior: "smooth" });
    return sum(await run);
  };

  box.querySelector("[data-x]").addEventListener("click", () => box.remove());
  box.querySelector(".hand").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const on = b.getAttribute("aria-pressed") !== "true", cls = PARTS[+b.dataset.i][1];
    b.setAttribute("aria-pressed", String(on));
    root.classList.toggle(cls[0], on);
    if (cls[0] === "d-float") window.lyraScroll?.(on ? "none" : "bubble");
  });
  box.querySelector("[data-go]").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const idle = sum(await frames(1500));
    const rows = [`<tr><td>静止</td><td>${idle.fps} fps</td><td>最慢 ${idle.worst} ms</td><td></td></tr>`];
    out.innerHTML = `<table>${rows.join("")}</table>`;
    for (const [name, cls] of PARTS) {
      root.classList.add(...cls);
      window.lyraScroll?.(cls.includes("d-float") ? "none" : "bubble");
      const r = await pass();
      root.classList.remove(...cls);
      rows.push(`<tr><td>${name}</td><td>${r.fps} fps</td><td>最慢 ${r.worst} ms</td><td>卡 ${r.late} 帧</td></tr>`);
      out.innerHTML = `<table>${rows.join("")}</table>`;
    }
    window.lyraScroll?.("bubble");
    out.insertAdjacentHTML("beforeend", "<div>跑完了，截这个框发我</div>");
  });
})();
