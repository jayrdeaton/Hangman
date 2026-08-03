import { render as rtlRender } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { PaperProvider } from 'react-native-paper'

import { PackEditorDrawer } from '@/components/PackEditorDrawer'
import { loadCustomPacksCache } from '@/utils/customPacks'

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// ConfirmDialog renders through a react-native-paper Portal — needs a Portal.Host ancestor,
// normally supplied by @rific/auto-paper's Provider at the app root; same wrapper
// PacksScreen.test.tsx/AchievementsDrawer.test.tsx use for their own Portal-based dialogs.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: PaperProvider })

// This file only covers what's specific to PackEditorDrawer's own shell — the accessibility-modal
// wiring every sibling drawer's test (PuzzleDrawer.test.tsx, AchievementsDrawer.test.tsx) already
// checks for its own panel, which nothing exercised for this one since it used to be an in-place
// step inside PacksScreen rather than its own animated Drawer. Everything else about the form
// itself (save/delete/share/validation) is already covered thoroughly through PacksScreen.test.tsx.
describe('PackEditorDrawer', () => {
  beforeEach(async () => {
    // Resets customPacks.ts's module-level cache to empty via the always-null AsyncStorage mock —
    // matches PacksScreen.test.tsx's own setup.
    await loadCustomPacksCache()
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
    // so RTL's default queries skip it — includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('pack-editor-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('renders the create-pack form when editingKey is null', async () => {
    const { getByText, getByTestId, queryByLabelText } = await render(<PackEditorDrawer visible editingKey={null} onDismiss={jest.fn()} onSaved={jest.fn()} onDelete={jest.fn()} onShare={jest.fn()} />)

    expect(getByText('New pack')).toBeTruthy()
    expect(getByTestId('pack-label-input')).toBeTruthy()
    // Nothing to share or delete yet — there's no saved pack behind a still-being-created one.
    expect(queryByLabelText('Share pack')).toBeNull()
    expect(queryByLabelText('Delete pack')).toBeNull()
  })
})
