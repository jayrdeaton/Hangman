import { act, renderHook } from '@testing-library/react-native'

import { useArtDemoLoop } from '@/hooks/useArtDemoLoop'
import { candleMode, classicMode, lettersMode } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'

// The loop's own beats (see useArtDemoLoop.ts): FADE_MS 200, SCENE_REVEAL_HOLD_MS 2000,
// DEMO_STEP_MS 500, DEMO_HOLD_MS 1000. The reanimated mock's withTiming hands back its target, so a
// fade lands on its shared value the moment it starts.
const FADE = 200
const REVEAL_HOLD = 2000
const STEP = 500

type Props = { isFocused: boolean; paused: boolean; mode: GameMode; startBlank?: boolean }

const renderLoop = (props: Props) => renderHook(({ isFocused, paused, mode, startBlank }: Props) => useArtDemoLoop(isFocused, paused, mode, startBlank), { initialProps: props })

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

// The timeouts scheduled and neither cleared nor run yet. jest.getTimerCount() can't answer this on
// its own: it also counts React's own pending work, which has nothing to do with the loop.
let pendingTimeouts: Set<unknown>
const trackTimeouts = () => {
  const pending = new Set<unknown>()
  const fakeSetTimeout = global.setTimeout
  const fakeClearTimeout = global.clearTimeout
  jest.spyOn(global, 'setTimeout').mockImplementation(((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    const id = fakeSetTimeout(() => {
      pending.delete(id)
      callback(...args)
    }, ms)
    pending.add(id)
    return id
  }) as typeof setTimeout)
  jest.spyOn(global, 'clearTimeout').mockImplementation(((id?: Parameters<typeof clearTimeout>[0]) => {
    pending.delete(id)
    fakeClearTimeout(id)
  }) as typeof clearTimeout)
  return pending
}

describe('useArtDemoLoop', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    pendingTimeouts = trackTimeouts()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  // Home's hero: nobody has seen a resting frame yet, so there's nothing to fade out of. The scene
  // mounts blank, draws itself in, and the loop waits out that reveal before the first step.
  it('with startBlank, starts on a blank scene with no entry fade and waits out its reveal', async () => {
    const { result } = await renderLoop({ isFocused: true, paused: false, mode: classicMode, startBlank: true })

    expect(result.current.mistakes).toBe(0)
    expect(result.current.revealKey).toBe(0)
    expect(result.current.cardOpacity.value).toBe(1)

    // Past where an entry fade would have remounted the scene: nothing moved.
    await advance(FADE)
    expect(result.current.revealKey).toBe(0)
    expect(result.current.cardOpacity.value).toBe(1)
    expect(result.current.mistakes).toBe(0)

    // Still inside the reveal hold.
    await advance(REVEAL_HOLD - FADE + STEP - 1)
    expect(result.current.mistakes).toBe(0)

    // The first step lands one DEMO_STEP_MS after the loop starts at REVEAL_HOLD.
    await advance(1)
    expect(result.current.mistakes).toBe(1)
    expect(result.current.revealKey).toBe(0)
  })

  // The carousel's cards: the resting "fully drawn" preview shows first, then fades out, remounts
  // blank while invisible, and the build starts after the fresh scene's reveal.
  it('by default starts on the resting frame, then fades it out and remounts a blank scene', async () => {
    const { result } = await renderLoop({ isFocused: true, paused: false, mode: classicMode })

    // Classic grows a figure, so its fullest frame is maxMistakes. The entry fade has already begun.
    expect(result.current.mistakes).toBe(classicMode.maxMistakes)
    expect(result.current.revealKey).toBe(0)
    expect(result.current.cardOpacity.value).toBe(0)

    await advance(FADE)
    expect(result.current.mistakes).toBe(0)
    expect(result.current.revealKey).toBe(1)
    expect(result.current.cardOpacity.value).toBe(1)

    await advance(REVEAL_HOLD + STEP)
    expect(result.current.mistakes).toBe(1)
  })

  it("rests a mode that wears away (Candle) at 0, its fullest frame, before the entry fade's remount", async () => {
    const { result } = await renderLoop({ isFocused: true, paused: false, mode: candleMode })

    expect(result.current.mistakes).toBe(0)
    expect(result.current.revealKey).toBe(0)

    await advance(FADE)
    expect(result.current.revealKey).toBe(1)
  })

  // Classic keeps its gallows across cycles: only the figure fades and the build starts over, with
  // no remount and no reveal hold.
  it('loops Classic by fading only its parts, without remounting the scene', async () => {
    const { result } = await renderLoop({ isFocused: true, paused: false, mode: classicMode, startBlank: true })

    // t = 2000 + 6 steps: fully built, holding.
    await advance(REVEAL_HOLD + classicMode.maxMistakes * STEP)
    expect(result.current.mistakes).toBe(classicMode.maxMistakes)

    // The 1000ms hold ends: the figure fades, the card doesn't.
    await advance(1000)
    expect(result.current.partsOpacity.value).toBe(0)
    expect(result.current.cardOpacity.value).toBe(1)

    await advance(FADE)
    expect(result.current.mistakes).toBe(0)
    expect(result.current.partsOpacity.value).toBe(1)
    expect(result.current.revealKey).toBe(0)

    // Straight into the next build.
    await advance(STEP)
    expect(result.current.mistakes).toBe(1)
  })

  it('loops every other mode by fading the whole card and remounting it for a fresh reveal', async () => {
    const { result } = await renderLoop({ isFocused: true, paused: false, mode: candleMode, startBlank: true })

    await advance(REVEAL_HOLD + candleMode.maxMistakes * STEP + 1000)
    expect(result.current.cardOpacity.value).toBe(0)

    await advance(FADE)
    expect(result.current.mistakes).toBe(0)
    expect(result.current.revealKey).toBe(1)
    expect(result.current.cardOpacity.value).toBe(1)

    // The fresh scene's reveal hold comes before the next build.
    await advance(REVEAL_HOLD + STEP - 1)
    expect(result.current.mistakes).toBe(0)
    await advance(1)
    expect(result.current.mistakes).toBe(1)
  })

  // Letters Only has no mistake-reactive art: it only replays its own draw-in, on a loop.
  it('replays Letters Only by remounting it, never stepping its mistakes', async () => {
    const { result } = await renderLoop({ isFocused: true, paused: false, mode: lettersMode })

    expect(result.current.mistakes).toBe(0)
    await advance(REVEAL_HOLD + 1000 + FADE)
    expect(result.current.revealKey).toBe(1)
    await advance(REVEAL_HOLD + 1000 + FADE)
    expect(result.current.revealKey).toBe(2)
    expect(result.current.mistakes).toBe(0)
  })

  it('never starts while paused, and leaves no timer behind', async () => {
    const { result } = await renderLoop({ isFocused: true, paused: true, mode: classicMode })

    expect(pendingTimeouts.size).toBe(0)
    await advance(10000)
    expect(result.current.mistakes).toBe(classicMode.maxMistakes)
    expect(result.current.revealKey).toBe(0)
  })

  // Home covered by another screen, or the drawer closed: the frame on screen stays put, and nothing
  // keeps re-rendering behind it.
  it('stops mid-cycle when paused, holding its frame, and restarts from the entry fade when unpaused', async () => {
    const { result, rerender } = await renderLoop({ isFocused: true, paused: false, mode: classicMode, startBlank: true })

    await advance(REVEAL_HOLD + 3 * STEP)
    expect(result.current.mistakes).toBe(3)

    await rerender({ isFocused: true, paused: true, mode: classicMode, startBlank: true })
    expect(pendingTimeouts.size).toBe(0)

    // Several full cycles' worth of time.
    await advance(20000)
    expect(result.current.mistakes).toBe(3)
    expect(result.current.revealKey).toBe(0)

    // Unpaused, the scene on screen is no longer the blank one it mounted with, so the entry fade
    // runs: out, remount blank, then the build again.
    await rerender({ isFocused: true, paused: false, mode: classicMode, startBlank: true })
    expect(result.current.cardOpacity.value).toBe(0)
    await advance(FADE)
    expect(result.current.mistakes).toBe(0)
    expect(result.current.revealKey).toBe(1)
    await advance(REVEAL_HOLD + STEP)
    expect(result.current.mistakes).toBe(1)
  })

  // Letters Only's next fade is a whole hold away once it restarts, so a pause that landed mid-fade
  // must not leave the card invisible for that hold.
  it('shows Letters Only again the moment it unpauses after a pause mid-fade', async () => {
    const { result, rerender } = await renderLoop({ isFocused: true, paused: false, mode: lettersMode })

    // The hold ends and the fade out begins.
    await advance(REVEAL_HOLD + 1000)
    expect(result.current.cardOpacity.value).toBe(0)

    // Paused before the remount brings it back.
    await advance(FADE / 2)
    await rerender({ isFocused: true, paused: true, mode: lettersMode })
    expect(pendingTimeouts.size).toBe(0)
    expect(result.current.cardOpacity.value).toBe(0)
    expect(result.current.revealKey).toBe(0)

    await rerender({ isFocused: true, paused: false, mode: lettersMode })
    expect(result.current.cardOpacity.value).toBe(1)

    // Then a full hold on screen before the next fade and remount.
    await advance(REVEAL_HOLD + 1000 - 1)
    expect(result.current.cardOpacity.value).toBe(1)
    expect(result.current.revealKey).toBe(0)
    await advance(1)
    expect(result.current.cardOpacity.value).toBe(0)
    await advance(FADE)
    expect(result.current.revealKey).toBe(1)
    expect(result.current.cardOpacity.value).toBe(1)
  })

  it('shows the resting frame at full opacity while unfocused, with no timer running', async () => {
    const { result, rerender } = await renderLoop({ isFocused: true, paused: false, mode: classicMode, startBlank: true })
    await advance(REVEAL_HOLD + 2 * STEP)
    expect(result.current.mistakes).toBe(2)

    await rerender({ isFocused: false, paused: false, mode: classicMode, startBlank: true })

    expect(result.current.mistakes).toBe(classicMode.maxMistakes)
    expect(result.current.cardOpacity.value).toBe(1)
    expect(result.current.partsOpacity.value).toBe(1)
    expect(pendingTimeouts.size).toBe(0)
  })

  it('leaves no timer behind after unmounting mid-cycle', async () => {
    const { unmount } = await renderLoop({ isFocused: true, paused: false, mode: candleMode, startBlank: true })
    await advance(REVEAL_HOLD + 2 * STEP)
    expect(pendingTimeouts.size).toBe(1)

    await unmount()

    expect(pendingTimeouts.size).toBe(0)
  })
})
