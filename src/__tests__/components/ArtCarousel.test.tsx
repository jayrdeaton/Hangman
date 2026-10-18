import { type Profile, profilesActions } from '@tastic/profile'
import { act, fireEvent, render } from '@testing-library/react-native'
import { FlatList } from 'react-native'

import { ArtCarousel } from '@/components/ArtCarousel'
import { Providers } from '@/components/Providers'
import { useArtDemoLoop } from '@/hooks/useArtDemoLoop'
import { DEFAULT_MODE, robotMode, VISIBLE_MODES } from '@/modes/registry'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { roundActions, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY } from '@/utils/players'

// The loop itself has its own suite (useArtDemoLoop.test.ts). Here it only records what each card asked
// of it (whether it's the one playing, whether it's paused), and runs no timers.
jest.mock('@/hooks/useArtDemoLoop', () => {
  const { fullyDrawnMistakes } = jest.requireActual('@/modes/shared/fullyDrawnMistakes')
  return { useArtDemoLoop: jest.fn((_focused: boolean, _paused: boolean, mode: never) => ({ mistakes: fullyDrawnMistakes(mode), revealKey: 0, cardOpacity: { value: 1 }, partsOpacity: { value: 1 }, replay: () => {} })) }
})

// The art isn't this component's concern (see GameVisual's and the modes' own suites).
jest.mock('@/components/GameVisual', () => {
  const { createElement } = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return { GameVisual: ({ mode }: { mode: { id: string } }) => createElement(View, { testID: `game-visual-${mode.id}` }) }
})

const mockLoop = jest.mocked(useArtDemoLoop)

// The jest preset's window is 750 wide, and a card is the whole width on a phone.
const PAGE = 750
const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }

const carousel = (paused = false) => (
  <Providers>
    <ArtCarousel paused={paused} artHeight={150} />
  </Providers>
)
const renderCarousel = (paused = false) => render(carousel(paused))
type Screen = Awaited<ReturnType<typeof renderCarousel>>

// What each card last asked its loop: [focused, paused], by art id.
const loopState = () => {
  const state = new Map<string, [boolean, boolean]>()
  for (const [focused, paused, mode] of mockLoop.mock.calls) state.set(mode.id, [focused, paused])
  return state
}
const playing = () => [...loopState()].filter(([, [focused]]) => focused).map(([id]) => id)
const art = () => store.getState().playerSettings[GUEST_PLAYER_KEY]?.modeId ?? DEFAULT_MODE.id
const indexOf = (id: string) => VISIBLE_MODES.findIndex((mode) => mode.id === id)
// The list renders the cards before the one it starts on in a later batch, behind VirtualizedList's
// own 50ms timer: letting it land inside act keeps it from firing as an un-acted update.
const flushListBatch = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
const settleOn = (screen: Screen, x: number) => fireEvent.scroll(screen.getByTestId('art-carousel'), { nativeEvent: { contentOffset: { x, y: 0 } } })

describe('ArtCarousel', () => {
  beforeEach(() => {
    mockLoop.mockClear()
    store.dispatch(roundActions.reset())
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
    store.dispatch(profilesActions.setAll([]))
  })

  afterEach(flushListBatch)

  it('has a card for every art the picker offers', async () => {
    store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: VISIBLE_MODES[0].id }))
    const screen = await renderCarousel()

    for (const mode of VISIBLE_MODES) expect(screen.getByTestId(`art-card-${mode.id}`)).toBeTruthy()
  })

  it("starts on the player's art, the only card playing", async () => {
    store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: robotMode.id }))
    const screen = await renderCarousel()

    expect(screen.getByTestId('art-carousel').props.initialScrollIndex).toBe(indexOf(robotMode.id))
    expect(screen.getByTestId(`art-card-${robotMode.id}`)).toBeTruthy()
    expect(playing()).toEqual([robotMode.id])
  })

  it("makes the card it settles on the player's art, live, redrawing their waiting round", async () => {
    store.dispatch(roundActions.startSolo({ playerKey: GUEST_PLAYER_KEY, puzzle: { phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random' } }))
    const screen = await renderCarousel()
    const target = VISIBLE_MODES[3]

    await settleOn(screen, 3 * PAGE)

    expect(art()).toBe(target.id)
    expect(selectSoloRound(store.getState().round, GUEST_PLAYER_KEY).puzzle?.modeId).toBe(target.id)
    // Only the card it settled on plays; the one it left rests.
    expect(playing()).toEqual([target.id])
  })

  it('picks nothing while a scroll is between cards, then settles on the nearest', async () => {
    const screen = await renderCarousel()
    const before = art()

    await settleOn(screen, 2 * PAGE + 200)
    expect(art()).toBe(before)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    expect(art()).toBe(VISIBLE_MODES[2].id)
  })

  it('pauses every card while it is paused', async () => {
    const screen = await renderCarousel()
    expect([...loopState().values()].every(([, paused]) => !paused)).toBe(true)

    await screen.rerender(carousel(true))

    expect([...loopState().values()].every(([, paused]) => paused)).toBe(true)
  })

  // Another player picked (the player picker), or the art picked somewhere else (the Settings sheet).
  it("follows the art when it changes from elsewhere, moving to that player's card", async () => {
    store.dispatch(profilesActions.setAll([ALICE]))
    store.dispatch(playerSettingsActions.setMode({ playerKey: ALICE.id, modeId: robotMode.id }))
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset')
    await renderCarousel()

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
    })

    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: indexOf(robotMode.id) * PAGE, animated: false })
    expect(playing()).toEqual([robotMode.id])
    scrollToOffset.mockRestore()
  })

  // Its own settle is already where the list is: moving it again would stop a fling going past.
  it("doesn't move the list to a card it settled on itself", async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset')
    const screen = await renderCarousel()

    await settleOn(screen, 4 * PAGE)

    expect(art()).toBe(VISIBLE_MODES[4].id)
    expect(scrollToOffset).not.toHaveBeenCalled()
    scrollToOffset.mockRestore()
  })

  // Swiping isn't reachable by a screen reader, so each card is adjustable instead.
  describe('for a screen reader', () => {
    const card = (screen: Screen, id: string) => screen.getByTestId(`art-card-${id}`)

    it("names each card's art, says which is picked and where it is, and offers Next and Previous", async () => {
      const screen = await renderCarousel()
      const picked = card(screen, DEFAULT_MODE.id)
      const other = card(screen, robotMode.id)

      expect(picked.props.accessibilityLabel).toBe(`${DEFAULT_MODE.label} art`)
      expect(picked.props.accessibilityRole).toBe('adjustable')
      expect(picked.props.accessibilityState).toEqual({ selected: true })
      expect(other.props.accessibilityState).toEqual({ selected: false })
      expect(picked.props.accessibilityValue).toEqual({ text: `${indexOf(DEFAULT_MODE.id) + 1} of ${VISIBLE_MODES.length}` })
      expect(picked.props.accessibilityActions.map(({ name }: { name: string }) => name)).toEqual(['increment', 'decrement'])
    })

    it('picks the next art and the previous one, moving the list to it', async () => {
      const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset')
      const screen = await renderCarousel()
      const start = indexOf(DEFAULT_MODE.id)

      await fireEvent(card(screen, DEFAULT_MODE.id), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
      expect(art()).toBe(VISIBLE_MODES[start + 1].id)
      expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: (start + 1) * PAGE, animated: false })

      await fireEvent(card(screen, VISIBLE_MODES[start + 1].id), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
      expect(art()).toBe(DEFAULT_MODE.id)
      scrollToOffset.mockRestore()
    })

    it('goes no further than the first and last arts', async () => {
      const first = VISIBLE_MODES[0]
      const last = VISIBLE_MODES[VISIBLE_MODES.length - 1]
      store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: first.id }))
      const screen = await renderCarousel()

      await fireEvent(card(screen, first.id), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } })
      expect(art()).toBe(first.id)

      await act(async () => {
        store.dispatch(playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: last.id }))
      })
      await fireEvent(card(screen, last.id), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
      expect(art()).toBe(last.id)
    })
  })
})
