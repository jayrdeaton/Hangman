import { Easing } from 'react-native-reanimated'

// How the loadout moves when it changes (Jay, 2026-10-18: switching the word source, and adding or
// removing players, were jarring). Every change of layout settles on one clock, so the parts stay in
// step: the seats glide to their new places, and the page's groups and the art ease to their new
// heights together (one grows by what the other gives up, so nothing else on the page moves). The word
// source's options cross-fade a little quicker. None of it runs while the page is out of sight, or with
// the system's Reduce Motion on (see LoadoutShell's useLoadoutMotion).
export const REFLOW_MS = 250
// An ease in and out (the standard in-out quad curve). A bezier rather than Easing.inOut, which the
// web's layout transitions can't turn into CSS (they fall back to linear, with a warning each time).
export const REFLOW_EASING = Easing.bezier(0.45, 0, 0.55, 1)
// A seat's pill coming or going (it grows in, or shrinks away), and its badge or remove glyph fading.
export const SEAT_FADE_MS = 200
// The word source's two sets of options.
export const SOURCE_FADE_MS = 180
