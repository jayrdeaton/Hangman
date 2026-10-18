import { getTriadicPalette, Provider as AutoPaperProvider } from '@rific/auto-paper'
import { type Profile, ProfileChip, profilesActions } from '@tastic/profile'
import { act, render } from '@testing-library/react-native'
import { Provider as ReduxProvider } from 'react-redux'

import { HarmonySwatches, PlayerSwatches } from '@/components/PlayerSwatches'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { DEFAULT_HARMONY, playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { guestSeatKey } from '@/utils/players'

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }
const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'B', createdAt: 2, updatedAt: 2 }

// Every react-native-svg Path's fill (the svg mock renders each as a host element of that name): the
// secondary and tertiary of each swatch drawn.
const pathFills = (tree: unknown): unknown[] => {
  const fills: unknown[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    const { type, props, children } = node as { type: string; props: { fill?: unknown }; children: unknown[] | null }
    if (type === 'Path') fills.push(props.fill)
    children?.forEach(walk)
  }
  walk(tree)
  return fills
}
const triad = (color: string, harmony: Parameters<typeof getTriadicPalette>[1]) => {
  const { secondary, tertiary } = getTriadicPalette(color, harmony)
  return [secondary, tertiary]
}

describe('PlayerSwatches', () => {
  beforeEach(() => {
    store.dispatch(profilesActions.setAll([ALICE, BOB]))
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerThemeActions.reset())
  })

  const renderChips = () =>
    render(
      <ReduxProvider store={store}>
        <PlayerSwatches>
          <ProfileChip profile={ALICE} />
          <ProfileChip profile={BOB} />
        </PlayerSwatches>
      </ReduxProvider>
    )

  it("draws each profile's chip as its whole palette, in the harmony that player picked, or the default", async () => {
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: ALICE.id, theme: { color: '#2196f3', harmony: 'square', profileColor: ALICE.color } }))
    const screen = await renderChips()

    expect(pathFills(screen.toJSON())).toEqual([...triad(ALICE.color, 'square'), ...triad(BOB.color, DEFAULT_HARMONY)])
  })

  it('redraws when a player picks another harmony', async () => {
    const screen = await renderChips()

    await act(async () => {
      store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: BOB.id, theme: { color: BOB.color, harmony: 'analogous', profileColor: BOB.color } }))
    })

    expect(pathFills(screen.toJSON())).toEqual([...triad(ALICE.color, DEFAULT_HARMONY), ...triad(BOB.color, 'analogous')])
  })

  // Two profiles in one color: the one playing decides how it's drawn.
  it("draws a color two profiles share in the active player's harmony", async () => {
    const twin: Profile = { ...BOB, color: ALICE.color }
    store.dispatch(profilesActions.setAll([ALICE, twin]))
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: ALICE.id, theme: { color: ALICE.color, harmony: 'square', profileColor: ALICE.color } }))
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: twin.id, theme: { color: ALICE.color, harmony: 'triadic', profileColor: ALICE.color } }))
    store.dispatch(activePlayerActions.setActivePlayer(twin.id))
    const screen = await renderChips()

    expect(pathFills(screen.toJSON())).toEqual([...triad(ALICE.color, 'triadic'), ...triad(BOB.color, DEFAULT_HARMONY)])
  })
})

// Each Pass & Play guest seat is a player of its own (2026-10-18), with colors of its own.
describe('PlayerSwatches, for guest seats', () => {
  const CYAN = '#00bcd4'
  // A chip in the guest seat's color: the renderer only ever gets a color to go on.
  const stranger: Profile = { ...BOB, id: 'profile-s', color: CYAN }

  beforeEach(() => {
    store.dispatch(profilesActions.setAll([ALICE]))
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerThemeActions.reset())
    store.dispatch(roundActions.reset())
  })

  const renderChip = () =>
    render(
      <ReduxProvider store={store}>
        <PlayerSwatches>
          <ProfileChip profile={stranger} />
        </PlayerSwatches>
      </ReduxProvider>
    )

  it("draws a guest seat's color in that seat's own harmony", async () => {
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p2'), theme: { color: CYAN, harmony: 'square' } }))
    const screen = await renderChip()

    expect(pathFills(screen.toJSON())).toEqual(triad(CYAN, 'square'))
  })

  // Its colors go with the seat: a seat no longer at the table claims nothing.
  it("ignores a guest seat that isn't at the table", async () => {
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p9'), theme: { color: CYAN, harmony: 'square' } }))
    const screen = await renderChip()

    expect(pathFills(screen.toJSON())).toEqual(triad(CYAN, DEFAULT_HARMONY))
  })

  it('lets the active guest seat win a color it shares with another', async () => {
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p1'), theme: { color: CYAN, harmony: 'square' } }))
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: guestSeatKey('p2'), theme: { color: CYAN, harmony: 'analogous' } }))
    store.dispatch(activePlayerActions.setActivePlayer(null, 'p2'))
    const screen = await renderChip()

    expect(pathFills(screen.toJSON())).toEqual(triad(CYAN, 'analogous'))
  })
})

describe('HarmonySwatches', () => {
  it('draws every swatch in the harmony it is given, whoever it belongs to', async () => {
    store.dispatch(profilesActions.setAll([ALICE]))
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: ALICE.id, theme: { color: ALICE.color, harmony: 'square', profileColor: ALICE.color } }))
    const screen = await render(
      <ReduxProvider store={store}>
        <AutoPaperProvider initialValue={{ color: '#f44336', harmony: 'complementary' }}>
          <PlayerSwatches>
            <HarmonySwatches harmony='complementary'>
              <ProfileChip profile={ALICE} />
            </HarmonySwatches>
          </PlayerSwatches>
        </AutoPaperProvider>
      </ReduxProvider>
    )

    expect(pathFills(screen.toJSON())).toEqual(triad(ALICE.color, 'complementary'))
  })
})
