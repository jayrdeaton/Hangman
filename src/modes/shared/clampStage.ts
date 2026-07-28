// Every mode's Visual (see the sibling files in src/modes/) independently converts the raw
// `mistakes` count it's handed into a stage index, part count, or remaining-instance count — and
// clamps that conversion to its own valid range, since Game.tsx hands it a live wrong-guess count
// (already capped for a mid-round art-style swap — see Game.tsx's visualMistakes) that has no
// built-in relationship to any one mode's own stage count. Floored at 0 defensively even where a
// caller's own math (e.g. an array `.slice()` start) would tolerate a negative without this, so
// every mode clamps the same way regardless of how its own stage list happens to be indexed.
export const clampStage = (mistakes: number, max: number): number => Math.min(Math.max(0, mistakes), max)
