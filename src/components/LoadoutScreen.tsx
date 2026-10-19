import { FadingScrollView } from '@rific/auto-paper'
import { Button, Card, IconButton, SegmentedButtons, Switch } from '@rific/feedback-press'
import { ConfirmDialog, WELL_SHADOW } from '@tastic/hud/chrome'
import { type Profile } from '@tastic/profile'
import { router, useFocusEffect, useIsFocused } from 'expo-router'
import { JSX, memo, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, type LayoutChangeEvent, Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { Avatar, Icon, ProgressBar, Text, useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { REFLOW_EASING, REFLOW_MS, SOURCE_FADE_MS } from '@/constants/loadoutMotion'
import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useEasedValue } from '@/hooks/useEasedValue'
import { usePackSelection } from '@/hooks/usePackSelection'
import { usePlayerData } from '@/hooks/usePlayerData'
import { useActiveProfile, useProfiles, useProfilesActions } from '@/hooks/useProfiles'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { useSelectArt } from '@/hooks/useSelectArt'
import { useStartSolo } from '@/hooks/useStartSolo'
import { DEFAULT_MODE } from '@/modes/registry'
import type { DifficultyFilter } from '@/redux/playerSettingsSlice'
import { type PlayMode, roundActions, selectSoloRound } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { isCustomPackKey } from '@/utils/customPacks'
import { gameHref } from '@/utils/navigation'
import { packGroupColors, packGroupIcon, packGroupLabel } from '@/utils/packGroupStyle'
import { packNamesBudget, summarizePackNames } from '@/utils/packSummary'
import { getPackTurnPlan, getSeatPlayer, getSeatPlayerKey } from '@/utils/packTurns'
import { GUEST_PLAYER_KEY, playerKeyFor } from '@/utils/players'
import { getFocusedSeat, getSeatIdentity, getStanding, guestName, hasStandings, MAX_PNP_PLAYERS, type WordSource } from '@/utils/pnpSession'
import { getPuzzleManifest, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { getPnpRemovalLoss, isRoundPlayable } from '@/utils/roundState'
import { getManifestUnlockProgress } from '@/utils/unlocks'

import { ART_CAROUSEL_CHROME_HEIGHT, ArtCarousel } from './ArtCarousel'
import { CORNER_BAND_HEIGHT, LoadoutPressAway, LoadoutShell, useLoadoutCovered, useLoadoutMotion, useLoadoutPopoverHost } from './LoadoutShell'
import { PacksScreen, type PacksScreenHandle } from './PacksScreen'
import { DifficultyPicker } from './PillPicker'
import { PLAYER_PICKER_ID_PREFIX, PlayerPicker } from './PlayerPicker'
import { isSeatPickerOpen, SeatsRow } from './SeatsRow'

// The Difficulty picker's popover id on the page's popover host, beside the players' pickers.
export const DIFFICULTY_PICKER_ID = 'loadout-difficulty'
const PLAYER_PICKER_ID = `${PLAYER_PICKER_ID_PREFIX}-profile`

// The fleet's black or white, as the pickers draw their name and chevron.
const inkFor = (dark: boolean) => (dark ? '#FFFFFF' : '#000000')

// The packs card's names line: two lines of it at most, across the card inside the page's gutters
// (the game's 480pt column on the web), its padding, the icon and the chevron.
const PACK_NAMES_LINES = 2
const PACK_NAMES_INSET = 2 * 16 + 2 * 16 + 40 + 12 + 24 + 12
const MAX_PAGE_WIDTH = 480
// The names are the card's title now, in titleMedium's bolder, wider 16pt type.
const TITLE_CHAR_WIDTH = 8.6

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

// Which packs the focused player's puzzles come from. One card in Hangman's card language (the pack
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
  // The packs themselves are the headline, the count the detail (Jay, 2026-10-18): "Brands & Products
  // and Companies" over "2 of 58 packs".
  const names = useMemo(() => packs.map((item) => item.label), [packs])
  // With every pack, the whole set is the list.
  const some = !all && selected > 0
  const title = all ? `All ${commaString(total)} packs` : selected === 0 ? 'No packs' : summarizePackNames(names, packNamesBudget(Math.min(width, MAX_PAGE_WIDTH) - PACK_NAMES_INSET, PACK_NAMES_LINES, TITLE_CHAR_WIDTH))
  const detail = all ? 'Every pack, new ones included' : selected === 0 ? 'Choose at least one pack to play.' : `${commaString(selected)} of ${commaString(total)} packs`
  // A screen reader hears the count first, then which packs.
  const spoken = selected === 0 ? `${title}. ${detail}` : some ? `${detail}. ${title}. ${commaString(unlocked)} of ${commaString(available)} puzzles unlocked` : `${title}. ${detail}. ${commaString(unlocked)} of ${commaString(available)} puzzles unlocked`
  // The one category every selected pack is of (undefined is Custom's), when they share one.
  const oneCategory = !all && selected > 0 && new Set(packs.map((item) => packGroupLabel(item.group))).size === 1
  const group = oneCategory ? packs[0].group : undefined
  const look = useMemo(() => (oneCategory ? { icon: packGroupIcon(group), ...packGroupColors(group, theme) } : { icon: 'format-list-checks', color: theme.colors.tertiary, onColor: theme.colors.onTertiary, container: theme.colors.tertiaryContainer, onContainer: theme.colors.onTertiaryContainer }), [oneCategory, group, theme])
  // Card's own accessibilityLabel lands on a wrapper a screen reader never reaches (see PackRow), so
  // the card sits in an accessible view of its own, which is the one button.
  return (
    <View accessible accessibilityRole='button' accessibilityLabel={spoken} accessibilityHint='Opens Choose Packs' style={styles.card}>
      <Card mode='contained' onPress={onPress} style={[styles.cardSurface, { backgroundColor: look.container }]} testID='packs-card'>
        <Card.Content style={styles.cardContent}>
          <Avatar.Icon size={40} icon={look.icon} color={look.onColor} style={{ backgroundColor: look.color }} testID='packs-card-badge' />
          <View style={styles.cardText}>
            <Text variant='titleMedium' style={[styles.cardTitle, { color: look.onContainer }]}>
              {title}
            </Text>
            <Text variant='bodyMedium' style={[styles.cardDetail, { color: look.onContainer }]}>
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

// Whether each written word is kept (useAutoSaveCustom: the Pass & Play pack), for a table writing its
// own words: a card like the packs card, in the secondary colors, the whole card switching it as well
// as its switch.
const KeepWordsCard = memo(({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }): JSX.Element => {
  const theme = useTheme()
  const toggle = useCallback(() => onChange(!value), [onChange, value])
  return (
    <View style={styles.card}>
      <Card mode='contained' onPress={toggle} style={[styles.cardSurface, { backgroundColor: theme.colors.secondaryContainer }]} testID='keep-words-card'>
        <Card.Content style={styles.cardContent}>
          <Avatar.Icon size={40} icon='content-save-outline' color={theme.colors.onSecondary} style={{ backgroundColor: theme.colors.secondary }} />
          <View style={styles.cardText}>
            <Text variant='titleMedium' style={[styles.cardTitle, { color: theme.colors.onSecondaryContainer }]}>
              Keep Each Word
            </Text>
            <Text variant='bodyMedium' style={[styles.cardDetail, { color: theme.colors.onSecondaryContainer }]}>
              Saves every word to your Pass & Play pack
            </Text>
          </View>
          <Switch value={value} onValueChange={onChange} accessibilityLabel='Keep each word' />
        </Card.Content>
      </Card>
    </View>
  )
})
KeepWordsCard.displayName = 'KeepWordsCard'

// Puts the focused player's art, difficulty and packs back to their defaults, after a confirm (the
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
// pill, the difficulty pill competed with it): Difficulty at the left edge, the reset at the right.
// Over the packs card and Ready after it while Difficulty's popover is open, which drops down over
// them (zIndex only orders one parent's children, as SeatsRow's open seat has it).
const SettingsRow = memo(({ difficulty, onChangeDifficulty, canReset, onReset }: SettingsRowProps): JSX.Element => {
  const host = useLoadoutPopoverHost()
  const { openId } = host
  return (
    <View testID='loadout-settings-row' style={[styles.settingsRow, isDifficultyOpen(openId) && styles.settingsRowOpen]}>
      <DifficultyPicker id={DIFFICULTY_PICKER_ID} host={host} value={difficulty} onChange={onChangeDifficulty} />
      <ResetSettingsButton disabled={!canReset} onPress={onReset} />
    </View>
  )
})
SettingsRow.displayName = 'SettingsRow'

// Single Player's one player, and their colors, first on the page (Jay, 2026-10-18): everything under
// it is theirs (their art, difficulty and packs), so picking another player switches the whole page.
// The active player's PlayerPicker, centered; a long name shrinks the pill rather than overflowing the
// gutters. Its guest is Player 1, the Pass & Play table's seat 1 (players.ts' SINGLE_PLAYER_SEAT_ID).
const PlayerRow = memo((): JSX.Element => {
  const host = useLoadoutPopoverHost()
  const activeProfile = useActiveProfile()
  const { selectPlayer } = useProfilesActions()
  const handleSelect = useCallback((profile: Profile | null) => selectPlayer(profile?.id ?? null), [selectPlayer])
  return (
    <View style={styles.playerRow}>
      <PlayerPicker host={host} selectedId={activeProfile?.id ?? null} guestLabel={guestName(0)} onSelect={handleSelect} />
    </View>
  )
})
PlayerRow.displayName = 'PlayerRow'

// Add player, for the Pass & Play table (Jay, 2026-10-18): in the corners' strip, centered between Home
// and the cog, in their plain-glyph look (the same ink, size and slop), so it stays under the same
// point however many seats are added, for adding several in a row. Dimmed and off at eight. An open
// popover closes first, as it does for the cog, so none is left hanging over the new seat.
const AddPlayerButton = memo(({ disabled, onAdd }: { disabled: boolean; onAdd: () => void }): JSX.Element => {
  const theme = useTheme()
  const { close } = useLoadoutPopoverHost()
  const handlePress = useCallback(() => {
    close()
    onAdd()
  }, [close, onAdd])
  return <IconButton icon='account-plus' iconColor={theme.colors.onSurface} size={24} onPress={handlePress} disabled={disabled} hitSlop={4} accessibilityLabel='Add player' />
})
AddPlayerButton.displayName = 'AddPlayerButton'

// Where the Pass & Play table's words come from (Jay, 2026-10-18): the packs, each player's own,
// taking turns, or the players write them for each other (Pass & Play). Two segments, short enough for
// a 360pt phone, in the primary colors Choose Packs' filter uses, raised off the board like the pills.
const SourceChoice = memo(({ value, onChange }: { value: WordSource; onChange: (value: WordSource) => void }): JSX.Element => {
  const theme = useTheme()
  const buttons = useMemo(
    () =>
      [
        { value: 'packs', label: 'Packs', icon: 'cards-outline' },
        { value: 'write', label: 'Write-In', icon: 'pencil-outline' }
      ].map((option) => ({ ...option, checkedColor: theme.colors.onPrimary, uncheckedColor: theme.colors.onPrimaryContainer, style: { backgroundColor: option.value === value ? theme.colors.primary : theme.colors.primaryContainer } })),
    [value, theme.colors.primary, theme.colors.onPrimary, theme.colors.primaryContainer, theme.colors.onPrimaryContainer]
  )
  const handleChange = useCallback((next: string | string[]) => onChange(next === 'write' ? 'write' : 'packs'), [onChange])
  return <SegmentedButtons value={value} onValueChange={handleChange} buttons={buttons} style={styles.source} />
})
SourceChoice.displayName = 'SourceChoice'

// The room between the blocks, and around the page.
const BLOCK_GAP = 20
// The art's own height: as tall as the room the rest of the page leaves it (measured, see
// LoadoutScreen), from this floor up to its own width (every art is a square scene, so taller than
// wide draws no bigger). Past the floor, the page scrolls. It used to stop at 260pt, which on a tall
// window left the page spread out around a small art (Jay, 2026-10-18: "it seems disjointed").
const ART_SLACK = 16
const ART_MIN_HEIGHT = 72
// The page's gutters: the art is the page's width (MAX_PAGE_WIDTH on the web) less these.
const PAGE_GUTTER = 16
// Single Player's page but the art, at its tallest (two lines of pack names): the player, the
// carousel's name and pips, the settings row, the packs card and Ready, with the gaps between. The
// art's height until the page has been measured, so the first frame is already close.
const SINGLE_PLAYER_PAGE_BUT_ART = 44 + BLOCK_GAP + ART_CAROUSEL_CHROME_HEIGHT + BLOCK_GAP + 44 + BLOCK_GAP + 116 + BLOCK_GAP + 48

const clampArt = (height: number, maxHeight: number) => Math.round(Math.min(maxHeight, Math.max(ART_MIN_HEIGHT, height)))

const isPlayerPickerOpen = (openId: string | null) => openId === PLAYER_PICKER_ID || isSeatPickerOpen(openId)
const isDifficultyOpen = (openId: string | null) => openId === DIFFICULTY_PICKER_ID

// A view's height, read before the first paint where the platform lets a layout effect read it: the
// web's DOM, and React Native's new architecture, whose views are DOM-like elements. So the page, laid
// out from measured heights, is right from its first frame (Jay, 2026-10-19: the art started at its
// estimate and jumped to its measured height a few frames later, shifting the whole page, since
// onLayout comes after the paint). Read as the page mounts; every later change comes through onLayout.
// Where nothing can be read (Jest), onLayout brings the first one too.
const useHeightBeforePaint = (ref: RefObject<View | null>, onHeight: (height: number) => void): void => {
  useLayoutEffect(() => {
    const height = (ref.current as unknown as { getBoundingClientRect?: () => { height: number } } | null)?.getBoundingClientRect?.().height
    if (height) onHeight(Math.round(height))
  }, [ref, onHeight])
}

// The page above the art, or below it: measured for the art's height (only its own height, see
// LoadoutScreen), and lifted over the press away catcher (and everything after it) while one of the
// popovers it holds is open, so the popover's rows take their own taps. Lifting the whole group is what
// does it: on native, zIndex only orders the children of one parent, and the catcher is the page's.
//
// Its height eases to a new one (a row of seats more or less, a line more or less in the packs card)
// rather than jumping (Jay, 2026-10-18), on the same clock as the art, which gives up or takes back
// exactly that much (see ArtCarousel), so the rest of the page stays put. The content inside is laid out
// at its new height at once (what's measured); only the group's own box eases, so a new row shows over
// the art for that moment while the seats glide into it. The first height lands as is. The group under
// the art hangs from its foot (`end`), so Ready never moves, and gives back what the word source's
// shorter options leave (`shrink`, see SourceSwap), easing with the art once the page is `measured`.
// Empty room in a group lets taps through to whatever it lies over (the press away catcher, the art's
// arrows).
type PageGroupProps = {
  testID: string
  lift: (openId: string | null) => boolean
  onHeight: (height: number) => void
  shrink?: number
  measured?: boolean
  end?: boolean
  children: ReactNode
}
const PageGroup = ({ testID, lift, onHeight, shrink = 0, measured = false, end = false, children }: PageGroupProps): JSX.Element => {
  const { openId } = useLoadoutPopoverHost()
  const motion = useLoadoutMotion()
  const [height, setHeight] = useState(0)
  const contentRef = useRef<View>(null)
  const measure = useCallback(
    (next: number) => {
      setHeight(next)
      onHeight(next)
    },
    [onHeight]
  )
  useHeightBeforePaint(contentRef, measure)
  const handleLayout = useCallback((event: LayoutChangeEvent) => measure(Math.round(event.nativeEvent.layout.height)), [measure])
  const eased = useEasedValue(height, motion && height > 0, REFLOW_MS, REFLOW_EASING)
  const easedShrink = useEasedValue(shrink, motion && measured, REFLOW_MS, REFLOW_EASING)
  // Its own height until the first measurement lands.
  const easedStyle = useAnimatedStyle(() => (eased.value > 0 ? { height: eased.value - easedShrink.value } : {}))
  return (
    <Animated.View pointerEvents='box-none' style={[styles.groupBox, end && styles.groupBoxEnd, easedStyle, lift(openId) && styles.lifted]}>
      <View ref={contentRef} testID={testID} onLayout={handleLayout} pointerEvents='box-none' style={styles.group}>
        {children}
      </View>
    </Animated.View>
  )
}

// The art carousel, sized by the page, and paused whenever it's out of sight: the page covered
// (another screen, the Settings sheet; see useLoadoutCovered), or something over it on the page
// (`coveredOnPage`, or an open popover). Its height eases with the page's groups once the page has been
// measured (`measured`: the first measured height lands as is, over the estimate). Its own component
// because it reads the shell's context.
const PageArtCarousel = ({ coveredOnPage, artHeight, measured }: { coveredOnPage: boolean; artHeight: number; measured: boolean }): JSX.Element => {
  const covered = useLoadoutCovered()
  const motion = useLoadoutMotion()
  const { openId } = useLoadoutPopoverHost()
  return (
    <View style={styles.carousel}>
      <ArtCarousel paused={covered || coveredOnPage || openId !== null} artHeight={artHeight} animated={motion && measured} />
    </View>
  )
}

// What each word source shows under the choice (Jay, 2026-10-18): both always mounted, laid over each
// other in one cell, the chosen one over the other, cross-fading on a switch. The one not chosen is
// invisible, untouchable and out of a screen reader's way (on the web also out of the keyboard's, once
// it has faded: CSS's visibility, which a transition holds back until the fade is over). Each sits at the
// cell's foot, just above Ready. While Difficulty's popover is open the cell sits over Ready, which its
// popover drops over.
//
// The cell is as tall as the taller (the packs' settings row and packs card), but the page only keeps
// the chosen one's height (Jay, 2026-10-19: writing left the Difficulty row's room empty above Keep
// Each Word). What the shorter leaves (`slack`) comes off the group's box (PageGroup's `shrink`) and goes
// to the art (LoadoutScreen's artHeight), and the choice slides down into that room, drawn over the
// options so it passes over the ones fading out. All three ease on the reflow's clock from the same
// commit once the page is measured, so they move as one (as the art and the groups always have). So the page
// around it stays put: Ready doesn't move, and the art grows or shrinks by what the choice slides.
// Options the choice has to slide up past to uncover (the packs', coming back from writing) wait half
// the reflow before fading in, so the Difficulty row never shows above the choice while it passes. The
// cell's empty room above the shorter options lets taps through to the art's arrows it lies over.
type SourceSwapProps = {
  source: WordSource
  choice: ReactNode
  packs: ReactNode
  write: ReactNode
  heights: { packs: number; write: number }
  onPacksHeight: (height: number) => void
  onWriteHeight: (height: number) => void
  slack: number
  measured: boolean
}
const SourceSwap = ({ source, choice, packs, write, heights, onPacksHeight, onWriteHeight, slack, measured }: SourceSwapProps): JSX.Element => {
  const { openId } = useLoadoutPopoverHost()
  const motion = useLoadoutMotion()
  const onPacks = source === 'packs'
  const slide = useEasedValue(slack, motion && measured, REFLOW_MS, REFLOW_EASING)
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.value }] }))

  const chosenTaller = onPacks ? heights.packs > heights.write : heights.write > heights.packs
  const fadeDelay = motion && chosenTaller ? REFLOW_MS / 2 : 0
  const shown = useSharedValue(onPacks ? 1 : 0)
  const fadedBefore = useRef(false)
  useEffect(() => {
    const target = onPacks ? 1 : 0
    const fade = withTiming(target, { duration: SOURCE_FADE_MS })
    shown.value = motion && fadedBefore.current ? (fadeDelay > 0 ? withDelay(fadeDelay, fade) : fade) : target
    fadedBefore.current = motion
  }, [shown, onPacks, motion, fadeDelay])
  const packsStyle = useAnimatedStyle(() => ({ opacity: shown.value }))
  const writeStyle = useAnimatedStyle(() => ({ opacity: 1 - shown.value }))
  const hideAfterMs = motion ? fadeDelay + SOURCE_FADE_MS : 0
  return (
    <>
      <Animated.View style={[styles.sourceSlide, slideStyle]}>{choice}</Animated.View>
      <View pointerEvents='box-none' style={[styles.swap, isDifficultyOpen(openId) && styles.swapOpen]}>
        <Animated.View testID='loadout-packs-options' pointerEvents={onPacks ? 'auto' : 'none'} aria-hidden={!onPacks} style={[styles.swapLayer, packsStyle, swapLayerState(onPacks, hideAfterMs)]}>
          <SwapContent testID='loadout-packs-content' onHeight={onPacksHeight}>
            {packs}
          </SwapContent>
        </Animated.View>
        <Animated.View testID='loadout-write-options' pointerEvents={onPacks ? 'none' : 'auto'} aria-hidden={onPacks} style={[styles.swapLayer, styles.swapLayerOver, writeStyle, swapLayerState(!onPacks, hideAfterMs)]}>
          <SwapContent testID='loadout-write-content' onHeight={onWriteHeight}>
            {write}
          </SwapContent>
        </Animated.View>
      </View>
    </>
  )
}

// One word source's options, measured (for the room the other leaves; see SourceSwap).
const SwapContent = ({ testID, onHeight, children }: { testID: string; onHeight: (height: number) => void; children: ReactNode }): JSX.Element => {
  const ref = useRef<View>(null)
  useHeightBeforePaint(ref, onHeight)
  const handleLayout = useCallback((event: LayoutChangeEvent) => onHeight(Math.round(event.nativeEvent.layout.height)), [onHeight])
  return (
    <View ref={ref} testID={testID} onLayout={handleLayout} style={styles.swapContent}>
      {children}
    </View>
  )
}

// The chosen layer over the other (its taps, and Difficulty's popover, come first), and on the web the
// other out of sight once its fade is over.
const swapLayerState = (chosen: boolean, hideAfterMs: number): ViewStyle => {
  if (Platform.OS !== 'web') return chosen ? styles.swapLayerChosen : {}
  const visibility = chosen ? { visibility: 'visible' } : { visibility: 'hidden', transitionDelay: `${hideAfterMs}ms`, transitionProperty: 'visibility' }
  return { ...(chosen ? styles.swapLayerChosen : {}), ...(visibility as unknown as ViewStyle) }
}

// What the remove confirm says a player leaving would take with them (see getPnpRemovalLoss).
const removalMessage = ({ standing, word }: { standing: boolean; word: boolean }): string => [standing ? 'Their standing this session goes with them.' : '', word ? 'The word waiting on the board goes too.' : ''].filter(Boolean).join(' ')

// What New session's confirm says it clears.
const newSessionMessage = (standings: boolean, word: boolean): string => [standings ? "Everyone's standing starts over." : '', word ? 'The word waiting on the board goes too.' : ''].filter(Boolean).join(' ')

// Who a seat's switch would hand its standing to, for the confirm.
type PendingSwitch = { id: string; profile: Profile | null; title: string; message: string }

export type LoadoutScreenProps = {
  // Which of Home's two doors this is (see roundSlice's PlayMode).
  mode: PlayMode
}

// The /loadout route (Jay, 2026-10-18): one page behind both of Home's doors, laid out the same way.
// Single Player is one player: the active one, their pill the player picker. Pass & Play is the table
// (two to eight seats, roundSlice's pnp.session) and, under the art, where its words come from: the
// packs, each player's own, taking turns, or the players write them for each other.
//
// The page is one player's at a time: Single Player's, or at the table the focused seat's (ringed).
// Opening the Pass & Play page makes its focused seat the active player, and so does focusing another
// (a press on its pill; a press on the focused pill opens its picker), so the art carousel, the
// difficulty and the packs card are theirs, as are the colors and their unlocked puzzles and waiting
// round. Every guest seat is a player of its own (utils/players.ts' guestSeatKey), starting on colors
// no other seat is showing, and Single Player's guest is another again.
//
// Ready plays: Single Player picks up the player's own waiting round or draws them one from their
// packs, difficulty and art (so it never has a round to abandon); the table on the packs goes back to
// the pack turn under way or starts the next one, the fair pick, whose player plays their own round the
// same way (see utils/packTurns.ts); the table writing goes back to the session under way (a round
// played, a word handed off or half typed) or starts one, the first seat writing. The page fits a
// 375x667 phone whole with up to four seats: the art takes whatever room the rest of the page leaves
// it, down to a floor, and only past that does the page scroll.
export const LoadoutScreen = ({ mode: door }: LoadoutScreenProps): JSX.Element => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { height: windowHeight, width: windowWidth } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { selectPlayer } = useProfilesActions()
  const { forgetGuestSeat, colorGuestSeats } = usePlayerData()
  const isFocused = useIsFocused()
  // The Pass & Play table. Single Player has none: its one player is the active player.
  const table = door === 'pnp'
  const session = useSelector((state: RootState) => state.round.pnp.session)
  const { players, standings } = session
  const source: WordSource = table ? session.source : 'packs'
  const focusedSeat = getFocusedSeat(session)
  const sessionStarted = hasStandings(session)
  // The roster, for the seats' names in the confirms.
  const profiles = useProfiles()

  // The focused player's own: their art, difficulty and packs, their unlocked puzzles and their waiting
  // solo round (they're the active player, see the focus effect below).
  const { key: playerKey } = useActivePlayer()
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()
  const { mode, difficulty, setDifficulty } = usePuzzleDefaults()
  const selectArt = useSelectArt()
  const { packsVersion } = useCatalogVersions()
  const { refreshCustomPacks } = useCatalogActions()
  const { requestStart, abandonDialog, asking } = useStartSolo()
  const { autoSave, setAutoSave } = useAutoSaveCustom()
  const resumable = useSelector((state: RootState) => isRoundPlayable(selectSoloRound(state.round, playerKey)))
  // A word waiting to come back to at the table: half typed, handed off, or mid-guess.
  const wordWaiting = useSelector((state: RootState) => {
    const { pnp } = state.round
    if (pnp.phase === 'authoring') return Boolean(pnp.draft?.answer.trim())
    return (pnp.phase === 'handoff' || pnp.phase === 'playing') && isRoundPlayable(pnp)
  })
  // Something for Ready to go back to when the players write, and for New session to clear.
  const sessionUnderWay = sessionStarted || wordWaiting
  // Read again whenever a win, an import or a reset moves the count, so the packs card's bar is current
  // and a new draw prefers a puzzle the player hasn't solved yet.
  const { unlockMap } = usePuzzleUnlocks()
  // At the table on the packs, the pack turn Ready plays: the one under way, or the next (the fair
  // pick). Two plain values, so the page only re-renders when one of them moves.
  const turnSeatId = useSelector((state: RootState) => (table ? getPackTurnPlan(state).seatId : null))
  const turnContinues = useSelector((state: RootState) => table && getPackTurnPlan(state).continues)

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
  // Choose Packs' Clear can leave nothing to draw from (the packs card says so): the page's player's,
  // or at the table the turn's player's while the page is theirs (anyone else's turn shows their page
  // instead, see playTurn).
  const readyDisabled = source === 'packs' && (!table || turnSeatId === focusedSeat.id) && selectedPacks.length === 0 && !resumable
  const atDefaults = mode.id === DEFAULT_MODE.id && difficulty === 'any' && selectedPacks.length === manifest.length

  const [packsScreenVisible, setPacksScreenVisible] = useState(false)
  const [resetVisible, setResetVisible] = useState(false)
  // The seat whose removal is waiting on its confirm (with what it would take, read as Remove was
  // pressed), the one whose switch is, and New session's.
  const [removing, setRemoving] = useState<{ id: string; message: string } | null>(null)
  const [switching, setSwitching] = useState<PendingSwitch | null>(null)
  const [clearing, setClearing] = useState<string | null>(null)

  // The table's focused seat's player becomes the active one, unless they already are: its profile
  // while the roster has it, otherwise the seat's own guest (pnpSession's seatPlayer), each guest seat
  // a player of its own.
  const activateFocusedSeat = useCallback(() => {
    const state = store.getState()
    const player = getSeatPlayer(state, getFocusedSeat(state.round.pnp.session).id)
    const { profileId, seatId } = state.activePlayer
    if (player && playerKeyFor(profileId, seatId) !== playerKeyFor(player.profileId, player.seatId)) selectPlayer(player.profileId, player.seatId)
  }, [store, selectPlayer])

  // Single Player's guest is never a Pass & Play guest seat's: a seat's guest left playing by the table
  // hands the page to Single Player's own guest as it's shown (a profile carries on, being the same
  // player at either door).
  useFocusEffect(
    useCallback(() => {
      if (!table && store.getState().activePlayer.seatId !== null) selectPlayer(null)
    }, [table, store, selectPlayer])
  )

  // Every guest seat at the table is given colors of its own as it's first shown (a new seat, one
  // handed back to a guest, a table stored before guest seats had them): utils/guestSeats.ts.
  useEffect(() => {
    if (table) colorGuestSeats()
  }, [table, players, colorGuestSeats])

  // While the Pass & Play page is the one showing, its focused seat is the active player: every time
  // it's shown, whoever a game (the device is handed around) or Single Player left playing, and
  // whenever who plays for the focused seat changes from outside the page (a seated profile forgotten
  // because another game deleted it leaves the seat its own guest's).
  const focusedSeatKey = useSelector((state: RootState) => (table ? getSeatPlayerKey(state, getFocusedSeat(state.round.pnp.session).id) : undefined))
  useEffect(() => {
    if (table && isFocused) activateFocusedSeat()
  }, [table, isFocused, focusedSeatKey, activateFocusedSeat])

  // A press on a seat that isn't the focused one: theirs is the page now, and a screen reader hears
  // whose.
  const handleFocus = useCallback(
    (seatId: string) => {
      const state = store.getState()
      const { session: current } = state.round.pnp
      if (current.focusedId === seatId || !current.players.some((player) => player.id === seatId)) return
      dispatch(roundActions.focusPnpSeat(seatId))
      activateFocusedSeat()
      AccessibilityInfo.announceForAccessibility(`Showing ${getSeatIdentity(current.players, seatId, state.profiles).name}`)
    },
    [store, dispatch, activateFocusedSeat]
  )

  const handleAdd = useCallback(() => dispatch(roundActions.addPnpPlayer()), [dispatch])

  // Straight away when nothing goes with the player; a confirm first when their standing or a word
  // waiting for them would. From the focused seat's glyph or any seat swiped away (SeatsRow). The
  // focus moves on when it was theirs, and what the seat's own guest kept
  // (their art, colors, packs, waiting round and unlocked puzzles) goes with the seat.
  const removeSeat = useCallback(
    (seatId: string) => {
      dispatch(roundActions.removePnpPlayer(seatId))
      if (store.getState().round.pnp.session.players.some((player) => player.id === seatId)) return
      activateFocusedSeat()
      void forgetGuestSeat(seatId)
    },
    [dispatch, store, activateFocusedSeat, forgetGuestSeat]
  )
  const handleRemove = useCallback(
    (seatId: string) => {
      const loss = getPnpRemovalLoss(store.getState().round.pnp, seatId)
      if (loss.standing || loss.word) setRemoving({ id: seatId, message: removalMessage(loss) })
      else removeSeat(seatId)
    },
    [store, removeSeat]
  )
  const handleRemoveConfirm = useCallback(() => {
    if (removing) removeSeat(removing.id)
    setRemoving(null)
  }, [removeSeat, removing])
  const handleRemoveCancel = useCallback(() => setRemoving(null), [])

  // Who sits in a seat; the focused seat's new player is the active one at once.
  const seatProfile = useCallback(
    (seatId: string, profile: Profile | null) => {
      dispatch(roundActions.setPnpSeatProfile({ id: seatId, profile: profile ? { id: profile.id, name: profile.name } : null }))
      activateFocusedSeat()
    },
    [dispatch, activateFocusedSeat]
  )
  // A seat's picker: straight away when the seat hasn't played this session, and after a confirm when
  // it has, since its standing stays with the seat and goes on under whoever sits there now. Picking
  // who's already there changes nothing.
  const handlePick = useCallback(
    (seatId: string, profile: Profile | null) => {
      const state = store.getState()
      const { session: current } = state.round.pnp
      const index = current.players.findIndex((player) => player.id === seatId)
      const seat = current.players[index]
      if (!seat || (seat.profileId ?? null) === (profile?.id ?? null)) return
      const { played, wins } = getStanding(current, seatId)
      if (played === 0) {
        seatProfile(seatId, profile)
        return
      }
      const nextName = profile?.name ?? guestName(index)
      setSwitching({ id: seatId, profile, title: `Switch to ${nextName}?`, message: `${nextName} takes over ${getSeatIdentity(current.players, seatId, state.profiles).name}'s standing this session: ${wins} of ${played} solved.` })
    },
    [store, seatProfile]
  )
  const handleSwitchConfirm = useCallback(() => {
    if (switching) seatProfile(switching.id, switching.profile)
    setSwitching(null)
  }, [seatProfile, switching])
  const handleSwitchCancel = useCallback(() => setSwitching(null), [])

  // New session: the same table with every standing cleared and any word waiting dropped, after a
  // confirm saying which. Pass & Play keeps no record of how a session ends, only of rounds actually
  // finished, so nothing is recorded.
  const openNewSession = useCallback(() => setClearing(newSessionMessage(sessionStarted, wordWaiting)), [sessionStarted, wordWaiting])
  const handleNewSessionConfirm = useCallback(() => {
    dispatch(roundActions.startPnpSession())
    setClearing(null)
  }, [dispatch])
  const handleNewSessionCancel = useCallback(() => setClearing(null), [])

  const handleSource = useCallback((next: WordSource) => dispatch(roundActions.setPnpSource(next)), [dispatch])

  // Single Player's own solo round (the table only plays one by turns, see playTurn).
  const goToSoloGame = useCallback(() => router.push(gameHref('solo')), [])
  const startPuzzle = useCallback((payload: GameStartPayload) => requestStart(payload, { onStarted: goToSoloGame }), [requestStart, goToSoloGame])

  // The focused player's waiting round when there's one to go back to, otherwise a new draw from their
  // whole selection. A round with a guess on it is always playable until it's decided, so the draw never
  // replaces one: this never asks to abandon anything.
  const playOwnRound = useCallback(() => {
    if (resumable) {
      goToSoloGame()
      return
    }
    const result = resolvePuzzle({ sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }, selectedPackKeys, unlockMap)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    startPuzzle(result.payload)
  }, [resumable, goToSoloGame, difficulty, mode, selectedPackKeys, unlockMap, startPuzzle])

  // The table on the packs: the pack turn under way, or the next one (the fair pick), on the solo game
  // from this door (gameHref('solo', 'pnp')), which makes the turn's player the active one and puts
  // their own round on the board: their waiting one, or a fresh draw from their packs, difficulty and
  // art, so nothing is abandoned (see GameScreen's PackTurnRound). A turn whose player has nothing to
  // draw from (no pack selected, nothing waiting) and isn't the page's shows the page as theirs
  // instead, where the packs card says why and Ready is off.
  const playTurn = useCallback(() => {
    const state = store.getState()
    const { seatId, continues } = getPackTurnPlan(state)
    const playerKey = getSeatPlayerKey(state, seatId) ?? GUEST_PLAYER_KEY
    const packKeys = state.playerSettings[playerKey]?.packKeys ?? null
    const canDraw = packKeys === null ? manifest.length > 0 : manifest.some((item) => packKeys.includes(item.key))
    if (!canDraw && !isRoundPlayable(selectSoloRound(state.round, playerKey))) {
      if (state.round.pnp.session.focusedId === seatId) return
      dispatch(roundActions.focusPnpSeat(seatId))
      activateFocusedSeat()
      AccessibilityInfo.announceForAccessibility(`It's ${getSeatIdentity(state.round.pnp.session.players, seatId, state.profiles).name}'s turn. Choose at least one pack to play.`)
      return
    }
    if (!continues) dispatch(roundActions.startPackTurn())
    router.push(gameHref('solo', 'pnp'))
  }, [store, manifest, dispatch, activateFocusedSeat])

  // Ready, for whatever the page is set to play.
  const handleReady = useCallback(() => {
    // The players write: back to the session under way, or a new one, the first seat writing for the
    // fair pick.
    if (source === 'write') {
      if (!sessionUnderWay) dispatch(roundActions.startPnpSession())
      router.push(gameHref('pnp'))
      return
    }
    if (table) playTurn()
    else playOwnRound()
  }, [source, sessionUnderWay, dispatch, table, playTurn, playOwnRound])
  // Whose turn Ready plays, by the name the page shows them by.
  const turnName = turnSeatId ? getSeatIdentity(players, turnSeatId, profiles).name : ''
  const packsHint = table ? (turnContinues ? `Continues ${turnName}'s turn` : `Starts with ${turnName}`) : resumable ? 'Continues your puzzle' : 'Starts a new puzzle'
  const readyHint = source === 'write' ? (sessionUnderWay ? 'Continues the session' : 'Starts a new session') : packsHint

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
  // Choose Packs' own pack browser and editor sit above it, so they close first. The confirms answer
  // back themselves (each registers as it opens, so it runs first); this is the page's fallback.
  const closeOverlay = useCallback(() => {
    if (resetVisible || removing || switching || clearing !== null) {
      setResetVisible(false)
      setRemoving(null)
      setSwitching(null)
      setClearing(null)
    } else if (packsScreenVisible) {
      if (!packsScreenRef.current?.closeTopOverlay()) setPacksScreenVisible(false)
    } else return false
    return true
  }, [resetVisible, removing, switching, clearing, packsScreenVisible])
  const closeAllOverlays = useCallback(() => {
    setPacksScreenVisible(false)
    setResetVisible(false)
    setRemoving(null)
    setSwitching(null)
    setClearing(null)
  }, [])

  // The art's height: the room the scroll view has, less the rest of the page (the players above the
  // art, everything from the word source down to Ready below it, and the carousel's own name and pips),
  // within its floor and ceiling. Measured rather than estimated, since the seats wrap onto as many
  // lines as their names need. Only heights are measured, never positions: the web reports a view's
  // layout when its size changes, not when it moves. Until the first layout lands, an estimate for
  // Single Player.
  const [viewportHeight, setViewportHeight] = useState(0)
  const [aboveHeight, setAboveHeight] = useState(0)
  const [belowHeight, setBelowHeight] = useState(0)
  // The scroll view runs the screen's full height, under the corners and the home indicator, so the
  // page scrolls up under them and fades there (FadingScrollView, Stats' treatment, Jay 2026-10-18)
  // rather than being cut off at the corners' strip; at rest it starts below the corners and ends above
  // the home indicator. The fade is the strip's height, so whatever passes under Home and the cog has
  // faded away there and the glyphs stay clear.
  const pagePadding = useMemo(() => ({ paddingBottom: insets.bottom + ART_SLACK / 2, paddingTop: insets.top + CORNER_BAND_HEIGHT + ART_SLACK / 2 }), [insets.bottom, insets.top])
  const artMaxHeight = (Platform.OS === 'web' ? Math.min(windowWidth, MAX_PAGE_WIDTH) : windowWidth) - 2 * PAGE_GUTTER
  const estimate = clampArt(windowHeight - insets.top - insets.bottom - CORNER_BAND_HEIGHT - SINGLE_PLAYER_PAGE_BUT_ART - ART_SLACK, artMaxHeight)
  // At the table, the word sources' options: the group under the art is measured with the taller in
  // it, and the art also gets the room the chosen one leaves (see SourceSwap), so it never sits empty.
  const [swapHeights, setSwapHeights] = useState({ packs: 0, write: 0 })
  const handlePacksHeight = useCallback((height: number) => setSwapHeights((previous) => (previous.packs === height ? previous : { ...previous, packs: height })), [])
  const handleWriteHeight = useCallback((height: number) => setSwapHeights((previous) => (previous.write === height ? previous : { ...previous, write: height })), [])
  const swapMeasured = swapHeights.packs > 0 && swapHeights.write > 0
  const swapSlack = table && swapMeasured ? Math.max(swapHeights.packs, swapHeights.write) - (source === 'packs' ? swapHeights.packs : swapHeights.write) : 0
  const measured = viewportHeight > 0 && aboveHeight > 0 && belowHeight > 0 && (!table || swapMeasured)
  const artHeight = measured ? clampArt(viewportHeight - insets.top - insets.bottom - CORNER_BAND_HEIGHT - aboveHeight - belowHeight - BLOCK_GAP - ART_CAROUSEL_CHROME_HEIGHT - ART_SLACK + swapSlack, artMaxHeight) : estimate
  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => setViewportHeight(Math.round(event.nativeEvent.layout.height)), [])
  const viewportRef = useRef<View>(null)
  useHeightBeforePaint(viewportRef, setViewportHeight)

  const coveredOnPage = packsScreenVisible || resetVisible || asking || removing !== null || switching !== null || clearing !== null

  // The focused player's settings row and packs card: Single Player's page, and the table's on the packs.
  const packsOptions = (
    <>
      <SettingsRow difficulty={difficulty} onChangeDifficulty={setDifficulty} canReset={!atDefaults} onReset={openReset} />
      <PacksCard packs={selectedPacks} total={manifest.length} progress={overallProgress} unlocked={totalUnlocked} available={totalAvailable} onPress={openPacksScreen} />
    </>
  )

  return (
    <LoadoutShell
      closeOverlay={closeOverlay}
      closeAllOverlays={closeAllOverlays}
      centerAction={table ? <AddPlayerButton disabled={players.length >= MAX_PNP_PLAYERS} onAdd={handleAdd} /> : undefined}
      overlays={
        <>
          {/* At the table the packs are only browsed: every puzzle comes by turns, from each player's own
              selection. */}
          <PacksScreen ref={packsScreenRef} visible={packsScreenVisible} onDismiss={closePacksScreen} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={refreshCustomPacks} mode={mode} difficulty={difficulty} onConfirm={table ? undefined : startFromPacksScreen} />
          <ConfirmDialog visible={resetVisible} icon='restore' title='Reset Settings?' message={`The art goes back to ${DEFAULT_MODE.label}, the difficulty to Any, and every pack is selected again.`} confirmLabel='Reset' cancelLabel='Cancel' onConfirm={handleResetConfirm} onCancel={handleResetCancel} />
          <ConfirmDialog visible={removing !== null} icon='account-remove-outline' title={`Remove ${removing ? getSeatIdentity(players, removing.id, profiles).name : ''}?`} message={removing?.message ?? ''} confirmLabel='Remove' cancelLabel='Cancel' onConfirm={handleRemoveConfirm} onCancel={handleRemoveCancel} destructive />
          <ConfirmDialog visible={switching !== null} icon='account-switch-outline' title={switching?.title ?? ''} message={switching?.message ?? ''} confirmLabel='Switch' cancelLabel='Cancel' onConfirm={handleSwitchConfirm} onCancel={handleSwitchCancel} />
          <ConfirmDialog visible={clearing !== null} icon='restore' title='New Session?' message={clearing ?? ''} confirmLabel='New Session' cancelLabel='Cancel' onConfirm={handleNewSessionConfirm} onCancel={handleNewSessionCancel} />
          {abandonDialog}
        </>
      }
    >
      {/* A plain scroll view that only scrolls once the art is at its floor (see artHeight); until then
          the page spreads over it (see styles.page). In a view of its own size, read before the first
          paint (see useHeightBeforePaint). */}
      <View ref={viewportRef} style={styles.flex}>
        <FadingScrollView testID='loadout-page' style={styles.flex} fadeHeight={insets.top + CORNER_BAND_HEIGHT} contentContainerStyle={[styles.page, pagePadding]} onLayout={handleViewportLayout} alwaysBounceVertical={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
          {/* First, under everything a tap should reach while a popover is open (the lifted group). */}
          <LoadoutPressAway style={styles.pressAway} />
          <PageGroup testID='loadout-above-art' lift={isPlayerPickerOpen} onHeight={setAboveHeight}>
            {table ? <SeatsRow players={players} focusedId={focusedSeat.id} standings={standings} showStandings={sessionStarted} onFocus={handleFocus} onPick={handlePick} onRemove={handleRemove} removingId={removing?.id ?? null} onNewSession={sessionUnderWay ? openNewSession : undefined} /> : <PlayerRow />}
          </PageGroup>
          <PageArtCarousel coveredOnPage={coveredOnPage} artHeight={artHeight} measured={measured} />
          <PageGroup testID='loadout-below-art' lift={isDifficultyOpen} onHeight={setBelowHeight} shrink={swapSlack} measured={measured} end>
            {table ? <SourceSwap source={source} choice={<SourceChoice value={source} onChange={handleSource} />} packs={packsOptions} write={<KeepWordsCard value={autoSave} onChange={setAutoSave} />} heights={swapHeights} onPacksHeight={handlePacksHeight} onWriteHeight={handleWriteHeight} slack={swapSlack} measured={measured} /> : packsOptions}
            {/* Off, rather than an alert after the tap, while there's nothing to draw from (the packs card
              says why). */}
            <Button mode='contained' icon='play' onPress={handleReady} disabled={readyDisabled} accessibilityHint={readyHint} style={styles.ready} contentStyle={styles.readyContent} labelStyle={styles.readyLabel}>
              Ready
            </Button>
          </PageGroup>
        </FadingScrollView>
      </View>
    </LoadoutShell>
  )
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', marginTop: BLOCK_GAP },
  cardContent: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  cardDetail: { marginTop: 2, opacity: 0.85 },
  // Raised off the board like the pills above it (the fleet's wells' shadow).
  cardSurface: { boxShadow: WELL_SHADOW },
  cardText: { flex: 1 },
  cardTitle: { fontWeight: '700' },
  carousel: { alignSelf: 'stretch', marginTop: BLOCK_GAP },
  flex: { flex: 1 },
  group: { alignItems: 'center', alignSelf: 'stretch' },
  // The group's own box, whose height eases (its content keeps its own, see PageGroup).
  groupBox: { alignSelf: 'stretch' },
  // Hung from its foot, so a change of height moves what's above it, never Ready.
  groupBoxEnd: { justifyContent: 'flex-end' },
  // A group over the press away catcher (and everything after it) while its popover is open.
  lifted: { zIndex: 2 },
  // One group, centered in the room under the corners, inside the gutters the rest of the app keeps.
  // The art grows to fill the room (up to its width), so the group fills it too and keeps together;
  // only past the art's width is there room left, split above and below the whole group. (Spreading
  // the blocks apart instead, space-between, read as disjointed around a small art, Jay 2026-10-18.)
  // Once the page outgrows the room it scrolls.
  page: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingHorizontal: PAGE_GUTTER, paddingVertical: ART_SLACK / 2 },
  // Centered, and never wider than the gutters, so a long name shrinks the pill instead of overflowing.
  playerRow: { alignItems: 'center', alignSelf: 'stretch', maxWidth: '100%' },
  // Over everything on the page but a lifted group (its height is the page's).
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
  settingsRow: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: BLOCK_GAP },
  settingsRowOpen: { zIndex: 1 },
  source: { alignSelf: 'stretch', borderRadius: 20, boxShadow: WELL_SHADOW, marginTop: BLOCK_GAP },
  // Over the options, so it slides over the ones fading out (see SourceSwap).
  sourceSlide: { alignSelf: 'stretch', zIndex: 2 },
  // The word sources' options overlaid: a row of two whole-width layers, the second pulled back over the
  // first, so the row is as tall as the taller and each sits at its foot.
  swap: { alignItems: 'flex-end', alignSelf: 'stretch', flexDirection: 'row' },
  swapContent: { alignItems: 'center', alignSelf: 'stretch' },
  swapLayer: { alignItems: 'center', width: '100%' },
  swapLayerChosen: { zIndex: 1 },
  swapLayerOver: { marginLeft: '-100%' },
  swapOpen: { zIndex: 1 }
})
