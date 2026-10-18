import { getTriadicPalette } from '@rific/auto-paper'
import { type Profile, profilesActions } from '@tastic/profile'
import { act, fireEvent, render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { ManageProfilesScreen } from '@/components/ManageProfilesScreen'
import { Providers } from '@/components/Providers'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { roundActions } from '@/redux/roundSlice'
import { store } from '@/redux/store'

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }

const renderScreen = (onBack = jest.fn()) =>
  render(
    <Providers>
      <ManageProfilesScreen onBack={onBack} />
    </Providers>
  )
type Screen = Awaited<ReturnType<typeof renderScreen>>

const roster = () => store.getState().profiles
const nameField = (screen: Screen) => screen.getByPlaceholderText('Name')

// The edit row's delete toggle: the pressable right after the Name field, with nothing in it under the
// shared icon mock, which draws Paper's icons as nothing (the toggle has no label of its own).
type HostNode = { parent: HostNode | null; children: (HostNode | string)[]; props: { accessible?: boolean } }
const deleteToggle = (screen: Screen) => {
  let node = nameField(screen) as unknown as HostNode
  while (node.parent) {
    const siblings = node.parent.children.filter((child): child is HostNode => typeof child !== 'string')
    const next = siblings[siblings.indexOf(node) + 1]
    if (next?.props.accessible && next.children.length === 0) return next as unknown as Parameters<typeof fireEvent.press>[0]
    node = node.parent
  }
  throw new Error('no delete toggle beside the Name field')
}

// Every react-native-svg Path's fill in the rendered tree (the svg mock renders each as a host element
// of that name), for reading the palette swatches.
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

// The /profiles route's screen: the fleet's roster screen (@tastic/profile's ProfilesScreen) over the
// app's own roster, through ProfilesProvider. The roster screen's own editing is the package's to test;
// this is the wiring.
describe('ManageProfilesScreen', () => {
  beforeEach(() => {
    store.dispatch(profilesActions.setAll([ALICE]))
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
    store.dispatch(playerThemeActions.reset())
    store.dispatch(roundActions.reset())
    store.dispatch(achievementsActions.reset())
  })

  it('lists the roster, with a New Profile row, transparent over the board', async () => {
    const screen = await renderScreen()

    expect(screen.getByText('Profiles')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('New Profile')).toBeTruthy()
    const shell = screen.getByTestId('profiles-screen').children[0] as unknown as { children: { props: { style: unknown } }[] }
    expect(StyleSheet.flatten(shell.children[0].props.style)).toMatchObject({ backgroundColor: 'transparent' })
  })

  it('makes a new profile, starting on the first swatch', async () => {
    const screen = await renderScreen()

    await fireEvent.press(screen.getByText('New Profile'))
    await fireEvent.changeText(nameField(screen), 'Daisy')
    await fireEvent(nameField(screen), 'submitEditing')

    expect(roster()).toHaveLength(2)
    expect(roster().find((profile) => profile.name === 'Daisy')).toMatchObject({ color: '#f44336', tag: 'D' })
  })

  it('renames a profile', async () => {
    const screen = await renderScreen()

    await fireEvent.press(screen.getByText('Alice'))
    await fireEvent.changeText(nameField(screen), 'Ali')
    await fireEvent(nameField(screen), 'submitEditing')

    expect(roster()).toEqual([expect.objectContaining({ id: ALICE.id, name: 'Ali', color: ALICE.color })])
  })

  it('deletes a profile once its confirm is accepted, forgetting what Hangman kept for them', async () => {
    store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
    store.dispatch(playerSettingsActions.setDifficulty({ playerKey: ALICE.id, difficulty: 'hard' }))
    const screen = await renderScreen()

    await fireEvent.press(screen.getByText('Alice'))
    await fireEvent.press(deleteToggle(screen))
    expect(screen.getByText('Delete Profile?')).toBeTruthy()
    await fireEvent.press(screen.getByText('Delete'))

    expect(roster()).toEqual([])
    expect(store.getState().activePlayer.profileId).toBeNull()
    expect(store.getState().playerSettings[ALICE.id]).toBeUndefined()
  })

  // The web keeps a left screen mounted, so the edit can't wait for an unmount to be saved.
  it('goes back from its arrow, saving an edit in progress first', async () => {
    const onBack = jest.fn()
    const screen = await renderScreen(onBack)

    await fireEvent.press(screen.getByText('Alice'))
    await fireEvent.changeText(nameField(screen), 'Ali')
    await fireEvent.press(screen.getByLabelText('Back'))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(roster()[0].name).toBe('Ali')
  })

  it("draws each profile's chip as its palette, in that player's own harmony", async () => {
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: ALICE.id, theme: { color: '#2196f3', harmony: 'square', profileColor: ALICE.color } }))
    const screen = await renderScreen()

    const { secondary, tertiary } = getTriadicPalette(ALICE.color, 'square')
    expect(pathFills(screen.toJSON())).toEqual(expect.arrayContaining([secondary, tertiary]))
  })

  it("follows the roster as it changes elsewhere (another game's edit)", async () => {
    const screen = await renderScreen()

    await act(async () => {
      store.dispatch(profilesActions.update({ id: ALICE.id, patch: { name: 'Alicia' } }))
    })

    expect(screen.getByText('Alicia')).toBeTruthy()
  })
})
