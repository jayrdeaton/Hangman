import AsyncStorage from '@react-native-async-storage/async-storage'
import { type Profile, profilesActions } from '@tastic/profile'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native'
import { router, useIsFocused } from 'expo-router'
import { useEffect } from 'react'
import { Alert, BackHandler, Keyboard, Platform, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'

import { WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { GameScreen } from '@/components/GameScreen'
import { Providers } from '@/components/Providers'
import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import { type PackSelectionContextType, usePackSelection } from '@/hooks/usePackSelection'
import { type PuzzleDefaultsContextType, usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { type DifficultyFilter, playerSettingsActions } from '@/redux/playerSettingsSlice'
import { roundActions, type RoundProgress, type SavedPuzzle, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import type { GameStartPayload } from '@/types/gameSession'
import { GUEST_PLAYER_KEY, type PlayerKey } from '@/utils/players'
import { findMode } from '@/utils/puzzleLink'
import * as puzzlePicker from '@/utils/puzzlePicker'
import { applySoloRound } from '@/utils/statsEngine'
import { createDefaultStats } from '@/utils/statsValidation'
import * as unlocks from '@/utils/unlocks'

import { puzzleManifest } from '../../data/puzzleCatalog.generated'

// Every draw goes through resolvePuzzle, so the tests decide what comes out of it and read what it
// was asked for. The rest of the module stays real.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

// The real unlock map by default (always empty under the app's AsyncStorage stub). The win tests swap
// in a map with progress in it, and markPuzzleUnlocked is spied to see which puzzle a win marks.
jest.mock('@/utils/unlocks', () => {
  const actual = jest.requireActual('@/utils/unlocks')
  return { ...actual, getPuzzleUnlockMap: jest.fn(actual.getPuzzleUnlockMap), markPuzzleUnlocked: jest.fn(actual.markPuzzleUnlocked) }
})

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockGetPuzzleUnlockMap = jest.mocked(unlocks.getPuzzleUnlockMap)
const mockMarkPuzzleUnlocked = jest.mocked(unlocks.markPuzzleUnlocked)
const realGetPuzzleUnlockMap: typeof unlocks.getPuzzleUnlockMap = jest.requireActual('@/utils/unlocks').getPuzzleUnlockMap
const realMarkPuzzleUnlocked: typeof unlocks.markPuzzleUnlocked = jest.requireActual('@/utils/unlocks').markPuzzleUnlocked
const mockUseIsFocused = jest.mocked(useIsFocused)

// Everything is the guest's unless a test says otherwise.
const solo = (playerKey: PlayerKey = GUEST_PLAYER_KEY) => selectSoloRound(store.getState().round, playerKey)
const stats = () => store.getState().achievements.stats

// A random draw from the player's whole selection, in Classic, unless a test says otherwise.
const savedPuzzle = (overrides: Partial<SavedPuzzle> = {}): SavedPuzzle => ({ phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random', packKey: 'pack-1', packLabel: 'Test Pack', puzzleId: 'puzzle-1', difficultyTier: 'easy', packScope: 'selection', ...overrides })

// The round the player left on the board: what the round slice holds when the screen mounts.
const seedRound = (puzzle: SavedPuzzle, progress?: RoundProgress, playerKey: PlayerKey = GUEST_PLAYER_KEY) => {
  store.dispatch(roundActions.startSolo({ playerKey, puzzle }))
  if (progress) store.dispatch(roundActions.saveSoloProgress({ playerKey, ...progress }))
}

// What resolvePuzzle hands back: FISH from pack-2, in whatever art it was asked for (the real
// resolver passes config.mode straight through).
const drawFish =
  (overrides: Partial<GameStartPayload> = {}) =>
  (config: puzzlePicker.PuzzleConfig): puzzlePicker.PuzzleResolution => ({ ok: true, payload: { phrase: 'FISH', mode: config.mode, sourceMode: 'random', packKey: 'pack-2', packLabel: 'Next Pack', puzzleId: 'puzzle-2', difficultyTier: 'medium', packScope: 'selection', ...overrides } })

// The player's saved picks (their playerSettings entry), already in the store when the screen mounts.
type StoredSettings = { selectedPackKeys?: string[]; modeId?: string; difficulty?: DifficultyFilter }
const storeSettings = ({ selectedPackKeys, modeId, difficulty }: StoredSettings, playerKey: PlayerKey = GUEST_PLAYER_KEY) => {
  if (selectedPackKeys) store.dispatch(playerSettingsActions.setPackKeys({ playerKey, packKeys: selectedPackKeys }))
  if (modeId) store.dispatch(playerSettingsActions.setMode({ playerKey, modeId }))
  if (difficulty) store.dispatch(playerSettingsActions.setDifficulty({ playerKey, difficulty }))
}

// The app-level setters the loadout and a .hangman import use, captured so a test can change the
// player's choices while the game screen is up.
type Handles = { setSelectedPackKeys: PackSelectionContextType['setSelectedPackKeys']; setDifficulty: PuzzleDefaultsContextType['setDifficulty']; setMode: PuzzleDefaultsContextType['setMode'] }
let handles: Handles | null = null
const HandlesCapture = () => {
  const { setSelectedPackKeys } = usePackSelection()
  const { setDifficulty, setMode } = usePuzzleDefaults()
  useEffect(() => {
    handles = { setSelectedPackKeys, setDifficulty, setMode }
  }, [setSelectedPackKeys, setDifficulty, setMode])
  return null
}

const renderScreen = () =>
  render(
    <Providers>
      <HandlesCapture />
      <GameScreen mode='solo' />
    </Providers>
  )

type Screen = Awaited<ReturnType<typeof renderScreen>>

// The word row's letters, '_' for each one not found yet.
const revealed = (screen: Screen): string[] => screen.getByLabelText('Secret word display').props.children[0].props.letters
// A Keyboard key's Button carries its disabled state two levels above the label (see Keyboard.test).
const keyDisabled = (screen: Screen, letter: string): boolean => screen.getByText(letter).parent?.parent?.props.accessibilityState.disabled
// The pip row under the art: each pip is a sketched ring, plus a fill once that wrong guess lands.
const pipFilled = (screen: Screen, index: number): boolean => screen.getByTestId(`pip-${index}`).props.children.props.children[1] !== null

const guess = async (screen: Screen, letters: string[]) => {
  for (const letter of letters) await fireEvent.press(screen.getByText(letter))
}

// Lets the screen's mount work settle: the player's unlocked puzzles are read back asynchronously, and
// the one-time "anything to play?" check waits on them.
const settle = async () => {
  await waitFor(() => expect(mockGetPuzzleUnlockMap).toHaveBeenCalled())
  await act(async () => {
    await Promise.all(mockGetPuzzleUnlockMap.mock.results.map((result) => result.value))
  })
}

// Every test starts from empty rounds and stats (the store is a module singleton), the real unlock
// map, nothing recorded on the expo-router mock, and the screen focused.
const resetForTest = () => {
  jest.clearAllMocks()
  mockResolvePuzzle.mockReset().mockImplementation(drawFish())
  mockGetPuzzleUnlockMap.mockReset().mockImplementation(realGetPuzzleUnlockMap)
  mockMarkPuzzleUnlocked.mockReset().mockImplementation(realMarkPuzzleUnlocked)
  mockUseIsFocused.mockImplementation(() => true)
  handles = null
  store.dispatch(roundActions.reset())
  store.dispatch(achievementsActions.reset())
  store.dispatch(activePlayerActions.setActivePlayer(null))
  store.dispatch(playerSettingsActions.reset())
  store.dispatch(profilesActions.setAll([]))
}

// The win card waits WIN_DIALOG_DELAY_MS (see Game.tsx), the loss card 450ms.
const openRoundEndCard = async () => {
  await act(async () => {
    jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
  })
}

// Android's own back dispatch, faked: the most recently added listener still subscribed runs first,
// and the first one to return true handles the press.
type BackListener = Parameters<typeof BackHandler.addEventListener>[1]
const installBackHandler = () => {
  const listeners: BackListener[] = []
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'hardwareBackPress') listeners.push(handler)
    return {
      remove: () => {
        const index = listeners.indexOf(handler)
        if (index >= 0) listeners.splice(index, 1)
      }
    }
  })
  // Resolves to whether anything handled it: unhandled, Android would close the app.
  return async (): Promise<boolean> => {
    let handled = false
    await act(async () => {
      handled = [...listeners].reverse().some((listener) => listener({} as Parameters<BackListener>[0]) === true)
    })
    return handled
  }
}

describe('GameScreen (solo)', () => {
  beforeEach(resetForTest)

  afterEach(() => {
    // Spies made with jest.spyOn only (AsyncStorage, BackHandler, Keyboard, Alert): restoreAllMocks
    // would also strip the module mocks' default implementations.
    for (const spied of [AsyncStorage.getItem, BackHandler.addEventListener, Keyboard.dismiss, Alert.alert]) if (jest.isMockFunction(spied)) spied.mockRestore()
  })

  it('marks the solo game as the one to come back to at a relaunch, as soon as it mounts', async () => {
    seedRound(savedPuzzle())
    await renderScreen()

    expect(store.getState().round.activeMode).toBe('solo')
  })

  // The mock's useFocusEffect cleans up on unmount, standing in for any blur: on the web the
  // browser's own back button takes the player off this screen without ever calling leave().
  it('clears it again when the screen goes away without leave(), keeping the round for Continue', async () => {
    seedRound(savedPuzzle(), { guessedLetters: ['D'], hintRevealed: false })
    const screen = await renderScreen()
    expect(store.getState().round.activeMode).toBe('solo')

    await screen.unmount()

    expect(store.getState().round.activeMode).toBeNull()
    expect(router.dismissTo).not.toHaveBeenCalled()
    expect(solo()).toMatchObject({ puzzle: { phrase: 'DOG' }, guessedLetters: ['D'] })
  })

  describe('a saved round', () => {
    it('comes back with its guesses and hint as they were left: the guessed keys disabled, the wrong guess counted, the hint open', async () => {
      seedRound(savedPuzzle({ hint: 'A loyal pet' }), { guessedLetters: ['D', 'Q'], hintRevealed: true })
      const screen = await renderScreen()

      expect(revealed(screen)).toEqual(['D', '_', '_'])
      expect(keyDisabled(screen, 'D')).toBe(true)
      expect(keyDisabled(screen, 'Q')).toBe(true)
      expect(keyDisabled(screen, 'O')).toBe(false)
      expect(screen.getByLabelText('Wrong guesses: 1 of 6 (Q)')).toBeTruthy()
      expect(pipFilled(screen, 0)).toBe(true)
      expect(pipFilled(screen, 1)).toBe(false)
      // Revealed, the pill shows what's behind it instead of the Hint button.
      expect(screen.queryByText('Hint')).toBeNull()
      expect(screen.getByText(/A loyal pet/)).toBeTruthy()

      await settle()
      // Still playable, so nothing new is drawn over it.
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })

    it('saves every guess, and opening the hint, into the round slice as it happens', async () => {
      seedRound(savedPuzzle({ hint: 'A loyal pet' }))
      const screen = await renderScreen()

      await guess(screen, ['D'])
      expect(solo().guessedLetters).toEqual(['D'])
      await guess(screen, ['Q'])
      expect(solo().guessedLetters).toEqual(['D', 'Q'])
      expect(solo().hintRevealed).toBe(false)

      await fireEvent.press(screen.getByLabelText('Show hint'))
      expect(solo()).toMatchObject({ guessedLetters: ['D', 'Q'], hintRevealed: true })
    })

    it('redraws the round on the board in a newly picked art right away, keeping its guesses and drawing nothing new', async () => {
      seedRound(savedPuzzle(), { guessedLetters: ['D'], hintRevealed: false })
      const screen = await renderScreen()
      await settle()
      const fontSize = () => screen.getByLabelText('Secret word display').props.children[0].props.fontSize

      // An art with artwork keeps the smaller of PuzzleStage's two word sizes (no layout has been
      // measured here, so it falls through to its unclamped base size).
      expect(fontSize()).toBe(42)

      // What the loadout's art picker dispatches. Letters Only has no artwork, so the word grows.
      await act(async () => {
        store.dispatch(roundActions.setRoundArt({ playerKey: GUEST_PLAYER_KEY, modeId: 'letters' }))
      })

      expect(fontSize()).toBe(80)
      expect(revealed(screen)).toEqual(['D', '_', '_'])
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })
  })

  describe('with nothing playable to put on the board', () => {
    it("draws a puzzle once, from the player's pack selection and in their current difficulty and art, waiting for their unlocked puzzles so the draw can prefer unsolved ones", async () => {
      storeSettings({ selectedPackKeys: ['pack-1', 'pack-3'], modeId: 'robot', difficulty: 'hard' })
      let resolveUnlockMap: (map: unlocks.PuzzleUnlockMap) => void = () => {}
      mockGetPuzzleUnlockMap.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUnlockMap = resolve
          })
      )
      const screen = await renderScreen()
      expect(mockResolvePuzzle).not.toHaveBeenCalled()

      await act(async () => {
        resolveUnlockMap({ 'pack-1': ['puzzle-1'] })
      })

      await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(1))
      await settle()
      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      const [config, packKeys, unlockMap] = mockResolvePuzzle.mock.calls[0]
      expect(packKeys).toEqual(['pack-1', 'pack-3'])
      expect(config).toMatchObject({ sourceMode: 'random', difficulty: 'hard' })
      expect(config.mode.id).toBe('robot')
      expect(unlockMap).toEqual({ 'pack-1': ['puzzle-1'] })

      expect(solo().puzzle).toMatchObject({ phrase: 'FISH', modeId: 'robot', packKey: 'pack-2' })
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
    })

    it('draws the next puzzle from the same pack when the saved round already ended on a single-pack draw', async () => {
      storeSettings({ selectedPackKeys: ['pack-1', 'pack-3'] })
      // Won while the app was closed (every letter found), so it was already recorded.
      seedRound(savedPuzzle({ packKey: 'pack-7', packScope: 'single' }), { guessedLetters: ['D', 'O', 'G'], hintRevealed: false })
      const screen = await renderScreen()

      await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(1))
      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual(['pack-7'])
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
      expect(solo().guessedLetters).toEqual([])
      // Counted when it ended, never again.
      expect(stats().solo.played).toBe(0)
    })

    it('draws from the whole selection when the saved round already ended on a selection-wide draw', async () => {
      storeSettings({ selectedPackKeys: ['pack-1', 'pack-3'] })
      // Lost: six wrong guesses.
      seedRound(savedPuzzle({ packKey: 'pack-1', packScope: 'selection' }), { guessedLetters: ['Q', 'W', 'E', 'R', 'T', 'Y'], hintRevealed: false })
      await renderScreen()

      await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(1))
      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual(['pack-1', 'pack-3'])
    })

    it("leaves a round with guesses on it alone when the player's unlocked puzzles load late, rather than swapping it out with no abandon confirm and no loss recorded", async () => {
      let resolveUnlockMap: (map: unlocks.PuzzleUnlockMap) => void = () => {}
      mockGetPuzzleUnlockMap.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUnlockMap = resolve
          })
      )
      seedRound(savedPuzzle())
      const screen = await renderScreen()

      await guess(screen, ['D'])
      await act(async () => {
        resolveUnlockMap({})
      })
      await settle()

      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(solo().puzzle?.phrase).toBe('DOG')
      expect(revealed(screen)).toEqual(['D', '_', '_'])
    })

    it('goes back to the solo loadout, with an alert, when there is nothing left to draw', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
      mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
      await renderScreen()

      await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'solo' } }))
      expect(alertSpy).toHaveBeenCalledWith('No Puzzles Available', 'No puzzles available for the selected packs and difficulty.', expect.anything())
      expect(solo().puzzle).toBeNull()
    })
  })

  describe('the round-end card', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    // The round is decided (and no longer playable) the moment it ends, so the screen's one-time
    // "anything to play?" check must not come round again while the card is up: here the unlock map
    // reloads (the win marks the puzzle unlocked) and the player's selection and difficulty change
    // underneath it (a .hangman pack import adds to the selection from any screen).
    it('is never swapped out from under its own round: a win stays on the board with its card until Next', async () => {
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      const roundId = solo().id

      await guess(screen, ['D', 'O', 'G'])
      await openRoundEndCard()
      expect(screen.getByText('You Won!')).toBeTruthy()
      // Read at mount, by the win itself, and again once the win's refreshUnlocks lands.
      expect(mockGetPuzzleUnlockMap.mock.calls.length).toBeGreaterThanOrEqual(3)

      await act(async () => {
        handles!.setSelectedPackKeys(['pack-9'])
        handles!.setDifficulty('hard')
      })

      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(screen.getByText('You Won!')).toBeTruthy()
      expect(solo()).toMatchObject({ id: roundId, guessedLetters: ['D', 'O', 'G'] })
      expect(revealed(screen)).toEqual(['D', 'O', 'G'])
    })

    // The one-time check judges the round as it was at mount, so a round decided during this mount,
    // before the check has run, keeps its result card.
    it('never swaps out a round won before the screen has finished loading the unlock map its one-time check waits on', async () => {
      let resolveUnlockMap: (map: unlocks.PuzzleUnlockMap) => void = () => {}
      mockGetPuzzleUnlockMap.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUnlockMap = resolve
          })
      )
      seedRound(savedPuzzle(), { guessedLetters: ['D', 'O'], hintRevealed: false })
      const screen = await renderScreen()

      // The last letter lands while the screen's first unlock map read is still pending.
      await guess(screen, ['G'])
      await act(async () => {
        resolveUnlockMap({})
      })
      await openRoundEndCard()

      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(solo().puzzle?.phrase).toBe('DOG')
      expect(screen.getByText('You Won!')).toBeTruthy()
    })

    it('keeps a difficulty or art default changed mid-round off the board, then draws the next puzzle from the same pack with it on Next after a loss on a single-pack draw', async () => {
      storeSettings({ selectedPackKeys: ['pack-1', 'pack-3'] })
      seedRound(savedPuzzle({ packKey: 'pack-7', packScope: 'single' }))
      const screen = await renderScreen()
      await settle()

      // The round on the board was drawn before this; a new filter can't change it.
      await act(async () => {
        handles!.setDifficulty('hard')
        handles!.setMode(findMode('robot'))
      })
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(solo().puzzle).toMatchObject({ phrase: 'DOG', modeId: DEFAULT_MODE.id })

      await guess(screen, ['Q', 'W', 'E', 'R', 'T', 'Y'])
      await openRoundEndCard()
      expect(screen.getByText('You Lost!')).toBeTruthy()
      expect(mockResolvePuzzle).not.toHaveBeenCalled()

      await fireEvent.press(screen.getByText('Next'))

      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      const [config, packKeys] = mockResolvePuzzle.mock.calls[0]
      expect(packKeys).toEqual(['pack-7'])
      expect(config.difficulty).toBe('hard')
      expect(config.mode.id).toBe('robot')
      // A fresh board for the new word, the card gone with the old one.
      expect(solo()).toMatchObject({ puzzle: { phrase: 'FISH', modeId: 'robot' }, guessedLetters: [], hintRevealed: false })
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
      expect(screen.queryByText('You Lost!')).toBeNull()
    })

    it("draws from the player's whole selection on Next after a win on a selection-wide draw", async () => {
      storeSettings({ selectedPackKeys: ['pack-1', 'pack-3'] })
      seedRound(savedPuzzle({ packKey: 'pack-1', packScope: 'selection' }))
      const screen = await renderScreen()
      await settle()

      await guess(screen, ['D', 'O', 'G'])
      await openRoundEndCard()
      await fireEvent.press(screen.getByText('Next'))

      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      expect(mockResolvePuzzle.mock.calls[0][1]).toEqual(['pack-1', 'pack-3'])
      expect(mockResolvePuzzle.mock.calls[0][0].difficulty).toBe('any')
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
    })

    it('leaves for the solo loadout on Next after a shared-link puzzle, clearing the slot instead of replaying the same word', async () => {
      seedRound({ phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'custom', difficultyTier: 'easy' })
      const screen = await renderScreen()
      await settle()

      await guess(screen, ['D', 'O', 'G'])
      await openRoundEndCard()
      await fireEvent.press(screen.getByText('Next'))

      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(solo().puzzle).toBeNull()
      expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'solo' } })
      expect(store.getState().round.activeMode).toBeNull()
    })
  })

  // Ported from the old RoundEndDialogAchievements suite: the real app store and provider, so the
  // round records through useGameStats and the card shows what came back.
  describe('what a round records, and the unlocks on its card', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    // No pack and no hint: a plain win, with nothing to unlock in the puzzle catalog and no Hint
    // pill to leave closed.
    const plainCat: SavedPuzzle = { phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'random', difficultyTier: 'easy' }

    it("lists a first flawless win's unlocks together, in catalog order and each on its tier's color, once the card opens and not before", async () => {
      seedRound(plainCat)
      const screen = await renderScreen()

      await guess(screen, ['C', 'A', 'T'])
      // Already recorded, but the card itself waits WIN_DIALOG_DELAY_MS.
      expect(screen.queryByText('You Won!')).toBeNull()
      expect(screen.queryByText('Flawless Victory')).toBeNull()
      expect(stats().solo).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })

      await openRoundEndCard()
      expect(screen.getByText('You Won!')).toBeTruthy()
      expect(screen.getByText('Achievements Unlocked')).toBeTruthy()
      expect(screen.getAllByText(/^(First Word|Solved It|Beginner's Luck|Flawless Victory)$/).map((node) => node.props.children)).toEqual(['First Word', 'Solved It', "Beginner's Luck", 'Flawless Victory'])
      // Each row is the badge (a View in the tier color) and then the title.
      const badgeColor = (title: string) => StyleSheet.flatten((screen.getByText(title).parent!.children[0] as unknown as { props: { style: StyleProp<ViewStyle> } }).props.style)?.backgroundColor
      expect(badgeColor('First Word')).toBe(ACHIEVEMENT_TIER_COLORS.bronze)
      expect(badgeColor('Solved It')).toBe(ACHIEVEMENT_TIER_COLORS.bronze)
      expect(badgeColor("Beginner's Luck")).toBe(ACHIEVEMENT_TIER_COLORS.gold)
      expect(badgeColor('Flawless Victory')).toBe(ACHIEVEMENT_TIER_COLORS.bronze)
    })

    it('shows no achievement callout on an ordinary win that unlocks nothing new', async () => {
      // One flawless win already behind the player, its unlocks already earned (the provider's mount
      // sweep records them).
      store.dispatch(achievementsActions.update({ stats: applySoloRound(createDefaultStats(), { result: 'win', wrongGuesses: 0, guessCount: 3, hintAvailable: false, hintRevealed: false, completedPackKeys: [] }, null) }))
      seedRound(plainCat)
      const screen = await renderScreen()

      // A wrong guess first, so this win isn't another flawless one.
      await guess(screen, ['Z', 'C', 'A', 'T'])
      await openRoundEndCard()

      expect(screen.getByText('You Won!')).toBeTruthy()
      expect(screen.queryByText(/Achievements? Unlocked/)).toBeNull()
      expect(stats().solo.wins).toBe(2)
    })

    it('marks a pack puzzle unlocked on a win and shows the pack progress that includes it', async () => {
      const [pack] = puzzleManifest
      seedRound(savedPuzzle({ phrase: 'CAT', packKey: pack.key, packLabel: 'Animals', puzzleId: 'solved-id' }))
      const screen = await renderScreen()
      await settle()
      // Read back after the puzzle is marked, so the count already includes it.
      mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: ['id-1', 'id-2', 'solved-id'] })

      await guess(screen, ['C', 'A', 'T'])
      await openRoundEndCard()

      expect(mockMarkPuzzleUnlocked).toHaveBeenCalledWith(GUEST_PLAYER_KEY, pack.key, 'solved-id')
      expect(screen.getByText(`3 of ${pack.count.toLocaleString('en-US')} unlocked in Animals`)).toBeTruthy()
    })

    it("records a loss as a solo loss, and shows that round's unlock too: the very first puzzle played, lost", async () => {
      const [pack] = puzzleManifest
      seedRound(savedPuzzle({ phrase: 'CAT', packKey: pack.key, packLabel: 'Animals', puzzleId: 'lost-id' }))
      const screen = await renderScreen()
      await settle()

      await guess(screen, ['Q', 'W', 'E', 'R', 'Y', 'U'])
      await openRoundEndCard()

      expect(screen.getByText('You Lost!')).toBeTruthy()
      expect(screen.getByText('Achievement Unlocked')).toBeTruthy()
      expect(screen.getByText('First Word')).toBeTruthy()
      expect(screen.queryByText("Beginner's Luck")).toBeNull()
      expect(stats()).toMatchObject({ solo: { played: 1, wins: 0, losses: 1, draws: 0 }, firstGameResult: 'loss', firstGameFlawless: false })
      // A loss unlocks no puzzle and shows no pack progress.
      expect(mockMarkPuzzleUnlocked).not.toHaveBeenCalled()
      expect(screen.queryByText(/unlocked in Animals/)).toBeNull()
    })

    describe('what a win records', () => {
      const winCat = async (overrides: Partial<SavedPuzzle>) => {
        seedRound({ ...plainCat, ...overrides })
        const screen = await renderScreen()
        await guess(screen, ['C', 'A', 'T'])
        await openRoundEndCard()
        return screen
      }

      it('counts the art on screen toward the mode family', async () => {
        await winCat({ modeId: 'robot' })
        expect(stats().wonModeIds).toEqual(['robot'])
      })

      it('never counts a hidden art (reachable only through a shared link)', async () => {
        await winCat({ modeId: 'jenga' })
        expect(stats().wonModeIds).toEqual([])
      })

      // The board offers its Hint pill whenever there's a pack label or a hint behind it
      // (PuzzleInfoRow), so a win that never opened it counts even with no hint text.
      it('counts a no-hint win on a puzzle whose only hint is its pack label', async () => {
        await winCat({ packLabel: 'Animals' })
        expect(stats().noHintWins).toBe(1)
      })

      it("counts no no-hint win when there's no Hint pill at all", async () => {
        await winCat({})
        expect(stats().noHintWins).toBe(0)
      })

      it('counts no no-hint win when the hint was opened', async () => {
        seedRound({ ...plainCat, hint: 'A pet' })
        const screen = await renderScreen()
        await fireEvent.press(screen.getByLabelText('Show hint'))
        await guess(screen, ['C', 'A', 'T'])
        await openRoundEndCard()

        expect(stats().noHintWins).toBe(0)
        expect(stats().solo.wins).toBe(1)
      })

      it('credits every built-in pack the unlock map shows complete', async () => {
        const [pack] = puzzleManifest
        mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: Array.from({ length: pack.count }, (_, i) => `id-${i}`) })
        await winCat({})

        expect(stats().completedPackKeys).toEqual([pack.key])
      })
    })
  })

  // Everything belongs to a player (2026-10-17): the board, the record and the unlocked puzzles are all
  // the active player's.
  describe("each player's own round", () => {
    const OTHER = 'profile-a'
    // On the roster, or the launch reconcile would forget a player it doesn't have (see ProfilesProvider).
    const ALICE: Profile = { id: OTHER, name: 'Alice', color: '#2196f3', tag: 'A', createdAt: 1, updatedAt: 1 }
    const setActivePlayer = (profileId: string | null) =>
      act(async () => {
        store.dispatch(activePlayerActions.setActivePlayer(profileId))
      })
    beforeEach(() => {
      store.dispatch(profilesActions.setAll([ALICE]))
    })

    it("plays the active player's waiting round, and switching players switches the board", async () => {
      seedRound(savedPuzzle(), { guessedLetters: ['D'], hintRevealed: false })
      seedRound(savedPuzzle({ phrase: 'CAT' }), { guessedLetters: ['C'], hintRevealed: false }, OTHER)
      const screen = await renderScreen()
      await settle()
      expect(revealed(screen)).toEqual(['D', '_', '_'])

      await setActivePlayer(OTHER)
      expect(revealed(screen)).toEqual(['C', '_', '_'])
      await guess(screen, ['A'])

      expect(solo(OTHER).guessedLetters).toEqual(['C', 'A'])
      expect(solo().guessedLetters).toEqual(['D'])
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })

    it('draws a puzzle, from their own picks, for a player with no round waiting when they become the active one', async () => {
      seedRound(savedPuzzle(), { guessedLetters: ['D'], hintRevealed: false })
      storeSettings({ selectedPackKeys: ['pack-5'], difficulty: 'hard' }, OTHER)
      await renderScreen()
      await settle()

      await setActivePlayer(OTHER)

      await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(1))
      const [config, packKeys] = mockResolvePuzzle.mock.calls[0]
      expect(packKeys).toEqual(['pack-5'])
      expect(config.difficulty).toBe('hard')
      expect(mockGetPuzzleUnlockMap).toHaveBeenLastCalledWith(OTHER)
      expect(solo(OTHER).puzzle?.phrase).toBe('FISH')
      expect(solo()).toMatchObject({ puzzle: { phrase: 'DOG' }, guessedLetters: ['D'] })
    })

    describe('a finished round', () => {
      beforeEach(() => {
        jest.useFakeTimers()
      })

      it('counts toward, and unlocks its puzzle for, the player whose round it is', async () => {
        const [pack] = puzzleManifest
        await setActivePlayer(OTHER)
        seedRound(savedPuzzle({ phrase: 'CAT', packKey: pack.key, packLabel: 'Animals', puzzleId: 'solved-id' }), undefined, OTHER)
        const screen = await renderScreen()
        await settle()

        await guess(screen, ['C', 'A', 'T'])
        await openRoundEndCard()

        expect(mockMarkPuzzleUnlocked).toHaveBeenCalledWith(OTHER, pack.key, 'solved-id')
        expect(stats().profiles[OTHER].solo).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })
        // The device's record has every round played here.
        expect(stats().solo.wins).toBe(1)
        // The card shows the profile's own unlocks, under their name.
        expect(screen.getByText('First Word')).toBeTruthy()
        expect(screen.getByText('Alice Unlocked')).toBeTruthy()
        expect(screen.queryByText(/^Achievements? Unlocked$/)).toBeNull()
      })

      it("credits Collection Complete from the winner's own unlocked puzzles, never another player's", async () => {
        const [pack] = puzzleManifest
        const complete = { [pack.key]: Array.from({ length: pack.count }, (_, i) => `id-${i}`) }
        mockGetPuzzleUnlockMap.mockImplementation((playerKey) => Promise.resolve(playerKey === GUEST_PLAYER_KEY ? complete : {}))
        await setActivePlayer(OTHER)
        seedRound({ phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'random', difficultyTier: 'easy' }, undefined, OTHER)
        const screen = await renderScreen()
        await settle()

        await guess(screen, ['C', 'A', 'T'])
        await openRoundEndCard()

        expect(stats().profiles[OTHER].completedPackKeys).toEqual([])
        expect(stats().completedPackKeys).toEqual([])
      })
    })
  })

  // Jay: his kids play a puzzle, then hand him the device. The result card's Up Next row picks who
  // plays next, and only Next acts on it.
  describe('the round-over hot swap (Up Next)', () => {
    const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#2196f3', tag: 'A', createdAt: 1, updatedAt: 1 }
    const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'B', createdAt: 2, updatedAt: 2 }
    const activePlayer = () => store.getState().activePlayer.profileId
    // Every read of a player's unlocked puzzles so far, settled, for a board that just changed hands.
    const settleUnlocks = () =>
      act(async () => {
        await Promise.all(mockGetPuzzleUnlockMap.mock.results.map((result) => result.value))
      })
    const winDog = async (screen: Screen) => {
      await guess(screen, ['D', 'O', 'G'])
      await openRoundEndCard()
    }

    beforeEach(() => {
      jest.useFakeTimers()
      store.dispatch(profilesActions.setAll([ALICE, BOB]))
    })

    it('has no Up Next row with nobody on the roster', async () => {
      store.dispatch(profilesActions.setAll([]))
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      await winDog(screen)

      expect(screen.getByText('You Won!')).toBeTruthy()
      expect(screen.queryByText('Up Next')).toBeNull()
      expect(screen.queryByLabelText('Up next: Guest')).toBeNull()
    })

    it("lists the guest and every profile with the round's player picked, and a pick changes nothing until Next", async () => {
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      const colorBefore = store.getState().theme.color

      expect(screen.getByLabelText('Up next: Guest').props.accessibilityState.selected).toBe(true)
      await fireEvent.press(screen.getByLabelText('Up next: Alice'))

      expect(screen.getByLabelText('Up next: Alice').props.accessibilityState.selected).toBe(true)
      expect(screen.getByLabelText('Up next: Guest').props.accessibilityState.selected).toBe(false)
      expect(activePlayer()).toBeNull()
      expect(store.getState().theme.color).toBe(colorBefore)
      expect(screen.getByText('You Won!')).toBeTruthy()
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })

    it("hands the device over on Next: the pick plays, from their own picks, and the finished round stays decided in the old player's slot with nothing drawn into it", async () => {
      storeSettings({ selectedPackKeys: ['pack-5'], difficulty: 'hard' }, ALICE.id)
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      const finishedId = solo().id
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Alice'))

      await fireEvent.press(screen.getByText('Next'))
      await settleUnlocks()

      expect(activePlayer()).toBe(ALICE.id)
      // Alice had nothing waiting, so her own picks drew her a puzzle.
      await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(1))
      const [config, packKeys] = mockResolvePuzzle.mock.calls[0]
      expect(packKeys).toEqual(['pack-5'])
      expect(config.difficulty).toBe('hard')
      expect(solo(ALICE.id).puzzle?.phrase).toBe('FISH')
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
      expect(screen.queryByText('You Won!')).toBeNull()
      // The guest's round, as it ended: no next puzzle drawn for them, and recorded once.
      expect(solo()).toMatchObject({ id: finishedId, puzzle: { phrase: 'DOG' }, guessedLetters: ['D', 'O', 'G'] })
      expect(stats().solo.played).toBe(1)
      // Her colors, now that the card is gone.
      await waitFor(() => expect(store.getState().theme.color).toBe(ALICE.color))
    })

    it("resumes the picked player's own waiting round instead of drawing", async () => {
      seedRound(savedPuzzle())
      seedRound(savedPuzzle({ phrase: 'CAT' }), { guessedLetters: ['C'], hintRevealed: false }, BOB.id)
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Bob'))

      await fireEvent.press(screen.getByText('Next'))
      await settleUnlocks()

      expect(activePlayer()).toBe(BOB.id)
      expect(revealed(screen)).toEqual(['C', '_', '_'])
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
    })

    it('draws the swapped-away player a fresh puzzle when they next play, recording nothing again', async () => {
      seedRound(savedPuzzle())
      seedRound(savedPuzzle({ phrase: 'CAT' }), { guessedLetters: ['C'], hintRevealed: false }, BOB.id)
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Bob'))
      await fireEvent.press(screen.getByText('Next'))
      await settleUnlocks()

      await act(async () => {
        store.dispatch(activePlayerActions.setActivePlayer(null))
      })
      await settleUnlocks()

      await waitFor(() => expect(mockResolvePuzzle).toHaveBeenCalledTimes(1))
      expect(solo().puzzle?.phrase).toBe('FISH')
      expect(stats().solo.played).toBe(1)
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
    })

    it("draws the round's own player their next puzzle when they're picked again", async () => {
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Bob'))
      await fireEvent.press(screen.getByLabelText('Up next: Guest'))

      await fireEvent.press(screen.getByText('Next'))

      expect(activePlayer()).toBeNull()
      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      expect(solo().puzzle?.phrase).toBe('FISH')
    })

    it("treats Android's back button on the card as Next, with the pick applied", async () => {
      const pressBack = installBackHandler()
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Bob'))

      expect(await pressBack()).toBe(true)
      await settleUnlocks()

      expect(activePlayer()).toBe(BOB.id)
      expect(router.dismissTo).not.toHaveBeenCalled()
      await waitFor(() => expect(solo(BOB.id).puzzle?.phrase).toBe('FISH'))
    })

    it('hands a profile their own round on to the guest too', async () => {
      await act(async () => {
        store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      })
      seedRound(savedPuzzle(), undefined, ALICE.id)
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      expect(screen.getByLabelText('Up next: Alice').props.accessibilityState.selected).toBe(true)

      await fireEvent.press(screen.getByLabelText('Up next: Guest'))
      await fireEvent.press(screen.getByText('Next'))
      await settleUnlocks()

      expect(activePlayer()).toBeNull()
      expect(stats().profiles[ALICE.id].solo.wins).toBe(1)
      expect(solo(ALICE.id)).toMatchObject({ puzzle: { phrase: 'DOG' }, guessedLetters: ['D', 'O', 'G'] })
    })

    it("applies the pick on a shared-link puzzle's Next, then leaves for the loadout without drawing the new player a puzzle", async () => {
      seedRound({ phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'custom', difficultyTier: 'easy' })
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Alice'))

      await fireEvent.press(screen.getByText('Next'))
      await settleUnlocks()

      expect(activePlayer()).toBe(ALICE.id)
      expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'solo' } })
      expect(solo().puzzle).toBeNull()
      expect(mockResolvePuzzle).not.toHaveBeenCalled()
      expect(solo(ALICE.id).puzzle).toBeNull()
    })

    // Deleted in another game, say, while the card was up: there's nobody to hand over to.
    it('keeps the round with its own player when the pick has left the roster by Next', async () => {
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      await winDog(screen)
      await fireEvent.press(screen.getByLabelText('Up next: Bob'))
      await act(async () => {
        store.dispatch(profilesActions.setAll([ALICE]))
      })
      expect(screen.getByLabelText('Up next: Guest').props.accessibilityState.selected).toBe(true)

      await fireEvent.press(screen.getByText('Next'))

      expect(activePlayer()).toBeNull()
      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
    })
  })

  describe('leaving', () => {
    // Home, not back: a launch can open straight into the game, with no loadout it came from.
    it('goes Home from the corner: the keyboard down, the resume cleared, and a dismiss to Home that keeps the round', async () => {
      const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')
      seedRound(savedPuzzle(), { guessedLetters: ['D'], hintRevealed: false })
      const screen = await renderScreen()
      expect(store.getState().round.activeMode).toBe('solo')

      await fireEvent.press(screen.getByLabelText('Home'))

      expect(dismissKeyboard).toHaveBeenCalled()
      expect(store.getState().round.activeMode).toBeNull()
      expect(router.dismissTo).toHaveBeenCalledTimes(1)
      expect(router.dismissTo).toHaveBeenCalledWith('/')
      // Left for later: the loadout offers Continue.
      expect(solo()).toMatchObject({ puzzle: { phrase: 'DOG' }, guessedLetters: ['D'] })
    })

    it("steps back to the solo loadout on Android's back button, and lets go of it on unmount", async () => {
      const pressBack = installBackHandler()
      seedRound(savedPuzzle())
      const screen = await renderScreen()

      // Handled, even with nothing beneath this screen in the stack (a resumed game, a share link
      // opened cold), where the navigator would otherwise close the app.
      expect(await pressBack()).toBe(true)

      expect(store.getState().round.activeMode).toBeNull()
      expect(router.dismissTo).toHaveBeenCalledTimes(1)
      expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'solo' } })

      jest.mocked(router.dismissTo).mockClear()
      await screen.unmount()
      expect(await pressBack()).toBe(false)
      expect(router.dismissTo).not.toHaveBeenCalled()
    })

    // The Settings sheet and the result card add their own back listeners after the screen's, so
    // theirs run first.
    it("closes the Settings sheet on Android's back button instead of leaving the game", async () => {
      const pressBack = installBackHandler()
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await fireEvent.press(screen.getByLabelText('Settings'))
      expect(screen.getByText('KEYBOARD')).toBeTruthy()

      expect(await pressBack()).toBe(true)

      await waitFor(() => expect(screen.queryByText('KEYBOARD')).toBeNull())
      expect(router.dismissTo).not.toHaveBeenCalled()
      expect(store.getState().round.activeMode).toBe('solo')
    })

    it("treats Android's back button on the result card as Next, drawing the next puzzle instead of leaving", async () => {
      jest.useFakeTimers()
      const pressBack = installBackHandler()
      seedRound(savedPuzzle())
      const screen = await renderScreen()
      await settle()
      await guess(screen, ['D', 'O', 'G'])
      await openRoundEndCard()

      expect(await pressBack()).toBe(true)

      expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
      expect(revealed(screen)).toEqual(['_', '_', '_', '_'])
      expect(router.dismissTo).not.toHaveBeenCalled()
    })

    // From the moment a round is decided until Next, leaving is held off: the result card (after a
    // win's celebration or a loss's short delay) is where the round's unlocks show, so it's always seen.
    describe('while a result card is on its way', () => {
      beforeEach(() => {
        jest.useFakeTimers()
      })

      // Both ways out, the Home corner and then Android's back button. Back is still handled (so
      // Android doesn't close the app instead), it just does nothing.
      const tryToLeave = async (screen: Screen, pressBack: () => Promise<boolean>) => {
        await fireEvent.press(screen.getByLabelText('Home'))
        expect(await pressBack()).toBe(true)
      }

      it('stays on a won round through its celebration, then goes Home from the corner once Next has drawn the next puzzle', async () => {
        const pressBack = installBackHandler()
        seedRound(savedPuzzle())
        const screen = await renderScreen()
        await settle()

        await guess(screen, ['D', 'O', 'G'])
        await tryToLeave(screen, pressBack)
        // And again at the very end of the celebration, the card not up yet.
        await act(async () => {
          jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS - 1)
        })
        expect(screen.queryByText('You Won!')).toBeNull()
        await tryToLeave(screen, pressBack)

        expect(router.dismissTo).not.toHaveBeenCalled()
        expect(store.getState().round.activeMode).toBe('solo')
        expect(revealed(screen)).toEqual(['D', 'O', 'G'])

        await openRoundEndCard()
        expect(screen.getByText('You Won!')).toBeTruthy()
        await fireEvent.press(screen.getByText('Next'))
        expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
        expect(revealed(screen)).toEqual(['_', '_', '_', '_'])

        await fireEvent.press(screen.getByLabelText('Home'))
        expect(router.dismissTo).toHaveBeenCalledTimes(1)
        expect(router.dismissTo).toHaveBeenCalledWith('/')
        expect(store.getState().round.activeMode).toBeNull()
      })

      it("stays on a lost round until its card is up, then leaves on Android's back button again once Next has drawn the next puzzle", async () => {
        const pressBack = installBackHandler()
        seedRound(savedPuzzle())
        const screen = await renderScreen()
        await settle()

        await guess(screen, ['Q', 'W', 'E', 'R', 'T', 'Y'])
        expect(screen.queryByText('You Lost!')).toBeNull()
        await tryToLeave(screen, pressBack)

        expect(router.dismissTo).not.toHaveBeenCalled()
        expect(store.getState().round.activeMode).toBe('solo')
        expect(solo()).toMatchObject({ puzzle: { phrase: 'DOG' }, guessedLetters: ['Q', 'W', 'E', 'R', 'T', 'Y'] })

        await openRoundEndCard()
        expect(screen.getByText('You Lost!')).toBeTruthy()
        await fireEvent.press(screen.getByText('Next'))
        expect(mockResolvePuzzle).toHaveBeenCalledTimes(1)
        expect(revealed(screen)).toEqual(['_', '_', '_', '_'])

        // The card's own back handling (Next) went with it, so this is the screen's again.
        expect(await pressBack()).toBe(true)
        expect(router.dismissTo).toHaveBeenCalledTimes(1)
        expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'solo' } })
        expect(store.getState().round.activeMode).toBeNull()
      })

      it("still leaves for the solo loadout on a shared-link puzzle's Next, the hold lifted before it leaves", async () => {
        const pressBack = installBackHandler()
        seedRound({ phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'custom', difficultyTier: 'easy' })
        const screen = await renderScreen()
        await settle()

        await guess(screen, ['Q', 'W', 'E', 'R', 'T', 'Y'])
        await tryToLeave(screen, pressBack)
        expect(router.dismissTo).not.toHaveBeenCalled()

        await openRoundEndCard()
        expect(screen.getByText('You Lost!')).toBeTruthy()
        await fireEvent.press(screen.getByText('Next'))

        expect(mockResolvePuzzle).not.toHaveBeenCalled()
        expect(solo().puzzle).toBeNull()
        expect(router.dismissTo).toHaveBeenCalledTimes(1)
        expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'solo' } })
        expect(store.getState().round.activeMode).toBeNull()
      })
    })
  })

  describe('locking the board', () => {
    it('opens the Settings sheet from the corner cog, and ignores letter keys until it closes', async () => {
      seedRound(savedPuzzle())
      const screen = await renderScreen()

      await fireEvent.press(screen.getByLabelText('Settings'))
      expect(screen.getByText('KEYBOARD')).toBeTruthy()

      await guess(screen, ['D'])
      expect(revealed(screen)).toEqual(['_', '_', '_'])
      expect(solo().guessedLetters).toEqual([])

      await fireEvent.press(screen.getByText('Done'))
      await guess(screen, ['D'])
      expect(revealed(screen)).toEqual(['D', '_', '_'])
    })

    it("ignores letter keys while this screen isn't the one showing", async () => {
      mockUseIsFocused.mockImplementation(() => false)
      seedRound(savedPuzzle())
      const screen = await renderScreen()

      await guess(screen, ['D', 'Q'])

      expect(revealed(screen)).toEqual(['_', '_', '_'])
      expect(solo().guessedLetters).toEqual([])
    })
  })
})

// Game listens for physical letter keys on window, web only (see Game.test). window's add/remove are
// swapped for stubs that collect the keydown listeners, and each captured listener is called with a
// plain event-shaped object.
describe('GameScreen (solo) physical keyboard (web)', () => {
  let keydownListeners: ((event: KeyboardEvent) => void)[] = []
  const originalOS = Platform.OS
  const originalAdd = window.addEventListener
  const originalRemove = window.removeEventListener

  beforeEach(() => {
    resetForTest()
    keydownListeners = []
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    window.addEventListener = ((type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === 'keydown') keydownListeners.push(listener)
    }) as typeof window.addEventListener
    window.removeEventListener = ((type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === 'keydown') keydownListeners = keydownListeners.filter((candidate) => candidate !== listener)
    }) as typeof window.removeEventListener
  })

  afterEach(async () => {
    // Unmount now, while the stubs are still installed (see Game.test).
    await cleanup()
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS })
    window.addEventListener = originalAdd
    window.removeEventListener = originalRemove
  })

  const pressKey = async (key: string) => {
    await act(async () => {
      for (const listener of keydownListeners) listener({ key, metaKey: false, ctrlKey: false, altKey: false, target: null } as unknown as KeyboardEvent)
    })
  }

  it('guesses a typed letter normally', async () => {
    seedRound(savedPuzzle())
    const screen = await renderScreen()

    await pressKey('d')

    expect(revealed(screen)).toEqual(['D', '_', '_'])
  })

  it('ignores a typed letter while Settings is open', async () => {
    seedRound(savedPuzzle())
    const screen = await renderScreen()

    await fireEvent.press(screen.getByLabelText('Settings'))
    await pressKey('d')

    expect(revealed(screen)).toEqual(['_', '_', '_'])
    expect(solo().guessedLetters).toEqual([])
  })

  // The web keeps a screen mounted after it's left, with Game's listener still on window.
  it("ignores a typed letter while this screen isn't the one showing", async () => {
    mockUseIsFocused.mockImplementation(() => false)
    seedRound(savedPuzzle())
    const screen = await renderScreen()

    await pressKey('d')

    expect(revealed(screen)).toEqual(['_', '_', '_'])
    expect(solo().guessedLetters).toEqual([])
  })
})
