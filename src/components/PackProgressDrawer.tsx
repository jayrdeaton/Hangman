import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/feedback-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Card, Icon, ProgressBar, Text, useTheme } from 'react-native-paper'
import { useSharedValue } from 'react-native-reanimated'

import { DRAWER_PACK_PROGRESS_Z_INDEX } from '@/constants/drawerStacking'
import { useDrawerWidth } from '@/hooks/useDrawerWidth'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'
import { getManifestUnlockProgress, getPuzzleUnlockMap, getUnlockedCountForPack, PuzzleUnlockMap } from '@/utils/unlocks'

import { PackPuzzleList } from './PackPuzzleList'
import { PackRow } from './PackRow'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

export type PackProgressDrawerProps = {
  visible: boolean
  onDismiss: () => void
  // PuzzleDrawer's own manifest (custom packs included, rebuilt whenever packsVersion bumps), so this
  // lists exactly the packs its Pack Progress row counts. Must stay referentially stable between
  // changes (PuzzleDrawer memoizes it), or the memo below does nothing.
  manifest: PuzzleManifestItem[]
  unlockVersion: number
  mode: GameMode
  difficulty: 'any' | PuzzleDifficultyTier
  onConfirm: (payload: GameStartPayload, config: PuzzleConfig) => void
}

// Every pack's progress, selected or not (the Game Menu itself lists only the selected packs), with a
// drill-in to a pack's puzzles and a pack-scoped Random. What's left of the old Achievements drawer:
// its stats and achievement list moved to StatsScreen, and its backup to the Settings sheet. Left-side,
// matching PuzzleDrawer (the Game Menu); it only opens from that drawer's Pack Progress row, so it
// stacks above PuzzleDrawer's own panel (see DRAWER_PACK_PROGRESS_Z_INDEX) rather than sliding in
// independently, with no edge-swipe of its own, same as PackPuzzlesDrawer (also only reached via a tap
// from inside another drawer).
// mode/difficulty are read in this file only inside handlePlayPuzzle/handleRandom (see below), event
// handlers that fire from an actual tap, never from rendering, so while this drawer is closed a
// mode/difficulty change elsewhere (e.g. the player picking a difficulty in PuzzleDrawer) has nothing
// here for it to affect. Comparing them only once `visible` is true (or transitioning) means this
// drawer's render skips entirely for the common case of "closed, and something else on screen just
// changed," without going stale: the moment `visible` flips true this falls through to the full
// comparison, so the render that actually brings the panel on screen always picks up Main.tsx's
// current mode/difficulty, not a cached one. The manifest is skipped while closed for the same
// reason: a custom pack saved elsewhere reaches the list the moment the drawer opens.
const arePackProgressDrawerPropsEqual = (prev: PackProgressDrawerProps, next: PackProgressDrawerProps): boolean => {
  if (!prev.visible && !next.visible) {
    return prev.onDismiss === next.onDismiss && prev.unlockVersion === next.unlockVersion && prev.onConfirm === next.onConfirm
  }
  return prev.visible === next.visible && prev.onDismiss === next.onDismiss && prev.manifest === next.manifest && prev.unlockVersion === next.unlockVersion && prev.mode === next.mode && prev.difficulty === next.difficulty && prev.onConfirm === next.onConfirm
}

// Memoized: this stays mounted (translated off-screen) even while closed and renders a row per pack,
// so re-rendering it on every unrelated ancestor state change is real, needless work - see
// PuzzleDrawer's own memo comment for the full reasoning. Callers must pass referentially stable
// props (PuzzleDrawer wraps onDismiss in useCallback) or this memo does nothing. Uses the custom
// comparator above (not memo's own default shallow-equal) specifically to ALSO ignore mode/difficulty
// while closed - see its own comment for why that's safe.
export const PackProgressDrawer = memo(({ visible, onDismiss, manifest, unlockVersion, mode, difficulty, onConfirm }: PackProgressDrawerProps): JSX.Element => {
  const theme = useTheme()
  const drawerWidth = useDrawerWidth()
  // Closed position for a `side='left'` drawer (the default, see @rific/drawer's own
  // getClosedOffset) is -drawerWidth, the same seed PuzzleDrawer's own panel uses.
  const translateX = useSharedValue(-drawerWidth)
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  const [detailPackKey, setDetailPackKey] = useState<string | null>(null)

  // Always reopens on the overview, same as PacksScreen resetting its own step on open -
  // otherwise a drawer left mid-pack-detail on last close would silently resume there next time.
  useEffect(() => {
    if (visible) setDetailPackKey(null)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let mounted = true
    void getPuzzleUnlockMap().then((nextUnlocks) => {
      if (mounted) setUnlockMap(nextUnlocks)
    })
    return () => {
      mounted = false
    }
  }, [visible, unlockVersion])

  const { totalUnlocked, totalAvailable, overallProgress } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])

  // Mirrors PackPuzzlesDrawer's own row-tap-to-play (same resolve-then-close shape as handleRandom
  // below) - a specific puzzle row should start that puzzle here exactly like it does there.
  const handlePlayPuzzle = (puzzleId: string) => {
    if (!detailPackKey) return
    const result = resolveChosenPuzzle(detailPackKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })
    // Starting a round is what closes this - otherwise it's left stacked on top of the game that
    // just started, blocking it from view until the player finds and taps Close themselves.
    onDismiss()
  }

  // Mirrors PackPuzzlesDrawer's own Random button - browsing into a pack's progress here would
  // otherwise be a dead end with no way to act on it. Uses the app's current mode/difficulty
  // (passed down from Main.tsx) rather than exposing pickers of its own; this drawer is about
  // reviewing progress, not choosing settings.
  const handleRandom = () => {
    if (!detailPackKey) return
    const configToResolve: PuzzleConfig = { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }
    const result = resolvePuzzle(configToResolve, [detailPackKey], unlockMap)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
    // Starting a round is what closes this - otherwise it's left stacked on top of the game that
    // just started, blocking it from view until the player finds and taps Close themselves.
    onDismiss()
  }

  // "Browse by pack" - the full 50-pack manifest, real enough on-device render cost that the old
  // plain .map() inside a ScrollView (rendering every row unconditionally even though this whole
  // drawer stays mounted off-screen most of the time) was worth virtualizing: this becomes the
  // FlatList's own `data` below, with the total-progress card as its header.
  const renderPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const complete = item.count > 0 && unlocked >= item.count
      const progress = item.count > 0 ? unlocked / item.count : 0
      return <PackRow label={item.label} group={item.group} isPack subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => setDetailPackKey(item.key)} trailing={<Icon source={complete ? 'trophy' : 'chevron-right'} size={24} color={complete ? theme.colors.primary : theme.colors.onSurfaceVariant} />} />
    },
    [unlockMap, theme.colors.primary, theme.colors.onSurfaceVariant]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // Total progress card through the "Browse by pack" label, as the FlatList's own scrolling
  // header rather than a sibling before it - same ListHeaderComponent approach as PuzzleDrawer's
  // and PacksScreen's own pack lists (see PuzzleDrawer's own comment on this). Not memoized:
  // unlike those two, this drawer only re-renders at all when actually open (see
  // arePackProgressDrawerPropsEqual above), so there's no needless-cascade cost left to guard
  // against here.
  const listHeader = (
    <>
      <Card style={[styles.card, styles.firstCard, { backgroundColor: theme.colors.primaryContainer }]} mode='contained'>
        <Card.Content>
          <Text variant='labelLarge' style={[styles.overline, { color: theme.colors.onPrimaryContainer }]}>
            Total Progress
          </Text>
          <Text variant='displaySmall' style={[styles.bigNumber, { color: theme.colors.primary }]}>
            {commaString(totalUnlocked)}
            <Text variant='titleMedium' style={[styles.muted, { color: theme.colors.onPrimaryContainer }]}>
              {' '}
              / {commaString(totalAvailable)}
            </Text>
          </Text>
          <Text variant='bodySmall' style={[styles.muted, { color: theme.colors.onPrimaryContainer }]}>
            Puzzles Unlocked
          </Text>
          <View style={styles.progressBarWrapper}>
            <ProgressBar progress={overallProgress} style={[styles.progressBar, { backgroundColor: theme.colors.surface }]} />
          </View>
        </Card.Content>
      </Card>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Browse by Pack
      </Text>
    </>
  )

  return (
    <Drawer open={visible} onClose={onDismiss} panelShadow translateOffset={translateX} width={drawerWidth} zIndex={DRAWER_PACK_PROGRESS_Z_INDEX}>
      <View testID='pack-progress-drawer-panel' style={styles.panelContent} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? (detailPackKey ? () => setDetailPackKey(null) : onDismiss) : undefined}>
        <ScrollViewProvider>
          {/* Both the top-level close and the drilled-in back-arrow sit on the LEADING (left) side,
              matching PuzzleDrawer (the Game Menu) - this only opens from a tap on that drawer's own
              Pack Progress row, so its own exit action stays under the same thumb that opened it,
              same as PackPuzzlesDrawer already does for the same reason. backAction, not
              trailingAction - IconButton here is @rific/feedback-press's own wrapper (already fires
              haptics), unlike Appbar.BackAction, so no manual selection() call is needed. The
              top-level exit is arrow-left, not X - mirrors PuzzleDrawer's own close icon exactly. The
              drilled-in back-arrow stays arrow-left too - that's page-level "go back one level"
              navigation within this drawer, not the whole-panel dismiss, but both read the same
              direction now that this panel itself is left-anchored. */}
          <ScrollViewHeader
            actionSize={40}
            // Generic "Pack" while drilled in, rather than the pack's own name or group tint - its
            // actual identity (icon, genre, title, progress) lives entirely in PackPuzzleList's own
            // in-flow pack summary row; this is just enough of a label that the floating bar
            // doesn't read as unexpectedly bare.
            title={detailPackKey ? 'Pack' : 'Pack Progress'}
            backAction={detailPackKey ? <IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={() => setDetailPackKey(null)} accessibilityLabel='Back to pack progress' /> : <IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={onDismiss} accessibilityLabel='Close' />}
          />

          {detailPackKey ? (
            <>
              <PackPuzzleList packKey={detailPackKey} onPlayPuzzle={handlePlayPuzzle} />
              <ScrollViewFooter style={styles.footer}>
                <Button mode='contained' icon='play' onPress={handleRandom}>
                  Random
                </Button>
              </ScrollViewFooter>
            </>
          ) : (
            <FlatList
              data={manifest}
              keyExtractor={packRowKeyExtractor}
              renderItem={renderPackRow}
              ListHeaderComponent={listHeader}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              // Solid vibrant fill, not the chip's own default muted surface tint - matches every
              // other accent in this drawer instead of being the one control still washed out.
              chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
            />
          )}
        </ScrollViewProvider>
      </View>
    </Drawer>
  )
}, arePackProgressDrawerPropsEqual)
PackProgressDrawer.displayName = 'PackProgressDrawer'

const styles = StyleSheet.create({
  bigNumber: { fontWeight: '800', marginTop: 4 },
  card: { marginBottom: 4 },
  // scrollContent's own paddingTop is clobbered by the FlatList's header-height inset (see
  // useScrollList's contentPadding, applied after externalContentContainerStyle in its style
  // array), so it can't create breathing room below the fixed header - this has to sit on the
  // first card itself instead, same as PuzzleDrawer's modeSelectorBleed.
  firstCard: { marginTop: 12 },
  // flexDirection/alignItems override matches every other migrated footer - see PuzzleDrawer's
  // own footer comment: alignItems alone only stretches the cross axis, which is height while
  // ScrollViewFooter's own row stays flexDirection 'row', so flexDirection has to flip to
  // 'column' too for Random to actually stretch full width instead of shrinking to content.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    // Matches ScrollViewHeader's own actionMargin - see PuzzleDrawer's own footer comment for why.
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  muted: { opacity: 0.7 },
  overline: { letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' },
  panelContent: {
    flex: 1,
    overflow: 'hidden'
  },
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
    paddingHorizontal: 16,
    paddingTop: 4
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  }
})
