export type Throw = { multiplier: 1 | 2 | 3; number: number };
export type Round = Throw[];

const numbers = Array.from({ length: 20 }, (_, i) => i + 1);

export const throwOptions: Throw[] = [
  ...numbers.flatMap((number) =>
    ([1, 2, 3] as const).map((multiplier) => ({ multiplier, number }))
  ),
  { multiplier: 1, number: 25 },
  { multiplier: 1, number: 50 },
];

export const value = (t: Throw) => t.multiplier * t.number;

export const canBeLastThrow = (t: Throw) => t.multiplier === 2 || t.number === 50;

const finishOptions = throwOptions.filter(canBeLastThrow);

export const maxScore = (darts: number) => 60 * (darts - 1) + 50;

export function countCheckouts(darts: number): number[] {
  const counts = new Array<number>(maxScore(darts) + 1).fill(0);
  let ways = new Map<number, number>([[0, 1]]);
  for (let k = 0; k < darts; k++) {
    for (const [s, c] of ways) for (const f of finishOptions) counts[s + value(f)] += c;
    const next = new Map<number, number>();
    for (const [s, c] of ways)
      for (const t of throwOptions) next.set(s + value(t), (next.get(s + value(t)) ?? 0) + c);
    ways = next;
  }
  return counts;
}

export function listCheckouts(target: number, darts: number, limit: number): Round[] {
  const result: Round[] = [];
  const path: Throw[] = [];

  function walk(remaining: number, length: number) {
    if (result.length >= limit) return;
    const left = length - path.length;
    if (left === 1) {
      for (const f of finishOptions) if (value(f) === remaining) result.push([...path, f]);
      return;
    }
    for (const t of throwOptions) {
      const rest = remaining - value(t);
      if (rest < 2 || rest > maxScore(left - 1)) continue;
      path.push(t);
      walk(rest, length);
      path.pop();
      if (result.length >= limit) return;
    }
  }

  for (let length = 1; length <= darts; length++) walk(target, length);
  return result;
}

export function formatThrow(t: Throw) {
  if (t.number === 50) return "Bull";
  if (t.number === 25) return "25";
  return `${"SDT"[t.multiplier - 1]}${t.number}`;
}

export const fieldKey = (multiplier: number, number: number) => `${multiplier}x${number}`;

export function minDartsToFinish(darts: number): number[] {
  const W = waysLayers(darts);
  const max = maxScore(darts);
  const min = new Array<number>(max + 1).fill(0);
  for (let L = 1; L <= darts; L++) {
    const w = W[L - 1];
    for (let t = 0; t < w.length; t++) {
      if (!w[t]) continue;
      for (const f of finishOptions) {
        const s = t + value(f);
        if (s <= max && min[s] === 0) min[s] = L;
      }
    }
  }
  return min;
}

const layerCache = new Map<number, Float64Array[]>();

function waysLayers(darts: number): Float64Array[] {
  const cached = layerCache.get(darts);
  if (cached) return cached;
  const max = maxScore(darts);
  let cur = new Float64Array(max + 1);
  cur[0] = 1;
  const layers = [cur];
  for (let m = 1; m <= darts - 1; m++) {
    const next = new Float64Array(max + 1);
    for (let t = 0; t < cur.length; t++) {
      const c = cur[t];
      if (!c) continue;
      for (const a of throwOptions) {
        const v = t + value(a);
        if (v <= max) next[v] += c;
      }
    }
    layers.push(next);
    cur = next;
  }
  layerCache.set(darts, layers);
  return layers;
}

export function fieldUsage(darts: number, score?: number): Map<string, number> {
  const W = waysLayers(darts);
  const max = maxScore(darts);
  const res = new Map<string, number>();
  for (const a of throwOptions) res.set(fieldKey(a.multiplier, a.number), 0);

  const scores =
    score != null ? [score] : Array.from({ length: max - 1 }, (_, i) => i + 2);

  for (const sc of scores) {
    for (const f of finishOptions) {
      const fk = fieldKey(f.multiplier, f.number);
      for (let L = 1; L <= darts; L++) {
        const need = sc - value(f);
        if (need >= 0 && need < W[L - 1].length) res.set(fk, res.get(fk)! + W[L - 1][need]);
      }
    }
    for (const g of throwOptions) {
      let add = 0;
      for (let L = 2; L <= darts; L++)
        for (const f of finishOptions) {
          const need = sc - value(f) - value(g);
          if (need >= 0 && need < W[L - 2].length) add += (L - 1) * W[L - 2][need];
        }
      if (add) {
        const gk = fieldKey(g.multiplier, g.number);
        res.set(gk, res.get(gk)! + add);
      }
    }
  }
  return res;
}
