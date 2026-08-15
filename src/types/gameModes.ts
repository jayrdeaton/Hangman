import type React from 'react'
import type { SharedValue } from 'react-native-reanimated'

export type ModeCategory = 'parts' | 'frames' | 'quantitative' | 'minimal'

export type ModeBehavior =
  | 'additive' // parts appear on wrong guess (classic hangman)
  | 'subtractive' // parts disappear on wrong guess (disappearing man)
  | 'depletion' // pool of instances shrinks on wrong guess (balloons popping)
  | 'accumulation' // instances accumulate on wrong guess
  | 'none' // no visual to react to wrong guesses at all

export interface GameMode {
  id: string
  label: string
  description: string
  category: ModeCategory
  behavior: ModeBehavior
  maxMistakes: number
  // When false, Game skips reserving space for a Visual entirely and enlarges the letter
  // display to fill it instead — Visual is still needed for the mode-picker preview card.
  hasVisual?: boolean
  // Curated out of the mode picker (see ModeSelector's VISIBLE_MODES) without deleting the mode
  // itself — it stays fully resolvable everywhere else (a shared puzzle link naming it by id, the
  // Mode Master achievement's own history) so nothing that already used it breaks.
  hidden?: boolean
  // colors is optional and additive — most modes ignore it and just use `color`, the single
  // accent they've always had. Only the generative/quantitative modes that place several
  // independent instances (balloons, stars) read it, to give each instance its own theme color
  // instead of every instance sharing one flat color (see PuzzleStage, which builds this from the
  // theme's primary/secondary/tertiary triad — the same one Game.tsx's own win-celebration
  // fireworks already randomize particle colors over).
  //
  // No width/height — every mode's own <Svg viewBox='0 0 100 100'> positions its artwork entirely
  // in that fixed coordinate space, so it never needed real pixel dimensions to draw correctly.
  // Passing width/height used to mean GameVisual/ModeSelector had to measure their own container
  // via onLayout before mounting this at all — a whole extra async round-trip on top of whatever
  // measurement the SURROUNDING layout already needed, and the actual cause of a visible pop when
  // the artwork finally appeared. Omitting width/height from <Svg> makes react-native-svg default
  // both to '100%' itself, filling whatever box this is already given immediately, no measurement
  // required.
  //
  // started is optional and additive, like colors — most modes ignore it. It mirrors Game.tsx's own
  // gameReady (true once the whole screen's combined reveal curtain has resolved, see Game.tsx's own
  // comment on gameReady/gameOpacity), threaded down through GameVisual/PuzzleStage, so a mode whose
  // artwork has its own one-time "construct the scene" reveal (e.g. classic.tsx's gallows) can hold
  // that reveal until the screen is actually visible instead of racing the curtain's own fade.
  //
  // partsOpacity is optional and additive too, and only classic.tsx reads it: it's the only mode
  // with a permanent scaffold (the gallows) structurally separate from its mistake-tracked parts
  // (the stick figure), so it's the only one where ModePickerDrawer's demo loop can fade the parts
  // back out between build cycles while leaving the scaffold alone — every other mode's demo cycle
  // fades and redraws the whole scene instead (see ModePickerDrawer's own useCardAnimation).
  Visual: React.ComponentType<{ mistakes: number; color: string; colors?: string[]; started?: boolean; partsOpacity?: SharedValue<number> }>
}
