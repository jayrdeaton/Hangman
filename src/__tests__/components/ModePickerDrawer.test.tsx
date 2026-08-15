import { Provider } from '@rific/auto-paper'
import { HapticPressProvider } from '@rific/haptic-press'
import { act, fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import * as RNPaper from 'react-native-paper'

import { ModePickerDrawer } from '@/components/ModePickerDrawer'
import { KeyboardLayoutContext, type KeyboardLayoutContextType } from '@/hooks/useKeyboardLayout'
import { DEFAULT_MODE } from '@/modes/registry'

// A lightweight stand-in exposing exactly the `mistakes` value ModePickerDrawer feeds each card,
// keyed by mode id — the demo-loop test below asserts on that value directly rather than reaching
// into a specific mode's own SVG part structure (classicParts.tsx etc.), which isn't this drawer's
// own responsibility to get right.
jest.mock('@/components/GameVisual', () => {
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return {
    GameVisual: ({ mode, mistakes }: { mode: { id: string }; mistakes: number }) => createElement(Text, { testID: `game-visual-${mode.id}` }, mistakes)
  }
})

// Any mode other than DEFAULT_MODE (classic) — used to prove scrolling the carousel actually
// selected a different card, not just re-confirmed the one already active.
const OTHER_MODE_ACCESSIBILITY_LABEL = /Letters Only mode/
const SELECTED_MODE_ACCESSIBILITY_LABEL = /Classic mode/

// PaperProvider (react-native-paper's own useTheme()), auto-paper's Provider (success/warning/
// danger roles, PalettePicker/AppearancePicker's own theme plumbing), and HapticPressProvider's
// real `paper` module (see Haptic.tsx, the app's own root wiring — without it, @rific/haptic-
// press's IconButton/SegmentedButtons/Pressable all fall back to a bare, unstyled RN element that
// drops accessibilityLabel entirely) — the same three this app's own Providers.tsx always nests
// together, in the same order (Haptic outside Theme).
const Wrapper = ({ children }: { children: ReactNode }) => (
  <HapticPressProvider paper={RNPaper}>
    <Provider initialValue={{ appearance: 'light' }}>{children}</Provider>
  </HapticPressProvider>
)

const render = (ui: ReactElement, keyboardLayout?: Partial<KeyboardLayoutContextType>) => {
  const wrapped = keyboardLayout ? <KeyboardLayoutContext.Provider value={{ layout: 'qwerty', setLayout: jest.fn(), ...keyboardLayout }}>{ui}</KeyboardLayoutContext.Provider> : ui
  return rtlRender(wrapped, { wrapper: Wrapper })
}

const renderPicker = async (overrides: Partial<React.ComponentProps<typeof ModePickerDrawer>> = {}, keyboardLayout?: Partial<KeyboardLayoutContextType>) => render(<ModePickerDrawer visible selected={DEFAULT_MODE} onDismiss={jest.fn()} onSelect={jest.fn()} {...overrides} />, keyboardLayout)

describe('ModePickerDrawer', () => {
  it('only marks its own panel as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderPicker()

    expect(getByTestId('mode-picker-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('mode-picker-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('mode-picker-panel').props.importantForAccessibility).toBe('yes')

    await rerender(<ModePickerDrawer visible={false} selected={DEFAULT_MODE} onDismiss={jest.fn()} onSelect={jest.fn()} />)

    // Closed state is deliberately hidden from accessibility tools, so RTL's default queries skip
    // it — includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('mode-picker-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('titles itself "Customize" and shows the Display section (palette, appearance, keyboard layout) above the mode carousel', async () => {
    const { getByText, getByLabelText } = await renderPicker()

    expect(getByText('Customize')).toBeTruthy()
    expect(getByText('Display')).toBeTruthy()
    // AppearancePicker — icon-only (showLabels={false}), so the accessible name is what's asserted
    // on, same as PuzzleDrawer/SettingsDrawer's own AppearancePicker coverage.
    expect(getByLabelText('System')).toBeTruthy()
    expect(getByLabelText('Light')).toBeTruthy()
    expect(getByLabelText('Dark')).toBeTruthy()
    expect(getByText('QWERTY')).toBeTruthy()
    expect(getByText('ABC')).toBeTruthy()
    // The carousel itself, below the Display block.
    expect(getByLabelText(SELECTED_MODE_ACCESSIBILITY_LABEL)).toBeTruthy()
    expect(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL)).toBeTruthy()
  })

  it('switches the keyboard layout via the KeyboardLayout context when ABC is picked', async () => {
    const setLayout = jest.fn()
    const { getByText } = await renderPicker({}, { layout: 'qwerty', setLayout })

    await fireEvent.press(getByText('ABC'))

    expect(setLayout).toHaveBeenCalledWith('abc')
  })

  it("marks the currently-selected mode's own card (not just whichever is focused) as accessibilityState.selected", async () => {
    const { getByLabelText } = await renderPicker({ selected: DEFAULT_MODE })

    expect(getByLabelText(SELECTED_MODE_ACCESSIBILITY_LABEL).props.accessibilityState.selected).toBe(true)
    expect(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL).props.accessibilityState.selected).toBe(false)
  })

  // Cards are plain Views, not Pressables — scrolling the carousel to a card is what selects it
  // (see ModePickerDrawer's own handleScroll/commitIndex), so this simulates that by firing a
  // 'scroll' event with contentOffset.x landing exactly on the target card's page boundary, not by
  // pressing it. offsetX: 0 always lands on index 0 (Letters Only, the first VISIBLE_MODES entry)
  // regardless of the test environment's own windowWidth, since 0 / anything is still 0.
  it('fires onSelect as soon as the carousel settles on a different mode card, without requiring a separate confirm step or dismissing the drawer', async () => {
    const onSelect = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = await renderPicker({ onSelect, onDismiss })

    await fireEvent.scroll(getByTestId('mode-picker-carousel'), { nativeEvent: { contentOffset: { x: 0, y: 0 } } })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('letters')
    // Selecting is just a live side effect of scrolling — it doesn't close the drawer on its own
    // (see ModePickerDrawer's own footer/close comments); only the header Close action or the
    // footer Done button do that.
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('closes without selecting anything when the header Close action is pressed', async () => {
    const onSelect = jest.fn()
    const onDismiss = jest.fn()
    const { getByLabelText } = await renderPicker({ onSelect, onDismiss })

    await fireEvent.press(getByLabelText('Close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('replays a fade/redraw-then-build-then-clear demo cycle on the focused card while it has an additive behavior (e.g. Classic), and leaves a non-focused/non-additive card (e.g. Letters Only) at a constant resting mistake count throughout', async () => {
    jest.useFakeTimers()
    // ModePickerDrawer only syncs focusedIndex to `selected` on the closed-to-open transition (see
    // its own prevVisible comment) — mounting already-open, like renderPicker's default, leaves
    // focusedIndex at its literal initial value (0, Letters Only) regardless of `selected`. Opening
    // it here instead, the same as a real app open, is what actually brings Classic (DEFAULT_MODE)
    // into focus.
    const { getByTestId, rerender } = await render(<ModePickerDrawer visible={false} selected={DEFAULT_MODE} onDismiss={jest.fn()} onSelect={jest.fn()} />)
    await rerender(<ModePickerDrawer visible selected={DEFAULT_MODE} onDismiss={jest.fn()} onSelect={jest.fn()} />)

    // Classic (behavior: 'additive') is now both the selected AND focused card; Letters Only
    // (behavior: 'none') never becomes focused in this test, so it's the control — its resting
    // count is constant (0) throughout, focused or not, since it has no mistake-reactive art to
    // animate at all (see useCardAnimation's own `animated` guard). Classic's own resting count,
    // for the single instant before its entry fade-out starts, is its fully-drawn maxMistakes (6)
    // per useCardAnimation's own restMistakes — the "nice grey preview" the fade is about to clear.
    expect(getByTestId('game-visual-classic').props.children).toBe(6)
    expect(getByTestId('game-visual-letters').props.children).toBe(0)

    // t=200 (FADE_MS): the entry fade-out completes, the scene remounts blank, and mistakes drops
    // to 0 — the "draw the static parts in" beat, holding at 0 for SCENE_REVEAL_HOLD_MS before the
    // build loop below is allowed to touch it (see useCardAnimation's own comment on why).
    await act(async () => {
      jest.advanceTimersByTime(200)
    })
    expect(getByTestId('game-visual-classic').props.children).toBe(0)

    // t=3200 (+200 fade, +2000 scene-reveal hold, +2 * DEMO_STEP_MS): partway through the build —
    // the loop is actively advancing the focused card's mistake count up from 0, one step at a time.
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })
    const midBuild = getByTestId('game-visual-classic').props.children
    expect(midBuild).toBeGreaterThan(0)
    expect(midBuild).toBeLessThan(6)
    expect(getByTestId('game-visual-letters').props.children).toBe(0)

    // t=6400 (+3200): long enough to finish building the remaining parts, hold at 6 for
    // DEMO_HOLD_MS, fade the stick figure back out (FADE_MS), and land exactly on the reset back to
    // 0 that kicks off the next build — proving this is a repeating loop, not a one-shot reveal that
    // just stops once fully built.
    await act(async () => {
      jest.advanceTimersByTime(3200)
    })
    expect(getByTestId('game-visual-classic').props.children).toBe(0)
    expect(getByTestId('game-visual-letters').props.children).toBe(0)
  })
})
