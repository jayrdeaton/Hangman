import { AppbarAction } from '@rific/haptic-press'
import * as Linking from 'expo-linking'
import { JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Appbar, Snackbar } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { usePackSelection } from '@/hooks/usePackSelection'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { ACHIEVEMENT_DEFINITIONS_BY_ID, type AchievementId, recordLoss, recordPnpLoss, recordPnpWin, recordSolve } from '@/utils/achievements'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { addCustomPuzzle, importCustomPack, loadCustomPacksCache, parseCustomPackImport, scoreDifficulty } from '@/utils/customPacks'
import { readHangmanFileFromUri } from '@/utils/hangmanFile'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { parseSharedPuzzle } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap, getTotalUnlockedCount, getUnlockedCountForPack, markPuzzleUnlocked, mergePuzzleUnlocks, parseProgressBackup, type PuzzleUnlockMap } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

import { AchievementsDrawer } from './AchievementsDrawer'
import { ConfirmDialog } from './ConfirmDialog'
import { Game, type LossDetails, type SolveDetails } from './Game'
import { PnpHandoffDialog } from './PnpHandoffDialog'
import { PnpWordPrompt } from './PnpWordPrompt'
import { PuzzleDrawer } from './PuzzleDrawer'
import { type CategoryProgress } from './RoundEndDialog'

const DEFAULT_CONFIG: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

// Strips the answer out of a config while keeping the intent around it (sourceMode/mode/
// difficulty). `session` is the single source of truth for what's actually on screen — nothing
// downstream of `config` (PuzzleDrawer's initialConfig, a later startNextRound call) has any
// business also carrying the live phrase around.
const withoutSecret = (config: PuzzleConfig): PuzzleConfig => ({ ...config, customPhrase: '', customHint: '' })

// Always succeeds (unlike resolvePuzzle), even on a blank or unscoreable answer — Game needs a
// session to render as the composing screen's own board from the moment authoring starts, not
// just once the word is valid enough to hand off. difficultyTier defaults to 'easy' while blank,
// matching buildCustomPuzzle's own scoring (which returns null, not a real tier, for that case) —
// see PuzzleInfoRow's the-pill-shouldn't-pop-in reasoning, which applies here for the same reason.
const buildPnpDraftSession = (answer: string, mode: GameMode): GameStartPayload => {
  const phrase = normalizePhrase(answer)
  const difficultyTier = phrase.replace(/ /g, '').length > 0 ? scoreDifficulty(phrase).difficultyTier : 'easy'
  return { phrase, mode, sourceMode: 'custom', difficultyTier }
}

export const Main = (): JSX.Element => {
  const insets = useSafeAreaInsets()
  // The persisted default pack selection (see usePackSelection) — read here, before the lazy
  // state initializers below, so it's already available (synchronously — see
  // PackSelectionProvider) the moment they run.
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()
  const { autoSave } = useAutoSaveCustom()
  // Pass and play is just a three-beat loop, so it needs no more state than which beat we're on —
  // null means we're not in it. There are deliberately no players and no score: any number of people
  // can be passing the device around, which makes both incoherent to track.
  const [pnpPhase, setPnpPhase] = useState<'authoring' | 'handoff' | 'playing' | null>(null)
  // Owned here, not by PnpWordPrompt — Main mounts the real Game continuously for the whole pass-
  // and-play round (see the render below and buildPnpDraftSession above), so it needs the live
  // phrase itself to feed that board while composing, not just the finished word at Hand off.
  const [pnpAnswer, setPnpAnswer] = useState('')
  const [pnpHint, setPnpHint] = useState('')
  // Resolved synchronously (not via a hook side effect) on web and read from the native module's
  // cache on native — see expo-linking's getLinkingURL — so a cold-started shared-puzzle link is
  // already known by the time the lazy state initializers below run.
  const incomingUrl = Linking.useLinkingURL()
  // No setup screen — the app opens straight into a game, matching the "no fuss" goal. A puzzle
  // shared by a friend (opened cold) goes straight into that puzzle too, for the same reason;
  // everything else falls back to the default random puzzle. Both computed as lazy useState
  // initializers (not an effect) so the first paint already shows the right game.
  const [config, setConfig] = useState<PuzzleConfig>(() => {
    const shared = incomingUrl ? parseSharedPuzzle(incomingUrl) : null
    return shared ?? DEFAULT_CONFIG
  })
  // A ref, not state — nothing renders off this directly (categoryProgress, set separately, is
  // what the UI actually reads), it just needs to be the latest value resolvePuzzle can read
  // synchronously from startNextRound's button-press callback, without an async fetch
  // (see handleSolved and the mount effect below) in the way of picking the next puzzle. Refs
  // shouldn't be read during render (only event handlers/effects — see the mount effect below,
  // which is exactly why this can't just seed the session initializer just below either), so the
  // very first, synchronous draw on cold boot always passes {} explicitly instead of this ref —
  // unlocks from a previous session load moments after first paint, too late for that one draw.
  const unlockMapRef = useRef<PuzzleUnlockMap>({})
  const [session, setSession] = useState<GameStartPayload | null>(() => {
    const result = resolvePuzzle(config, selectedPackKeys, {})
    return result.ok ? result.payload : null
  })
  // Game is keyed on this counter (not session.phrase) so it always remounts on a new round —
  // two consecutive puzzles can land on the identical normalized phrase (a small pack, or two
  // different puzzles normalizing to the same text), and keying on the phrase text would then
  // reuse the same Game instance, carrying its outcome/celebrationCycle/guessedLetters state into the
  // "new" round instead of resetting it.
  const [roundKey, setRoundKey] = useState(0)
  // How far the CURRENT round (see roundKey) has gotten — fed by Game's onGuessProgress, reset
  // below whenever roundKey bumps. Refs, not state: nothing renders off these, they just need to
  // be readable synchronously from shouldConfirmAbandon at the moment a new puzzle is requested.
  const roundProgressRef = useRef<LossDetails>({ wrongGuesses: 0, guessCount: 0 })
  // Flipped inside handleSolved/handleLost, which already fire synchronously the instant a round
  // is decided (see Game's own roundOverRef) — cheaper and more accurate than trying to infer
  // "already decided" from Game's outcome state, which lags a loss by its own 450ms delay.
  const roundDecidedRef = useRef(false)
  // A puzzle switch requested while the current round already has a guess on it and isn't decided
  // yet — held here until the player confirms via the abandon-confirmation dialog below (or
  // discards it via Cancel), rather than applied immediately like a fresh/already-over round's
  // switch is.
  const [pendingAbandon, setPendingAbandon] = useState<{ kind: 'puzzle'; payload: GameStartPayload; config: PuzzleConfig } | { kind: 'pnp' } | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [achievementsVisible, setAchievementsVisible] = useState(false)
  const [unlockVersion, setUnlockVersion] = useState(0)
  const [customPacksVersion, setCustomPacksVersion] = useState(0)
  const [snackbarQueue, setSnackbarQueue] = useState<AchievementId[]>([])
  const pendingAchievementsRef = useRef<AchievementId[]>([])
  // The category-completion stat shown on a win. Cleared synchronously at the top of
  // handleSolved (see below) so a fresh win never briefly shows the previous win's numbers
  // while the unlock-map lookup for the new one is still in flight.
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress | null>(null)

  // Every genuinely new round (roundKey bump — see its own declaration above) starts a clean slate
  // for abandon-tracking too, whichever path got it there (a picked puzzle, the automatic next
  // round, a fresh pass-and-play word).
  useEffect(() => {
    roundProgressRef.current = { wrongGuesses: 0, guessCount: 0 }
    roundDecidedRef.current = false
  }, [roundKey])

  // Native caches the cold-start URL in a singleton that only resets via this call (unlike web,
  // which always re-reads the live window location) — clearing it once consumed means a later
  // remount (Fast Refresh, a future error boundary) can't replay the same puzzle as if it were new.
  useEffect(() => {
    Linking.clearInitialURL()
  }, [])

  const refreshUnlocks = useCallback(() => setUnlockVersion((v) => v + 1), [])
  const refreshCustomPacks = useCallback(() => setCustomPacksVersion((v) => v + 1), [])

  // Custom packs live in AsyncStorage, so they aren't available for the very first (synchronous)
  // auto-started puzzle on cold boot — same "loads shortly after first paint" tradeoff the app
  // already accepts for unlocks/achievements. Bumping the version afterward makes them show up in
  // the pack picker and future random draws as soon as they're hydrated.
  useEffect(() => {
    void loadCustomPacksCache().then(refreshCustomPacks)
  }, [refreshCustomPacks])

  // Hydrates unlockMapRef shortly after first paint (see its own declaration above for why the
  // very first, synchronous session draw can't wait for this) — every automatic next round from
  // here on already reflects unlocks from a previous session, not just ones made in this one.
  useEffect(() => {
    void getPuzzleUnlockMap().then((map) => {
      unlockMapRef.current = map
    })
  }, [])

  // A pack or progress backup shared as a real .hangman file (see hangmanFile.ts) — opened via the
  // OS "Open in Hangman" flow (Messages attachment, Mail, Files, AirDrop), not the app's own
  // hangman:// scheme, so it arrives as a file:/content: URL rather than something
  // parseSharedPuzzle understands. Preview-only until confirmed below — parsing reads the
  // label/word count (or unlock count) without saving anything, so a stray or malicious file can't
  // silently change anything.
  const [incomingFilePreview, setIncomingFilePreview] = useState<{ kind: 'pack'; raw: string; label: string; wordCount: number } | { kind: 'progress'; raw: string; unlockCount: number } | null>(null)

  useEffect(() => {
    // Native-only: there's no OS-level "open this file in an app" concept on web for Linking to
    // ever deliver here, and expo-file-system (needed to read the file:/content: URI) doesn't
    // support web at all.
    if (!incomingUrl || Platform.OS === 'web') return
    const { scheme } = Linking.parse(incomingUrl)
    if (scheme !== 'file' && scheme !== 'content') return

    let mounted = true
    void readHangmanFileFromUri(incomingUrl)
      .then((raw) => {
        if (!mounted) return
        // The two .hangman payload shapes are told apart by content (a `pack` key vs an `unlocks`
        // key — see hangmanFile.ts), not by filename/extension, since both share the same one.
        // parseProgressBackup is tried first and is strict about that `unlocks` key, so it never
        // mistakes a pack export for a backup; falling through to parseCustomPackImport on failure
        // (rather than branching on shape ourselves) reuses each parser's own validation instead of
        // duplicating it here.
        try {
          const unlocks = parseProgressBackup(raw)
          setIncomingFilePreview({ kind: 'progress', raw, unlockCount: getTotalUnlockedCount(unlocks) })
          return
        } catch {
          // Not a progress backup — fall through and try it as a pack instead.
        }
        const { label, entries } = parseCustomPackImport(raw)
        setIncomingFilePreview({ kind: 'pack', raw, label, wordCount: entries.length })
      })
      .catch(() => {
        if (mounted) void alert('Invalid file', 'Could not read that as a Hangman pack or progress backup file.')
      })
    return () => {
      mounted = false
    }
  }, [incomingUrl])

  // Only reachable from the confirm dialog's own Import button (see the ConfirmDialog rendered
  // below) — by the time this runs, the player has already agreed to import the file.
  const handleConfirmIncomingFile = useCallback(async () => {
    if (!incomingFilePreview) return
    try {
      if (incomingFilePreview.kind === 'progress') {
        await mergePuzzleUnlocks(incomingFilePreview.raw)
        refreshUnlocks()
        // Opens the Achievements drawer so the merged progress is immediately visible — the
        // closest thing to confirmation without inventing new toast UI.
        setAchievementsVisible(true)
      } else {
        const pack = await importCustomPack(incomingFilePreview.raw)
        if (!selectedPackKeys.includes(pack.key)) setSelectedPackKeys([...selectedPackKeys, pack.key])
        refreshCustomPacks()
        // Opens the menu so the new pack count (and the pack itself, in the quick list) is
        // immediately visible — the closest thing to confirmation without inventing new toast UI.
        setDrawerVisible(true)
      }
    } catch {
      void alert('Invalid file', incomingFilePreview.kind === 'progress' ? 'Could not import that Hangman progress backup file.' : 'Could not import that Hangman pack file.')
    } finally {
      setIncomingFilePreview(null)
    }
  }, [incomingFilePreview, selectedPackKeys, setSelectedPackKeys, refreshCustomPacks, refreshUnlocks])

  // True while the current round has at least one guess on it and isn't decided yet — the
  // moment abandoning it (by starting a different puzzle, or a pass-and-play word) instead of
  // seeing it through should cost the same loss it would if the wrong-guess limit were hit for
  // real. A fresh round (no guesses) or one that already ended costs nothing to leave, so those
  // switch immediately with no confirmation. Left out of pass-and-play entirely — a friend's word
  // has its own separate pnpWins/pnpLosses counters (see handleSolved/handleLost above), earned
  // only by actually finishing a round, not by however a two-player session gets left.
  const shouldConfirmAbandon = useCallback(() => !pnpPhase && !roundDecidedRef.current && roundProgressRef.current.guessCount > 0, [pnpPhase])

  const applyNewPuzzle = useCallback((payload: GameStartPayload, nextConfig: PuzzleConfig) => {
    setSession(payload)
    // The secret itself is deliberately NOT retained in `config` — only the intent around it
    // (sourceMode/mode/difficulty). It's already been resolved into `session` by this point, and
    // anything still holding it would let a later startNextRound(config, …) silently replay the old
    // word instead of drawing a new one. `session` is the single owner of the live phrase.
    setConfig(withoutSecret(nextConfig))
    setDrawerVisible(false)
    setRoundKey((k) => k + 1)
    // Starting any puzzle from the menu is how you leave pass and play — the menu stays reachable
    // throughout, so this doubles as the exit and needs no separate affordance.
    setPnpPhase(null)
  }, [])

  const handleConfirmPuzzle = useCallback(
    (payload: GameStartPayload, nextConfig: PuzzleConfig) => {
      if (shouldConfirmAbandon()) {
        setPendingAbandon({ kind: 'puzzle', payload, config: nextConfig })
        return
      }
      applyNewPuzzle(payload, nextConfig)
    },
    [shouldConfirmAbandon, applyNewPuzzle]
  )

  const handleGuessProgress = useCallback((details: LossDetails) => {
    roundProgressRef.current = details
  }, [])

  const handleDismissDrawer = useCallback(() => {
    setDrawerVisible(false)
  }, [])

  // Live, not staged behind the drawer's confirm button — an art style is purely cosmetic, so it
  // applies to the round already on screen the instant it's picked, not just future ones. Session
  // stays otherwise untouched (same phrase/hint/outcome/guessedLetters), so this never disturbs a
  // round in progress; Game.tsx separately freezes the mistake limit itself at round start so a
  // mode with a different maxMistakes (see modes/stars.tsx) can't shift the difficulty mid-round.
  const handleModeChange = useCallback((mode: GameMode) => {
    setConfig((c) => ({ ...c, mode }))
    setSession((s) => (s ? { ...s, mode } : s))
  }, [])

  // Also live, but deliberately left out of `session` — a difficulty filter only shapes which
  // puzzle gets drawn NEXT, so touching the config that startNextRound reads from is enough for it
  // to apply the moment the current round ends, without retroactively touching the puzzle already
  // on screen (which was already drawn under whatever filter was active at the time).
  const handleDifficultyChange = useCallback((difficulty: PuzzleConfig['difficulty']) => {
    setConfig((c) => ({ ...c, difficulty }))
  }, [])

  const handleSolved = useCallback(
    async (details: SolveDetails) => {
      // A win decides the round — see roundDecidedRef's own declaration for why this (not
      // Game's outcome state) is what shouldConfirmAbandon reads.
      roundDecidedRef.current = true
      // Cleared here (synchronously, before the first await below) so it's batched with the
      // Game's own setOutcome('win') and never paints the previous round's category stats
      // while this round's unlock-map lookup is still in flight.
      setCategoryProgress(null)

      // A pass-and-play round is a contest between two people on one device, not progress against
      // the catalogue. It has no packKey/puzzleId to unlock, and folding it into the solo record
      // would let a friend's word inflate totalSolved and the win streak — and let the author's
      // choice of whether to write a hint decide the "No Hints Needed" achievement. Tracked in its
      // own pnpWins counter instead (see achievements.ts), separate from every solo stat.
      if (pnpPhase) {
        void recordPnpWin().then(refreshUnlocks)
        return
      }

      let packUnlockedCount: number | undefined
      let packTotalCount: number | undefined

      if (session?.packKey && session.puzzleId) {
        const unlocked = await markPuzzleUnlocked(session.packKey, session.puzzleId)
        const unlockMap = await getPuzzleUnlockMap()
        // So the very next automatic round (see startNextRound) already knows this puzzle is no
        // longer unsolved, without waiting on its own separate fetch.
        unlockMapRef.current = unlockMap
        packUnlockedCount = getUnlockedCountForPack(unlockMap, session.packKey)
        packTotalCount = getPuzzleManifest().find((item) => item.key === session.packKey)?.count
        if (unlocked) refreshUnlocks()
        if (session.packLabel && packTotalCount) setCategoryProgress({ label: session.packLabel, unlockedCount: packUnlockedCount, totalCount: packTotalCount })
      }

      const newlyUnlocked = await recordSolve({
        modeId: session?.mode.id ?? DEFAULT_MODE.id,
        wrongGuesses: details.wrongGuesses,
        guessCount: details.guessCount,
        hintWasAvailable: Boolean(session?.hint),
        hintRevealed: details.hintRevealed,
        packKey: session?.packKey,
        packUnlockedCount,
        packTotalCount
      })
      pendingAchievementsRef.current = newlyUnlocked
      refreshUnlocks()
    },
    [session, refreshUnlocks, pnpPhase]
  )

  const handleLost = useCallback(
    (details: LossDetails) => {
      // A loss decides the round too — see roundDecidedRef's own declaration.
      roundDecidedRef.current = true
      // Same separation as the win path above — a friend beating you shouldn't break your solo
      // streak or count toward your solo losses.
      if (pnpPhase) {
        void recordPnpLoss().then(refreshUnlocks)
        return
      }
      void recordLoss(details).then(refreshUnlocks)
    },
    [pnpPhase, refreshUnlocks]
  )

  const surfacePendingAchievements = useCallback(() => {
    if (pendingAchievementsRef.current.length > 0) {
      setSnackbarQueue(pendingAchievementsRef.current)
      pendingAchievementsRef.current = []
    }
  }, [])

  // The only caller left is handleRoundEnd's own automatic-next-round path below — kept as its own
  // function since "draw a puzzle for some set of packKeys and mount it as the next round" is a
  // distinct step from deciding WHICH packKeys that should be.
  const startNextRound = useCallback(
    (nextConfig: PuzzleConfig, packKeys: string[]) => {
      surfacePendingAchievements()
      const result = resolvePuzzle(nextConfig, packKeys, unlockMapRef.current)
      if (result.ok) {
        setSession(result.payload)
        setRoundKey((k) => k + 1)
      }
    },
    [surfacePendingAchievements]
  )

  const handleRoundEnd = useCallback(() => {
    // Pass and play doesn't draw anything: the player who just guessed becomes the next author, and
    // the loop continues until someone explicitly ends the session. No achievement snackbars either
    // — none were recorded (see handleSolved).
    if (pnpPhase) {
      setPnpAnswer('')
      setPnpHint('')
      // Fresh Game mount for the next word — otherwise the round just finished (its outcome,
      // wrongGuesses, celebration) would carry straight into the blank composing screen.
      setRoundKey((k) => k + 1)
      setPnpPhase('authoring')
      return
    }
    // A custom word is one-off — there's no "next" word to auto-generate, so surface the drawer
    // to ask for a new one instead of silently replaying the same phrase.
    if (config.sourceMode === 'custom') {
      surfacePendingAchievements()
      setDrawerVisible(true)
      return
    }
    // RoundEndDialog's single continue button already knows where the puzzle that just ended came
    // from (see GameStartPayload.packScope): a pack the player was specifically browsing
    // (PackPuzzlesDrawer/AchievementsDrawer's own Random, or a row tap) keeps drawing from just
    // that pack, same as a solo pack ever was; anything drawn from the player's whole standing
    // selection (PuzzleDrawer's bottom Random) draws from that live selection again — not whatever
    // config.packKeys used to be, since a pack toggled off in Choose Packs and never confirmed via
    // "Random" should still apply to this automatic next round.
    const packKeys = session?.packScope === 'single' && session.packKey ? [session.packKey] : selectedPackKeys
    startNextRound(config, packKeys)
  }, [config, selectedPackKeys, session, startNextRound, surfacePendingAchievements, pnpPhase])

  const applyPnpStart = useCallback(() => {
    setDrawerVisible(false)
    setPnpAnswer('')
    setPnpHint('')
    // Fresh Game mount for the composing screen — whatever was on screen before (a solo round's
    // outcome/guessedLetters, mid-guess or not) shouldn't carry into the new blank board.
    setRoundKey((k) => k + 1)
    setPnpPhase('authoring')
  }, [])

  const handleStartPnp = useCallback(() => {
    if (shouldConfirmAbandon()) {
      setPendingAbandon({ kind: 'pnp' })
      return
    }
    applyPnpStart()
  }, [shouldConfirmAbandon, applyPnpStart])

  // Only reachable from the abandon-confirmation dialog's own confirm button below — by the time
  // this runs, the player has already agreed to give up the round in progress. Records the loss
  // BEFORE applying the switch — applyNewPuzzle/applyPnpStart both bump roundKey, which resets
  // roundProgressRef back to zero on the very next effect pass (see its own declaration above).
  const handleConfirmAbandon = useCallback(() => {
    if (!pendingAbandon) return
    void recordLoss(roundProgressRef.current).then(refreshUnlocks)
    if (pendingAbandon.kind === 'puzzle') applyNewPuzzle(pendingAbandon.payload, pendingAbandon.config)
    else applyPnpStart()
    setPendingAbandon(null)
  }, [pendingAbandon, applyNewPuzzle, applyPnpStart, refreshUnlocks])

  const handleCancelAbandon = useCallback(() => {
    setPendingAbandon(null)
  }, [])

  const handlePnpAuthored = useCallback(() => {
    // Goes through the same resolver the drawer's custom flow uses, so normalization and what
    // counts as a valid word can't drift between the two places one can be authored. The mode
    // comes from `config` so whichever artwork the players picked still applies.
    const result = resolvePuzzle({ ...DEFAULT_CONFIG, sourceMode: 'custom', mode: config.mode, customPhrase: pnpAnswer, customHint: pnpHint }, [])
    if (!result.ok) {
      void alert('Enter a valid word', result.error)
      return
    }
    // Deliberately does NOT write to `config` — that's what feeds the drawer, and a phrase left
    // there is a phrase the next guesser can read (see withoutSecret above). `session` owns it.
    setSession(result.payload)
    // No roundKey bump: Game has been mounted (and locked) since composing began, already
    // rendering this exact word live the entire time (see buildPnpDraftSession) — finalizing it
    // into `session` here doesn't remount anything, so there's nothing left to flicker.
    // Opt-in, off by default (see useAutoSaveCustom). Fire-and-forget so handing over isn't
    // blocked on a storage write.
    if (autoSave) void addCustomPuzzle({ answer: pnpAnswer, hint: pnpHint || undefined }).then(refreshCustomPacks)
    setPnpPhase('handoff')
  }, [config.mode, pnpAnswer, pnpHint, autoSave, refreshCustomPacks])

  // What Game actually renders: the live draft while composing (so the board reflects the word as
  // it's typed), the real thing otherwise. Computing this here — rather than branching inside the
  // JSX below — is what lets the game slot below stay a single Game element instead of two, which
  // is the whole point (see the comment there).
  const effectiveSession = pnpPhase === 'authoring' ? buildPnpDraftSession(pnpAnswer, config.mode) : session

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        {/* The menu stays available throughout, pass and play included — whoever is holding the
            device can change settings or start a Random puzzle whenever they like, and that's also
            how you leave a session. */}
        <AppbarAction icon='menu' onPress={() => setDrawerVisible(true)} accessibilityLabel='Game Menu' />
        <View style={styles.appbarSpacer} />
        <AppbarAction icon='trophy-outline' onPress={() => setAchievementsVisible(true)} accessibilityLabel='Achievements' />
      </Appbar.Header>

      {/* One occupant, always: Game. It mounts once at the start of a pass-and-play round — the
          moment composing begins, not once a word's been handed off — and stays mounted, unchanged,
          all the way through play. Nothing ever swaps it out for a separate preview or screen,
          because a swap between two differently-built component trees is what actually caused the
          flicker this used to have at Hand off; matching their rendered data was never going to
          fully fix that on its own. PnpWordPrompt and PnpHandoffDialog both just float a dialog on
          top of this same, continuously-mounted board — the word prompt while composing (driving
          Game's phrase live from pnpAnswer, see buildPnpDraftSession above), then the handoff
          dialog once the word's been handed off. Game is locked for both of those phases (see its
          `locked` prop) so nothing about the round — the one being written OR the one about to be
          played — can be touched by tap or physical keyboard before actual play starts. */}
      <View style={[styles.flex, gameShell, { paddingBottom: insets.bottom }]}>{effectiveSession ? <Game key={roundKey} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} onGuessProgress={handleGuessProgress} phrase={effectiveSession.phrase} mode={effectiveSession.mode} hint={effectiveSession.hint} packLabel={effectiveSession.packLabel} difficultyTier={effectiveSession.difficultyTier} categoryProgress={categoryProgress} continueLabel={pnpPhase ? 'Next word' : undefined} locked={pnpPhase === 'authoring' || pnpPhase === 'handoff' || pendingAbandon !== null} /> : null}</View>

      {pnpPhase === 'authoring' ? <PnpWordPrompt answer={pnpAnswer} hint={pnpHint} onAnswerChange={setPnpAnswer} onHintChange={setPnpHint} promptVisible={!drawerVisible} onRequestMenu={() => setDrawerVisible(true)} onSubmit={handlePnpAuthored} /> : null}

      {pnpPhase === 'handoff' ? <PnpHandoffDialog visible={!drawerVisible} onReady={() => setPnpPhase('playing')} /> : null}

      <PuzzleDrawer visible={drawerVisible} onDismiss={handleDismissDrawer} onRequestOpen={() => setDrawerVisible(true)} initialConfig={withoutSecret(config)} onConfirm={handleConfirmPuzzle} onStartPnp={handleStartPnp} packsVersion={customPacksVersion} onPacksChanged={refreshCustomPacks} onModeChange={handleModeChange} onDifficultyChange={handleDifficultyChange} />
      <AchievementsDrawer visible={achievementsVisible} onDismiss={() => setAchievementsVisible(false)} unlockVersion={unlockVersion} onUnlocksChanged={refreshUnlocks} mode={config.mode} difficulty={config.difficulty} onConfirm={handleConfirmPuzzle} />
      <Snackbar visible={snackbarQueue.length > 0} onDismiss={() => setSnackbarQueue((q) => q.slice(1))} duration={3000} icon='trophy-outline'>
        {snackbarQueue[0] ? `Achievement unlocked: ${ACHIEVEMENT_DEFINITIONS_BY_ID[snackbarQueue[0]].title}` : ''}
      </Snackbar>
      <ConfirmDialog visible={incomingFilePreview !== null} title={incomingFilePreview ? (incomingFilePreview.kind === 'progress' ? 'Import progress backup?' : `Import "${incomingFilePreview.label}"?`) : ''} message={incomingFilePreview ? (incomingFilePreview.kind === 'progress' ? `Merges ${commaString(incomingFilePreview.unlockCount)} unlocked puzzle${incomingFilePreview.unlockCount === 1 ? '' : 's'} into your existing progress.` : `Adds ${commaString(incomingFilePreview.wordCount)} word${incomingFilePreview.wordCount === 1 ? '' : 's'} as a new pack you can play.`) : ''} confirmLabel='Import' onConfirm={() => void handleConfirmIncomingFile()} onCancel={() => setIncomingFilePreview(null)} />
      <ConfirmDialog visible={pendingAbandon !== null} title='Abandon this puzzle?' message="You've already made a guess — switching now will count this puzzle as a loss." confirmLabel='Abandon' destructive onConfirm={handleConfirmAbandon} onCancel={handleCancelAbandon} />
    </View>
  )
}

const styles = StyleSheet.create({
  appbarSpacer: { flex: 1 },
  flex: { flex: 1 }
})
