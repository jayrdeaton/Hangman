// `started` (see gameModes.ts's own comment) flips true the same instant Game.tsx's screen-opacity
// curtain starts its own 220ms fade-in — without a pause here, a mode's one-time "construct the
// scene" reveal (the gallows, a fully-formed figure, a scattered field of stars/balloons, all
// visible from mistakes=0) would start sketching/materializing itself in while the screen is still
// fading up. This is the shared pause every such reveal waits out first, so it reads as its own
// distinct beat once the screen has actually resolved, rather than racing the curtain.
export const SCENE_START_DELAY_MS = 400
