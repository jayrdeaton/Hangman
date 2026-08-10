// Small randomization helpers for modes whose art is regenerated fresh each round (balloons,
// stars, ...) rather than using one fixed layout every game. Safe to call from a useState
// initializer since Main.tsx remounts Game (and everything under it) with a fresh `key` per round.

export const randIn = (min: number, max: number): number => min + Math.random() * (max - min)

// Fisher-Yates shuffle of [0..n-1] — used to randomize which theme color lands on which shape
// each round instead of a fixed index -> color mapping (which would otherwise always put the
// same shape on the same color every game).
export function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
