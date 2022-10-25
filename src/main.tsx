const numbers = new Array(20).fill(0).map((_, index) => index + 1);

const throwOptions = numbers.flatMap((number) =>
  [1, 2, 3].map((multiplier) => ({ multiplier, number }))
);
throwOptions.push({ multiplier: 1, number: 25 });
throwOptions.push({ multiplier: 1, number: 50 });

const throwCount = 3;
const allOptions = getAllOptions(throwCount);

const input = document.querySelector("input")!;
const output = document.querySelector("#result")!;
input.addEventListener("input", () => {
  const n = parseInt(input.value);
  if (Number.isNaN(n)) {
    output.innerHTML = "";
    return;
  }
  const options = allOptions.filter((r) => sumRound(r) === n);
  output.innerHTML = `<p>There are ${options.length} options to reach ${n}</p>
    <ul>
      ${options.map((r) => `<li>${stringifyRound(r)}</li>`).join("")}
    </ul>`;
});

function getAllOptions(throwCount: number): Round[] {
  if (throwCount === 0) return [];
  return throwOptions.flatMap((option): Round[] => {
    const nextTurns = getAllOptions(throwCount - 1).map((r) => [option, ...r]);

    if (canBeLastThrow(option)) return [[option], ...nextTurns];

    return nextTurns;
  });
}

function sumRound(round: Round) {
  let sum = 0;
  for (const t of round) sum += !t ? 0 : t.multiplier * t.number;
  return sum;
}

function stringifyRound(round: Round) {
  return round.map((r) => `${r.multiplier} x ${r.number}`).join(" - ");
}

function canBeLastThrow(t: Throw) {
  return t && (t.multiplier === 2 || t.number > 25);
}

export {};

type Throw = typeof throwOptions[number];
type Round = Throw[];
