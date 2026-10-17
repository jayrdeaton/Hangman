import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { Button, IconButton, SegmentedButtons } from '@rific/feedback-press'
import { FlatList, ScrollView, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { router, useFocusEffect } from 'expo-router'
import { JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Avatar, Icon, Portal, Switch, Text, useTheme } from 'react-native-paper'
import { useDispatch, useSelector } from 'react-redux'

import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import { usePackSelection } from '@/hooks/usePackSelection'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { useStartSolo } from '@/hooks/useStartSolo'
import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import { type PlayMode, roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { gameHref, safeBack } from '@/utils/navigation'
import { getPuzzleManifest, type PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { isRoundPlayable } from '@/utils/roundState'
import { getManifestUnlockProgress, getPuzzleUnlockMap, getUnlockedCountForPack, type PuzzleUnlockMap } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

import { GameVisual } from './GameVisual'
import { ModePickerDrawer } from './ModePickerDrawer'
import { PackProgressDrawer } from './PackProgressDrawer'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'
import { PacksScreen, type PacksScreenHandle } from './PacksScreen'
import { SettingsDialog } from './SettingsDialog'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on the header) brings
// the tap target up to 48x48 without the visible circle growing.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

const randomConfig = (mode: GameMode, difficulty: PuzzleConfig['difficulty']): PuzzleConfig => ({ sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })

// The art summary row both loadouts share: the current art, drawn complete, opening Customize (the
// palette and the art carousel, ModePickerDrawer).
const ArtRow = ({ mode, onPress }: { mode: GameMode; onPress: () => void }): JSX.Element => {
  const theme = useTheme()
  const { settings } = useThemeSettings()
  // Same triad PuzzleStage builds for the real board, so the preview shows the art's full colors.
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])
  return <PackRow label={mode.label} subtitle={mode.description} leading={<GameVisual mode={mode} mistakes={fullyDrawnMistakes(mode)} color={resolveSeedColor(settings.color)} colors={colors} style={[styles.artPreview, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} />} trailing={<Icon source='chevron-right' size={24} color={theme.colors.onSurfaceVariant} />} onPress={onPress} accessibilityLabel={`Art: ${mode.label}. Change art`} />
}

const SectionLabel = ({ children, first = false }: { children: ReactNode; first?: boolean }): JSX.Element => (
  <Text variant='titleMedium' style={[styles.sectionLabel, first && styles.firstSectionLabel]}>
    {children}
  </Text>
)

type ShellProps = {
  title: string
  children: ReactNode
  footer: ReactNode
  // Closes the top-most drawer open over the page, if one is, for Android's back button. Returns
  // whether it closed one.
  closeOverlay: () => boolean
  // Closes every drawer, when the page stops being the one showing (a browser back on the web, a
  // share link pushed over it): an open art picker would otherwise keep its demo loop running.
  closeAllOverlays: () => void
  overlays?: ReactNode
}

// What both loadouts share: the header (back to Home, the title, the Settings cog), the scrolling
// body, the docked footer, Android back, and the Settings sheet. Transparent, over the app's one board
// (see BoardBackground), like every screen.
const LoadoutShell = ({ title, children, footer, closeOverlay, closeAllOverlays, overlays }: ShellProps): JSX.Element => {
  const theme = useTheme()
  const { refreshUnlocks } = useCatalogActions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Read through refs so the back listener below is registered once per focus and never again: React
  // Native runs the newest listener first, and re-registering whenever a drawer opened or closed put
  // this one ahead of a confirm that opened in the same commit (picking a puzzle in a pack's list
  // opens the abandon confirm and closes the list together), so back left the page instead of
  // cancelling the confirm.
  const closeOverlayRef = useRef(closeOverlay)
  const closeAllOverlaysRef = useRef(closeAllOverlays)
  useEffect(() => {
    closeOverlayRef.current = closeOverlay
    closeAllOverlaysRef.current = closeAllOverlays
  })

  // Back closes an open drawer first, then leaves for Home. safeBack replaces with Home when there's
  // nothing beneath (this loadout replaced a resumed game), where the navigator would close the app.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!closeOverlayRef.current()) safeBack()
        return true
      })
      return () => {
        subscription.remove()
        closeAllOverlaysRef.current()
      }
    }, [])
  )

  return (
    <Portal.Host>
      <View style={[styles.flex, gameShell]}>
        <ScrollViewProvider>
          <ScrollViewHeader actionSize={40} backAction={<IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={safeBack} accessibilityLabel='Back' />} title={title} trailingAction={<IconButton icon='cog' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />} />
          {children}
          <ScrollViewFooter style={styles.footer}>{footer}</ScrollViewFooter>
        </ScrollViewProvider>
      </View>
      {overlays}
      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} onUnlocksChanged={refreshUnlocks} />
    </Portal.Host>
  )
}

// Single Player: the old Game Menu's gameplay half, as a page. The art, the difficulty filter, the
// packs (Choose Packs, Pack Progress, and a quick-start row per selected pack), then Random, or
// Continue for a round left waiting on the board.
const SoloLoadout = (): JSX.Element => {
  const theme = useTheme()
  const dispatch = useDispatch()
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()
  const { mode, setMode, difficulty, setDifficulty } = usePuzzleDefaults()
  const { packsVersion, unlockVersion } = useCatalogVersions()
  const { refreshCustomPacks } = useCatalogActions()
  const { requestStart, abandonDialog } = useStartSolo()
  const canContinue = useSelector((state: RootState) => isRoundPlayable(state.round.solo))

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
  const [modePickerVisible, setModePickerVisible] = useState(false)
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})

  // Re-read whenever a win, an import or a reset moves the count, so every row's progress is current
  // when the player comes back from a round.
  useEffect(() => {
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (mounted) setUnlockMap(map)
    })
    return () => {
      mounted = false
    }
  }, [unlockVersion])

  const { totalUnlocked, totalAvailable, overallProgress } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])
  const packsComplete = useMemo(() => manifest.filter((item) => getUnlockedCountForPack(unlockMap, item.key) >= item.count).length, [manifest, unlockMap])
  const packsLabel = selectedPackKeys.length === manifest.length ? 'All Packs' : `${selectedPackKeys.length} of ${manifest.length} Packs`
  // In manifest order (built-in packs first, alphabetical within that), not selection order.
  const selectedPacks = useMemo(() => {
    const selectedSet = new Set(selectedPackKeys)
    return manifest.filter((item) => selectedSet.has(item.key))
  }, [manifest, selectedPackKeys])

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

  // The art is cosmetic, so a new pick also applies to a round left waiting on the board.
  const handleSelectMode = useCallback(
    (next: GameMode) => {
      setMode(next)
      dispatch(roundActions.setRoundArt(next.id))
    },
    [setMode, dispatch]
  )

  const handleOpenPack = useCallback((packKey: string) => {
    setPlayPackKey(packKey)
    setPlayDrawerVisible(true)
  }, [])
  // Stable identities: the drawers are memoized and stay mounted.
  const handleClosePacksScreen = useCallback(() => setPacksScreenVisible(false), [])
  const handleClosePlayDrawer = useCallback(() => setPlayDrawerVisible(false), [])
  const handleClosePackProgress = useCallback(() => setPackProgressVisible(false), [])
  const handleCloseModePicker = useCallback(() => setModePickerVisible(false), [])

  const packsScreenRef = useRef<PacksScreenHandle>(null)
  // Choose Packs' own pack browser and editor sit above it, so they close first.
  const closeOverlay = useCallback(() => {
    if (playDrawerVisible) setPlayDrawerVisible(false)
    else if (modePickerVisible) setModePickerVisible(false)
    else if (packProgressVisible) setPackProgressVisible(false)
    else if (packsScreenVisible) {
      if (!packsScreenRef.current?.closeTopOverlay()) setPacksScreenVisible(false)
    } else return false
    return true
  }, [playDrawerVisible, modePickerVisible, packProgressVisible, packsScreenVisible])
  const closeAllOverlays = useCallback(() => {
    setPlayDrawerVisible(false)
    setModePickerVisible(false)
    setPackProgressVisible(false)
    setPacksScreenVisible(false)
  }, [])

  // Tapping a pack draws from just that pack, the fastest way into a game. Browsing it (picking a
  // puzzle, or that pack's own Random) is the info icon. A long press unselects the pack (the same
  // selection Choose Packs toggles), a quiet shortcut for trimming this list.
  const renderPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const progress = item.count > 0 ? unlocked / item.count : 0
      return <PackRow label={item.label} group={item.group} isPack subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => startRandom([item.key])} onLongPress={() => setSelectedPackKeys(selectedPackKeys.filter((key) => key !== item.key))} trailing={<IconButton icon='information-outline' size={20} onPress={() => handleOpenPack(item.key)} accessibilityLabel={`Browse ${item.label}`} />} />
    },
    [unlockMap, startRandom, handleOpenPack, selectedPackKeys, setSelectedPackKeys]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  const listHeader = (
    <>
      <SectionLabel first>Art</SectionLabel>
      <ArtRow mode={mode} onPress={() => setModePickerVisible(true)} />

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
          <Button mode={canContinue ? 'outlined' : 'contained'} icon='shuffle-variant' onPress={() => startRandom(selectedPackKeys)} style={canContinue ? styles.secondButton : undefined}>
            Random
          </Button>
        </>
      }
      overlays={
        <>
          <PacksScreen ref={packsScreenRef} visible={packsScreenVisible} onDismiss={handleClosePacksScreen} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={refreshCustomPacks} />
          <PackPuzzlesDrawer visible={playDrawerVisible} packKey={playPackKey} mode={mode} difficulty={difficulty} onDismiss={handleClosePlayDrawer} onConfirm={startPuzzle} />
          <PackProgressDrawer visible={packProgressVisible} onDismiss={handleClosePackProgress} manifest={manifest} unlockVersion={unlockVersion} mode={mode} difficulty={difficulty} onConfirm={startPuzzle} />
          <ModePickerDrawer visible={modePickerVisible} onDismiss={handleCloseModePicker} selected={mode} onSelect={handleSelectMode} />
          {abandonDialog}
        </>
      }
    >
      <FlatList data={selectedPacks} keyExtractor={packRowKeyExtractor} renderItem={renderPackRow} ListHeaderComponent={listHeader} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled' chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }} />
    </LoadoutShell>
  )
}

// Pass & Play: the art, and whether each word is kept, then a fresh word, or Continue for a round
// left waiting. The word itself is written on the game screen, over the real board.
const PnpLoadout = (): JSX.Element => {
  const theme = useTheme()
  const dispatch = useDispatch()
  const { mode, setMode } = usePuzzleDefaults()
  const { autoSave, setAutoSave } = useAutoSaveCustom()
  const [modePickerVisible, setModePickerVisible] = useState(false)
  // Something to come back to: a word half typed, a word handed off, or a round mid-guess. A blank
  // prompt isn't.
  const canContinue = useSelector((state: RootState) => {
    const { pnp } = state.round
    if (pnp.phase === 'authoring') return Boolean(pnp.draft?.answer.trim())
    return (pnp.phase === 'handoff' || pnp.phase === 'playing') && isRoundPlayable(pnp)
  })

  const handleSelectMode = useCallback(
    (next: GameMode) => {
      setMode(next)
      dispatch(roundActions.setRoundArt(next.id))
    },
    [setMode, dispatch]
  )
  const handleCloseModePicker = useCallback(() => setModePickerVisible(false), [])
  const closeOverlay = useCallback(() => {
    if (!modePickerVisible) return false
    setModePickerVisible(false)
    return true
  }, [modePickerVisible])
  const closeAllOverlays = useCallback(() => setModePickerVisible(false), [])

  const goToGame = useCallback(() => router.push(gameHref('pnp')), [])
  // A new session starts at a blank prompt. Leaving one behind costs nothing: Pass & Play keeps no
  // record of how a session ends, only of rounds actually finished.
  const handleStart = useCallback(() => {
    dispatch(roundActions.startPnpAuthoring())
    goToGame()
  }, [dispatch, goToGame])

  return (
    <LoadoutShell
      title='Pass & Play'
      closeOverlay={closeOverlay}
      closeAllOverlays={closeAllOverlays}
      footer={
        <>
          {canContinue ? (
            <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='play' onPress={goToGame}>
              Continue
            </Button>
          ) : null}
          <Button mode={canContinue ? 'outlined' : 'contained'} buttonColor={canContinue ? undefined : theme.colors.secondary} textColor={canContinue ? undefined : theme.colors.onSecondary} icon='pencil' onPress={handleStart} style={canContinue ? styles.secondButton : undefined}>
            Write a Word
          </Button>
        </>
      }
      overlays={<ModePickerDrawer visible={modePickerVisible} onDismiss={handleCloseModePicker} selected={mode} onSelect={handleSelectMode} />}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text variant='bodyLarge' style={[styles.intro, { color: theme.colors.onSurface }]}>
          One player writes a secret word and passes the device. The other guesses it, then writes the next one.
        </Text>

        <SectionLabel>Art</SectionLabel>
        <ArtRow mode={mode} onPress={() => setModePickerVisible(true)} />

        <SectionLabel>Words</SectionLabel>
        <PackRow label='Keep Each Word' subtitle='Saves every word to your Pass & Play pack' leading={<Avatar.Icon size={40} icon='content-save-outline' color={theme.colors.onSecondary} style={{ backgroundColor: theme.colors.secondary }} />} trailing={<Switch value={autoSave} onValueChange={setAutoSave} accessibilityLabel='Keep each word' />} onPress={() => setAutoSave(!autoSave)} />
      </ScrollView>
    </LoadoutShell>
  )
}

export type LoadoutScreenProps = { mode: PlayMode }

// The /loadout route: what to play before playing it, one page per play mode, between Home and the
// game. Each mode keeps its own round (see roundSlice), so Continue picks up exactly where that mode
// was left.
export const LoadoutScreen = ({ mode }: LoadoutScreenProps): JSX.Element => (mode === 'pnp' ? <PnpLoadout /> : <SoloLoadout />)

const styles = StyleSheet.create({
  artPreview: { borderRadius: 8, borderWidth: 2, height: 56, overflow: 'hidden', width: 56 },
  // Paper's SegmentedButtonItem makes every segment an equal quarter of the row (flex: 1) with a
  // fixed 16pt of padding a side, and equal quarters can't hold "Medium" on a narrow phone. So each
  // segment starts at its own label's width (flexBasis auto) and the leftover width is split evenly
  // on top (flexGrow 1). flex: 0 replaces Paper's flex: 1 because Yoga ignores flexBasis whenever
  // flex is positive; minWidth: 0 drops Paper's 76pt floor, and flexShrink: 1 lets segments narrow
  // and ellipsize instead of overflowing the gutter.
  difficultySegment: { flex: 0, flexBasis: 'auto', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  firstSectionLabel: { marginTop: 12 },
  flex: { flex: 1 },
  // A column of full-width buttons, with the header's own 4pt margins top and bottom.
  footer: { alignItems: 'stretch', flexDirection: 'column', paddingBottom: 4, paddingHorizontal: 16, paddingTop: 4 },
  intro: { marginTop: 12, opacity: 0.85 },
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  secondButton: { marginTop: 8 },
  sectionLabel: { fontWeight: '700', marginBottom: 8, marginTop: 16 }
})
