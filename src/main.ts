import "./style.css";
import { countCheckouts, fieldKey, fieldUsage, formatThrow, listCheckouts, maxScore, minDartsToFinish } from "./darts";

const LIST_LIMIT = 300;
const RENDER_CAP = 20000;
let listLimit = LIST_LIMIT;
const fmt = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const tabs = $<HTMLDivElement>("#darts");
const stats = $<HTMLDivElement>("#stats");
const chart = $<HTMLDivElement>("#chart");
const chartLegend = $<HTMLDivElement>("#chart-legend");
const tooltip = $<HTMLDivElement>("#tooltip");
const input = $<HTMLInputElement>("#score");
const output = $<HTMLDivElement>("#result");
const tableBody = $<HTMLTableSectionElement>("#table tbody");
const exportScope = $<HTMLSpanElement>("#export-scope");
const boardEl = $<HTMLDivElement>("#board");
const boardTitle = $<HTMLHeadingElement>("#board-title");
const boardSub = $<HTMLParagraphElement>("#board-sub");
const boardLegend = $<HTMLDivElement>("#board-legend");
const boardMode = $<HTMLDivElement>("#board-mode");
const boardTip = $<HTMLDivElement>("#board-tip");

const cache = new Map<number, number[]>();
const getCounts = (d: number) => cache.get(d) ?? cache.set(d, countCheckouts(d)).get(d)!;

const usageCache = new Map<number, Map<string, number>>();
const getTotalUsage = (d: number) =>
  usageCache.get(d) ?? usageCache.set(d, fieldUsage(d)).get(d)!;

let darts = 3;
let mode: "score" | "all" = "score";
let boardHl: Element | null = null;

function render() {
  const counts = getCounts(darts);
  const max = maxScore(darts);
  const scores = Array.from({ length: max - 1 }, (_, i) => i + 2);
  const total = scores.reduce((a, s) => a + counts[s], 0);
  const best = Math.max(...scores.map((s) => counts[s]));
  const bestAt = scores.filter((s) => counts[s] === best);
  const ones = scores.filter((s) => counts[s] === 1);
  const bogeys = scores.filter((s) => counts[s] === 0);

  tabs.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.d) === darts))
  );

  stats.innerHTML = [
    tile("Total checkouts", fmt.format(total), `scores 2–${max}`),
    tile("Most checkouts", fmt.format(best), `score ${bestAt.join(", ")}`),
    tile("Only one way", String(ones.length), shorten(ones)),
    tile("Bogey numbers", String(bogeys.length), shorten(bogeys) || "none"),
  ].join("");

  const min = minDartsToFinish(darts);
  drawChart(scores, counts, best, min);

  tableBody.innerHTML = scores
    .map((s) => `<tr><td>${s}</td><td>${fmt.format(counts[s])}</td><td>${counts[s] ? min[s] : ""}</td></tr>`)
    .join("");
  exportScope.textContent = `(${darts} dart${darts === 1 ? "" : "s"})`;

  input.max = String(max);
  lookup();
  renderBoard();
}

function tile(label: string, value: string, note: string) {
  return `<div class="tile"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`;
}

function shorten(list: number[]) {
  return list.length > 8 ? `${list.slice(0, 8).join(", ")} …` : list.join(", ");
}

function niceMax(v: number) {
  const step = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * step).find((n) => n >= v)!;
}

function dartsColor(L: number, total: number) {
  const t = total > 1 ? (L - 1) / (total - 1) : 0;
  return RAMP[Math.round(RAMP_LO + t * (RAMP.length - 1 - RAMP_LO))];
}

function drawChart(scores: number[], counts: number[], best: number, min: number[]) {
  const W = 960, H = 340, L = 48, R = 12, T = 12, B = 32;
  const top = niceMax(best);
  const plotW = W - L - R, plotH = H - T - B;
  const band = plotW / scores.length;
  const barW = Math.min(24, Math.max(1, band - 2));
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const r = Math.min(4, barW / 2);

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = top * f;
      return `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${compact.format(v)}</text>`;
    })
    .join("");

  const tickStep = scores.length > 120 ? 20 : scores.length > 40 ? 10 : 5;
  const xTicks = scores
    .filter((s) => s % tickStep === 0)
    .map((s) =>
      `<text class="axis" x="${L + (s - 2) * band + band / 2}" y="${H - 10}" text-anchor="middle">${s}</text>`)
    .join("");

  const bars = scores
    .map((s, i) => {
      const x = L + i * band + (band - barW) / 2;
      const c = counts[s];
      const hit = `<rect class="hit" data-s="${s}" x="${L + i * band}" y="${T}" width="${band}" height="${plotH}"/>`;
      if (c === 0)
        return `<circle class="bogey" cx="${x + barW / 2}" cy="${T + plotH + 6}" r="2"/>${hit}`;
      const h = Math.max(1, T + plotH - y(c));
      const yy = T + plotH - h;
      const rr = Math.min(r, h);
      const d = `M${x},${T + plotH}V${yy + rr}Q${x},${yy} ${x + rr},${yy}H${x + barW - rr}Q${x + barW},${yy} ${x + barW},${yy + rr}V${T + plotH}Z`;
      return `<path class="bar" data-s="${s}" style="fill:${dartsColor(min[s], darts)}" d="${d}"/>${hit}`;
    })
    .join("");

  chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Checkouts per score with ${darts} darts, colored by fewest darts to finish">
    ${grid}<line class="baseline" x1="${L}" x2="${W - R}" y1="${T + plotH}" y2="${T + plotH}"/>${bars}${xTicks}</svg>`;

  const swatches = Array.from({ length: darts }, (_, i) => i + 1)
    .map((L) => `<span class="swatch"><i style="background:${dartsColor(L, darts)}"></i>${L} dart${L === 1 ? "" : "s"}</span>`)
    .join("");
  chartLegend.innerHTML = `${swatches}<span class="swatch"><i class="sw-bogey"></i>bogey</span>`;

  const svg = chart.querySelector("svg")!;
  svg.addEventListener("pointermove", (e) => {
    const s = Number((e.target as Element).getAttribute("data-s"));
    svg.querySelectorAll(".bar.active").forEach((b) => b.classList.remove("active"));
    if (!s) return (tooltip.hidden = true);
    svg.querySelector(`.bar[data-s="${s}"]`)?.classList.add("active");
    const c = counts[s];
    tooltip.innerHTML = `<strong>${s}</strong> · ${c ? `${fmt.format(c)} checkout${c === 1 ? "" : "s"} · min ${min[s]} dart${min[s] === 1 ? "" : "s"}` : "bogey number"}`;
    tooltip.hidden = false;
    const box = chart.parentElement!.getBoundingClientRect();
    const x = Math.min(e.clientX - box.left + 12, box.width - tooltip.offsetWidth);
    tooltip.style.transform = `translate(${x}px, ${e.clientY - box.top - 36}px)`;
  });
  svg.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    svg.querySelectorAll(".bar.active").forEach((b) => b.classList.remove("active"));
  });
  svg.addEventListener("click", (e) => {
    const s = Number((e.target as Element).getAttribute("data-s"));
    if (!s) return;
    input.value = String(s);
    lookup();
    if (mode === "score") renderBoard();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const RAMP = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];
const CX = 130, CY = 130, RS = 120;
const rings = {
  bullIn: (6.35 / 170) * RS,
  bullOut: (15.9 / 170) * RS,
  tripIn: (99 / 170) * RS,
  tripOut: (107 / 170) * RS,
  dblIn: (162 / 170) * RS,
  dblOut: RS,
};

const pt = (r: number, aDeg: number) => {
  const a = (aDeg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};

function sector(r1: number, r2: number, a1: number, a2: number) {
  const [ox1, oy1] = pt(r2, a1);
  const [ox2, oy2] = pt(r2, a2);
  const [ix2, iy2] = pt(r1, a2);
  const [ix1, iy1] = pt(r1, a1);
  return `M${ox1},${oy1}A${r2},${r2} 0 0 1 ${ox2},${oy2}L${ix2},${iy2}A${r1},${r1} 0 0 0 ${ix1},${iy1}Z`;
}

const RAMP_LO = 2;

function heatFill(v: number, minV: number, maxV: number) {
  if (v <= 0) return null;
  const t = maxV > minV ? (v - minV) / (maxV - minV) : 1;
  const idx = Math.round(RAMP_LO + t * (RAMP.length - 1 - RAMP_LO));
  return RAMP[idx];
}

const circlePath = (r: number) =>
  `M${CX - r},${CY}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;

function cellPath(v: number, label: string, d: string, minV: number, maxV: number) {
  const fill = heatFill(v, minV, maxV);
  const cls = fill ? "cell" : "cell cell-empty";
  const tip = `${label} · hit ${fmt.format(v)} time${v === 1 ? "" : "s"}`;
  return `<path class="${cls}"${fill ? ` style="fill:${fill}"` : ""} data-tip="${tip}" data-d="${d}" d="${d}"></path>`;
}

function region(m: number, num: number, d: string, usage: Map<string, number>, minV: number, maxV: number) {
  const v = usage.get(fieldKey(m, num)) ?? 0;
  const label = formatThrow({ multiplier: m as 1 | 2 | 3, number: num });
  return cellPath(v, label, d, minV, maxV);
}

function drawBoard(usage: Map<string, number>) {
  const values = [...usage.values()];
  const maxV = Math.max(...values);
  const minV = Math.min(...values.filter((v) => v > 0));
  const parts: string[] = [];
  BOARD_ORDER.forEach((num, i) => {
    const a = i * 18, a1 = a - 9, a2 = a + 9;
    parts.push(region(2, num, sector(rings.dblIn, rings.dblOut, a1, a2), usage, minV, maxV));
    parts.push(region(1, num, sector(rings.tripOut, rings.dblIn, a1, a2), usage, minV, maxV));
    parts.push(region(3, num, sector(rings.tripIn, rings.tripOut, a1, a2), usage, minV, maxV));
    parts.push(region(1, num, sector(rings.bullOut, rings.tripIn, a1, a2), usage, minV, maxV));
  });
  const vBull = usage.get(fieldKey(1, 25)) ?? 0;
  parts.push(cellPath(vBull, "25", circlePath(rings.bullOut), minV, maxV));
  const vEye = usage.get(fieldKey(1, 50)) ?? 0;
  parts.push(cellPath(vEye, "Bull", circlePath(rings.bullIn), minV, maxV));

  const labels = BOARD_ORDER.map((num, i) => {
    const [x, y] = pt(RS + 12, i * 18);
    return `<text class="board-num" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${num}</text>`;
  }).join("");

  boardEl.innerHTML = `<svg viewBox="-16 -16 292 292" role="img" aria-label="Dartboard heatmap">${parts.join("")}${labels}<path class="board-hl" d=""></path></svg>`;
  boardHl = boardEl.querySelector(".board-hl");

  boardLegend.innerHTML = `<span class="legend-label">${fmt.format(minV)}</span>
    <span class="legend-bar" style="background:linear-gradient(90deg, ${RAMP[RAMP_LO]}, ${RAMP[RAMP.length - 1]})"></span>
    <span class="legend-label">${fmt.format(maxV)}</span>`;
}

function renderBoard() {
  boardMode.querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.m === mode))
  );
  const n = parseInt(input.value);
  const max = maxScore(darts);
  const validScore = !Number.isNaN(n) && n >= 2 && n <= max && getCounts(darts)[n] > 0;

  if (mode === "all") {
    boardTitle.textContent = "Board heatmap: all checkouts";
    boardSub.textContent = `How often each field is thrown across every checkout with ${darts} dart${darts === 1 ? "" : "s"}.`;
    drawBoard(getTotalUsage(darts));
    boardEl.hidden = false;
    boardLegend.hidden = false;
    return;
  }

  if (!validScore) {
    boardTitle.textContent = "Board heatmap: one score";
    boardSub.textContent = "Type a reachable score above to light up the fields its checkouts use.";
    boardEl.hidden = true;
    boardLegend.hidden = true;
    return;
  }
  boardTitle.textContent = `Board heatmap: scoring ${n}`;
  boardSub.textContent = `How often each field is thrown across the checkouts of ${n} with ${darts} dart${darts === 1 ? "" : "s"}.`;
  drawBoard(fieldUsage(darts, n));
  boardEl.hidden = false;
  boardLegend.hidden = false;
}

function lookup() {
  const n = parseInt(input.value);
  const max = maxScore(darts);
  if (Number.isNaN(n)) return (output.innerHTML = "");
  if (n < 2 || n > max)
    return (output.innerHTML = `<p>Enter a score between 2 and ${max} for ${darts} dart${darts === 1 ? "" : "s"}.</p>`);

  const count = getCounts(darts)[n];
  if (count === 0) return (output.innerHTML = `<p><strong>${n}</strong> is a bogey number: no checkout with ${darts} dart${darts === 1 ? "" : "s"}.</p>`);

  const shown = Math.min(count, listLimit, RENDER_CAP);
  const rounds = listCheckouts(n, darts, shown);
  const note = count > shown ? ` · showing the first ${fmt.format(shown)}` : "";
  const canShowMore = count > shown && shown < RENDER_CAP;
  const atCap = shown === RENDER_CAP && count > RENDER_CAP;

  output.innerHTML = `<p>There ${count === 1 ? "is" : "are"} <strong>${fmt.format(count)}</strong> way${count === 1 ? "" : "s"} to check out <strong>${n}</strong>${note}.</p>
    <ol class="rounds">${rounds.map((r) => `<li>${r.map((t) => `<span>${formatThrow(t)}</span>`).join("")}</li>`).join("")}</ol>
    ${canShowMore ? `<button type="button" id="show-all">Show all ${fmt.format(Math.min(count, RENDER_CAP))}</button>` : ""}
    ${atCap ? `<p class="hint">Capped at ${fmt.format(RENDER_CAP)} to keep the page responsive.</p>` : ""}`;
}

tabs.addEventListener("click", (e) => {
  const d = Number((e.target as HTMLElement).dataset.d);
  if (!d) return;
  darts = d;
  listLimit = LIST_LIMIT;
  render();
});
input.addEventListener("input", () => {
  listLimit = LIST_LIMIT;
  lookup();
  if (mode === "score") renderBoard();
});
output.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id !== "show-all") return;
  listLimit = RENDER_CAP;
  lookup();
});
boardMode.addEventListener("click", (e) => {
  const m = (e.target as HTMLElement).dataset.m as "score" | "all" | undefined;
  if (!m || m === mode) return;
  mode = m;
  renderBoard();
});
function clearBoardHover() {
  boardTip.hidden = true;
  boardHl?.setAttribute("d", "");
}
boardEl.addEventListener("pointermove", (e) => {
  const t = e.target as SVGElement;
  const tip = t.getAttribute?.("data-tip");
  if (!tip) return clearBoardHover();
  boardHl?.setAttribute("d", t.getAttribute("data-d") || "");
  boardTip.textContent = tip;
  boardTip.hidden = false;
  const box = boardEl.parentElement!.getBoundingClientRect();
  const x = Math.min(e.clientX - box.left + 12, box.width - boardTip.offsetWidth);
  boardTip.style.transform = `translate(${Math.max(0, x)}px, ${e.clientY - box.top - 34}px)`;
});
boardEl.addEventListener("pointerleave", clearBoardHover);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportData(format: "csv" | "json") {
  const counts = getCounts(darts);
  const min = minDartsToFinish(darts);
  const max = maxScore(darts);
  const rows = Array.from({ length: max - 1 }, (_, i) => i + 2).map((s) => ({
    score: s,
    checkouts: counts[s],
    minDarts: counts[s] ? min[s] : null,
    bogey: counts[s] === 0,
  }));
  if (format === "csv") {
    const csv = ["score,checkouts,min_darts,bogey"]
      .concat(rows.map((r) => `${r.score},${r.checkouts},${r.minDarts ?? ""},${r.bogey}`))
      .join("\n");
    download(`dartcalc-${darts}darts.csv`, csv, "text/csv");
  } else {
    download(`dartcalc-${darts}darts.json`, JSON.stringify({ darts, max, rows }, null, 2), "application/json");
  }
}

const CHECKOUT_CAP = 300000;
const exportNote = $<HTMLSpanElement>("#export-note");

function exportCheckouts() {
  const counts = getCounts(darts);
  const max = maxScore(darts);
  const total = Array.from({ length: max - 1 }, (_, i) => i + 2).reduce((a, s) => a + counts[s], 0);
  const lines = ["score,darts,throws"];
  let remaining = CHECKOUT_CAP;
  for (let s = 2; s <= max && remaining > 0; s++) {
    if (!counts[s]) continue;
    const rounds = listCheckouts(s, darts, remaining);
    for (const r of rounds) lines.push(`${s},${r.length},${r.map(formatThrow).join(" ")}`);
    remaining -= rounds.length;
  }
  download(`dartcalc-${darts}darts-checkouts.csv`, lines.join("\n"), "text/csv");
  exportNote.textContent =
    total > CHECKOUT_CAP
      ? `exported first ${fmt.format(CHECKOUT_CAP)} of ${fmt.format(total)} checkouts`
      : `${fmt.format(total)} checkouts exported`;
}

$<HTMLButtonElement>("#export-csv").addEventListener("click", () => exportData("csv"));
$<HTMLButtonElement>("#export-json").addEventListener("click", () => exportData("json"));
$<HTMLButtonElement>("#export-checkouts").addEventListener("click", exportCheckouts);

render();
