// `started` (see gameModes.ts's own comment) flips true the same instant Game.tsx's screen-opacity
// curtain starts its own 220ms fade-in — without a pause here, a mode's one-time "construct the
// scene" reveal (the gallows, a fully-formed figure, a scattered field of stars/balloons, all
// visible from mistakes=0) would start sketching/materializing itself in while the screen is still
// fading up. This is the shared pause every such reveal waits out first, so it reads as its own
// distinct beat once the screen has actually resolved, rather than racing the curtain. Every mode's
// own artwork file imports this directly, unchanged. It's also, in effect, the artwork band's own
// offset in the sweep below, which is anchored around this same value instead of introducing a
// second "curtain settled" pause of its own.
export const SCENE_START_DELAY_MS = 400

// The whole game screen's opening reveal reads as one continuous sweep travelling bottom to top:
// the keyboard first, then the wrong-guess pips just above it, then the puzzle word, then the
// mode's own artwork (already timed off SCENE_START_DELAY_MS above, left untouched here), and
// finally the difficulty/hint pills at the very top. That's the goal, instead of every section
// popping in the instant `started` flips true. Each band still runs its own already-built internal
// stagger (the keyboard's own left-to-right column sweep, a gallows's own construction order, a
// word's own per-letter stagger, ...) on top of this head start; this only staggers when one
// band's stagger gets to begin relative to the next.
const SWEEP_BAND_MS = 110
export const KEYBOARD_SWEEP_DELAY_MS = SCENE_START_DELAY_MS - SWEEP_BAND_MS * 3
export const PIPS_SWEEP_DELAY_MS = SCENE_START_DELAY_MS - SWEEP_BAND_MS * 2
export const WORD_SWEEP_DELAY_MS = SCENE_START_DELAY_MS - SWEEP_BAND_MS
export const INFO_ROW_SWEEP_DELAY_MS = SCENE_START_DELAY_MS + SWEEP_BAND_MS
