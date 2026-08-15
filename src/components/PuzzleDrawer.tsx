import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { Drawer, DrawerEdgeSwipe } from '@rific/drawer'
import { Button, IconButton, SegmentedButtons, TouchableRipple } from '@rific/haptic-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { useUpdater } from '@rific/updater'
import { JSX, memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Avatar, Card, Icon, ProgressBar, Text, useTheme } from 'react-native-paper'
import { useSharedValue } from 'react-native-reanimated'

import { DRAWER_BASE_Z_INDEX } from '@/constants/drawerStacking'
import { release } from '@/constants/release'
import { useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import { usePackSelection } from '@/hooks/usePackSelection'
import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { ACHIEVEMENT_DEFINITIONS, type AchievementStats, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats } from '@/utils/achievements'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { getManifestUnlockProgress, getPuzzleUnlockMap, getUnlockedCountForPack, PuzzleUnlockMap } from '@/utils/unlocks'

import { AchievementsDrawer } from './AchievementsDrawer'
import { GameVisual } from './GameVisual'
import { ModePickerDrawer } from './ModePickerDrawer'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'
import { PacksScreen } from './PacksScreen'

const DRAWER_WIDTH = 380
// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

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
  // Threaded straight through to the nested AchievementsDrawer (see below) — mirrors
  // packsVersion/onPacksChanged just above.
  unlockVersion?: number
  onUnlocksChanged?: () => void
  // Fired live, on every change — not staged behind the confirm button — so the art style updates
  // the round already in progress immediately, and the difficulty filter is already in effect the
  // moment the current round ends, without the player having to also press New Puzzle/Start Puzzle
  // just to save what they picked.
  onModeChange?: (mode: GameMode) => void
  onDifficultyChange?: (difficulty: 'any' | PuzzleDifficultyTier) => void
}

// Memoized: PacksScreen/PackPuzzlesDrawer below (and everything they in turn
// render — pack rows, the pack editor form) stay mounted at all times (see the Drawer-never-
// unmounts comment further down), so without this, any unrelated state change in Main
// (difficulty, mode, drawerVisible toggling elsewhere) would re-render this entire subtree for
// no visible-facing reason. Callers must keep every prop referentially stable (useCallback/
// useMemo) or this memo does nothing — see Main.tsx's own initialDrawerConfig/handleOpenDrawer.
export const PuzzleDrawer = memo(({ visible, onDismiss, onRequestOpen, initialConfig, onConfirm, onStartPnp = () => {}, packsVersion = 0, onPacksChanged = () => {}, unlockVersion = 0, onUnlocksChanged = () => {}, onModeChange = () => {}, onDifficultyChange = () => {} }: PuzzleDrawerProps): JSX.Element => {
  // Only settings.color is read here now (the mode summary row's own preview swatch) — editing
  // appearance itself moved to ModePickerDrawer, reached via that same row.
  const { settings } = useThemeSettings()
  const theme = useTheme()
  // autoCheck stays on (the default) — matches every other game built on this hook, which stage
  // updates silently in the background and apply on the next cold launch with no button needed.
  // check() below is purely an ADDITIONAL affordance for a player who wants to force a check right
  // now, now that the version text has a natural home for it in the header.
  const { check, checking, updateReady } = useUpdater()
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
  const [achievementsVisible, setAchievementsVisible] = useState(false)
  const [modePickerVisible, setModePickerVisible] = useState(false)
  const anyOverlayVisible = packsScreenVisible || playDrawerVisible || achievementsVisible || modePickerVisible
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  const [achievementStats, setAchievementStats] = useState<AchievementStats>(DEFAULT_ACHIEVEMENT_STATS)

  // Same triad PuzzleStage.tsx builds for the real game visual — without this, the mode summary
  // row's own preview would silently fall back to plain `color` instead of showing the actual
  // multi-color look a selected mode gets in-game (see e.g. hourglass.tsx, classic.tsx).
  const themeColors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])

  // The "All packs" row's own label — how many of the manifest's packs are actually toggled on for
  // Random/quick-start draws, not the unlock-progress subtitle just below it (that one deliberately
  // stays scoped to every pack regardless of selection, the same "your overall collection" framing
  // the Achievements card uses — this is a second, different fact about the same row, not a
  // narrower view of the first one). No special-cased "No packs selected" string for zero anymore —
  // "0 of 50 Packs" already says that, in the same shape as every other count here.
  const packsLabel = useMemo(() => (selectedPackKeys.length === manifest.length ? 'All Packs' : `${selectedPackKeys.length} of ${manifest.length} Packs`), [selectedPackKeys.length, manifest.length])

  // In manifest order (built-in packs first, alphabetical within that), not selection order —
  // stable regardless of the order packs happened to get toggled on in, and matches what Choose
  // packs itself shows.
  const selectedPacks = useMemo(() => {
    const selectedSet = new Set(selectedPackKeys)
    return manifest.filter((item) => selectedSet.has(item.key))
  }, [manifest, selectedPackKeys])

  // Same theme-harmonized green/amber/red the difficulty badge shows during play, and the same
  // four-way (Any + the three real tiers) color set PackPuzzleList's own difficulty filter menu
  // uses — one shared hook so the two stay visually identical rather than two hand-rolled copies
  // (see useDifficultyOptionColors's own doc comment).
  const difficultyOptionColors = useDifficultyOptionColors()

  const difficultyOptions = useMemo((): { label: string; value: 'any' | PuzzleDifficultyTier; checkedColor: string; uncheckedColor: string; style: { backgroundColor: string } }[] => {
    const tiers: { label: string; value: 'any' | PuzzleDifficultyTier }[] = [
      { label: 'Any', value: 'any' },
      { label: 'Easy', value: 'easy' },
      { label: 'Medium', value: 'medium' },
      { label: 'Hard', value: 'hard' }
    ]
    // react-native-paper's SegmentedButtons has no prop for a per-segment checked background
    // (checkedColor only ever reaches text/icon/border — see SegmentedButtonItem's
    // getSegmentedButtonColors), so both checked AND unchecked backgrounds are applied as a plain
    // style override below, on every option, not just whichever is checked — every button always
    // renders its OWN style regardless of checked state, unlike checkedColor/uncheckedColor.
    return tiers.map((option) => {
      const checked = option.value === draft.difficulty
      const colors = difficultyOptionColors[option.value]
      return { ...option, checkedColor: colors.onVibrant, uncheckedColor: colors.onContainer, style: { backgroundColor: checked ? colors.vibrant : colors.container } }
    })
  }, [difficultyOptionColors, draft.difficulty])

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
  useEffect(() => {
    if (!visible) return
    setDraft(initialConfig)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialConfig is deliberately excluded, see above
  }, [visible])

  // Re-fetched each time the drawer opens, AND whenever unlockVersion bumps (a puzzle solved
  // elsewhere while this drawer is already open, e.g. through the nested AchievementsDrawer's own
  // Random) — the quick-start list's per-pack progress and the "All packs" row's own unlocked
  // count (see totalUnlocked/totalAvailable/overallProgress) both read unlockMap live rather than
  // only on next open; the Achievements card's own earned-count reads achievementStats the same
  // way, fetched alongside it (same Promise.all pairing AchievementsDrawer's own identical effect
  // uses) since a puzzle solved elsewhere can unlock a new achievement in the same stroke.
  useEffect(() => {
    if (!visible) return
    let mounted = true
    void Promise.all([getPuzzleUnlockMap(), getAchievementStats()]).then(([map, stats]) => {
      if (mounted) {
        setUnlockMap(map)
        setAchievementStats(stats)
      }
    })
    return () => {
      mounted = false
    }
  }, [visible, unlockVersion])

  // Shared with AchievementsDrawer's own identical "Total progress" computation (see
  // getManifestUnlockProgress's own doc comment) — the quick-look card below shows the exact same
  // numbers as the drawer it opens.
  const { totalUnlocked, totalAvailable, overallProgress } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])

  const handleConfirm = useCallback(() => {
    const configToResolve: PuzzleConfig = { ...draft, sourceMode: 'random' }
    const result = resolvePuzzle(configToResolve, selectedPackKeys, unlockMap)
    if (!result.ok) {
      void alert('No puzzles available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
  }, [draft, onConfirm, selectedPackKeys, unlockMap])

  // A quick-start row's own tap: the Game Menu is about getting a game going as fast as possible,
  // so pressing a pack now draws instantly from just that one — same shape as handleConfirm above,
  // just scoped to a single packKey instead of the whole selection. Browsing that pack (picking a
  // specific puzzle, or a pack-scoped Random from within its own list) moved to the row's trailing
  // info icon (see handleOpenPack) rather than living behind the row tap itself.
  const handleQuickRandom = useCallback(
    (packKey: string) => {
      const configToResolve: PuzzleConfig = { ...draft, sourceMode: 'random' }
      const result = resolvePuzzle(configToResolve, [packKey], unlockMap)
      if (!result.ok) {
        void alert('No puzzles available', result.error)
        return
      }
      onConfirm(result.payload, configToResolve)
    },
    [draft, onConfirm, unlockMap]
  )

  // Opens that pack's own puzzle list (PackPuzzlesDrawer) — browsing, not the fast path above.
  const handleOpenPack = useCallback((packKey: string) => {
    setPlayPackKey(packKey)
    setPlayDrawerVisible(true)
  }, [])

  // Stable identities for PacksScreen/PackPuzzlesDrawer's own onDismiss below — each is memoized
  // (see their own files) specifically so an unrelated re-render here (e.g. this component's own
  // `draft` changing) doesn't cascade into them; a fresh arrow function on every render would defeat
  // that regardless of the memo.
  const handleClosePacksScreen = useCallback(() => setPacksScreenVisible(false), [])
  const handleClosePlayDrawer = useCallback(() => setPlayDrawerVisible(false), [])
  const handleCloseAchievements = useCallback(() => setAchievementsVisible(false), [])
  const handleOpenModePicker = useCallback(() => setModePickerVisible(true), [])
  const handleCloseModePicker = useCallback(() => setModePickerVisible(false), [])

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

  // One row per pack in the current selection. The Game Menu is about getting a game going as
  // fast as possible, so tapping a row itself draws an instant random puzzle from just that pack
  // (handleQuickRandom) rather than opening its list — browsing (picking a specific puzzle, or a
  // pack-scoped Random from within it) is the trailing info icon instead, a small but visible
  // affordance rather than a hidden gesture. Manage which packs are IN this list via Choose packs
  // above; this is only ever a subset of what's selected there. Long-pressing a row is the fast
  // path to trim this list without a trip through Choose packs — it unselects the pack (same
  // selectedPackKeys Choose packs itself toggles), so "hidden" here just means "unselected there",
  // and Choose packs is already the place to bring it back. Deliberately not a visible affordance
  // (no icon, no hint) — a long press is fine as a not-immediately-obvious power-user shortcut here.
  // Rendered via FlatList (below), not a plain .map() — the full built-in manifest is 50 packs, real
  // enough on-device render cost once a player has most/all of them selected that virtualizing
  // (only mounting on-screen rows) is what actually fixed the felt delay opening this menu, not
  // just memoizing the row component.
  const renderPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const progress = item.count > 0 ? unlocked / item.count : 0
      return <PackRow label={item.label} group={item.group} isPack subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => handleQuickRandom(item.key)} onLongPress={() => setSelectedPackKeys(selectedPackKeys.filter((key) => key !== item.key))} trailing={<IconButton icon='information-outline' size={20} onPress={() => handleOpenPack(item.key)} accessibilityLabel={`Browse ${item.label}`} />} />
    },
    [unlockMap, handleQuickRandom, handleOpenPack, selectedPackKeys, setSelectedPackKeys]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // Everything ABOVE the pack list — mode picker, difficulty filter, Choose packs summary button
  // — as the FlatList's own scrolling header rather than a sibling before it, so it scrolls away
  // with the rest of the content exactly as it did back when this was all one plain ScrollView.
  const listHeader = useMemo(
    () => (
      <>
        <Text variant='titleMedium' style={styles.topSectionLabel}>
          Achievements
        </Text>
        {/* Same big-number/progress-bar visual language as the "All packs" row below (tapping
            either opens the full drawer/screen behind it) but a different metric — earned
            achievements out of the fixed ACHIEVEMENT_DEFINITIONS list, not a puzzle-unlock count.
            That count already lives on "All packs" now (and on every pack row below it); showing
            it a second time here just made this card look like one more pack row instead of its
            own distinct facet of progress. */}
        <Card style={[styles.achievementsCard, { backgroundColor: theme.colors.primaryContainer }]} mode='contained' onPress={() => setAchievementsVisible(true)}>
          <Card.Content style={styles.achievementsCardRow}>
            <Avatar.Icon size={40} icon='trophy-award' color={theme.colors.onPrimary} style={{ backgroundColor: theme.colors.primary }} />
            <View style={styles.achievementsText}>
              {/* No "Achievements" overline in here anymore — the topSectionLabel right above the
                  card already says it, and repeating it a second time immediately below read as
                  the same word twice in a row. */}
              <Text variant='titleSmall' style={{ color: theme.colors.onPrimaryContainer }}>
                {achievementStats.unlockedIds.length}
                <Text variant='titleSmall' style={[styles.muted, { color: theme.colors.onPrimaryContainer }]}>
                  {' '}
                  / {ACHIEVEMENT_DEFINITIONS.length}
                </Text>
              </Text>
              <Text variant='bodySmall' style={[styles.muted, { color: theme.colors.onPrimaryContainer }]}>
                Achievements earned
              </Text>
              <View style={styles.progressBarWrapper}>
                <ProgressBar progress={achievementStats.unlockedIds.length / ACHIEVEMENT_DEFINITIONS.length} style={[styles.progressBar, { backgroundColor: theme.colors.surface }]} />
              </View>
            </View>
            <Icon source='chevron-right' size={24} color={theme.colors.onPrimaryContainer} />
          </Card.Content>
        </Card>

        <Text variant='titleMedium' style={styles.sectionLabel}>
          Customize
        </Text>
        {/* Compact summary of the current mode — tapping it opens ModePickerDrawer (titled
            "Customize", hence the label above matching it), the full-page picker (animated
            previews, one mode per screen) that replaced the old inline carousel. PackRow is the
            same "leading visual + trailing accessory + onPress" row every pack in this drawer
            already uses, not a bespoke component. */}
        <PackRow label={draft.mode.label} subtitle={draft.mode.description} leading={<GameVisual mode={draft.mode} mistakes={fullyDrawnMistakes(draft.mode)} color={resolveSeedColor(settings.color)} colors={themeColors} style={[styles.modeSummaryPreview, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} />} trailing={<Icon source='chevron-right' size={24} color={theme.colors.onSurfaceVariant} />} onPress={handleOpenModePicker} accessibilityLabel={`Mode: ${draft.mode.label}. Change mode`} />

        <Text variant='titleMedium' style={styles.heroAdjacentSectionLabel}>
          Difficulty
        </Text>
        <SegmentedButtons value={draft.difficulty} onValueChange={(value) => handleSelectDifficulty(value as 'any' | PuzzleDifficultyTier)} buttons={difficultyOptions} />

        <Text variant='titleMedium' style={styles.sectionLabel}>
          Packs
        </Text>
        {/* Same shape as every pack row below it (leading badge, label, "X of Y unlocked" subtitle,
            progress bar) — it IS the row for the aggregate across every pack, not a differently-
            styled button above the real ones. Untinted card (no group/isPack) since it isn't
            itself a member of any pack's own category — the tertiary tint moves to its own
            leading icon instead, keeping the same accent the button used to carry without
            tinting the whole row the way a real pack's group color does. Opens PacksScreen on
            press, same as the button always did — browsing/selection, not an instant Random draw
            the way tapping a real pack row is (that's what the Random button at the bottom is
            for). */}
        <PackRow label={packsLabel} subtitle={`${commaString(totalUnlocked)} of ${commaString(totalAvailable)} unlocked`} progress={overallProgress} leading={<Avatar.Icon size={40} icon='format-list-checks' color={theme.colors.onTertiary} style={{ backgroundColor: theme.colors.tertiary }} />} trailing={<Icon source='chevron-right' size={24} color={theme.colors.onSurfaceVariant} />} onPress={() => setPacksScreenVisible(true)} />
      </>
    ),
    [draft.mode, draft.difficulty, settings.color, themeColors, handleOpenModePicker, handleSelectDifficulty, difficultyOptions, achievementStats, packsLabel, totalUnlocked, totalAvailable, overallProgress, theme]
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
      <DrawerEdgeSwipe enabled={!visible} onOpen={onRequestOpen} translateOffset={translateX} width={DRAWER_WIDTH} />
      {/* open is gated on !anyOverlayVisible too, not just visible — PacksScreen, PackPuzzlesDrawer,
          and ModePickerDrawer each render as a Drawer of their own, stacked on top of this one while
          open. Now that every drawer's header/footer float over a blurred backdrop (see
          the @rific/scroll-view migration), leaving this panel visually "open" underneath a
          blurred child stacked on top of it read as a layering glitch — a second, redundant blur
          bleeding through behind the one actually in front. Sliding this panel out of the way
          while a child is open (then back in once it closes) reads as real navigation instead:
          this panel closing IS what makes room for the child, not an accident of them overlapping.
          Content still stays mounted underneath either way (Drawer never unmounts on close, just
          translates) — accessibilityElementsHidden below (unchanged) is what keeps its title/close
          button/fields from staying reachable by screen readers and keyboard focus while
          invisible. */}
      <Drawer open={visible && !anyOverlayVisible} onClose={onDismiss} panelShadow translateOffset={translateX} width={DRAWER_WIDTH} zIndex={DRAWER_BASE_Z_INDEX}>
        <View testID='puzzle-drawer-panel' style={styles.panelContent} accessibilityViewIsModal={visible && !anyOverlayVisible} accessibilityElementsHidden={!visible || anyOverlayVisible} importantForAccessibility={visible && !anyOverlayVisible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible && !anyOverlayVisible ? onDismiss : undefined}>
          <ScrollViewProvider>
            {/* Close sits on the LEADING (left) side, not trailing — this drawer opens from the
                hamburger icon at the top-left of the game screen, so closing it from the same
                corner your thumb already used to open it keeps the gesture symmetric. Every other
                drawer reached from here (PackPuzzlesDrawer, PacksScreen and its own children,
                AchievementsDrawer) follows the same left-anchored convention. 'Close', not the
                Appbar.BackAction default of 'Back' — this dismisses the whole panel, it doesn't
                step back a level within it (see accessibilityLabel on every other migrated
                drawer's ScrollViewHeader for the same reasoning). A custom IconButton, not the
                default callback-driven Appbar.BackAction — filled tertiary, matching every other
                back/close action in the app (see AchievementsDrawer's own back/close for the
                first of these); IconButton already fires the app's own haptic convention on
                press itself (unlike raw Appbar.BackAction, which has none of its own), so this
                needs no manual selection() call the way the callback form used to. */}
            <ScrollViewHeader
              actionSize={40}
              backAction={<IconButton icon='arrow-left' mode='contained' hitSlop={ICON_ACTION_HIT_SLOP} containerColor={theme.colors.tertiary} iconColor={theme.colors.onTertiary} onPress={onDismiss} accessibilityLabel='Close' />}
              // The hamburger icon that opens this already says "menu" — naming the app instead is
              // more informative, and the OTA version rides along right underneath it rather than
              // its own separate card further down (see the removed Card that used to sit at the
              // bottom of the scroll content). The whole title block is the touch target, not just
              // the version line — "Hangman" is as good a place to expect a tap as the version text
              // right under it, and a two-line target is easier to find and hit than a single small
              // caption. Tappable — check() is a no-op (an informational alert) in dev and on web by
              // the hook's own design, so this only does something real in a production build;
              // harmless either way to leave reachable everywhere rather than platform-gating the
              // touch target itself. centerContent (not title/caption) since this needs its own
              // TouchableRipple wrapper around a two-line stack, not ScrollViewHeader's plain Text.
              centerContent={
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
              }
              // No trailingAction anymore — appearance/color, keyboard layout, and haptics/sound all
              // moved into ModePickerDrawer (reached via the mode summary row below), the only
              // settings surface this menu opens now. This menu itself stays gameplay-only (packs,
              // difficulty, Random, Pass & play).
            />

            {/* The hero (the mode summary row) through the Choose packs button live in
                ListHeaderComponent below, not as siblings before this — they scroll away together with the pack list
                exactly as they did back when this was all one plain ScrollView; only the pack
                list itself (up to 50 rows in the built-in manifest) needed to become a real
                FlatList, so everything above it stays exactly the JSX it always was, just moved
                into listHeader (see its own declaration above). */}
            <FlatList
              data={selectedPacks}
              keyExtractor={packRowKeyExtractor}
              renderItem={renderPackRow}
              ListHeaderComponent={listHeader}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps='handled'
              // Solid vibrant fill, not the chip's own default muted surface tint — matches every
              // other accent in this drawer now instead of being the one control still washed out.
              chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
            />

            {/* Not part of the scrollable content — leaving the button inline at the end of a form
                this short left a large dead gap below it instead of avoiding one. Docking it here
                closes that gap and keeps the primary action reachable without scrolling. Scrolls
                away with the rest of the chrome while actively scrolling and snaps back once it
                settles (ScrollViewProvider's own default), rather than staying permanently pinned. */}
            <ScrollViewFooter style={styles.footer}>
              <Button mode='contained' icon='play' onPress={handleConfirm}>
                Random
              </Button>
              <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='account-multiple' onPress={onStartPnp} style={styles.pnpButton}>
                Pass &amp; play
              </Button>
            </ScrollViewFooter>
          </ScrollViewProvider>
        </View>
      </Drawer>

      <PacksScreen visible={packsScreenVisible} onDismiss={handleClosePacksScreen} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={onPacksChanged} />

      {/* Stacks above both this drawer's own panel and PacksScreen via its own hardcoded
          DRAWER_PACK_DETAIL_Z_INDEX (see @/constants/drawerStacking) — not render order. */}
      <PackPuzzlesDrawer visible={playDrawerVisible} packKey={playPackKey} mode={draft.mode} difficulty={draft.difficulty} onDismiss={handleClosePlayDrawer} onConfirm={onConfirm} />

      {/* Reached by tapping the quick-look card above rather than its own top-level entry point —
          see AchievementsDrawer's own doc comment for why it stacks here (DRAWER_ACHIEVEMENTS_Z_INDEX)
          instead of sliding in independently from the opposite screen edge. mode/difficulty/onConfirm
          reuse this drawer's own draft/prop, same as PackPuzzlesDrawer just above. */}
      <AchievementsDrawer visible={achievementsVisible} onDismiss={handleCloseAchievements} unlockVersion={unlockVersion} onUnlocksChanged={onUnlocksChanged} mode={draft.mode} difficulty={draft.difficulty} onConfirm={onConfirm} />

      {/* Reached by tapping the mode summary row above — full-page, animated, replacing the old
          inline ModeSelector carousel. handleSelectMode is reused unchanged: it already does
          exactly what a picker selection needs (updateDraft + onModeChange). */}
      <ModePickerDrawer visible={modePickerVisible} onDismiss={handleCloseModePicker} selected={draft.mode} onSelect={handleSelectMode} />
    </>
  )
})
PuzzleDrawer.displayName = 'PuzzleDrawer'

const styles = StyleSheet.create({
  // Matches AchievementsDrawer's own "Total progress" card spacing/shape exactly (see its own
  // styles.card) — no marginTop of its own since the "Achievements" label right above it (see
  // topSectionLabel) already provides that clearance.
  achievementsCard: { marginBottom: 4 },
  achievementsCardRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  achievementsText: { flex: 1 },
  centeredText: { textAlign: 'center' },
  // flexDirection/alignItems override ScrollViewFooter's own row+center defaults — Random and Pass
  // & play stack vertically here (see pnpButton's marginTop below) and each stretch full width,
  // matching this footer's look before the scroll-view migration.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    // paddingTop/paddingBottom match ScrollViewHeader's own actionMargin (@rific/scroll-view's
    // ScrollViewHeader.tsx) — its action icons sit only 4px from the header's own top/bottom edge,
    // so this footer uses the same margin instead of the much roomier 16px it used to, which made
    // the footer bar read as a different, heavier weight of chrome than the header.
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  headerSubtitle: { opacity: 0.7 },
  // A tighter top margin than a standalone section would use — right under the mode cards, so it
  // reads as "here's what you just picked" rather than a new, unrelated block starting.
  heroAdjacentSectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12
  },
  modeSummaryPreview: { borderRadius: 8, borderWidth: 2, height: 56, overflow: 'hidden', width: 56 },
  muted: { opacity: 0.7 },
  panelContent: {
    flex: 1,
    overflow: 'hidden'
  },
  pnpButton: { marginTop: 8 },
  progressBar: {
    borderRadius: 6,
    height: 8
  },
  progressBarWrapper: {
    height: 8,
    marginTop: 10,
    overflow: 'hidden'
  },
  scrollContent: {
    paddingBottom: 12,
    paddingHorizontal: 16
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  },
  // margin cancels padding out — the touchable needs real padding for its own hover/ripple box to
  // round out away from the text (see the comment at its call site). No flex:1 — ScrollViewHeader's
  // own centerContent slot is what centers this, and a flex:1 child here would stretch to fill that
  // slot's full height itself, pinning its content to the top instead of leaving the centering
  // nothing to do.
  titleTouchable: {
    borderRadius: 8,
    margin: -8,
    padding: 8
  },
  // Same tight marginTop as heroAdjacentSectionLabel (both 12, vs a standalone section's 16) — this
  // is the very first label in the list, right below the header's own inset, not following another
  // section's own bottom margin the way sectionLabel's 16 assumes.
  topSectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12
  }
})
