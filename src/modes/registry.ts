import type { GameMode } from '@/types/gameModes'

import { appearingMode } from './appearing'
import { balloonsMode } from './balloons'
import { candleMode } from './candle'
import { classicMode } from './classic'
import { crackingWindowMode } from './crackingWindow'
import { disappearingMode } from './disappearing'
import { flowerMode } from './flower'
import { hourglassMode } from './hourglass'
import { jengaMode } from './jenga'
import { kiteMode } from './kite'
import { lettersMode } from './letters'
import { robotMode } from './robot'
import { sandcastleMode } from './sandcastle'
import { snowmanMode } from './snowman'
import { starsMode } from './stars'
import { stormCloudMode } from './stormCloud'

export { appearingMode, balloonsMode, candleMode, classicMode, crackingWindowMode, disappearingMode, flowerMode, hourglassMode, jengaMode, kiteMode, lettersMode, robotMode, sandcastleMode, snowmanMode, starsMode, stormCloudMode }

// Ordered list for mode selector display. Letters Only leads the carousel since it's the
// most discoverable/accessible option, but classicMode stays the actual default below —
// display order and the initial-session pick are deliberately independent.
//
// The full, canonical set of every mode that has ever existed — deliberately NOT filtered by
// `hidden` here. A shared puzzle link naming a since-hidden mode by id (see puzzleLink.ts) still
// needs to resolve it, and a player's already-earned Mode Master progress (see achievements.ts)
// shouldn't silently change meaning. Only the mode PICKER (VISIBLE_MODES below) should ever
// filter these out.
export const ALL_MODES: GameMode[] = [lettersMode, classicMode, appearingMode, disappearingMode, robotMode, candleMode, balloonsMode, starsMode, snowmanMode, stormCloudMode, jengaMode, flowerMode, kiteMode, crackingWindowMode, sandcastleMode, hourglassMode]

// The curated subset offered in the mode picker (see ModeSelector) — everything in ALL_MODES
// except whatever's been marked `hidden: true` on the mode itself. Hiding a mode is a one-line
// edit in its own file, not a second list to keep in sync here.
export const VISIBLE_MODES: GameMode[] = ALL_MODES.filter((mode) => !mode.hidden)

export const DEFAULT_MODE: GameMode = classicMode
