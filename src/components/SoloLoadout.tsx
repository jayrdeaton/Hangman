import { Button, IconButton, SegmentedButtons } from '@rific/feedback-press'
import { FlatList } from '@rific/scroll-view'
import { router } from 'expo-router'
import { JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Avatar, Icon, Text, useTheme } from 'react-native-paper'
import { useSelector } from 'react-redux'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import { usePackSelection } from '@/hooks/usePackSelection'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { useStartSolo } from '@/hooks/useStartSolo'
import { selectSoloRound } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { gameHref } from '@/utils/navigation'
import { getPuzzleManifest, type PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { isRoundPlayable } from '@/utils/roundState'
import { getManifestUnlockProgress, getUnlockedCountForPack } from '@/utils/unlocks'

import { ColorsRow } from './ColorsRow'
import { LoadoutShell, SectionLabel } from './LoadoutShell'
import { PackProgressDrawer } from './PackProgressDrawer'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'
import { PacksScreen, type PacksScreenHandle } from './PacksScreen'

const randomConfig = (mode: GameMode, difficulty: PuzzleConfig['difficulty']): PuzzleConfig => ({ sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })

// Single Player: the old Game Menu's gameplay half, as a page. The colors (for now), the difficulty
// filter, the packs (Choose Packs, Pack Progress, and a quick-start row per selected pack), then
// Random (off, with a line saying why, while no pack is selected), or Continue for a round left
// waiting on the board. Everything on it is the active player's:
// their picks, their unlocked puzzles and their waiting round. The art is picked in the Settings sheet
// (the header's cog; see ArtPicker), not here.
export const SoloLoadout = (): JSX.Element => {
  const theme = useTheme()
  const { key: playerKey } = useActivePlayer()
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()
  const { mode, difficulty, setDifficulty } = usePuzzleDefaults()
  const { packsVersion } = useCatalogVersions()
  const { refreshCustomPacks } = useCatalogActions()
  const { requestStart, abandonDialog } = useStartSolo()
  const canContinue = useSelector((state: RootState) => isRoundPlayable(selectSoloRound(state.round, playerKey)))
  // Read again whenever a win, an import or a reset moves the count, so every row's progress is
  // current when the player comes back from a round.
  const { unlockMap } = usePuzzleUnlocks()

  // packsVersion isn't read here: it's a change counter bumped whenever a custom pack is created,
  // edited, deleted or imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])

  const [packsScreenVisible, setPacksScreenVisible] = useState(false)
  // Which pack's puzzle list is showing, and whether it's actually open - split rather than one
  // nullable "open pack" so dismissing doesn't null the key out mid-close-animation (see
  // PackPuzzlesDrawer's own doc comment on packKey for why that would flash the content blank).
  const [playPackKey, setPlayPackKey] = useState<string | null>(null)
  const [playDrawerVisible, setPlayDrawerVisible] = useState(false)
  const [packProgressVisible, setPackProgressVisible] = useState(false)

  const { totalUnlocked, totalAvailable, overallProgress } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])
  const packsComplete = useMemo(() => manifest.filter((item) => getUnlockedCountForPack(unlockMap, item.key) >= item.count).length, [manifest, unlockMap])
  // In manifest order (built-in packs first, alphabetical within that), not selection order. Every
  // count below is of these, the packs that exist, so the collection row, Quick Start and Random always
  // agree on how many are selected.
  const selectedPacks = useMemo(() => {
    const selectedSet = new Set(selectedPackKeys)
    return manifest.filter((item) => selectedSet.has(item.key))
  }, [manifest, selectedPackKeys])
  const packsLabel = selectedPacks.length === manifest.length ? 'All Packs' : `${selectedPacks.length} of ${manifest.length} Packs`
  // Choose Packs' Clear (or removing the last Quick Start row) can leave nothing to draw from.
  const nothingSelected = selectedPacks.length === 0

  const difficultyOptionColors = useDifficultyOptionColors()
  const difficultyOptions = useMemo((): { label: string; value: 'any' | PuzzleDifficultyTier; checkedColor: string; uncheckedColor: string; style: StyleProp<ViewStyle> }[] => {
    const tiers: { label: string; value: 'any' | PuzzleDifficultyTier }[] = [
      { label: 'Any', value: 'any' },
      { label: 'Easy', value: 'easy' },
      { label: 'Medium', value: 'medium' },
      { label: 'Hard', value: 'hard' }
    ]
    // Paper's SegmentedButtons has no per-segment checked background, so both backgrounds are set
    // through each option's own style (see styles.difficultySegment).
    return tiers.map((option) => {
      const checked = option.value === difficulty
      const colors = difficultyOptionColors[option.value]
      return { ...option, checkedColor: colors.onVibrant, uncheckedColor: colors.onContainer, style: [styles.difficultySegment, { backgroundColor: checked ? colors.vibrant : colors.container }] }
    })
  }, [difficultyOptionColors, difficulty])

  const goToGame = useCallback(() => router.push(gameHref('solo')), [])
  const startPuzzle = useCallback((payload: GameStartPayload) => requestStart(payload, { onStarted: goToGame }), [requestStart, goToGame])

  // Draws from the whole pack selection, or from one pack (its quick-start row).
  const startRandom = useCallback(
    (packKeys: string[]) => {
      const result = resolvePuzzle(randomConfig(mode, difficulty), packKeys, unlockMap)
      if (!result.ok) {
        void alert('No Puzzles Available', result.error)
        return
      }
      startPuzzle(result.payload)
    },
    [mode, difficulty, unlockMap, startPuzzle]
  )

  const handleOpenPack = useCallback((packKey: string) => {
    setPlayPackKey(packKey)
    setPlayDrawerVisible(true)
  }, [])

  // Read through a ref, so removePack, and with it renderPackRow (every Quick Start row's renderer),
  // doesn't change identity each time the selection does.
  const selectedPackKeysRef = useRef(selectedPackKeys)
  useEffect(() => {
    selectedPackKeysRef.current = selectedPackKeys
  })
  // A Quick Start row's remove button: unselects that pack (the same selection Choose Packs edits).
  const removePack = useCallback((packKey: string) => setSelectedPackKeys(selectedPackKeysRef.current.filter((key) => key !== packKey)), [setSelectedPackKeys])
  // A pack list's Only This Pack: the selection becomes just that pack (the list closes itself).
  const handleOnlyThisPack = useCallback((packKey: string) => setSelectedPackKeys([packKey]), [setSelectedPackKeys])
  const onlyThisPackSelected = selectedPacks.length === 1 && selectedPacks[0].key === playPackKey
  // Stable identities: the drawers are memoized and stay mounted.
  const handleClosePacksScreen = useCallback(() => setPacksScreenVisible(false), [])
  const handleClosePlayDrawer = useCallback(() => setPlayDrawerVisible(false), [])
  const handleClosePackProgress = useCallback(() => setPackProgressVisible(false), [])

  const packsScreenRef = useRef<PacksScreenHandle>(null)
  // Choose Packs' own pack browser and editor sit above it, so they close first.
  const closeOverlay = useCallback(() => {
    if (playDrawerVisible) setPlayDrawerVisible(false)
    else if (packProgressVisible) setPackProgressVisible(false)
    else if (packsScreenVisible) {
      if (!packsScreenRef.current?.closeTopOverlay()) setPacksScreenVisible(false)
    } else return false
    return true
  }, [playDrawerVisible, packProgressVisible, packsScreenVisible])
  const closeAllOverlays = useCallback(() => {
    setPlayDrawerVisible(false)
    setPackProgressVisible(false)
    setPacksScreenVisible(false)
  }, [])

  // Tapping a pack draws from just that pack, the fastest way into a game. Browsing it (picking a
  // puzzle, Play This Pack, or Only This Pack) is the info icon. The remove button unselects the pack,
  // trimming this list (it used to be a long press, which nobody would find).
  const renderPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const progress = item.count > 0 ? unlocked / item.count : 0
      return (
        <PackRow
          label={item.label}
          group={item.group}
          isPack
          subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`}
          progress={progress}
          onPress={() => startRandom([item.key])}
          actions={[
            { name: 'browse', label: `Browse ${item.label}`, onPress: () => handleOpenPack(item.key) },
            { name: 'remove', label: `Remove ${item.label} from Quick Start`, onPress: () => removePack(item.key) }
          ]}
          trailing={
            <View style={styles.rowActions}>
              <IconButton icon='information-outline' size={20} onPress={() => handleOpenPack(item.key)} accessibilityLabel={`Browse ${item.label}`} />
              <IconButton icon='minus-circle-outline' size={20} onPress={() => removePack(item.key)} accessibilityLabel={`Remove ${item.label} from Quick Start`} />
            </View>
          }
        />
      )
    },
    [unlockMap, startRandom, handleOpenPack, removePack]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  const listHeader = (
    <>
      <ColorsRow first />

      <SectionLabel>Difficulty</SectionLabel>
      <SegmentedButtons value={difficulty} onValueChange={(value) => setDifficulty(value as 'any' | PuzzleDifficultyTier)} buttons={difficultyOptions} />

      <SectionLabel>Packs</SectionLabel>
      {/* The row for the whole collection, in the same shape as every pack row below it. */}
      <PackRow label={packsLabel} subtitle={`${commaString(totalUnlocked)} of ${commaString(totalAvailable)} unlocked`} progress={overallProgress} leading={<Avatar.Icon size={40} icon='format-list-checks' color={theme.colors.onTertiary} style={{ backgroundColor: theme.colors.tertiary }} />} trailing={<Icon source='chevron-right' size={24} color={theme.colors.onSurfaceVariant} />} onPress={() => setPacksScreenVisible(true)} />
      {/* Every pack's progress, selected or not, in PackProgressDrawer. Counts complete packs (the
          trophies in the drawer), not puzzles, so it doesn't repeat the row above. */}
      <PackRow label='Pack Progress' subtitle={`${commaString(packsComplete)} of ${commaString(manifest.length)} packs complete`} leading={<Avatar.Icon size={40} icon='progress-check' color={theme.colors.onSecondary} style={{ backgroundColor: theme.colors.secondary }} />} trailing={<Icon source='chevron-right' size={24} color={theme.colors.onSurfaceVariant} />} onPress={() => setPackProgressVisible(true)} />
      <SectionLabel>Quick Start</SectionLabel>
    </>
  )

  return (
    <LoadoutShell
      title='Single Player'
      closeOverlay={closeOverlay}
      closeAllOverlays={closeAllOverlays}
      footer={
        <>
          {canContinue ? (
            <Button mode='contained' icon='play' onPress={goToGame}>
              Continue
            </Button>
          ) : null}
          {/* Off, rather than an alert after the tap, while there's nothing to draw from, with the
              reason right above it (the docked footer is always in view, the empty Quick Start list
              may not be). */}
          {nothingSelected ? (
            <Text variant='bodySmall' style={[styles.randomNote, canContinue ? styles.secondButton : null, { color: theme.colors.onSurfaceVariant }]}>
              Choose at least one pack to play Random.
            </Text>
          ) : null}
          <Button mode={canContinue ? 'outlined' : 'contained'} icon='shuffle-variant' onPress={() => startRandom(selectedPackKeys)} disabled={nothingSelected} style={canContinue && !nothingSelected ? styles.secondButton : undefined}>
            Random
          </Button>
        </>
      }
      overlays={
        <>
          <PacksScreen ref={packsScreenRef} visible={packsScreenVisible} onDismiss={handleClosePacksScreen} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={refreshCustomPacks} />
          <PackPuzzlesDrawer visible={playDrawerVisible} packKey={playPackKey} mode={mode} difficulty={difficulty} onDismiss={handleClosePlayDrawer} onConfirm={startPuzzle} onOnlyThisPack={handleOnlyThisPack} onlyThisPackSelected={onlyThisPackSelected} />
          <PackProgressDrawer visible={packProgressVisible} onDismiss={handleClosePackProgress} manifest={manifest} mode={mode} difficulty={difficulty} onConfirm={startPuzzle} />
          {abandonDialog}
        </>
      }
    >
      <FlatList
        data={selectedPacks}
        keyExtractor={packRowKeyExtractor}
        renderItem={renderPackRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <Text variant='bodySmall' style={styles.emptyText}>
            No packs selected.
          </Text>
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
      />
    </LoadoutShell>
  )
}

const styles = StyleSheet.create({
  // Paper's SegmentedButtonItem makes every segment an equal quarter of the row (flex: 1) with a
  // fixed 16pt of padding a side, and equal quarters can't hold "Medium" on a narrow phone. So each
  // segment starts at its own label's width (flexBasis auto) and the leftover width is split evenly
  // on top (flexGrow 1). flex: 0 replaces Paper's flex: 1 because Yoga ignores flexBasis whenever
  // flex is positive; minWidth: 0 drops Paper's 76pt floor, and flexShrink: 1 lets segments narrow
  // and ellipsize instead of overflowing the gutter.
  difficultySegment: { flex: 0, flexBasis: 'auto', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  // Choose Packs' own empty-section text.
  emptyText: { marginBottom: 12, opacity: 0.7 },
  randomNote: { marginBottom: 8, textAlign: 'center' },
  // The info and remove buttons, side by side in the row's trailing slot.
  rowActions: { flexDirection: 'row' },
  // The same as PnpLoadout's.
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  secondButton: { marginTop: 8 }
})
