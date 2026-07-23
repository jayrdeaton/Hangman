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
export const ALL_MODES: GameMode[] = [lettersMode, classicMode, appearingMode, disappearingMode, robotMode, candleMode, balloonsMode, starsMode, snowmanMode, stormCloudMode, jengaMode, flowerMode, kiteMode, crackingWindowMode, sandcastleMode, hourglassMode]

export const DEFAULT_MODE: GameMode = classicMode
