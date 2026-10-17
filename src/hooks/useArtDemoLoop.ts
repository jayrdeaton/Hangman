import { useEffect, useRef, useState } from 'react'
import { useSharedValue, withTiming } from 'react-native-reanimated'

import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import type { GameMode } from '@/types/gameModes'

// Time between each successive wrong-guess step during a card's demo cycle - comfortably longer
// than sketchShapes.tsx's own DRAW_MS (380) so a part/instance visibly finishes its own sketch-in or
// fade-in before the next step lands. DEMO_HOLD_MS is how long the fully-built (or fully-depleted)
// extreme holds before the cycle fades back out and restarts.
const DEMO_STEP_MS = 500
const DEMO_HOLD_MS = 1000
// Quick opacity tween for every fade in this cycle - fast enough to read as a beat between two
// drawn states, not a slow cross-dissolve.
const FADE_MS = 200
// How long a freshly (re)mounted scene's own one-time reveal (GallowsWithRope, RobotCore, Candle's
// base-to-flame sketch-on, a whole scattered field of stars/snowflakes) needs to finish before the
// mistake-simulation loop below starts touching `mistakes` again. Sized to comfortably clear the
// slowest of these - Robot's antenna, the last of six staggered removable parts, only finishes
// around 1.9s after its own core scaffold starts (see robot.tsx's own CORE_END_MS/STAGGER_MS) -
// rather than tracking each mode's own exact stagger math here. Too short and a slow-revealing part
// gets yanked away by the loop before a viewer ever sees it drawn (the antenna bug this cycle was
// built to fix); too long just reads as a pause, not a functional problem.
const SCENE_REVEAL_HOLD_MS = 2000

// classic.tsx is the only mode with a permanent scaffold (the gallows) structurally separate from
// its mistake-tracked parts (the stick figure) - see gameModes.ts's own comment on partsOpacity.
// Every other mode's "scene" IS its mistakes-reactive content, so there's nothing to preserve across
// a fade/redraw the way the gallows is here.
const SCAFFOLDED_MODE_ID = 'classic'

// Drives each card's demo cycle while it's focused: fades the resting "fully drawn" preview out,
// (re)mounts the scene so its own one-time reveal plays fresh (bumping `revealKey` forces this - see
// its own usage below), waits for that reveal to finish, then steps `mistakes` from 0 up to
// maxMistakes (holding briefly once fully built/depleted) the same way a real round's wrong guesses
// would, just looped. At the end of each hold: classic.tsx fades `partsOpacity` down to fade out just
// the stick figure, leaving the gallows alone, then loops straight back into the next build (no
// remount, no scene-reveal wait - the gallows never went anywhere). Every other mode instead fades
// the whole card out, remounts for a full fresh redraw, and waits out the reveal again before
// continuing - there's no persistent piece worth preserving there, so a full redraw each cycle is
// simpler and reads just as well ("draw in, animate through, fade out, draw back in, repeat").
// `paused` (the drawer is closed, Home is covered) stops the cycle outright; see its own guard below.
//
// Shared by ModePickerDrawer's carousel cards and Home's hero (HeroTitle), which both demo the art.
//
// `startBlank` (Home's hero) starts on a blank scene that draws itself in at mount, rather than on the
// resting "fully drawn" preview with an entry fade: nobody has seen a resting frame to fade out of.
export const useArtDemoLoop = (isFocused: boolean, paused: boolean, mode: GameMode, startBlank = false) => {
  const restMistakes = fullyDrawnMistakes(mode)
  // 'none' (Letters Only) has no mistake-reactive art - nothing for the mistake-stepping half of
  // this cycle (runMistakeLoop below) to animate. It still has its own one-time reveal worth
  // replaying on a loop now that it draws its letters in (SketchLetter) rather than rendering
  // static text, so it's not exempted from this hook entirely - see the `animated` branch below,
  // which skips straight from one remount to the next, holding on the resting frame in between
  // rather than stepping through mistakes it doesn't have.
  const animated = mode.behavior !== 'none'
  const isClassic = mode.id === SCAFFOLDED_MODE_ID

  const [mistakes, setMistakes] = useState(startBlank ? 0 : restMistakes)
  // Whether the scene on screen is still the blank one it mounted with (startBlank), so the first run
  // skips the entry fade. Effect-only, never read during render.
  const blankSceneRef = useRef(startBlank)
  const [revealKey, setRevealKey] = useState(0)
  const cardOpacity = useSharedValue(1)
  const partsOpacity = useSharedValue(1)

  useEffect(() => {
    if (!isFocused) {
      // Snapped, not faded - this card isn't visible mid-transition to begin with (it's the one
      // losing focus as the carousel settles elsewhere), so there's nothing for a tween to show.
      // No setMistakes call here: the returned `mistakes` below already masks stale state at the
      // source whenever unfocused, so there's nothing for this effect itself to reset.
      cardOpacity.value = 1
      partsOpacity.value = 1
      return
    }

    // ModePickerDrawer stays mounted (translated off-screen) while closed, and Home stays mounted under
    // the loadout and the game, so without this the cycle would keep re-rendering and remounting its
    // art forever in the background. It also kept every test that renders a screen holding one of
    // these feeding React a never-ending stream of real-timer updates. Bailing out here,
    // rather than through the snap above, leaves whatever frame was showing in place for the close
    // slide-out; the next open (which re-syncs focus, see ModePickerDrawer's own prevVisible) flips
    // this back and restarts from the entry fade below.
    if (paused) return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    if (!animated) {
      // No mistakes to step through, just the one-time reveal itself, replayed on a loop: fade
      // out, remount (revealKey forces SketchLetter's own draw-in to play fresh, same trick the
      // animated branch below uses), hold on the resting frame, repeat. Shown first: a pause that
      // landed mid-fade (the drawer closing, Home being covered) left it at whatever opacity it had,
      // and this branch's first fade is a whole hold away.
      cardOpacity.value = 1
      const runStaticLoop = () => {
        cardOpacity.value = withTiming(0, { duration: FADE_MS })
        timeoutId = setTimeout(() => {
          if (cancelled) return
          setRevealKey((key) => key + 1)
          cardOpacity.value = 1
          timeoutId = setTimeout(runStaticLoop, SCENE_REVEAL_HOLD_MS + DEMO_HOLD_MS)
        }, FADE_MS)
      }
      timeoutId = setTimeout(runStaticLoop, SCENE_REVEAL_HOLD_MS + DEMO_HOLD_MS)
      return () => {
        cancelled = true
        clearTimeout(timeoutId)
      }
    }

    const runMistakeLoop = () => {
      let step = 0
      const advanceMistakes = () => {
        if (cancelled) return
        if (step > mode.maxMistakes) {
          if (isClassic) {
            partsOpacity.value = withTiming(0, { duration: FADE_MS })
            timeoutId = setTimeout(() => {
              if (cancelled) return
              setMistakes(0)
              partsOpacity.value = 1
              step = 0
              advanceMistakes()
            }, FADE_MS)
          } else {
            cardOpacity.value = withTiming(0, { duration: FADE_MS })
            timeoutId = setTimeout(() => {
              if (cancelled) return
              setMistakes(0)
              setRevealKey((key) => key + 1)
              cardOpacity.value = 1
              step = 0
              timeoutId = setTimeout(advanceMistakes, SCENE_REVEAL_HOLD_MS)
            }, FADE_MS)
          }
          return
        }
        setMistakes(step)
        const isLastStep = step === mode.maxMistakes
        step += 1
        timeoutId = setTimeout(advanceMistakes, isLastStep ? DEMO_HOLD_MS : DEMO_STEP_MS)
      }
      advanceMistakes()
    }

    // Entry, from a scene that mounted blank and is drawing itself in already: just wait out that
    // reveal before the loop starts touching mistakes.
    if (blankSceneRef.current) {
      blankSceneRef.current = false
      timeoutId = setTimeout(runMistakeLoop, SCENE_REVEAL_HOLD_MS)
      return () => {
        cancelled = true
        clearTimeout(timeoutId)
      }
    }

    // Entry: fade the resting preview out, swap to a blank/fresh scene while invisible, then reveal
    // it (a real mount, so every started-gated part replays its own sketch-in) before the loop above
    // starts touching mistakes.
    cardOpacity.value = withTiming(0, { duration: FADE_MS })
    timeoutId = setTimeout(() => {
      if (cancelled) return
      setMistakes(0)
      setRevealKey((key) => key + 1)
      cardOpacity.value = 1
      partsOpacity.value = 1
      timeoutId = setTimeout(runMistakeLoop, SCENE_REVEAL_HOLD_MS)
    }, FADE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode/isClassic/restMistakes are fixed for a given card instance; only isFocused/paused should retrigger this
  }, [isFocused, paused])

  return { mistakes: animated && isFocused ? mistakes : restMistakes, revealKey, cardOpacity, partsOpacity }
}
