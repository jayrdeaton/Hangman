import { type AutoPaperTheme, Provider, useAutoPaperTheme } from '@rific/auto-paper'
import { useUpdater } from '@rific/updater'
import { fireEvent, render } from '@testing-library/react-native'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'

import { PuzzleDrawer } from '@/components/PuzzleDrawer'
import { PackSelectionContext, type PackSelectionContextType } from '@/hooks/usePackSelection'
import { DEFAULT_MODE } from '@/modes/registry'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import type { PuzzleConfig } from '@/utils/puzzlePicker'

// Any mode other than DEFAULT_MODE (baseConfig.mode below) — used to prove a mode change was
// actually applied, not just re-confirmed as the same value.
const OTHER_MODE_ACCESSIBILITY_LABEL = /Letters Only mode/

// This file renders PuzzleDrawer without a PaperProvider — react-native-paper's useTheme() falls
// back to its context default, which is MD3LightTheme itself (see react-native-paper's own
// core/theming.tsx: `createTheming<unknown>(MD3LightTheme)`), so every theme-derived color
// assertion below can compare directly against MD3LightTheme's real values. The difficulty-color
// tests are the exception — success/warning only exist on a theme @rific/auto-paper's own Provider
// actually computed (see renderDrawerWithRealTheme below), not on this fallback default.
const colorChannels = (color: string): [number, number, number] => {
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbaMatch) return [Number(rgbaMatch[1]), Number(rgbaMatch[2]), Number(rgbaMatch[3])]
  const n = parseInt(color.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ModeSelector's cards render from a measured container width (see ModeSelector.test.tsx) — with
// no layout event, its FlatList never renders a single card and mode-card queries below would
// always come up empty.
const MODE_SELECTOR_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 200 } } }

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// The real hook is exercised on its own turf (its own package); here it's just a dependency whose
// checking/updateReady states this file wants to drive directly, without faking AppState changes
// or a real expo-updates manifest fetch.
jest.mock('@rific/updater', () => ({
  useUpdater: jest.fn()
}))

const mockUseUpdater = jest.mocked(useUpdater)
const mockCheck = jest.fn().mockResolvedValue(undefined)
const mockAlert = jest.mocked(alert)

const baseConfig: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

// Real packs from the real manifest, not fixtures — matches PacksScreen.test.tsx's own convention,
// so these tests don't drift from whatever pack keys/labels the catalog actually ships with.
const builtInPacks = () => getPuzzleManifest().filter((item) => item.count > 0)

// selectedPacks is supplied via the context directly rather than through PackSelectionProvider, so
// a test can pick a value without going through the provider's own persisted-default plumbing.
// Omitting it exercises the real shipped default (no packs selected) via the context's own
// fallback.
const renderDrawer = (overrides: Partial<React.ComponentProps<typeof PuzzleDrawer>> = {}, packSelection?: Partial<PackSelectionContextType>) => {
  const drawer = <PuzzleDrawer visible onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} {...overrides} />
  if (!packSelection) return render(drawer)
  return render(<PackSelectionContext.Provider value={{ selectedPackKeys: [], setSelectedPackKeys: jest.fn(), ...packSelection }}>{drawer}</PackSelectionContext.Provider>)
}

// success/warning/danger only exist on a theme @rific/auto-paper's Provider actually computed (see
// useComputedTheme.ts) — renderDrawer's bare-fallback MD3LightTheme doesn't have them. This wraps
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
  const wrapped = packSelection ? <PackSelectionContext.Provider value={{ selectedPackKeys: [], setSelectedPackKeys: jest.fn(), ...packSelection }}>{drawer}</PackSelectionContext.Provider> : drawer
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
    mockCheck.mockClear()
    mockAlert.mockClear()
    mockUseUpdater.mockReturnValue({ check: mockCheck, checking: false, updateReady: false })
  })

  it('shows Choose packs and Difficulty with no Custom option — pass and play is how a word gets authored now — and always offers both Random and Pass & play', async () => {
    const { getByText, queryByText } = await renderDrawer()

    expect(getByText('No packs selected')).toBeTruthy()
    expect(getByText('Difficulty')).toBeTruthy()
    expect(queryByText('Custom')).toBeNull()
    expect(getByText('Random')).toBeTruthy()
    expect(getByText('Pass & play')).toBeTruthy()
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

  it('hides a pack from the quick list via its trailing icon — unselecting it (same selectedPackKeys Choose packs itself toggles) rather than opening it', async () => {
    const [packA, packB] = builtInPacks()
    const onConfirm = jest.fn()
    const setSelectedPackKeys = jest.fn()
    const { getByLabelText } = await renderDrawer({ onConfirm }, { selectedPackKeys: [packA.key, packB.key], setSelectedPackKeys })

    await fireEvent.press(getByLabelText(`Hide ${packA.label}`))

    expect(setSelectedPackKeys).toHaveBeenCalledWith([packB.key])
    // A distinct action from tapping the row body — hiding a pack shouldn't also open its puzzle list.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('draws an instant random puzzle scoped to just the pack tapped, not the whole selection, when a quick-start row itself is pressed', async () => {
    const [packA, packB] = builtInPacks()
    const onConfirm = jest.fn()
    const { getByText } = await renderDrawer({ onConfirm }, { selectedPackKeys: [packA.key, packB.key] })

    await fireEvent.press(getByText(packA.label))

    // The Game Menu is about getting a game going as fast as possible now — a plain tap on a
    // quick-start row draws directly from that one pack rather than opening its list.
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload] = onConfirm.mock.calls[0]
    expect(payload.packKey).toBe(packA.key)
    expect(payload.packScope).toBe('single')
  })

  it("opens that pack's own puzzle list via its trailing info icon, scoped to the specific pack — not just any drawer, and not another pack in the selection", async () => {
    const [packA, packB] = builtInPacks()
    const onConfirm = jest.fn()
    const { getByLabelText, findByText, queryByTestId } = await renderDrawer({ onConfirm }, { selectedPackKeys: [packA.key, packB.key] })

    await fireEvent.press(getByLabelText(`Browse ${packA.label}`))

    // Specific to packA's own count — proves packA's own list opened, not packB's or an
    // unresolved one, which a bare accessibilityViewIsModal check can't distinguish.
    expect(await findByText(`${commaString(0)} of ${commaString(packA.count)} unlocked`)).toBeTruthy()
    const puzzleFromA = getPuzzlesForCategory(packA.key)[0]
    const puzzleFromB = getPuzzlesForCategory(packB.key)[0]
    expect(queryByTestId(`puzzle-row-${puzzleFromA.id}`)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${puzzleFromB.id}`)).toBeNull()
    // Browsing is a distinct action from an instant random draw — the info icon shouldn't also
    // resolve a puzzle on its own.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not reset an in-progress draft edit on a rerender that keeps the drawer open, even when initialConfig changes underneath it', async () => {
    const { getByText, rerender } = await renderDrawer()

    await fireEvent.press(getByText('Hard'))
    expect(getByText('Hard').parent?.parent?.props.accessibilityState.checked).toBe(true)

    // Simulates a live update elsewhere in Main.tsx (e.g. a mode pick echoing back through config)
    // arriving while the drawer is still open — this must not resync the draft, or an in-progress
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

    // baseConfig.difficulty is 'any' — reopening should have discarded the unconfirmed Hard pick.
    expect(getByText('Any').parent?.parent?.props.accessibilityState.checked).toBe(true)
  })

  it('only marks the drawer as a modal accessibility view while visible', async () => {
    const { getByTestId, rerender } = await renderDrawer()

    expect(getByTestId('puzzle-drawer-panel').props.accessibilityViewIsModal).toBe(true)
    expect(getByTestId('puzzle-drawer-panel').props.accessibilityElementsHidden).toBe(false)
    expect(getByTestId('puzzle-drawer-panel').props.importantForAccessibility).toBe('yes')

    await rerender(<PuzzleDrawer visible={false} onDismiss={jest.fn()} onRequestOpen={jest.fn()} initialConfig={baseConfig} onConfirm={jest.fn()} />)

    // Closed state is deliberately hidden from accessibility tools (accessibilityElementsHidden),
    // so RTL's default queries skip it — includeHiddenElements opts back in for this assertion.
    const closedPanel = getByTestId('puzzle-drawer-panel', { includeHiddenElements: true })
    expect(closedPanel.props.accessibilityViewIsModal).toBe(false)
    expect(closedPanel.props.accessibilityElementsHidden).toBe(true)
    expect(closedPanel.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('fires onModeChange immediately when a different mode card is tapped, without requiring confirm', async () => {
    const onModeChange = jest.fn()
    const onConfirm = jest.fn()
    const { getByLabelText, getByTestId } = await renderDrawer({ onModeChange, onConfirm })

    await fireEvent(getByTestId('mode-selector-container'), 'layout', MODE_SELECTOR_LAYOUT_EVENT)
    await fireEvent.press(getByLabelText(OTHER_MODE_ACCESSIBILITY_LABEL))

    expect(onModeChange).toHaveBeenCalledTimes(1)
    expect(onModeChange.mock.calls[0][0].id).toBe('letters')
    // The art style is meant to apply to whatever's already playing right away — Main.tsx's
    // handleModeChange is what actually pushes it live, but from the drawer's own side this
    // shouldn't wait on (or require) the confirm button at all.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('fires onDifficultyChange immediately when a difficulty option is picked, without requiring confirm', async () => {
    const onDifficultyChange = jest.fn()
    const onConfirm = jest.fn()
    const { getByText } = await renderDrawer({ onDifficultyChange, onConfirm })

    await fireEvent.press(getByText('Hard'))

    expect(onDifficultyChange).toHaveBeenCalledWith('hard')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('colors the selected difficulty segment with its own theme role (easy/medium/hard -> success/warning/danger — see useDifficultyColors), and moves the color when the selection changes', async () => {
    const { getByText, theme } = await renderDrawerWithRealTheme()

    await fireEvent.press(getByText('Hard'))
    expect(StyleSheet.flatten(getByText('Hard').props.style).color).toBe(theme.colors.onDangerContainer)
    // Red channel clearly dominant — hard is a red, whatever the exact shade.
    const [hr, hg, hb] = colorChannels(theme.colors.onDangerContainer)
    expect(hr).toBeGreaterThan(hg)
    expect(hr).toBeGreaterThan(hb)
    // The previously-checked segment ("Any", checked by default per baseConfig) is back to plain
    // unchecked/onSurface — not primary, and not any of the difficulty colors either.
    expect(StyleSheet.flatten(getByText('Any').props.style).color).toBe(theme.colors.onSurface)

    await fireEvent.press(getByText('Easy'))
    expect(StyleSheet.flatten(getByText('Easy').props.style).color).toBe(theme.colors.onSuccessContainer)
    // Green channel clearly dominant, and Hard goes back to plain onSurface now that it's no
    // longer checked — its red doesn't linger.
    const [er, eg, eb] = colorChannels(theme.colors.onSuccessContainer)
    expect(eg).toBeGreaterThan(er)
    expect(eg).toBeGreaterThan(eb)
    expect(StyleSheet.flatten(getByText('Hard').props.style).color).toBe(theme.colors.onSurface)
  })

  it("fills the selected difficulty segment's own background with its theme role's container color, and clears it once the selection moves elsewhere", async () => {
    const { getByText, theme } = await renderDrawerWithRealTheme()
    // react-native-paper's SegmentedButtons has no per-segment checked-background prop (checkedColor
    // only ever reaches the text/icon/border) — PuzzleDrawer applies this as a plain style override
    // on whichever button is currently checked (see difficultyOptions), which lands on the segment's
    // outer View, three parents up from its label Text.
    const fillOf = (label: string) => StyleSheet.flatten(getByText(label).parent?.parent?.parent?.props.style).backgroundColor

    await fireEvent.press(getByText('Hard'))
    expect(fillOf('Hard')).toBe(theme.colors.dangerContainer)
    const [hr, hg, hb] = colorChannels(theme.colors.dangerContainer)
    expect(hr).toBeGreaterThan(hg)
    expect(hr).toBeGreaterThan(hb)
    // "Any" (checked by default) goes back to the theme's own plain unchecked background
    // (transparent) once it's no longer checked — not a lingering tint.
    expect(fillOf('Any')).toBe('transparent')

    await fireEvent.press(getByText('Easy'))
    expect(fillOf('Easy')).toBe(theme.colors.successContainer)
    const [er, eg, eb] = colorChannels(theme.colors.successContainer)
    expect(eg).toBeGreaterThan(er)
    expect(eg).toBeGreaterThan(eb)
    expect(fillOf('Hard')).toBe('transparent')
  })

  it("colors 'Any' with the theme's own primary color when selected, since it isn't a difficulty tier with a semantic role of its own", async () => {
    const { getByText, theme } = await renderDrawerWithRealTheme()

    // baseConfig.difficulty is 'any', so it's already checked on first render — no press needed.
    expect(StyleSheet.flatten(getByText('Any').props.style).color).toBe(theme.colors.primary)
  })

  // Appearance/keyboard layout/haptics moved out to their own SettingsDrawer (reached via the
  // gear icon below) — this menu is gameplay-only now (packs, difficulty, Random, Pass & play).
  // See SettingsDrawer.test.tsx for coverage of the controls themselves.
  it('does not show the Appearance or Keyboard controls directly, only a Settings entry point to reach them', async () => {
    const { getByLabelText, queryByText, queryByLabelText } = await renderDrawer()

    expect(queryByText('Appearance')).toBeNull()
    expect(queryByLabelText('System')).toBeNull()
    expect(queryByText('QWERTY')).toBeNull()
    expect(queryByText('ABC')).toBeNull()
    expect(getByLabelText('Settings')).toBeTruthy()
  })

  it('titles the drawer with the app name and its version, not a generic "Game Menu" the hamburger icon already implies or the "OTA" jargon a player wouldn\'t recognize', async () => {
    const { getByText, queryByText } = await renderDrawer()

    expect(getByText('Hangman')).toBeTruthy()
    expect(getByText(/^v\d+$/)).toBeTruthy()
    expect(queryByText(/OTA/)).toBeNull()
  })

  // Jest runs with __DEV__ true, same as this app's own dev/web guard checks for — so this
  // exercises the actual real-world behavior of running the app from a dev build or the web dev
  // server, not a simulated one.
  it("shows an in-app alert instead of calling check() while running in dev, since react-native-web's Alert.alert — what check() falls back to on its own — is a silent no-op there", async () => {
    const { getByLabelText } = await renderDrawer()

    await fireEvent.press(getByLabelText('Check for updates'))

    expect(mockAlert).toHaveBeenCalledWith('Updates unavailable', 'Update checks are disabled in development mode.')
    expect(mockCheck).not.toHaveBeenCalled()
  })

  it('calls the real check() on a platform the hook actually supports, from pressing either the version text or "Hangman" itself', async () => {
    // __DEV__ is declared `const` (see react-native's own globals.d.ts) purely so app code can't
    // reassign it by accident — real value, real global, genuinely swappable at runtime, which is
    // exactly what simulating a production build here needs. The `any` cast is what sidesteps the
    // same const-ness that's the whole reason this override works truthfully instead of mocking a
    // module.
    const globalWithDev = globalThis as unknown as { __DEV__: boolean }
    const originalDev = globalWithDev.__DEV__
    globalWithDev.__DEV__ = false
    try {
      const { getByLabelText, getByText } = await renderDrawer()

      await fireEvent.press(getByText('Hangman'))
      await fireEvent.press(getByLabelText('Check for updates'))

      expect(mockCheck).toHaveBeenCalledTimes(2)
      expect(mockAlert).not.toHaveBeenCalled()
    } finally {
      globalWithDev.__DEV__ = originalDev
    }
  })

  it('shows a checking state on the version text while a check is in flight, and disables it against a second tap', async () => {
    mockUseUpdater.mockReturnValue({ check: mockCheck, checking: true, updateReady: false })
    const { getByLabelText, getByText } = await renderDrawer()

    expect(getByText(/v\d+ · checking…/)).toBeTruthy()
    const versionText = getByLabelText('Checking for updates')
    expect(versionText.props.accessibilityState?.disabled ?? versionText.props.disabled).toBe(true)
  })

  it('flags a silently-staged update on the version text, from the same background check every other game on this hook relies on', async () => {
    mockUseUpdater.mockReturnValue({ check: mockCheck, checking: false, updateReady: true })
    const { getByText } = await renderDrawer()

    expect(getByText(/v\d+ · update ready/)).toBeTruthy()
  })
})
