import { Provider } from '@rific/auto-paper'
import { act, fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { HeroTitle } from '@/components/HeroTitle'
import { sketchWordBlanksDrawnMs } from '@/components/SketchWord'
import { PuzzleDefaultsContext } from '@/hooks/usePuzzleDefaults'
import { candleMode, classicMode } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'

// A stand-in for the art that shows the `mistakes` the hero's demo loop feeds it, and records every
// mount and render by mode id, so a test can tell a fresh scene from the same one carrying on.
const mockArtEvents: string[] = []
jest.mock('@/components/GameVisual', () => {
  const { createElement, useEffect, useState } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return {
    GameVisual: ({ mode, mistakes }: { mode: { id: string }; mistakes: number }) => {
      mockArtEvents.push(`render:${mode.id}`)
      // The id it mounted with, so the effect runs once per mount.
      const [mountedId] = useState(mode.id)
      useEffect(() => {
        mockArtEvents.push(`mount:${mountedId}`)
      }, [mountedId])
      return createElement(Text, { testID: `hero-art-${mode.id}` }, mistakes)
    }
  }
})

const count = (event: string) => mockArtEvents.filter((entry) => entry === event).length

// The title as text, '_' for a blank, so a test can read how far it's been filled in. The sizing and
// timing helpers stay real.
jest.mock('@/components/SketchWord', () => {
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return {
    ...jest.requireActual('@/components/SketchWord'),
    SketchWord: ({ letters }: { letters: string[] }) => createElement(Text, { testID: 'hero-title' }, letters.join(''))
  }
})

// The loop's beats (see useArtDemoLoop.ts): the scene's own reveal, then one step per wrong guess.
const REVEAL_HOLD = 2000
const STEP = 500

// The player's art comes from the puzzle defaults; the colors and theme from auto-paper's Provider.
const Wrapper = ({ mode, children }: { mode: GameMode; children: ReactNode }) => (
  <Provider initialValue={{ appearance: 'light' }}>
    <PuzzleDefaultsContext.Provider value={{ mode, setMode: jest.fn(), difficulty: 'any', setDifficulty: jest.fn(), ready: true }}>{children}</PuzzleDefaultsContext.Provider>
  </Provider>
)
const hero = (mode: GameMode, paused: boolean) => (
  <Wrapper mode={mode}>
    <HeroTitle paused={paused} />
  </Wrapper>
)
const render = (mode: GameMode = classicMode, paused = false) => rtlRender(hero(mode, paused))

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

describe('HeroTitle', () => {
  beforeEach(() => {
    mockArtEvents.length = 0
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // One element for a screen reader: "Hangman, heading", not seven sketched letters and a drawing.
  it('is a single accessible header labeled Hangman', async () => {
    const { getByRole } = await render()

    expect(getByRole('header', { name: 'Hangman' })).toBeTruthy()
  })

  // Solved like a puzzle: every blank draws in first, then a beat later each gives way to its letter,
  // left to right, the way a right guess fills a blank on the board.
  describe('the title', () => {
    const FIRST_LETTER = sketchWordBlanksDrawnMs(7) + 150
    const LETTER_STAGGER = 120

    it('starts as seven blanks and fills them in one letter at a time once they are drawn', async () => {
      const { getByTestId } = await render()

      expect(getByTestId('hero-title').props.children).toBe('_______')
      await advance(FIRST_LETTER - 1)
      expect(getByTestId('hero-title').props.children).toBe('_______')
      await advance(1)
      expect(getByTestId('hero-title').props.children).toBe('H______')
      await advance(LETTER_STAGGER)
      expect(getByTestId('hero-title').props.children).toBe('HA_____')
      // One timer at a time: each letter schedules the next once it's on screen.
      for (let i = 0; i < 5; i++) await advance(LETTER_STAGGER)
      expect(getByTestId('hero-title').props.children).toBe('HANGMAN')
      // Done: nothing left scheduled for the title.
      await advance(10000)
      expect(getByTestId('hero-title').props.children).toBe('HANGMAN')
    })

    it('holds while Home is covered and picks up where it stopped', async () => {
      const { getByTestId, rerender } = await render()
      await advance(FIRST_LETTER)
      await advance(LETTER_STAGGER)
      expect(getByTestId('hero-title').props.children).toBe('HA_____')

      await rerender(hero(classicMode, true))
      await advance(10000)
      expect(getByTestId('hero-title').props.children).toBe('HA_____')

      await rerender(hero(classicMode, false))
      await advance(LETTER_STAGGER)
      expect(getByTestId('hero-title').props.children).toBe('HAN____')
    })

    it('fills nothing in while Home is covered from the start', async () => {
      const { getByTestId } = await render(classicMode, true)
      await advance(10000)

      expect(getByTestId('hero-title').props.children).toBe('_______')
    })
  })

  // Nobody has seen a resting frame yet at launch, so the art draws itself in from blank, then
  // acts out a round.
  it("draws the player's art in from blank, then steps through a round", async () => {
    const { getByTestId } = await render()

    expect(getByTestId('hero-art-classic').props.children).toBe(0)
    await advance(REVEAL_HOLD + 2 * STEP)
    expect(getByTestId('hero-art-classic').props.children).toBe(2)
  })

  // Jay, 2026-10-18: the hero doesn't need to keep animating. One round, then the finished figure
  // stays, even after Home has been covered and uncovered.
  it('acts out one round, then holds the finished picture for good', async () => {
    const { getByTestId, rerender } = await render()
    const art = () => getByTestId('hero-art-classic').props.children

    await advance(REVEAL_HOLD + classicMode.maxMistakes * STEP + 1000)
    expect(art()).toBe(classicMode.maxMistakes)
    const rendersWhenSettled = count('render:classic')

    await advance(20000)
    await rerender(hero(classicMode, true))
    await rerender(hero(classicMode, false))
    await advance(20000)

    expect(art()).toBe(classicMode.maxMistakes)
    expect(count('mount:classic')).toBe(1)
    // The two rerenders above, and nothing of the art's own.
    expect(count('render:classic')).toBe(rendersWhenSettled + 2)
  })

  // Just for fun (Jay, 2026-10-18): pressing the art plays the round again, and only the round: the
  // figure is drawn back in under the same gallows (no remount), and the title stays solved.
  it('plays the round again when the art is pressed, keeping the gallows up and the title solved', async () => {
    const { getByTestId } = await render()
    const art = () => getByTestId('hero-art-classic').props.children
    const title = () => getByTestId('hero-title').props.children
    // In small steps: the title schedules each letter once the last is on screen.
    for (let elapsed = 0; elapsed < REVEAL_HOLD + classicMode.maxMistakes * STEP + 1000; elapsed += 100) await advance(100)
    expect(art()).toBe(classicMode.maxMistakes)
    expect(title()).toBe('HANGMAN')

    await fireEvent.press(getByTestId('hero-art-replay'))
    // The figure fades, then the round starts over straight away: no reveal hold, the gallows never left.
    await advance(200)
    expect(art()).toBe(0)
    await advance(STEP)
    expect(art()).toBe(1)
    await advance((classicMode.maxMistakes - 1) * STEP + 1000)
    expect(art()).toBe(classicMode.maxMistakes)

    expect(count('mount:classic')).toBe(1)
    expect(title()).toBe('HANGMAN')
  })

  // Home stays mounted under the loadout, the game and Stats: covered, the art holds its frame and
  // nothing behind the screen in front keeps re-rendering.
  it('holds its frame with no further renders while paused, and plays its round again when uncovered before it finished', async () => {
    const { getByTestId, rerender } = await render()
    const art = () => getByTestId('hero-art-classic').props.children
    await advance(REVEAL_HOLD + 3 * STEP)
    expect(art()).toBe(3)

    await rerender(hero(classicMode, true))
    const rendersWhilePaused = count('render:classic')
    await advance(20000)

    expect(art()).toBe(3)
    expect(count('render:classic')).toBe(rendersWhilePaused)

    // Uncovered: the entry fade runs, the scene remounts blank, and the build starts over.
    await rerender(hero(classicMode, false))
    await advance(200)
    expect(art()).toBe(0)
    expect(count('mount:classic')).toBe(2)
    await advance(REVEAL_HOLD + STEP)
    expect(art()).toBe(1)
  })

  // The loop reads the mode once, so new art picked in the Settings sheet needs a fresh hero art, with
  // its own draw-in, rather than the old loop carrying on with the new picture.
  it('starts the art over, from blank, when the player picks new art', async () => {
    const { getByTestId, queryByTestId, rerender } = await render()
    await advance(REVEAL_HOLD + 3 * STEP)
    expect(getByTestId('hero-art-classic').props.children).toBe(3)

    await rerender(hero(candleMode, false))
    const art = () => getByTestId('hero-art-candle').props.children

    expect(queryByTestId('hero-art-classic')).toBeNull()
    expect(count('mount:candle')).toBe(1)
    expect(art()).toBe(0)

    // Classic's loop would have stepped again by now; the new art is still in its own reveal hold.
    await advance(REVEAL_HOLD + STEP - 1)
    expect(art()).toBe(0)
    await advance(1)
    expect(art()).toBe(1)
  })

  // Art is picked in the Settings sheet, which pauses the hero under it: the new art draws itself in
  // once the sheet is gone, where the player can watch it, not behind the sheet.
  it('keeps the old art, frozen, while new art is picked over a paused hero, then draws the new art in once uncovered', async () => {
    const { getByTestId, queryByTestId, rerender } = await render()
    await advance(REVEAL_HOLD + 3 * STEP)
    await rerender(hero(classicMode, true))

    await rerender(hero(candleMode, true))
    await advance(20000)

    expect(getByTestId('hero-art-classic').props.children).toBe(3)
    expect(queryByTestId('hero-art-candle')).toBeNull()
    expect(count('render:candle')).toBe(0)

    await rerender(hero(candleMode, false))
    const art = () => getByTestId('hero-art-candle').props.children

    expect(queryByTestId('hero-art-classic')).toBeNull()
    expect(count('mount:candle')).toBe(1)
    expect(art()).toBe(0)
    await advance(REVEAL_HOLD + STEP)
    expect(art()).toBe(1)
  })
})
