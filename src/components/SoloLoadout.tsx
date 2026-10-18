import { Button, Card, IconButton } from '@rific/feedback-press'
import { ConfirmDialog, WELL_SHADOW } from '@tastic/hud/chrome'
import { OptionPicker, type OptionPickerOption, ProfileColorProvider } from '@tastic/profile'
import { router } from 'expo-router'
import { JSX, memo, useCallback, useMemo, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Avatar, Icon, ProgressBar, Text, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSelector } from 'react-redux'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import { usePackSelection } from '@/hooks/usePackSelection'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { useSelectArt } from '@/hooks/useSelectArt'
import { useStartSolo } from '@/hooks/useStartSolo'
import { DEFAULT_MODE } from '@/modes/registry'
import type { DifficultyFilter } from '@/redux/playerSettingsSlice'
import { selectSoloRound } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { isCustomPackKey } from '@/utils/customPacks'
import { gameHref } from '@/utils/navigation'
import { packGroupColors, packGroupIcon, packGroupLabel } from '@/utils/packGroupStyle'
import { packNamesBudget, summarizePackNames } from '@/utils/packSummary'
import { getPuzzleManifest, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { isRoundPlayable } from '@/utils/roundState'
import { getManifestUnlockProgress } from '@/utils/unlocks'

import { ART_CAROUSEL_CHROME_HEIGHT, ArtCarousel } from './ArtCarousel'
import { CORNER_BAND_HEIGHT, LoadoutPressAway, LoadoutShell, useLoadoutCovered, useLoadoutPopoverHost } from './LoadoutShell'
import { PacksScreen, type PacksScreenHandle } from './PacksScreen'
import { PLAYER_PICKER_ID_PREFIX, PlayerPicker } from './PlayerPicker'

// The Difficulty picker's popover id on the page's popover host, beside the player picker's.
export const DIFFICULTY_PICKER_ID = 'loadout-difficulty'
const PLAYER_PICKER_ID = `${PLAYER_PICKER_ID_PREFIX}-profile`

// Signal bars for the tiers, an open set for Any (every tier).
const DIFFICULTY_TIERS: { value: DifficultyFilter; label: string; icon: string }[] = [
  { value: 'any', label: 'Any', icon: 'all-inclusive' },
  { value: 'easy', label: 'Easy', icon: 'signal-cellular-1' },
  { value: 'medium', label: 'Medium', icon: 'signal-cellular-2' },
  { value: 'hard', label: 'Hard', icon: 'signal-cellular-3' }
]

// The fleet's black or white, as the pickers draw their name and chevron.
const inkFor = (dark: boolean) => (dark ? '#FFFFFF' : '#000000')

// Difficulty, as @tastic/profile's OptionPicker (the fleet's CPU difficulty control in hud's
// PlayerSetupPanel): the same pill and popover as the player picker further down, on the page's
// popover host. A pill rather than a segmented control, which cut "Medium" short on small phones; the
// difficulty is a saved pick, so the extra tap costs little. Its chip, menu border and picked row take
// the tier's color, the same colors the board's difficulty badge uses (Any is the theme's primary),
// and the pill the tier's muted container. Drawn flat: the app's ProfileColorProvider (PlayerSwatches)
// draws every chip as a profile's palette, which means nothing for a difficulty.
const DifficultyPicker = memo(({ value, onChange }: { value: DifficultyFilter; onChange: (value: DifficultyFilter) => void }): JSX.Element => {
  const theme = useTheme()
  const host = useLoadoutPopoverHost()
  const colors = useDifficultyOptionColors()
  // Each row's icon in its own tier's color until it's the picked one, which fills with it
  // (@tastic/profile 0.16.1+).
  const options = useMemo((): OptionPickerOption<DifficultyFilter>[] => DIFFICULTY_TIERS.map((tier) => ({ ...tier, color: colors[tier.value].vibrant })), [colors])
  const icon = DIFFICULTY_TIERS.find((tier) => tier.value === value)?.icon ?? 'all-inclusive'
  // PlayerPicker's own raised pill, filled with the picked tier's container color (the fleet's black or
  // white name and chevron read on it, light containers in light mode and dark ones in dark).
  const container = colors[value].container
  const pillStyle = useMemo(() => [styles.pill, { backgroundColor: container }], [container])
  return (
    <ProfileColorProvider>
      <OptionPicker id={DIFFICULTY_PICKER_ID} host={host} options={options} value={value} onChange={onChange} color={colors[value].vibrant} dark={theme.dark} icon={icon} triggerStyle={pillStyle} />
    </ProfileColorProvider>
  )
})
DifficultyPicker.displayName = 'DifficultyPicker'

// The packs card's names line: two lines of it at most, across the card inside the page's gutters
// (the game's 480pt column on the web), its padding, the icon and the chevron.
const PACK_NAMES_LINES = 2
const PACK_NAMES_INSET = 2 * 16 + 2 * 16 + 40 + 12 + 24 + 12
const MAX_PAGE_WIDTH = 480

// The packs card's bar shows from 1% (Jay, 2026-10-18), where its fill starts to show.
const MIN_SHOWN_PROGRESS = 0.01

type PacksCardProps = {
  // The selected packs, in Choose Packs' order (the player's own packs first).
  packs: PuzzleManifestItem[]
  total: number
  // How much of the selected packs the player has unlocked, 0 to 1, for the bar.
  progress: number
  // The same, in puzzles, for a screen reader.
  unlocked: number
  available: number
  onPress: () => void
}

// The page's main option: which packs Ready draws from. One card in Hangman's card language (the pack
// rows' tinted card and icon badge), opening Choose Packs (58 packs are too many for a popover): "12 of
// 58 packs" over the selected packs' names in one line, cut short with how many more there are
// (summarizePackNames), so it never runs long, then a bar of how much of them is unlocked. Every pack
// is just "All 58 packs", since new packs join it too; none says why Ready is off. Its badge and tint
// are a list's, unless every pack selected is of one category (one pack, or Brands & Products and
// Companies, both Business): then they're that category's, the way its rows in Choose Packs look (a
// custom pack's category is Custom, as PackRow has it).
const PacksCard = memo(({ packs, total, progress, unlocked, available, onPress }: PacksCardProps): JSX.Element => {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const selected = packs.length
  const all = selected === total
  const title = all ? `All ${commaString(total)} packs` : `${commaString(selected)} of ${commaString(total)} packs`
  const names = useMemo(() => packs.map((item) => item.label), [packs])
  const detail = all ? 'Every pack, new ones included' : selected === 0 ? 'Choose at least one pack to play.' : summarizePackNames(names, packNamesBudget(Math.min(width, MAX_PAGE_WIDTH) - PACK_NAMES_INSET, PACK_NAMES_LINES))
  const spoken = selected === 0 ? `${title}. ${detail}` : `${title}. ${detail}. ${commaString(unlocked)} of ${commaString(available)} puzzles unlocked`
  // The one category every selected pack is of (undefined is Custom's), when they share one.
  const oneCategory = !all && selected > 0 && new Set(packs.map((item) => packGroupLabel(item.group))).size === 1
  const group = oneCategory ? packs[0].group : undefined
  const look = useMemo(() => (oneCategory ? { icon: packGroupIcon(group), ...packGroupColors(group, theme) } : { icon: 'format-list-checks', color: theme.colors.tertiary, onColor: theme.colors.onTertiary, container: theme.colors.tertiaryContainer, onContainer: theme.colors.onTertiaryContainer }), [oneCategory, group, theme])
  // Card's own accessibilityLabel lands on a wrapper a screen reader never reaches (see PackRow), so
  // the card sits in an accessible view of its own, which is the one button.
  return (
    <View accessible accessibilityRole='button' accessibilityLabel={spoken} accessibilityHint='Opens Choose Packs' style={styles.packsCard}>
      <Card mode='contained' onPress={onPress} style={[styles.packsCardSurface, { backgroundColor: look.container }]} testID='packs-card'>
        <Card.Content style={styles.packsCardContent}>
          <Avatar.Icon size={40} icon={look.icon} color={look.onColor} style={{ backgroundColor: look.color }} testID='packs-card-badge' />
          <View style={styles.packsCardText}>
            <Text variant='titleMedium' style={[styles.packsTitle, { color: look.onContainer }]}>
              {title}
            </Text>
            <Text variant='bodyMedium' style={[styles.packsDetail, { color: look.onContainer }]}>
              {detail}
            </Text>
            {/* Only once its fill can be seen: an empty track reads like a broken slider, and a few puzzles
                of every pack's 19,643 would still draw one. */}
            {selected > 0 && progress >= MIN_SHOWN_PROGRESS ? (
              <View style={styles.progressWrapper}>
                <ProgressBar progress={progress} color={look.color} style={[styles.progressBar, { backgroundColor: theme.colors.surface }]} />
              </View>
            ) : null}
          </View>
          <Icon source='chevron-right' size={24} color={look.onContainer} />
        </Card.Content>
      </Card>
    </View>
  )
})
PacksCard.displayName = 'PacksCard'

// Puts the active player's art, difficulty and packs back to their defaults, after a confirm (the
// page's). Off while all three already are.
const ResetSettingsButton = memo(({ disabled, onPress }: { disabled: boolean; onPress: () => void }): JSX.Element => {
  const theme = useTheme()
  return <IconButton icon='restore' iconColor={inkFor(theme.dark)} onPress={onPress} disabled={disabled} hitSlop={4} accessibilityLabel='Reset settings' style={styles.resetButton} />
})
ResetSettingsButton.displayName = 'ResetSettingsButton'

type SettingsRowProps = {
  difficulty: DifficultyFilter
  onChangeDifficulty: (value: DifficultyFilter) => void
  canReset: boolean
  onReset: () => void
}

// The player's settings, between the art and the packs card (Jay, 2026-10-18: right under the player
// pill, the difficulty pill competed with it): Difficulty at the left edge, the reset at the right. Lifted over the press away
// catcher (and everything after it) while the Difficulty popover is open, so its rows take their own
// taps.
const SettingsRow = memo(({ difficulty, onChangeDifficulty, canReset, onReset }: SettingsRowProps): JSX.Element => {
  const host = useLoadoutPopoverHost()
  return (
    <View style={[styles.settingsRow, host.openId === DIFFICULTY_PICKER_ID && styles.lifted]}>
      <DifficultyPicker value={difficulty} onChange={onChangeDifficulty} />
      <ResetSettingsButton disabled={!canReset} onPress={onReset} />
    </View>
  )
})
SettingsRow.displayName = 'SettingsRow'

// Who plays, and their colors, first on the page (Jay, 2026-10-18): everything under it is that
// player's (their art, difficulty and packs), so switching players changes the whole page. Unlike the
// other games, whose settings rows belong to the match, not to a player, and sit above their players.
// Centered; a long name shrinks the pill rather than overflowing the gutters. Lifted like the settings
// row while its popover is open.
const PlayerRow = memo((): JSX.Element => {
  const host = useLoadoutPopoverHost()
  return (
    <View style={[styles.playerRow, host.openId === PLAYER_PICKER_ID && styles.lifted]}>
      <PlayerPicker host={host} />
    </View>
  )
})
PlayerRow.displayName = 'PlayerRow'

// Everything on the page but the art itself, the packs card at its tallest (two lines of pack names):
// the player row, the carousel's name and pips, the settings row, the packs card and Ready, with the
// even gaps between them. The art takes what's left of the room under the corners, so the whole page fits a
// 375x667 phone unscrolled.
const BLOCK_GAP = 20
const PAGE_BUT_ART = 44 + BLOCK_GAP + ART_CAROUSEL_CHROME_HEIGHT + BLOCK_GAP + 116 + BLOCK_GAP + 44 + BLOCK_GAP + 48
const ART_SLACK = 16
const ART_MIN_HEIGHT = 120
const ART_MAX_HEIGHT = 260

// The art carousel, sized to the room the page leaves it, and paused whenever it's out of sight: the
// page covered (another screen, the Settings sheet; see useLoadoutCovered), or something over it on the
// page (`coveredOnPage`, or an open popover). Its own component because it reads the shell's context.
const PageArtCarousel = ({ coveredOnPage }: { coveredOnPage: boolean }): JSX.Element => {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const covered = useLoadoutCovered()
  const { openId } = useLoadoutPopoverHost()
  const room = height - insets.top - insets.bottom - CORNER_BAND_HEIGHT - PAGE_BUT_ART - ART_SLACK
  const artHeight = Math.min(ART_MAX_HEIGHT, Math.max(ART_MIN_HEIGHT, room))
  return (
    <View style={styles.carousel}>
      <ArtCarousel paused={covered || coveredOnPage || openId !== null} artHeight={artHeight} />
    </View>
  )
}

// Single Player, condensed like the other games' loadouts (Jay, 2026-10-18), and mostly one option,
// the packs: the player, the art carousel, the settings row (Difficulty and the reset), the packs card,
// then Ready, as one group centered in the room under the corners. Everything on it is the active
// player's: their art, difficulty and packs, their unlocked puzzles and their waiting round, so picking
// another player switches the whole page. Ready picks up the player's round left waiting on the board,
// or draws a new one from their packs, difficulty and art, so it never has a round to abandon. Choose
// Packs (the packs card) lists every pack's progress, and its pack browser plays a pack or narrows the
// selection to it. The Settings sheet's ART grid still picks the art too.
export const SoloLoadout = (): JSX.Element => {
  const { key: playerKey } = useActivePlayer()
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()
  const { mode, difficulty, setDifficulty } = usePuzzleDefaults()
  const selectArt = useSelectArt()
  const { packsVersion } = useCatalogVersions()
  const { refreshCustomPacks } = useCatalogActions()
  const { requestStart, abandonDialog, asking } = useStartSolo()
  const resumable = useSelector((state: RootState) => isRoundPlayable(selectSoloRound(state.round, playerKey)))
  // Read again whenever a win, an import or a reset moves the count, so the packs card's bar is current
  // and a new draw prefers a puzzle the player hasn't solved yet.
  const { unlockMap } = usePuzzleUnlocks()

  // packsVersion isn't read here: it's a change counter bumped whenever a custom pack is created,
  // edited, deleted or imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  // The selected packs that exist, so the packs card, Ready and the reset always agree on what's
  // selected, in Choose Packs' order: the player's own packs, then the built-in ones.
  const selectedPacks = useMemo(() => {
    const selectedSet = new Set(selectedPackKeys)
    const selected = manifest.filter((item) => selectedSet.has(item.key))
    return [...selected.filter((item) => isCustomPackKey(item.key)), ...selected.filter((item) => !isCustomPackKey(item.key))]
  }, [manifest, selectedPackKeys])
  const { totalUnlocked, totalAvailable, overallProgress } = useMemo(() => getManifestUnlockProgress(selectedPacks, unlockMap), [selectedPacks, unlockMap])
  // Choose Packs' Clear can leave nothing to draw from (the packs card says so).
  const readyDisabled = selectedPacks.length === 0 && !resumable
  const atDefaults = mode.id === DEFAULT_MODE.id && difficulty === 'any' && selectedPacks.length === manifest.length

  const [packsScreenVisible, setPacksScreenVisible] = useState(false)
  const [resetVisible, setResetVisible] = useState(false)

  const goToGame = useCallback(() => router.push(gameHref('solo')), [])
  const startPuzzle = useCallback((payload: GameStartPayload) => requestStart(payload, { onStarted: goToGame }), [requestStart, goToGame])

  // The player's waiting round when there's one to go back to, otherwise a new draw from their whole
  // selection. A round with a guess on it is always playable until it's decided, so the draw never
  // replaces one: Ready never asks to abandon anything.
  const handleReady = useCallback(() => {
    if (resumable) {
      goToGame()
      return
    }
    const result = resolvePuzzle({ sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }, selectedPackKeys, unlockMap)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    startPuzzle(result.payload)
  }, [resumable, goToGame, difficulty, mode, selectedPackKeys, unlockMap, startPuzzle])

  // Stable identities: Choose Packs is memoized and stays mounted.
  const openPacksScreen = useCallback(() => setPacksScreenVisible(true), [])
  const closePacksScreen = useCallback(() => setPacksScreenVisible(false), [])
  // A puzzle started from Choose Packs' pack browser (a pick, or Play This Pack) closes Choose Packs
  // too: the abandon confirm, when the waiting round has a guess on it, opens over the page itself, and
  // the page should be clear when the player comes back from the round.
  const startFromPacksScreen = useCallback(
    (payload: GameStartPayload) => {
      setPacksScreenVisible(false)
      startPuzzle(payload)
    },
    [startPuzzle]
  )

  // Back to the default art (picked the way any art is, so the rounds waiting follow it), Any and every
  // pack.
  const openReset = useCallback(() => setResetVisible(true), [])
  const handleResetConfirm = useCallback(() => {
    selectArt(DEFAULT_MODE)
    setDifficulty('any')
    setSelectedPackKeys(manifest.map((item) => item.key))
    setResetVisible(false)
  }, [selectArt, setDifficulty, setSelectedPackKeys, manifest])
  const handleResetCancel = useCallback(() => setResetVisible(false), [])

  // Read through a ref by closeOverlay, so the shell's back listener needs nothing new each time.
  const packsScreenRef = useRef<PacksScreenHandle>(null)
  // Choose Packs' own pack browser and editor sit above it, so they close first. The reset confirm
  // answers back itself (it registers as it opens, so it runs first); this is the page's fallback.
  const closeOverlay = useCallback(() => {
    if (resetVisible) setResetVisible(false)
    else if (packsScreenVisible) {
      if (!packsScreenRef.current?.closeTopOverlay()) setPacksScreenVisible(false)
    } else return false
    return true
  }, [resetVisible, packsScreenVisible])
  const closeAllOverlays = useCallback(() => {
    setPacksScreenVisible(false)
    setResetVisible(false)
  }, [])

  return (
    <LoadoutShell
      closeOverlay={closeOverlay}
      closeAllOverlays={closeAllOverlays}
      overlays={
        <>
          <PacksScreen ref={packsScreenRef} visible={packsScreenVisible} onDismiss={closePacksScreen} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={refreshCustomPacks} mode={mode} difficulty={difficulty} onConfirm={startFromPacksScreen} />
          <ConfirmDialog visible={resetVisible} icon='restore' title='Reset Settings?' message={`The art goes back to ${DEFAULT_MODE.label}, the difficulty to Any, and every pack is selected again.`} confirmLabel='Reset' cancelLabel='Cancel' onConfirm={handleResetConfirm} onCancel={handleResetCancel} />
          {abandonDialog}
        </>
      }
    >
      {/* No scroll view: the art carousel takes the room the rest leaves it (PageArtCarousel), so the
          page fits the smallest phone (375x667) whole. */}
      <View style={styles.page}>
        {/* First, under everything a tap should reach while a popover is open (the lifted row). */}
        <LoadoutPressAway style={styles.pressAway} />
        <PlayerRow />
        <PageArtCarousel coveredOnPage={packsScreenVisible || resetVisible || asking} />
        <SettingsRow difficulty={difficulty} onChangeDifficulty={setDifficulty} canReset={!atDefaults} onReset={openReset} />
        <PacksCard packs={selectedPacks} total={manifest.length} progress={overallProgress} unlocked={totalUnlocked} available={totalAvailable} onPress={openPacksScreen} />
        {/* Off, rather than an alert after the tap, while there's nothing to draw from (the packs card
            says why). */}
        <Button mode='contained' icon='play' onPress={handleReady} disabled={readyDisabled} accessibilityHint={resumable ? 'Continues your puzzle' : 'Starts a new puzzle'} style={styles.ready} contentStyle={styles.readyContent} labelStyle={styles.readyLabel}>
          Ready
        </Button>
      </View>
    </LoadoutShell>
  )
}

const styles = StyleSheet.create({
  carousel: { alignSelf: 'stretch', marginTop: BLOCK_GAP },
  // A row over the press away catcher (and everything after it) while its popover is open.
  lifted: { zIndex: 2 },
  packsCard: { alignSelf: 'stretch', marginTop: BLOCK_GAP },
  packsCardContent: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  // Raised off the board like the pills above it (the fleet's wells' shadow).
  packsCardSurface: { boxShadow: WELL_SHADOW },
  packsCardText: { flex: 1 },
  packsDetail: { marginTop: 2, opacity: 0.85 },
  packsTitle: { fontWeight: '700' },
  // Every row, centered as one group under the corners, inside the gutters the rest of the app keeps.
  page: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  // Rounded at both ends, like PlayerPicker's, and raised off the board the same way.
  pill: { borderRadius: 999, boxShadow: WELL_SHADOW },
  // Centered, and narrower than the gutters so a long name shrinks the pill instead of overflowing.
  playerRow: { alignItems: 'center', alignSelf: 'stretch', maxWidth: '100%' },
  // Over everything on the page but the lifted row (its height is the page's).
  pressAway: { zIndex: 1 },
  // PackRow's bar.
  progressBar: { borderRadius: 6, height: 6 },
  progressWrapper: { height: 6, marginTop: 8, overflow: 'hidden' },
  ready: { alignSelf: 'stretch', marginTop: BLOCK_GAP },
  readyContent: { height: 48 },
  readyLabel: { fontSize: 16, letterSpacing: 1 },
  // Paper's 6pt margin off, so the button ends at the gutter, in line with the card's edge.
  resetButton: { margin: 0 },
  // Difficulty at the left edge, the reset at the right.
  settingsRow: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: BLOCK_GAP }
})
