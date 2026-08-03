import { AppearancePicker, PalettePicker, useThemeSettings } from '@rific/auto-paper'
import { Drawer, DrawerEdgeSwipe } from '@rific/drawer'
import { Button, IconButton, SegmentedButtons, TouchableRipple } from '@rific/haptic-press'
import { useUpdater } from '@rific/updater'
import { JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, ScrollView as RNScrollView, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DRAWER_HEADER_ROW_STYLE, DRAWER_HEADER_TITLE_WRAP_STYLE } from '@/constants/drawerHeader'
import { release } from '@/constants/release'
import { getContainerColor, useDifficultyColors, useDifficultyContainerColors } from '@/hooks/useDifficultyColors'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { usePackSelection } from '@/hooks/usePackSelection'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap, getUnlockedCountForPack, PuzzleUnlockMap } from '@/utils/unlocks'

import { ModeSelector } from './ModeSelector'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'
import { PacksScreen } from './PacksScreen'

const DRAWER_WIDTH = 380
// Opacity folded into the color itself — boxShadow (unlike the deprecated shadow* props it
// replaces) has no separate opacity field.
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)'

export type PuzzleDrawerProps = {
  visible: boolean
  onDismiss: () => void
  onRequestOpen: () => void
  initialConfig: PuzzleConfig
  onConfirm: (payload: GameStartPayload, config: PuzzleConfig) => void
  // Starts a two-player pass-and-play session instead of drawing a puzzle. Owned by Main, which
  // holds the session state machine — this drawer only launches it.
  onStartPnp?: () => void
  packsVersion?: number
  onPacksChanged?: () => void
  // Fired live, on every change — not staged behind the confirm button — so the art style updates
  // the round already in progress immediately, and the difficulty filter is already in effect the
  // moment the current round ends, without the player having to also press New Puzzle/Start Puzzle
  // just to save what they picked.
  onModeChange?: (mode: GameMode) => void
  onDifficultyChange?: (difficulty: 'any' | PuzzleDifficultyTier) => void
}

export const PuzzleDrawer = ({ visible, onDismiss, onRequestOpen, initialConfig, onConfirm, onStartPnp = () => {}, packsVersion = 0, onPacksChanged = () => {}, onModeChange = () => {}, onDifficultyChange = () => {} }: PuzzleDrawerProps): JSX.Element => {
  const { settings, set } = useThemeSettings()
  const theme = useTheme()
  const { layout, setLayout } = useKeyboardLayout()
  // autoCheck stays on (the default) — matches every other game built on this hook, which stage
  // updates silently in the background and apply on the next cold launch with no button needed.
  // check() below is purely an ADDITIONAL affordance for a player who wants to force a check right
  // now, now that the version text has a natural home for it in the header.
  const { check, checking, updateReady } = useUpdater()
  const insets = useSafeAreaInsets()
  // packsVersion isn't read here — it's a change counter bumped whenever a custom pack is
  // created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const translateX = useSharedValue(-DRAWER_WIDTH)
  // The persisted default (see usePackSelection) — read and written live, not staged in `draft`
  // like the rest of this config, so toggling a pack takes effect immediately for every future
  // round rather than only once "Random" is pressed.
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()

  const [draft, setDraft] = useState<PuzzleConfig>(initialConfig)
  const [packsScreenVisible, setPacksScreenVisible] = useState(false)
  // Which pack's puzzle list is showing, and whether it's actually open — split rather than one
  // nullable "open pack" so dismissing doesn't null the key out mid-close-animation (see
  // PackPuzzlesDrawer's own doc comment on packKey for why that would flash the content blank).
  const [playPackKey, setPlayPackKey] = useState<string | null>(null)
  const [playDrawerVisible, setPlayDrawerVisible] = useState(false)
  const anyOverlayVisible = packsScreenVisible || playDrawerVisible
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})

  const packSummaryLabel = useMemo(() => {
    if (selectedPackKeys.length === 0) return 'No packs selected'
    if (selectedPackKeys.length === manifest.length) return 'All packs'
    return `${selectedPackKeys.length} of ${manifest.length} selected`
  }, [selectedPackKeys, manifest.length])

  // In manifest order (built-in packs first, alphabetical within that), not selection order —
  // stable regardless of the order packs happened to get toggled on in, and matches what Choose
  // packs itself shows.
  const selectedPacks = useMemo(() => {
    const selectedSet = new Set(selectedPackKeys)
    return manifest.filter((item) => selectedSet.has(item.key))
  }, [manifest, selectedPackKeys])

  // Same theme-harmonized green/amber/red the difficulty badge shows during play (see
  // useDifficultyColors) — so picking "Hard" here and seeing "Hard" during the round are visually
  // the same color, not just the same word.
  const difficultyColors = useDifficultyColors()
  // The SELECTED segment's own fill, not just its text — a lightened tint of the same tier color,
  // so picking "Hard" doesn't just turn the label red, the whole pill reads as red. react-native-
  // paper's SegmentedButtons has no prop for a per-segment checked background (checkedColor only
  // ever reaches the text/icon/border — see SegmentedButtonItem's getSegmentedButtonColors), so this
  // is applied as a plain style override below, and only on the option that's actually checked —
  // every button always renders its OWN style regardless of checked state, unlike checkedColor.
  const difficultyContainerColors = useDifficultyContainerColors()
  const anyContainerColor = useMemo(() => getContainerColor(theme.colors.primary, theme.colors.surface), [theme.colors.primary, theme.colors.surface])

  const difficultyOptions = useMemo((): { label: string; value: 'any' | PuzzleDifficultyTier; checkedColor?: string; style?: { backgroundColor: string } }[] => {
    const tiers: { label: string; value: 'any' | PuzzleDifficultyTier; checkedColor: string; containerColor: string }[] = [
      // "Any" isn't a difficulty tier, so it has no green/amber/red of its own — colored with the
      // theme's own primary instead, so it still pops when selected rather than being the one
      // segment that looks unfinished next to three colored ones.
      { label: 'Any', value: 'any', checkedColor: theme.colors.primary, containerColor: anyContainerColor },
      { label: 'Easy', value: 'easy', checkedColor: difficultyColors.easy, containerColor: difficultyContainerColors.easy },
      { label: 'Medium', value: 'medium', checkedColor: difficultyColors.medium, containerColor: difficultyContainerColors.medium },
      { label: 'Hard', value: 'hard', checkedColor: difficultyColors.hard, containerColor: difficultyContainerColors.hard }
    ]
    return tiers.map(({ containerColor, ...option }) => (option.value === draft.difficulty ? { ...option, style: { backgroundColor: containerColor } } : option))
  }, [difficultyColors, difficultyContainerColors, theme.colors.primary, anyContainerColor, draft.difficulty])

  const updateDraft = useCallback((patch: Partial<PuzzleConfig>) => setDraft((d) => ({ ...d, ...patch })), [])

  // Resets the draft from whatever's currently playing each time the drawer opens.
  // Drawer/DrawerEdgeSwipe (from @rific/drawer) own the actual open/close animation, so this effect
  // only has to mirror the prop into editable local state — a legitimate external-system sync.
  //
  // Deliberately NOT keyed on initialConfig itself: mode and difficulty are live (see
  // onModeChange/onDifficultyChange below), which mutates Main.tsx's config — and therefore this
  // same initialConfig prop — while the drawer is still open, and resetting the whole draft on
  // every one of those echoes would fight the player's own in-progress edits to the rest of the
  // draft (e.g. a difficulty filter they just picked) just because they tapped a different mode
  // card a moment earlier.
  /* eslint-disable react-hooks/set-state-in-effect -- syncs the draft from an external prop, not derived from other state */
  useEffect(() => {
    if (!visible) return
    setDraft(initialConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialConfig is deliberately excluded, see above
  }, [visible])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Re-fetched each time the drawer opens, not subscribed to live — good enough for the per-pack
  // progress the quick-start list below shows, and matches the one-shot fetch every other
  // pack-progress display in this app already does (PackPuzzleList, AchievementsDrawer).
  useEffect(() => {
    if (!visible) return
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (mounted) setUnlockMap(map)
    })
    return () => {
      mounted = false
    }
  }, [visible])

  const handleConfirm = useCallback(() => {
    const configToResolve: PuzzleConfig = { ...draft, sourceMode: 'random' }
    const result = resolvePuzzle(configToResolve, selectedPackKeys, unlockMap)
    if (!result.ok) {
      void alert('No puzzles available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
  }, [draft, onConfirm, selectedPackKeys, unlockMap])

  // Opens that pack's own puzzle list (PackPuzzlesDrawer) rather than drawing from it directly —
  // picking a specific puzzle or a pack-scoped Random both happen from there now.
  const handleOpenPack = useCallback((packKey: string) => {
    setPlayPackKey(packKey)
    setPlayDrawerVisible(true)
  }, [])

  const handleSelectMode = useCallback(
    (mode: GameMode) => {
      updateDraft({ mode })
      onModeChange(mode)
    },
    [updateDraft, onModeChange]
  )

  const handleSelectDifficulty = useCallback(
    (value: 'any' | PuzzleDifficultyTier) => {
      updateDraft({ difficulty: value })
      onDifficultyChange(value)
    },
    [updateDraft, onDifficultyChange]
  )

  // Mirrors @rific/updater's own "unsupported here" guard (__DEV__ || web) rather than always
  // calling check() and letting the hook handle it: the hook's version of that guard shows its
  // message via react-native's Alert.alert, which react-native-web implements as a bare no-op (see
  // node_modules/react-native-web/src/exports/Alert — the whole class is `static alert() {}`) —
  // so on web, pressing this would otherwise do nothing visible at all. This app's own alert()
  // already exists for exactly that gap (falls back to window.alert on web) and is used the same
  // way elsewhere in this file. A real production build never takes this branch — check() runs
  // for real there, on a platform where Alert.alert isn't a no-op.
  const handleCheckForUpdate = useCallback(() => {
    if (__DEV__ || Platform.OS === 'web') {
      void alert('Updates unavailable', Platform.OS === 'web' ? 'Update checks are not supported on web.' : 'Update checks are disabled in development mode.')
      return
    }
    void check()
  }, [check])

  return (
    <>
      <DrawerEdgeSwipe enabled={!visible} onOpen={onRequestOpen} translateX={translateX} width={DRAWER_WIDTH} />
      <Drawer open={visible} onClose={onDismiss} translateX={translateX} width={DRAWER_WIDTH}>
        {/* PacksScreen and PackPuzzlesDrawer each render as a full-width Drawer of their own,
            stacked on top of this one while open — visually complete coverage, but this panel's
            own content stays mounted underneath (Drawer never unmounts on close, just
            translates). Without factoring anyOverlayVisible in here too, this panel's title/close
            button/fields would stay reachable by screen readers and keyboard focus while
            invisible behind whichever screen is covering them. */}
        <View testID='puzzle-drawer-panel' style={[styles.panelContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={visible && !anyOverlayVisible} accessibilityElementsHidden={!visible || anyOverlayVisible} importantForAccessibility={visible && !anyOverlayVisible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible && !anyOverlayVisible ? onDismiss : undefined}>
          <View style={styles.headerRow}>
            {/* The hamburger icon that opens this already says "menu" — naming the app instead is
                more informative, and the OTA version rides along right underneath it rather than
                its own separate card further down (see the removed Card that used to sit at the
                bottom of the scroll content).
                The whole title block is the touch target, not just the version line — "Hangman" is
                as good a place to expect a tap as the version text right under it, and a two-line
                target is easier to find and hit than a single small caption.
                Tappable — check() is a no-op (an informational alert) in dev and on web by the
                hook's own design, so this only does something real in a production build; harmless
                either way to leave reachable everywhere rather than platform-gating the touch
                target itself.
                padding+negative margin (not hitSlop) — the hover/ripple highlight is the touchable's
                own visible box, so it needs real breathing room around the text to round out nicely;
                hitSlop only extends invisible touch detection, it doesn't affect what the hover
                state actually looks like. The negative margin cancels the padding back out so it
                doesn't shrink the touchable within DRAWER_HEADER_TITLE_WRAP_STYLE's own reserved
                width — a centered title, matching every other drawer's header (see
                AchievementsDrawer), not left-aligned flush with the row's edge.
                Close sits on the LEADING (left) side, not trailing — this drawer opens from the
                hamburger icon at the top-left of the game screen, so closing it from the same
                corner your thumb already used to open it keeps the gesture symmetric. Every other
                drawer reached from here (PackPuzzlesDrawer, PacksScreen and its own children)
                follows the same left-anchored convention; AchievementsDrawer stays right-anchored
                since it opens from the trophy icon on the opposite corner.
                arrow-left rather than a plain X — the arrow's direction shows which way this panel
                actually moves when dismissed (back off to the left, the same way it slid in), which
                a direction-less X can't communicate; it also sidesteps any expectation that an X
                belongs in the top-right corner, since this isn't that convention at all. */}
            <IconButton icon='arrow-left' onPress={onDismiss} accessibilityLabel='Close' />
            {/* Absolutely positioned across the full row (see DRAWER_HEADER_TITLE_WRAP_STYLE) so
                its center is the row's true center, independent of the icon/spacer widths on
                either side of it. numberOfLines={1} on both lines — unlike every sibling drawer's
                single-line title, this is a two-line title+subtitle stack inside a fixed-height
                row with no overflow clipping, so without it a large OS accessibility font size
                could wrap the (dynamic, so unpredictably wide) subtitle onto an extra line and
                bleed past the row into the Appearance section right below it. */}
            <View style={DRAWER_HEADER_TITLE_WRAP_STYLE}>
              <TouchableRipple onPress={handleCheckForUpdate} disabled={checking} accessibilityRole='button' accessibilityLabel={checking ? 'Checking for updates' : 'Check for updates'} style={styles.titleTouchable}>
                <View>
                  <Text variant='titleLarge' numberOfLines={1} style={styles.centeredText}>
                    Hangman
                  </Text>
                  {/* "OTA" is Expo/EAS-update jargon — meaningful for spotting which build a player's
                      on, meaningless to the player themselves. The bare "v" + number is what's
                      actually being loaded (release.otaVersion), still legible as a version to someone
                      who's never heard the term OTA. */}
                  <Text variant='bodySmall' numberOfLines={1} style={[styles.headerSubtitle, styles.centeredText]}>
                    v{release.otaVersion}
                    {checking ? ' · checking…' : updateReady ? ' · update ready' : ''}
                  </Text>
                </View>
              </TouchableRipple>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <RNScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
            {/* App-wide appearance leads the drawer — a quick, no-scroll toggle now that Settings
                has been folded into this hamburger menu, ahead of the puzzle-specific controls
                below it. The accent-color swatch sits inline with the picker rather than as its
                own labeled row — what it does is obvious without a caption. */}
            <Text variant='titleMedium' style={styles.topSectionLabel}>
              Appearance
            </Text>
            <View style={styles.row}>
              <PalettePicker value={settings.color} onChange={(color) => set({ color })} />
              <View style={styles.flex}>
                <AppearancePicker value={settings.appearance} onChange={(appearance) => set({ appearance })} showLabels={false} />
              </View>
            </View>

            {/* No title — QWERTY vs ABC is self-explanatory without one. */}
            <SegmentedButtons
              value={layout}
              onValueChange={(value) => setLayout(value as typeof layout)}
              buttons={[
                { value: 'qwerty', label: 'QWERTY' },
                { value: 'abc', label: 'ABC' }
              ]}
              style={styles.keyboardPicker}
            />

            {/* The hero: the visual/tactile choice (what the round looks and feels like) leads,
                ahead of the more utilitarian pack/difficulty controls below it. No label — the
                mode cards are self-explanatory without one. */}
            <ModeSelector selected={draft.mode} color={settings.color} onSelect={handleSelectMode} />

            <Text variant='titleMedium' style={styles.heroAdjacentSectionLabel}>
              Difficulty
            </Text>
            <SegmentedButtons value={draft.difficulty} onValueChange={(value) => handleSelectDifficulty(value as 'any' | PuzzleDifficultyTier)} buttons={difficultyOptions} />

            <Text variant='titleMedium' style={styles.sectionLabel}>
              Packs
            </Text>
            <Button mode='outlined' icon='format-list-checks' onPress={() => setPacksScreenVisible(true)} contentStyle={styles.choosePacksContent}>
              {packSummaryLabel}
            </Button>

            {/* One row per pack in the current selection — tapping it opens that pack's own
                puzzle list (browse and pick one, or draw randomly from just there), without
                changing the selection itself. Manage which packs are IN this list via Choose
                packs above; this is only ever a subset of what's selected there. The trailing
                eye icon is the fast path to trim this list without a trip through Choose packs —
                it unselects the pack (same selectedPackKeys Choose packs itself toggles), so
                "hidden" here just means "unselected there", and Choose packs is already the place
                to bring it back. */}
            <View style={styles.packList}>
              {selectedPacks.map((item) => {
                const unlocked = getUnlockedCountForPack(unlockMap, item.key)
                const progress = item.count > 0 ? unlocked / item.count : 0
                return <PackRow key={item.key} label={item.label} group={item.group} subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => handleOpenPack(item.key)} trailing={<IconButton icon='eye-off-outline' size={20} onPress={() => setSelectedPackKeys(selectedPackKeys.filter((key) => key !== item.key))} accessibilityLabel={`Hide ${item.label}`} />} />
              })}
            </View>
          </RNScrollView>

          {/* A fixed footer, not part of the scrollable content — leaving the button inline at the
              end of a form this short left a large dead gap below it instead of avoiding one.
              Docking it here closes that gap and keeps the primary action reachable without
              scrolling. No divider above it — the padding alone reads as separate from the
              content without adding a hard line. */}
          <View style={styles.footer}>
            <Button mode='contained' icon='play' onPress={handleConfirm} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
              Random
            </Button>
            <Button mode='contained-tonal' icon='account-multiple' onPress={onStartPnp} style={styles.pnpButton} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
              Pass &amp; play
            </Button>
          </View>
        </View>
      </Drawer>

      <PacksScreen visible={packsScreenVisible} onDismiss={() => setPacksScreenVisible(false)} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={onPacksChanged} />

      {/* Rendered last so it stacks above both this drawer's own panel and PacksScreen — every
          Drawer instance shares the same z-index (see @rific/drawer), so DOM order is what
          decides who paints on top. */}
      <PackPuzzlesDrawer visible={playDrawerVisible} packKey={playPackKey} mode={draft.mode} difficulty={draft.difficulty} onDismiss={() => setPlayDrawerVisible(false)} onConfirm={onConfirm} />
    </>
  )
}

const styles = StyleSheet.create({
  centeredText: { textAlign: 'center' },
  choosePacksContent: { justifyContent: 'flex-start' },
  confirmContent: { height: 52 },
  confirmLabel: { fontSize: 16, fontWeight: '700' },
  flex: { flex: 1 },
  footer: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  headerRow: DRAWER_HEADER_ROW_STYLE,
  headerSpacer: { width: 40 },
  headerSubtitle: { opacity: 0.7 },
  // A tighter top margin than a standalone section would use — right under the mode cards, so it
  // reads as "here's what you just picked" rather than a new, unrelated block starting.
  heroAdjacentSectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12
  },
  // Tight above (same Appearance group as the row it follows), a full section break below —
  // ModeSelector brings no vertical margin of its own, so the gap before the artwork lives here.
  keyboardPicker: { marginBottom: 16, marginTop: 8 },
  packList: { marginTop: 8 },
  panelContent: {
    boxShadow: [{ offsetX: 2, offsetY: 0, blurRadius: 8, color: SHADOW_COLOR }],
    elevation: 8,
    flex: 1,
    overflow: 'hidden'
  },
  pnpButton: { marginTop: 8 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  scrollContent: {
    paddingBottom: 16,
    paddingHorizontal: 16
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  },
  // margin cancels padding out — the touchable needs real padding for its own hover/ripple box to
  // round out away from the text (see the comment at its call site). No flex:1 — DRAWER_HEADER_
  // TITLE_WRAP_STYLE's own justifyContent:'center' is what vertically centers this within the
  // header row, and a flex:1 child here would stretch to fill that entire row height itself,
  // pinning its content to the top instead and leaving the parent's centering with nothing to do.
  titleTouchable: {
    borderRadius: 8,
    margin: -8,
    padding: 8
  },
  topSectionLabel: {
    fontWeight: '700',
    marginBottom: 8
  }
})
