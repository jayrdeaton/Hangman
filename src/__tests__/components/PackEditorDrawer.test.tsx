import { ToastProvider } from '@rific/toaster'
import { profilesActions } from '@tastic/profile'
import { fireEvent, render as rtlRender, waitFor } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { PaperProvider } from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { PackEditorDrawer } from '@/components/PackEditorDrawer'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { store } from '@/redux/store'
import { loadCustomPacksCache } from '@/utils/customPacks'

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// Only success() is read by PackEditorDrawer; the real ToastProvider still wraps every render.
const mockSuccess = jest.fn()
jest.mock('@rific/toaster', () => ({
  ...jest.requireActual('@rific/toaster'),
  useToast: () => ({ success: mockSuccess })
}))

// ConfirmDialog renders through a react-native-paper Portal - needs a Portal.Host ancestor,
// normally supplied by @rific/auto-paper's Provider at the app root; same wrapper
// PacksScreen.test.tsx uses for its own Portal-based dialog.
// ToastProvider is also required: PackEditorDrawer's save flow calls useToast() to show a newly
// unlocked custom-pack achievement, and that hook throws outside a ToastProvider ancestor (normally
// supplied by Providers.tsx at the app root). So are the app's stats store and GameStatsProvider,
// which record the new pack (see useGameStats).
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <GameStatsProvider>
      <ToastProvider>
        <PaperProvider>{children}</PaperProvider>
      </ToastProvider>
    </GameStatsProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

// This file only covers what's specific to PackEditorDrawer's own shell - the accessibility-modal
// wiring every sibling drawer's test (ModePickerDrawer.test.tsx, PacksScreen.test.tsx) already
// checks for its own panel, which nothing exercised for this one since it used to be an in-place
// step inside PacksScreen rather than its own animated Drawer. Everything else about the form
// itself (save/delete/share/validation) is already covered thoroughly through PacksScreen.test.tsx.
describe('PackEditorDrawer', () => {
  beforeEach(async () => {
    // Resets customPacks.ts's module-level cache to empty via the always-null AsyncStorage mock,
    // matching PacksScreen.test.tsx's own setup, and starts every test from fresh stats.
    await loadCustomPacksCache()
    store.dispatch(achievementsActions.reset())
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(profilesActions.setAll([]))
    mockSuccess.mockClear()
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await render(<PackEditorDrawer visible editingKey={null} onDismiss={jest.fn()} onSaved={jest.fn()} onDelete={jest.fn()} onShare={jest.fn()} />)

    expect(getByTestId('pack-editor-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('pack-editor-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('pack-editor-panel').props.importantForAccessibility).toBe('yes')

    await rerender(
      <PaperProvider>
        <PackEditorDrawer visible={false} editingKey={null} onDismiss={jest.fn()} onSaved={jest.fn()} onDelete={jest.fn()} onShare={jest.fn()} />
      </PaperProvider>
    )

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it - includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('pack-editor-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('renders the create-pack form when editingKey is null', async () => {
    const { getByText, getByTestId, queryByLabelText } = await render(<PackEditorDrawer visible editingKey={null} onDismiss={jest.fn()} onSaved={jest.fn()} onDelete={jest.fn()} onShare={jest.fn()} />)

    expect(getByText('New Pack')).toBeTruthy()
    expect(getByTestId('pack-label-input')).toBeTruthy()
    // Nothing to share or delete yet - there's no saved pack behind a still-being-created one.
    expect(queryByLabelText('Share pack')).toBeNull()
    expect(queryByLabelText('Delete pack')).toBeNull()
  })

  it("toasts a new pack's unlocked achievement by name, captioned 'Achievement unlocked', in its tier's color with its icon", async () => {
    const { getByTestId, getByText } = await render(<PackEditorDrawer visible editingKey={null} onDismiss={jest.fn()} onSaved={jest.fn()} onDelete={jest.fn()} onShare={jest.fn()} />)

    await fireEvent.changeText(getByTestId('pack-label-input'), 'My Trip')
    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')
    await fireEvent.press(getByText('Save'))

    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith('Pack Rat', 'Achievement unlocked', undefined, { color: '#CD7F32', icon: 'folder-plus-outline' }))
    expect(mockSuccess).toHaveBeenCalledTimes(1)
    expect(store.getState().achievements.stats.customPacksCreated).toBe(1)
  })

  // Whoever is playing makes the pack, so it counts toward their own custom pack achievements, and
  // its toast names them (LightCycles' caption).
  it('counts a new pack for the active player, and names them under its unlock toast', async () => {
    store.dispatch(profilesActions.setAll([{ id: 'profile-a', name: 'Alice', color: '#2196f3', tag: 'A', createdAt: 1, updatedAt: 1 }]))
    store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    const { getByTestId, getByText } = await render(<PackEditorDrawer visible editingKey={null} onDismiss={jest.fn()} onSaved={jest.fn()} onDelete={jest.fn()} onShare={jest.fn()} />)

    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')
    await fireEvent.press(getByText('Save'))

    await waitFor(() => expect(mockSuccess).toHaveBeenCalledWith('Pack Rat', 'Alice unlocked', undefined, { color: '#CD7F32', icon: 'folder-plus-outline' }))
    expect(store.getState().achievements.stats.profiles['profile-a']?.customPacksCreated).toBe(1)
    expect(store.getState().achievements.unlocked).toHaveProperty('profile-a:first_custom_pack')
  })
})
