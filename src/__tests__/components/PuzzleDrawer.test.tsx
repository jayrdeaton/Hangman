import { type AutoPaperTheme, getColorRoles, Provider, useAutoPaperTheme } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { ToastProvider } from '@rific/toaster'
import { fireEvent, render as rtlRender, within } from '@testing-library/react-native'
import { type ReactElement, type ReactNode, useEffect } from 'react'
import { StyleSheet } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { PuzzleDrawer } from '@/components/PuzzleDrawer'
import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { PackSelectionContext, type PackSelectionContextType } from '@/hooks/usePackSelection'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { store } from '@/redux/store'
import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import type { PuzzleConfig } from '@/utils/puzzlePicker'

// Any mode other than DEFAULT_MODE (baseConfig.mode below) - used both as the accessibility label
// ModeSelector's own cards used to render AND as ModePickerCard's own current format
// (`${label} mode, ${category}. ${description}`) - proves a mode change was actually applied, not
// just re-confirmed as the same value, regardless of which picker UI is asserting on it.
const OTHER_MODE_ACCESSIBILITY_LABEL = /Letters Only mode/

// This file renders PuzzleDrawer without a PaperProvider - react-native-paper's useTheme() falls
// back to its context default, which is MD3LightTheme itself (see react-native-paper's own
// core/theming.tsx: `createTheming<unknown>(MD3LightTheme)`), so every theme-derived color
// assertion below can compare directly against MD3LightTheme's real values. The difficulty-color
// tests are the exception - success/warning only exist on a theme @rific/auto-paper's own Provider
// actually computed (see renderDrawerWithRealTheme below), not on this fallback default.
const colorChannels = (color: string): [number, number, number] => {
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbaMatch) return [Number(rgbaMatch[1]), Number(rgbaMatch[2]), Number(rgbaMatch[3])]
  const n = parseInt(color.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// FeedbackPressProvider's real `paper` module injected everywhere below (see Haptic.tsx, the app's
// own root wiring) - without it, @rific/feedback-press's Button/IconButton/SegmentedButtons all fall
// back to a bare, unstyled RN element that drops accessibilityLabel entirely and renders with a
// completely different DOM shape (see that package's own renderFallbackIcon/SegmentedButtons
// fallback), which both the label-based queries and the parent/parent DOM-traversal assertions
// below rely on being the real react-native-paper structure. Passed as RTL's own `wrapper` option,
// not a manual JSX wrap - several tests below call `rerender` with a bare <PuzzleDrawer> (no
// wrapper of its own), which only keeps this Provider in the tree if RTL re-applies `wrapper`
// itself on every rerender the way it does automatically for this option.
// ToastProvider is also required - PuzzleDrawer's own tree reaches down through PacksScreen into
// PackEditorDrawer (always mounted, translated off-screen, same as every other drawer in this
// lineage), and that drawer's own form calls useToast() to surface a newly-unlocked custom-pack
// achievement, which throws outside a ToastProvider ancestor. The app's stats store and
// GameStatsProvider are needed too: the Stats & Achievements card and page read the store, and the
// nested drawers record and reset through useGameStats.
const HapticWrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <GameStatsProvider>
      <ToastProvider>
        <FeedbackPressProvider paper={RNPaper}>{children}</FeedbackPressProvider>
      </ToastProvider>
    </GameStatsProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: HapticWrapper })

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

const baseConfig: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

// Real packs from the real manifest, not fixtures - matches PacksScreen.test.tsx's own convention,
// so these tests don't drift from whatever pack keys/labels the catalog actually ships with.
const builtInPacks = () => getPuzzleManifest().filter((item) => item.count > 0)

// selectedPacks is supplied via the context directly rather than through PackSelectionProvider, so
// a test can pick a value without going through the provider's own persisted-default plumbing.
// Omitting it exercises the real shipped default (no packs selected) via the context's own
// fallback.
const renderDrawer = (overrides: Partial<React.ComponentProps<typeof PuzzleDrawer>> = {}, packSelection?: Partial<PackSelectionContextType>) => {
  const drawer = <PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} {...overrides} />
  if (!packSelection) return render(drawer)
  return render(<PackSelectionContext.Provider value={{ selectedPackKeys: [], setSelectedPackKeys: jest.fn(), ready: true, ...packSelection }}>{drawer}</PackSelectionContext.Provider>)
}

// success/warning/danger only exist on a theme @rific/auto-paper's Provider actually computed (see
// useComputedTheme.ts) - renderDrawer's bare-fallback MD3LightTheme doesn't have them. This wraps
// PuzzleDrawer in the real Provider and captures the resulting theme via a sibling probe, so the
// difficulty-color tests can assert against the exact values the app itself would compute rather
// than a hardcoded guess.
let capturedTheme: AutoPaperTheme | null = null
const ThemeCapture = () => {
  const theme = useAutoPaperTheme()
  useEffect(() => {
    capturedTheme = theme
  }, [theme])
  return null
}
const renderDrawerWithRealTheme = async (overrides: Partial<React.ComponentProps<typeof PuzzleDrawer>> = {}, packSelection?: Partial<PackSelectionContextType>) => {
  capturedTheme = null
  const drawer = <PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} {...overrides} />
  const wrapped = packSelection ? <PackSelectionContext.Provider value={{ selectedPackKeys: [], setSelectedPackKeys: jest.fn(), ready: true, ...packSelection }}>{drawer}</PackSelectionContext.Provider> : drawer
  const utils = await render(
    <Provider initialValue={{ appearance: 'light' }}>
      <ThemeCapture />
      {wrapped}
    </Provider>
  )
  return { ...utils, theme: capturedTheme! }
}

describe('PuzzleDrawer', () => {
  beforeEach(() => {
    store.dispatch(achievementsActions.reset())
  })

  // Read from the stats store (see useUnlockedAchievementCount), out of the whole catalog. An id
  // that's no longer in the catalog doesn't count.
  it("shows how many achievements are earned out of the catalog's total on the Stats & Achievements card", async () => {
    store.dispatch(achievementsActions.update({ unlocked: { first_game_played: 1, first_ever_win: 2, retired_achievement: 3 } }))
    const { getByText, getByRole } = await renderDrawer()

    expect(getByText('Stats & Achievements')).toBeTruthy()
    expect(getByText('Achievements Earned')).toBeTruthy()
    expect(getByText(`2 / ${ACHIEVEMENT_CATALOG.length}`)).toBeTruthy()
    // On the accessible wrapper a screen reader focuses (Paper's Card would drop it), as a button.
    expect(getByRole('button', { name: `Stats and achievements. 2 of ${ACHIEVEMENT_CATALOG.length} achievements earned` }).props.accessible).toBe(true)
  })

  describe('the Stats & Achievements page', () => {
    const openStats = async () => {
      const utils = await renderDrawerWithRealTheme()
      await fireEvent.press(utils.getByText('Achievements Earned'))
      return utils
    }

    it('opens over the menu from the card, with the menu left open underneath but hidden from accessibility', async () => {
      const { getByTestId, queryByTestId, getByText } = await renderDrawerWithRealTheme()
      expect(queryByTestId('stats-screen')).toBeNull()

      await fireEvent.press(getByText('Achievements Earned'))

      expect(getByTestId('stats-screen')).toBeTruthy()
      expect(getByText('Reset All Stats')).toBeTruthy()
      const panel = getByTestId('puzzle-drawer-panel', { includeHiddenElements: true })
      expect(panel.props.accessibilityElementsHidden).toBe(true)
      expect(panel.props.importantForAccessibility).toBe('no-hide-descendants')
    })

    it("goes back to the menu from the page's back arrow", async () => {
      const onDismiss = jest.fn()
      const utils = await renderDrawerWithRealTheme({ onDismiss })
      await fireEvent.press(utils.getByText('Achievements Earned'))

      await fireEvent.press(within(utils.getByTestId('stats-screen')).getAllByRole('button')[0])

      expect(utils.queryByTestId('stats-screen')).toBeNull()
      expect(onDismiss).not.toHaveBeenCalled()
      expect(utils.getByTestId('puzzle-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    })

    it("closes with the menu, so reopening the menu doesn't land on it", async () => {
      const { queryByTestId, getByTestId, rerender } = await openStats()
      expect(getByTestId('stats-screen')).toBeTruthy()
      // The same tree renderDrawerWithRealTheme built (ThemeCapture included), so this updates the
      // mounted drawer instead of remounting a fresh one.
      const drawer = (visible: boolean) => (
        <Provider initialValue={{ appearance: 'light' }}>
          <ThemeCapture />
          <PuzzleDrawer visible={visible} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />
        </Provider>
      )

      await rerender(drawer(false))
      expect(queryByTestId('stats-screen')).toBeNull()
      await rerender(drawer(true))
      expect(queryByTestId('stats-screen')).toBeNull()
    })
  })

  it('shows how many packs are complete on the Pack Progress row, and opens the Pack Progress drawer from it', async () => {
    const manifest = builtInPacks()
    const { getByText, findByText, getByTestId } = await renderDrawer()

    expect(await findByText(`0 of ${manifest.length} packs complete`)).toBeTruthy()
    expect(getByTestId('pack-progress-drawer-panel', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)

    await fireEvent.press(getByText('Pack Progress'))

    expect(getByTestId('pack-progress-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    // The menu slides out of the way while a drawer it opened is on top.
    expect(getByTestId('puzzle-drawer-panel', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true)
  })

  it('shows the All packs row and Difficulty with no Custom option - pass and play is how a word gets authored now - and always offers both Random and Pass & play', async () => {
    const { getByText, queryByText } = await renderDrawer()

    // "All packs" is its own row now (see listHeader's own comment on why it looks like a pack
    // row instead of a button above them), labeled with the live selection count (see packsLabel's
    // own comment) rather than a static caption - nothing is selected by default here (see
    // renderDrawer's own packSelection default), so "0 of N Packs" is what that label resolves to.
    expect(getByText(`0 of ${builtInPacks().length} Packs`)).toBeTruthy()
    expect(getByText('Difficulty')).toBeTruthy()
    expect(queryByText('Custom')).toBeNull()
    expect(getByText('Random')).toBeTruthy()
    expect(getByText('Pass & Play')).toBeTruthy()
  })

  it('labels the "All packs" row "All Packs" once every built-in pack is selected, not a count', async () => {
    const { getByText } = await renderDrawer({}, { selectedPackKeys: builtInPacks().map((pack) => pack.key) })

    expect(getByText('All Packs')).toBeTruthy()
  })

  it('shows no quick-start pack rows when nothing is selected', async () => {
    const pack = builtInPacks()[0]
    const { queryByText } = await renderDrawer()

    expect(queryByText(pack.label)).toBeNull()
  })

  it('shows a row for each pack in the current selection, with its label, unlock progress, and puzzle count', async () => {
    const pack = builtInPacks()[0]
    const { getByText, findByText } = await renderDrawer({}, { selectedPackKeys: [pack.key] })

    expect(getByText(pack.label)).toBeTruthy()
    expect(await findByText(`${commaString(0)} of ${commaString(pack.count)} unlocked`)).toBeTruthy()
  })

  it('hides a pack from the quick list via a long press - unselecting it (same selectedPackKeys Choose packs itself toggles) rather than opening it', async () => {
    const [packA, packB] = builtInPacks()
    const onConfirm = jest.fn()
    const setSelectedPackKeys = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm }, { selectedPackKeys: [packA.key, packB.key], setSelectedPackKeys })

    await fireEvent(getByText(packA.label), 'longPress')

    expect(setSelectedPackKeys).toHaveBeenCalledWith([packB.key])
    // A distinct action from tapping the row body - hiding a pack shouldn't also draw from it.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('draws an instant random puzzle scoped to just the pack tapped, not the whole selection, when a quick-start row itself is pressed', async () => {
    const [packA, packB] = builtInPacks()
    const onConfirm = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm }, { selectedPackKeys: [packA.key, packB.key] })

    await fireEvent.press(getByText(packA.label))

    // The Game Menu is about getting a game going as fast as possible now - a plain tap on a
    // quick-start row draws directly from that one pack rather than opening its list.
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload] = onConfirm.mock.calls[0]
    expect(payload.packKey).toBe(packA.key)
    expect(payload.packScope).toBe('single')
  })

  it("opens that pack's own puzzle list via its trailing info icon, scoped to the specific pack - not just any drawer, and not another pack in the selection", async () => {
    const [packA, packB] = builtInPacks()
    const onConfirm = jest.fn()
    const { getByLabelText, findByText, queryByTestId } = await renderDrawer({ onConfirm }, { selectedPackKeys: [packA.key, packB.key] })

    await fireEvent.press(getByLabelText(`Browse ${packA.label}`))

    // Specific to packA's own count - proves packA's own list opened, not packB's or an
    // unresolved one, which a bare accessibilityViewIsModal check can't distinguish.
    expect(await findByText(`${commaString(0)} of ${commaString(packA.count)} unlocked`)).toBeTruthy()
    const puzzleFromA = getPuzzlesForCategory(packA.key)[0]
    const puzzleFromB = getPuzzlesForCategory(packB.key)[0]
    expect(queryByTestId(`puzzle-row-${puzzleFromA.id}`)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${puzzleFromB.id}`)).toBeNull()
    // Browsing is a distinct action from an instant random draw - the info icon shouldn't also
    // resolve a puzzle on its own.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not reset an in-progress draft edit on a rerender that keeps the drawer open, even when initialConfig changes underneath it', async () => {
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Hard'))
    expect(getByText('Hard').parent?.parent?.props.accessibilityState.checked).toBe(true)

    // Simulates a live update elsewhere in Main.tsx (e.g. a mode pick echoing back through config)
    // arriving while the drawer is still open - this must not resync the draft, or an in-progress
    // pick here would get silently discarded by an unrelated live update.
    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={{ ...baseConfig, difficulty: 'easy' }} onConfirm={jest.fn()} />)

    expect(getByText('Hard').parent?.parent?.props.accessibilityState.checked).toBe(true)
  })

  it('re-syncs the draft from initialConfig each time the drawer transitions from closed to open', async () => {
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Hard'))
    expect(getByText('Hard').parent?.parent?.props.accessibilityState.checked).toBe(true)

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)
    await rerender(<PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    // baseConfig.difficulty is 'any' - reopening should have discarded the unconfirmed Hard pick.
    expect(getByText('Any').parent?.parent?.props.accessibilityState.checked).toBe(true)
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderDrawer()

    expect(getByTestId('puzzle-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('puzzle-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('puzzle-drawer-panel').props.importantForAccessibility).toBe('yes')

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it - includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('puzzle-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('opens ModePickerDrawer from the mode summary row, showing the current mode', async () => {
    const { getByLabelText } = await renderDrawer()

    // draft.mode starts as baseConfig.mode (DEFAULT_MODE) - the row itself, and the picker it
    // opens, both read that value; pressing it is the only way to reach the picker's cards below.
    expect(getByLabelText(`Mode: ${DEFAULT_MODE.label}. Change mode`)).toBeTruthy()

    await fireEvent.press(getByLabelText(`Mode: ${DEFAULT_MODE.label}. Change mode`))

    expect(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL)).toBeTruthy()
  })

  // Cards are plain Views now, not Pressables - scrolling the carousel to a card is what selects
  // it (see ModePickerDrawer's own handleScroll/commitIndex), so this simulates that by firing a
  // 'scroll' event with contentOffset.x landing exactly on the target card's page boundary, not by
  // pressing it. offsetX: 0 always lands on index 0 (Letters Only, the first VISIBLE_MODES entry)
  // regardless of the test environment's own windowWidth, since 0 / anything is still 0.
  it('fires onModeChange immediately when the carousel settles on a different mode card, without requiring confirm or closing the picker', async () => {
    const onModeChange = jest.fn()
    const onConfirm = jest.fn()
    const { getByLabelText, getByTestId } = await renderDrawer({ onModeChange, onConfirm })

    await fireEvent.press(getByLabelText(`Mode: ${DEFAULT_MODE.label}. Change mode`))
    await fireEvent.scroll(getByTestId('mode-picker-carousel'), { nativeEvent: { contentOffset: { x: 0, y: 0 } } })

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange.mock.calls[0][0].id).toBe('letters')
    // The art style is meant to apply to whatever's already playing right away - Main.tsx's
    // handleModeChange is what actually pushes it live, but from the drawer's own side this
    // shouldn't wait on (or require) the confirm button at all.
    expect(onConfirm).not.toHaveBeenCalled()
    // Selecting is just a live side effect of scrolling - it doesn't commit or close anything on
    // its own (see ModePickerDrawer's own footer/close comments), so the card is still reachable.
    expect(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL)).toBeTruthy()
  })

  it('fires onDifficultyChange immediately when a difficulty option is picked, without requiring confirm', async () => {
    const onDifficultyChange = jest.fn()
    const onConfirm = jest.fn()
    const { getByText } = await renderDrawer({ onDifficultyChange, onConfirm })

    await fireEvent.press(getByText('Hard'))

    expect(onDifficultyChange).toHaveBeenCalledWith('hard')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("colors the CHECKED difficulty segment with its own theme role's vibrant text color (easy/medium/hard -> success/warning/danger - see useDifficultyOptionColors), and every unchecked segment with that role's muted container text color instead", async () => {
    const { getByText, theme } = await renderDrawerWithRealTheme()

    await fireEvent.press(getByText('Hard'))
    // Checked: the vibrant (full-saturation) role color, not the muted container one - every
    // checked segment in this app now pops solid rather than just tinted.
    expect(StyleSheet.flatten(getByText('Hard').props.style).color).toBe(theme.colors.onDanger)
    // Red channel clearly dominant - hard is a red, whatever the exact shade.
    const [hr, hg, hb] = colorChannels(theme.colors.onDanger)
    expect(hr).toBeGreaterThan(hg)
    expect(hr).toBeGreaterThan(hb)
    // The previously-checked segment ("Any", checked by default per baseConfig) drops to its own
    // unchecked/muted-container text color, not a generic onSurface - every segment keeps its own
    // tier's tint even while unchecked now.
    expect(StyleSheet.flatten(getByText('Any').props.style).color).toBe(theme.colors.onPrimaryContainer)

    await fireEvent.press(getByText('Easy'))
    expect(StyleSheet.flatten(getByText('Easy').props.style).color).toBe(theme.colors.onSuccess)
    // Green channel clearly dominant, and Hard goes back to its own muted onDangerContainer now
    // that it's no longer checked - not a generic neutral, its own red just dims.
    const [er, eg, eb] = colorChannels(theme.colors.onSuccess)
    expect(eg).toBeGreaterThan(er)
    expect(eg).toBeGreaterThan(eb)
    expect(StyleSheet.flatten(getByText('Hard').props.style).color).toBe(theme.colors.onDangerContainer)
  })

  it("fills the CHECKED difficulty segment's own background with its theme role's vibrant (full-saturation) color, and every unchecked segment with that role's muted container color instead", async () => {
    const { getByText, theme } = await renderDrawerWithRealTheme()
    // react-native-paper's SegmentedButtons has no per-segment checked-background prop (checkedColor
    // only ever reaches the text/icon/border) - PuzzleDrawer applies this as a plain style override
    // on every button, checked or not (see difficultyOptions), which lands on the segment's outer
    // View, three parents up from its label Text.
    const fillOf = (label: string) => StyleSheet.flatten(getByText(label).parent?.parent?.parent?.props.style).backgroundColor
    // "Any" isn't a difficulty tier with its own success/warning/danger role - its container is a
    // computed tint of the theme's own primary (see useDifficultyOptionColors' own anyContainerColor),
    // not primaryContainer directly.
    const anyContainerColor = getColorRoles(theme.colors.primary, theme.colors.surface).container

    await fireEvent.press(getByText('Hard'))
    expect(fillOf('Hard')).toBe(theme.colors.danger)
    const [hr, hg, hb] = colorChannels(theme.colors.danger)
    expect(hr).toBeGreaterThan(hg)
    expect(hr).toBeGreaterThan(hb)
    // "Any" (checked by default) drops to its own muted container fill once it's no longer
    // checked - not a bare transparent default.
    expect(fillOf('Any')).toBe(anyContainerColor)

    await fireEvent.press(getByText('Easy'))
    expect(fillOf('Easy')).toBe(theme.colors.success)
    const [er, eg, eb] = colorChannels(theme.colors.success)
    expect(eg).toBeGreaterThan(er)
    expect(eg).toBeGreaterThan(eb)
    expect(fillOf('Hard')).toBe(theme.colors.dangerContainer)
  })

  it("fills the checked 'Any' segment with the theme's own primary color as a solid vibrant fill, since it isn't a difficulty tier with a semantic role of its own", async () => {
    const { getByText, theme } = await renderDrawerWithRealTheme()
    const fillOf = (label: string) => StyleSheet.flatten(getByText(label).parent?.parent?.parent?.props.style).backgroundColor

    // baseConfig.difficulty is 'any', so it's already checked on first render - no press needed.
    expect(StyleSheet.flatten(getByText('Any').props.style).color).toBe(theme.colors.onPrimary)
    expect(fillOf('Any')).toBe(theme.colors.primary)
  })

  // Jest has no real layout, so this pins the style that does the fitting rather than measured
  // widths: each segment sized to its own label instead of Paper's equal-quarter flex: 1 and 76pt
  // minWidth, which cut "Medium" to "Medi..." on 375pt and 360pt screens (see
  // styles.difficultySegment in PuzzleDrawer for the measured numbers).
  it('sizes every difficulty segment to its own label instead of an equal quarter of the row', async () => {
    const { getByText } = await renderDrawer()

    for (const label of ['Any', 'Easy', 'Medium', 'Hard']) {
      const segmentStyle = StyleSheet.flatten(getByText(label).parent?.parent?.parent?.props.style)
      expect(segmentStyle).toMatchObject({ flex: 0, flexBasis: 'auto', flexGrow: 1, flexShrink: 1, minWidth: 0 })
    }
  })

  // Appearance/keyboard layout AND haptics/sound all moved into ModePickerDrawer (reached via the
  // mode summary row) - SettingsDrawer and its own gear-icon entry point are gone entirely, so this
  // menu no longer renders those controls directly OR offers a second way to reach them. See
  // ModePickerDrawer.test.tsx for coverage of the controls themselves.
  it('does not show the Appearance, Keyboard, or Feedback controls directly, and has no separate settings entry point besides the mode summary row', async () => {
    const { getByLabelText, queryByText, queryByLabelText } = await renderDrawer()

    expect(queryByText('Appearance')).toBeNull()
    expect(queryByLabelText('System')).toBeNull()
    expect(queryByText('QWERTY')).toBeNull()
    expect(queryByText('ABC')).toBeNull()
    expect(queryByLabelText('Vibrate on tap')).toBeNull()
    expect(queryByLabelText('Sound effects')).toBeNull()
    expect(queryByLabelText('Feedback')).toBeNull()
    expect(getByLabelText(`Mode: ${DEFAULT_MODE.label}. Change mode`)).toBeTruthy()
  })

  // The version and Check for Updates moved to the fleet Settings sheet (see SettingsDialog.test.tsx),
  // so the header is just the app's name: the hamburger that opens this already says "menu".
  it('titles the drawer with just the app name, with no version or update check of its own', async () => {
    const { getByText, queryByText, queryByLabelText } = await renderDrawer()

    expect(getByText('Hangman')).toBeTruthy()
    expect(queryByText(/^v\d+/)).toBeNull()
    expect(queryByLabelText('Check for updates')).toBeNull()
  })
})
