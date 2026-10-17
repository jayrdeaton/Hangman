import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render } from '@testing-library/react-native'
import { router, useIsFocused } from 'expo-router'
import { BackHandler, Keyboard, Text } from 'react-native'
import { Provider as ReduxProvider } from 'react-redux'

import { WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { GameScreen } from '@/components/GameScreen'
import { LoadoutScreen } from '@/components/LoadoutScreen'
import { Providers } from '@/components/Providers'
import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import activePlayerReducer from '@/redux/activePlayerSlice'
import roundReducer, { initialRoundState, type PnpPhase, roundActions, type SavedPuzzle, selectSoloRound } from '@/redux/roundSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { addCustomPuzzle } from '@/utils/customPacks'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { createDefaultPnpSession } from '@/utils/pnpSession'
import * as puzzlePicker from '@/utils/puzzlePicker'
import { sanitizeRoundState } from '@/utils/roundState'

// The real resolver by default (a hand-typed word goes through it at Next), so a test can make one
// call fail without the rest of the file running on a stand-in.
jest.mock('@/utils/puzzlePicker', () => {
  const actual = jest.requireActual('@/utils/puzzlePicker')
  return { ...actual, resolvePuzzle: jest.fn(actual.resolvePuzzle) }
})

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// PnpWordPrompt also pulls buildCustomPuzzle from this same module to decide whether Next is
// enabled: spreading the real module keeps that working and only overrides the one export the Keep
// This Word tests below assert on.
jest.mock('@/utils/customPacks', () => ({
  ...jest.requireActual('@/utils/customPacks'),
  addCustomPuzzle: jest.fn().mockResolvedValue({ key: 'custom:test', label: 'Pass & Play', createdAt: '', updatedAt: '', puzzles: [] })
}))

const { resolvePuzzle: actualResolvePuzzle } = jest.requireActual<typeof puzzlePicker>('@/utils/puzzlePicker')
const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockAlert = jest.mocked(alert)
const mockAddCustomPuzzle = jest.mocked(addCustomPuzzle)
const mockUseIsFocused = jest.mocked(useIsFocused)

// The real stores: what a round recorded and where the round stands are read straight from them.
const stats = () => store.getState().achievements.stats
const pnpRound = () => store.getState().round.pnp

const PNP_LOADOUT = { pathname: '/loadout', params: { mode: 'pnp' } }
const PNP_GAME = { pathname: '/game', params: { mode: 'pnp' } }

// CAT as the real resolver saves it: the player's current art (the default, Classic), and 'hard',
// since three distinct letters leave most of the alphabet as misses (see scoreDifficulty).
const savedCat: SavedPuzzle = { phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom', difficultyTier: 'hard' }

// Puts a session on the board the way the screen itself would have left it, for the resume tests and
// the loadout's Continue: a fresh prompt, then the word handed off, then play with these guesses.
const seedPnp = (phase: PnpPhase, guessedLetters: string[] = []) => {
  store.dispatch(roundActions.startPnpAuthoring())
  if (phase === 'authoring') return
  store.dispatch(roundActions.setPnpWord(savedCat))
  if (phase === 'handoff') return
  store.dispatch(roundActions.startPnpPlaying())
  store.dispatch(roundActions.savePnpProgress({ guessedLetters, hintRevealed: false }))
}

// A prompt left with this typed into it, as the screen saves it on every keystroke.
const seedDraft = (answer: string, hint: string) => {
  seedPnp('authoring')
  store.dispatch(roundActions.setPnpDraft({ answer, hint }))
}

// None of these appear in CAT, and Classic allows six misses, so this is a genuine full loss.
const WRONG_LETTERS_FOR_CAT = ['Z', 'X', 'Q', 'W', 'E', 'R']

// Android's back button: the listeners are kept in registration order and pressed newest first,
// stopping at the first that handles it, as the OS does (React Native's iOS BackHandler, which Jest
// runs, never calls them at all).
type BackListener = () => boolean | null | undefined
let backListeners: BackListener[] = []
let addBackListener: jest.SpyInstance
const pressBack = () =>
  act(async () => {
    for (const listener of [...backListeners].reverse()) if (listener()) return
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockResolvePuzzle.mockReset()
  mockResolvePuzzle.mockImplementation(actualResolvePuzzle)
  mockUseIsFocused.mockReturnValue(true)
  store.dispatch(achievementsActions.reset())
  store.dispatch(roundActions.reset())
  backListeners = []
  addBackListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    backListeners.push(listener as BackListener)
    return {
      remove: () => {
        backListeners = backListeners.filter((item) => item !== listener)
      }
    }
  })
})

afterEach(() => {
  addBackListener.mockRestore()
})

describe('GameScreen - pass and play', () => {
  const renderGame = () =>
    render(
      <Providers>
        <GameScreen mode='pnp' />
      </Providers>
    )
  type Utils = Awaited<ReturnType<typeof renderGame>>

  const writeWord = async (utils: Utils, phrase: string) => {
    await fireEvent.changeText(utils.getByTestId('pnp-answer-input'), phrase)
    await fireEvent.press(utils.getByText('Next'))
  }

  // From a fresh mount through to "a round is in play".
  const playThroughToRound = async (utils: Utils, phrase: string) => {
    await writeWord(utils, phrase)
    await fireEvent.press(utils.getByText('Ready'))
  }

  const guess = async (utils: Utils, letters: string[]) => {
    for (const letter of letters) await fireEvent.press(utils.getByText(letter))
  }

  // Game holds the win card back WIN_DIALOG_DELAY_MS so the celebration plays first. Fake timers for
  // that (switched back in the test itself), so the fireworks behind the card never run for real.
  const winWithCat = async (utils: Utils) => {
    await guess(utils, ['C', 'A', 'T'])
    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })
  }

  // Game holds the loss card back a moment so the final artwork paints first; running the timers
  // pending by then opens it. Fake timers here too, so the falling keyboard's own timers run inside
  // act rather than loose, after the test has moved on.
  const loseWithCat = async (utils: Utils) => {
    await guess(utils, WRONG_LETTERS_FOR_CAT)
    await act(async () => {
      jest.runOnlyPendingTimers()
    })
  }

  it('starts a blank prompt over the live board when there is no session yet', async () => {
    const { getByTestId, getByText, getByLabelText } = await renderGame()

    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1, puzzle: null })
    expect(getByTestId('pnp-answer-input').props.value).toBe('')
    expect(getByTestId('pnp-hint-input').props.value).toBe('')
    // Named for who's writing: the first seat, in a fresh session.
    expect(getByText("Player 1's Word")).toBeTruthy()
    // Composing happens over the real board, not a blank screen: the word row, and the on-screen
    // keyboard where it will sit once play starts rather than a dead gap.
    expect(getByLabelText('Secret word display')).toBeTruthy()
    expect(getByText('Q')).toBeTruthy()
    // Marked as the game to resume at launch.
    expect(store.getState().round.activeMode).toBe('pnp')
  })

  it('previews the puzzle live while composing: the difficulty follows every keystroke', async () => {
    const { getByTestId, getByLabelText } = await renderGame()

    // Easy before anything's typed, rather than absent, so the pill doesn't pop into existence (and
    // shift the layout below it) on the first keystroke.
    expect(getByLabelText('Difficulty: Easy')).toBeTruthy()

    // Few distinct letters means most of the alphabet is a miss, which is what makes a short word
    // hard in hangman (see scoreDifficulty in customPacks.ts).
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()

    // More distinct letters, so more guesses land: the same scorer calls this easy, and the board has
    // to follow the typing rather than scoring once.
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'THE QUICK BROWN FOX')
    expect(getByLabelText('Difficulty: Easy')).toBeTruthy()
  })

  it('turns a typed hyphen or slash into a space, the same word break the board makes', async () => {
    const { getByTestId } = await renderGame()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'Spider-Man')
    expect(getByTestId('pnp-answer-input').props.value).toBe('Spider Man')

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'Face/Off')
    expect(getByTestId('pnp-answer-input').props.value).toBe('Face Off')
  })

  it('rejects a character that is not a letter or space, and toasts about it rather than silently dropping it', async () => {
    const { getByTestId, findByText } = await renderGame()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT!')

    // Rejected at the source, not just when the word is normalized: otherwise the field would show
    // "CAT!" while the board behind it showed blanks for "CAT".
    expect(getByTestId('pnp-answer-input').props.value).toBe('CAT')
    expect(await findByText('Only Letters and Spaces')).toBeTruthy()
  })

  it('locks the board while composing, so a tap on the keyboard behind the prompt guesses nothing', async () => {
    const utils = await renderGame()

    await fireEvent.changeText(utils.getByTestId('pnp-answer-input'), 'CAT')
    await guess(utils, ['C', 'Q'])

    expect(pnpRound().guessedLetters).toEqual([])
    expect(utils.getByLabelText('Wrong guesses: 0 of 6')).toBeTruthy()
  })

  it('hands off on Next with the same board: the difficulty and pips carry through unchanged, nothing remounts', async () => {
    const utils = await renderGame()
    const { getByLabelText, getByTestId, getByText } = utils

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByLabelText('Wrong guesses: 0 of 6')).toBeTruthy()
    const boardBeforeHandoff = getByLabelText('Secret word display')

    await fireEvent.press(getByText('Next'))

    // The word is saved as the real resolver built it, under the same round id: the board has been
    // drawing this exact word since composing began, so finalizing it has nothing to remount.
    expect(pnpRound()).toMatchObject({ phase: 'handoff', id: 1, puzzle: savedCat, guessedLetters: [] })
    // Naming who to hand the device to, and whose word is waiting.
    expect(getByText("Player 2's Turn")).toBeTruthy()
    expect(getByText("Player 1's word is set.")).toBeTruthy()
    // Both read from the exact same label text, so a drift between the preview's scoring and the
    // saved word's would fail this.
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByLabelText('Wrong guesses: 0 of 6')).toBeTruthy()
    // The same instance, not merely equal-looking output from a fresh one: this is what rules out the
    // remount that used to flicker at Hand off.
    expect(getByLabelText('Secret word display')).toBe(boardBeforeHandoff)
  })

  // The hand-off is the fleet's shared card (@tastic/hud's ConfirmDialog), which has no backdrop to
  // tap away: a stray touch while the device changes hands can't end it early.
  it('starts the round only from Ready, with no backdrop that could dismiss the hand-off early', async () => {
    const utils = await renderGame()
    const { getByText, queryByTestId, queryByText } = utils

    await writeWord(utils, 'CAT')

    expect(getByText("Player 2's Turn")).toBeTruthy()
    expect(queryByTestId('dialog-backdrop')).toBeNull()

    await fireEvent.press(getByText('Ready'))

    expect(pnpRound().phase).toBe('playing')
    expect(queryByText("Player 2's Turn")).toBeNull()
  })

  it('locks the board during the hand-off: the round is mounted underneath, but not guessable until Ready', async () => {
    jest.useFakeTimers()
    const utils = await renderGame()
    const { getByText, queryByText } = utils

    await writeWord(utils, 'CAT')

    // Solving it here would prove the board is only covered, not locked. RNTL presses straight
    // through the card's stacking order, so Game's own `locked` prop is what has to stop this.
    await guess(utils, ['C', 'A', 'T'])
    expect(queryByText('You Won!')).toBeNull()
    expect(pnpRound().guessedLetters).toEqual([])

    await fireEvent.press(getByText('Ready'))
    await winWithCat(utils)

    expect(getByText('You Won!')).toBeTruthy()

    jest.useRealTimers()
  })

  it('answers Android back on the hand-off with the card itself: it neither starts the round nor leaves', async () => {
    const utils = await renderGame()

    await writeWord(utils, 'CAT')
    await pressBack()

    // A card with only a confirm button has to be answered (see hud's ConfirmDialog).
    expect(utils.getByText("Player 2's Turn")).toBeTruthy()
    expect(pnpRound().phase).toBe('handoff')
    expect(router.dismissTo).not.toHaveBeenCalled()
  })

  it('loops: a won round goes back to a blank prompt for the next word, on a new round', async () => {
    jest.useFakeTimers()
    const utils = await renderGame()
    const { getByLabelText, getByTestId, getByText } = utils

    await playThroughToRound(utils, 'CAT')
    const finishedBoard = getByLabelText('Secret word display')
    await winWithCat(utils)

    // "You" is the guesser holding the device; the card names who played whose word, and who's next.
    expect(getByText('You Won!')).toBeTruthy()
    expect(getByText("Player 2 solved Player 1's word.")).toBeTruthy()
    expect(getByText('Player 2 writes next')).toBeTruthy()

    await fireEvent.press(getByText('Next'))

    // Straight back to composing, with the fields cleared for whoever is next, on a new round id so
    // nothing of the finished round (its outcome, its celebration) carries into the new board.
    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 2, puzzle: null, guessedLetters: [] })
    expect(getByText("Player 2's Word")).toBeTruthy()
    expect(getByTestId('pnp-answer-input').props.value).toBe('')
    expect(getByTestId('pnp-hint-input').props.value).toBe('')
    expect(getByLabelText('Secret word display')).not.toBe(finishedBoard)

    jest.useRealTimers()
  })

  it('loops on a loss too, and Android back on the result card counts as Next', async () => {
    jest.useFakeTimers()
    const utils = await renderGame()
    const { getByTestId, getByText } = utils

    await playThroughToRound(utils, 'CAT')
    await loseWithCat(utils)
    expect(getByText('You Lost!')).toBeTruthy()

    await pressBack()

    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 2, puzzle: null })
    expect(getByTestId('pnp-answer-input').props.value).toBe('')
    expect(router.dismissTo).not.toHaveBeenCalled()

    jest.useRealTimers()
  })

  it('records a win only on the Pass & Play record, never the solo record, streak or round', async () => {
    jest.useFakeTimers()
    const utils = await renderGame()

    await playThroughToRound(utils, 'CAT')
    await winWithCat(utils)

    expect(utils.getByText('You Won!')).toBeTruthy()
    // A word someone typed on the spot shouldn't inflate the solve count or the win streak, and their
    // choice not to write a hint shouldn't hand out No Hints Needed for free.
    expect(stats()).toMatchObject({ solo: { played: 0, wins: 0, losses: 0, draws: 0 }, soloStreak: { currentWinStreak: 0, bestWinStreak: 0 }, noHintWins: 0, flawlessWins: 0, lettersGuessed: 0 })
    expect(stats().pnp).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })
    // Each play mode keeps its own round: a Pass & Play session leaves the solo one alone.
    expect(store.getState().round.solo).toEqual(initialRoundState.solo)

    jest.useRealTimers()
  })

  // A loss is a separate branch from a win, so a win-only test doesn't cover it: losing to someone
  // else's word must not break your solo streak either.
  it('records a loss only on the Pass & Play record', async () => {
    jest.useFakeTimers()
    const utils = await renderGame()

    await playThroughToRound(utils, 'CAT')
    await loseWithCat(utils)

    expect(utils.getByText('You Lost!')).toBeTruthy()
    expect(stats().solo).toEqual({ played: 0, wins: 0, losses: 0, draws: 0 })
    expect(stats().soloStreak).toMatchObject({ currentWinStreak: 0, bestWinStreak: 0 })
    expect(stats().pnp).toEqual({ played: 1, wins: 0, losses: 1, draws: 0 })
    expect(store.getState().round.solo).toEqual(initialRoundState.solo)

    jest.useRealTimers()
  })

  it('does not keep the word by default: Keep This Word starts off', async () => {
    const utils = await renderGame()

    expect(utils.getByLabelText('Keep this word').props.value).toBe(false)

    await writeWord(utils, 'CAT')

    expect(pnpRound().phase).toBe('handoff')
    expect(mockAddCustomPuzzle).not.toHaveBeenCalled()
  })

  it('keeps the word and hint in the Pass & Play pack once Keep This Word is on at Next', async () => {
    const { getByLabelText, getByTestId, getByText } = await renderGame()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.changeText(getByTestId('pnp-hint-input'), 'A pet')
    await fireEvent(getByLabelText('Keep this word'), 'valueChange', true)
    await fireEvent.press(getByText('Next'))

    // The raw typed word and hint, as handed to the pack (which normalizes them itself), and the
    // dedicated Pass & Play pack, not the general Custom one.
    expect(mockAddCustomPuzzle).toHaveBeenCalledTimes(1)
    expect(mockAddCustomPuzzle).toHaveBeenCalledWith({ answer: 'CAT', hint: 'A pet' }, 'Pass & Play')
  })

  it('alerts on a word the resolver rejects and stays on the prompt, keeping nothing', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: false, error: 'Enter a secret word using letters A-Z (spaces allowed).' })
    const { getByLabelText, getByTestId, getByText, queryByText } = await renderGame()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent(getByLabelText('Keep this word'), 'valueChange', true)
    await fireEvent.press(getByText('Next'))

    expect(mockAlert).toHaveBeenCalledWith('Invalid Word', 'Enter a secret word using letters A-Z (spaces allowed).')
    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1, puzzle: null })
    expect(getByTestId('pnp-answer-input').props.value).toBe('CAT')
    expect(queryByText("Player 2's Turn")).toBeNull()
    expect(mockAddCustomPuzzle).not.toHaveBeenCalled()
  })

  it("leaves for the Pass & Play loadout from the prompt's close glyph, keeping the session", async () => {
    const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')
    const { getByLabelText, getByTestId } = await renderGame()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.press(getByLabelText('Close'))

    expect(router.dismissTo).toHaveBeenCalledTimes(1)
    expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
    expect(dismissKeyboard).toHaveBeenCalled()
    // No longer the game to resume at launch, but nothing about the round itself changed.
    expect(store.getState().round.activeMode).toBeNull()
    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1 })
    dismissKeyboard.mockRestore()
  })

  it('leaves for the Pass & Play loadout on Android back while composing', async () => {
    await renderGame()

    await pressBack()

    expect(router.dismissTo).toHaveBeenCalledTimes(1)
    expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
    expect(store.getState().round.activeMode).toBeNull()
  })

  it('leaves from the back corner mid-round with the guesses saved for Continue', async () => {
    const utils = await renderGame()

    await playThroughToRound(utils, 'CAT')
    await guess(utils, ['C', 'Z'])
    await fireEvent.press(utils.getByLabelText('Back'))

    expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
    expect(pnpRound()).toMatchObject({ phase: 'playing', id: 1, puzzle: savedCat, guessedLetters: ['C', 'Z'] })
  })

  it('steps the prompt aside for Settings and brings it back with the half-typed word intact', async () => {
    const { getByLabelText, getByTestId, getByText, queryByTestId } = await renderGame()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'BANANA BREAD')
    await fireEvent.changeText(getByTestId('pnp-hint-input'), 'Breakfast loaf')
    // Hidden before Settings opens, so the word stays hidden when the prompt comes back: the prompt
    // stays mounted behind the sheet, keeping its show/hide toggle.
    await fireEvent.press(getByLabelText('Hide solution'))
    expect(getByTestId('pnp-answer-input').props.secureTextEntry).toBe(true)

    await fireEvent.press(getByLabelText('Settings'))
    expect(queryByTestId('pnp-answer-input')).toBeNull()

    await fireEvent.press(getByText('Done'))
    expect(getByTestId('pnp-answer-input').props.value).toBe('BANANA BREAD')
    expect(getByTestId('pnp-hint-input').props.value).toBe('Breakfast loaf')
    expect(getByTestId('pnp-answer-input').props.secureTextEntry).toBe(true)
    expect(getByLabelText('Show solution')).toBeTruthy()
    // And the board behind it is still drawing that word.
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
  })

  it('steps the hand-off aside for Settings too, and keeps the board locked while the sheet is up', async () => {
    const utils = await renderGame()
    const { getByLabelText, getByText, queryByText } = utils

    await writeWord(utils, 'CAT')
    await fireEvent.press(getByLabelText('Settings'))
    expect(queryByText("Player 2's Turn")).toBeNull()

    await fireEvent.press(getByText('Done'))
    await fireEvent.press(getByText('Ready'))

    // Mid-round, Settings locks the board as well: a tap behind the sheet guesses nothing.
    await fireEvent.press(getByLabelText('Settings'))
    await guess(utils, ['C'])
    expect(pnpRound().guessedLetters).toEqual([])

    await fireEvent.press(getByText('Done'))
    await guess(utils, ['C'])
    expect(pnpRound().guessedLetters).toEqual(['C'])
  })

  it("hides the prompt and locks the board while the game screen isn't the one showing", async () => {
    mockUseIsFocused.mockReturnValue(false)
    const utils = await renderGame()

    // The web keeps a left screen mounted, and the prompt's card is a portal, so it has to step aside
    // on its own; the board's keyboard listener is on the window, so it has to be locked too.
    expect(utils.queryByTestId('pnp-answer-input')).toBeNull()
    expect(pnpRound().phase).toBe('authoring')
    await guess(utils, ['Q'])
    expect(pnpRound().guessedLetters).toEqual([])
  })

  describe('the word being written', () => {
    it('saves the word and hint as they are typed, and forgets them once both are cleared', async () => {
      const { getByTestId } = await renderGame()

      // Saved as the field shows it, after the prompt's own clean-up of the keystroke.
      await fireEvent.changeText(getByTestId('pnp-answer-input'), 'Spider-Man')
      expect(pnpRound().draft).toEqual({ answer: 'Spider Man', hint: '' })

      await fireEvent.changeText(getByTestId('pnp-hint-input'), 'A hero')
      expect(pnpRound().draft).toEqual({ answer: 'Spider Man', hint: 'A hero' })

      // A hint on its own is still something typed.
      await fireEvent.changeText(getByTestId('pnp-answer-input'), '')
      expect(pnpRound().draft).toEqual({ answer: '', hint: 'A hero' })

      await fireEvent.changeText(getByTestId('pnp-hint-input'), '')
      expect(pnpRound()).not.toHaveProperty('draft')
      // Typing never starts a new round.
      expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1, puzzle: null })
    })

    it('keeps the word through the close glyph, offers Continue for it, and brings the prompt back with it', async () => {
      const game = await renderGame()
      await fireEvent.changeText(game.getByTestId('pnp-answer-input'), 'CAT')
      await fireEvent.changeText(game.getByTestId('pnp-hint-input'), 'A pet')
      await fireEvent.press(game.getByLabelText('Close'))

      expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
      // dismissTo pops the game screen off the stack, so it unmounts here too.
      await game.unmount()

      const loadout = await render(
        <Providers>
          <LoadoutScreen mode='pnp' />
        </Providers>
      )
      const saved = pnpRound()
      await fireEvent.press(loadout.getByText('Continue'))

      expect(router.push).toHaveBeenCalledWith(PNP_GAME)
      expect(pnpRound()).toEqual(saved)

      const again = await renderGame()

      expect(again.getByTestId('pnp-answer-input').props.value).toBe('CAT')
      expect(again.getByTestId('pnp-hint-input').props.value).toBe('A pet')
      // And the board behind the prompt is drawing that word again: a blank one reads Easy.
      expect(again.getByLabelText('Difficulty: Hard')).toBeTruthy()
      expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1, puzzle: null, draft: { answer: 'CAT', hint: 'A pet' } })
      expect(store.getState().round.activeMode).toBe('pnp')
    })

    it('hands off a word brought back exactly as typed, and the next round starts at a blank prompt', async () => {
      jest.useFakeTimers()
      seedDraft('CAT', 'A pet')
      const utils = await renderGame()
      const { getByTestId, getByText } = utils

      await fireEvent.press(getByText('Next'))

      expect(pnpRound()).toMatchObject({ phase: 'handoff', id: 1, puzzle: { ...savedCat, hint: 'A pet' } })
      expect(pnpRound()).not.toHaveProperty('draft')

      await fireEvent.press(getByText('Ready'))
      await winWithCat(utils)
      await fireEvent.press(getByText('Next'))

      expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 2, puzzle: null })
      expect(pnpRound()).not.toHaveProperty('draft')
      expect(getByTestId('pnp-answer-input').props.value).toBe('')
      expect(getByTestId('pnp-hint-input').props.value).toBe('')

      jest.useRealTimers()
    })
  })

  describe('the session', () => {
    const session = () => pnpRound().session

    it('counts each round for its guesser, once, and has the guesser write the next word for the writer', async () => {
      jest.useFakeTimers()
      const utils = await renderGame()
      const { getByLabelText, getByText, queryByText } = utils

      await playThroughToRound(utils, 'CAT')
      await winWithCat(utils)

      expect(session().standings).toEqual({ p2: { played: 1, wins: 1 } })
      expect(stats().pnp).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })
      // The card's standings, this round counted.
      expect(getByText('Standings')).toBeTruthy()
      expect(getByLabelText('Player 2: 1 of 1 solved')).toBeTruthy()
      expect(getByLabelText('Player 1: no words guessed yet')).toBeTruthy()

      await fireEvent.press(getByText('Next'))

      // Two players: no For row, the word can only be for Player 1.
      expect(getByText("Player 2's Word")).toBeTruthy()
      expect(queryByText('For')).toBeNull()
      expect(session()).toMatchObject({ writerId: 'p2', guesserId: 'p1' })

      await writeWord(utils, 'CAT')
      expect(getByText("Player 1's Turn")).toBeTruthy()
      expect(getByText("Player 2's word is set.")).toBeTruthy()
      await fireEvent.press(getByText('Ready'))
      await loseWithCat(utils)

      expect(session().standings).toEqual({ p1: { played: 1, wins: 0 }, p2: { played: 1, wins: 1 } })
      expect(stats().pnp).toEqual({ played: 2, wins: 1, losses: 1, draws: 0 })
      expect(getByText("Player 1 missed Player 2's word.")).toBeTruthy()
      expect(getByText('Player 1 writes next')).toBeTruthy()

      jest.useRealTimers()
    })

    it('with three players, pre-picks whoever has guessed the fewest words and lets the writer pick someone else', async () => {
      jest.useFakeTimers()
      store.dispatch(roundActions.addPnpPlayer())
      const utils = await renderGame()
      const { getByLabelText, getByText } = utils

      // Player 2 and Player 3 have guessed nothing: Player 2 sits next after the writer.
      expect(getByText('For')).toBeTruthy()
      expect(getByLabelText('For Player 2')).toBeSelected()
      expect(getByLabelText('For Player 3')).not.toBeSelected()

      await fireEvent.press(getByLabelText('For Player 3'))
      expect(getByLabelText('For Player 3')).toBeSelected()
      expect(session().guesserId).toBe('p3')

      await writeWord(utils, 'CAT')
      expect(getByText("Player 3's Turn")).toBeTruthy()
      await fireEvent.press(getByText('Ready'))
      await winWithCat(utils)
      expect(session().standings).toEqual({ p3: { played: 1, wins: 1 } })
      await fireEvent.press(getByText('Next'))

      // Player 3 writes; Player 1 and Player 2 have guessed nothing, and Player 1 sits next after them.
      expect(getByText("Player 3's Word")).toBeTruthy()
      expect(getByLabelText('For Player 1')).toBeSelected()
      expect(getByLabelText('For Player 2')).not.toBeSelected()

      jest.useRealTimers()
    })

    // The count lands with the last guess, and redux-persist could save the one without the other: the
    // round comes back undecided, and finishing it again counts nothing.
    it('counts nothing for a round whose result was already counted, when it ends again after a relaunch', async () => {
      jest.useFakeTimers()
      seedPnp('playing', ['C', 'A'])
      store.dispatch(roundActions.recordPnpResult({ roundId: pnpRound().id, result: 'win' }))
      const counted = session()
      const utils = await renderGame()

      await guess(utils, ['T'])
      await act(async () => {
        jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
      })

      expect(utils.getByText('You Won!')).toBeTruthy()
      expect(session()).toEqual(counted)
      expect(stats().pnp.played).toBe(0)

      jest.useRealTimers()
    })

    it('comes back after a relaunch to a prompt for whoever guessed the round that ended', async () => {
      seedPnp('playing', ['C', 'A', 'T'])
      store.dispatch(roundActions.recordPnpResult({ roundId: pnpRound().id, result: 'win' }))
      const { getByText } = await renderGame()

      expect(getByText("Player 2's Word")).toBeTruthy()
      expect(session()).toMatchObject({ writerId: 'p2', guesserId: 'p1', standings: { p2: { played: 1, wins: 1 } } })
    })

    describe('End Session', () => {
      const endSession = async (utils: Utils) => {
        await playThroughToRound(utils, 'CAT')
        await winWithCat(utils)
        await fireEvent.press(utils.getByText('End Session'))
      }

      it('puts the round card away for the standings card, with the winner', async () => {
        jest.useFakeTimers()
        store.dispatch(roundActions.addPnpPlayer())
        const utils = await renderGame()

        await endSession(utils)

        expect(utils.queryByText('You Won!')).toBeNull()
        expect(utils.getByText('Player 2 Wins!')).toBeTruthy()
        expect(utils.getByText('1 of 1 solved, the best rate at 100%.')).toBeTruthy()
        // Nothing has ended yet: the card is all there is until Done.
        expect(session().standings).toEqual({ p2: { played: 1, wins: 1 } })
        expect(router.dismissTo).not.toHaveBeenCalled()

        jest.useRealTimers()
      })

      it('ends the session from Done: the standings cleared, the table kept, and back to the loadout', async () => {
        jest.useFakeTimers()
        store.dispatch(roundActions.addPnpPlayer())
        store.dispatch(roundActions.renamePnpPlayer({ id: 'p1', name: 'Ann' }))
        const utils = await renderGame()

        await endSession(utils)
        await fireEvent.press(utils.getByText('Done'))

        expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
        expect(utils.queryByText('Player 2 Wins!')).toBeNull()
        expect(session()).toMatchObject({ standings: {}, recordedRoundId: null, writerId: 'p1', guesserId: 'p2' })
        expect(session().players.map((player) => player.name)).toEqual(['Ann', 'Player 2', 'Player 3'])
        expect(pnpRound().phase).toBeNull()
        expect(store.getState().round.activeMode).toBeNull()
        // The stats keep the round: ending a session only clears its own standings.
        expect(stats().pnp.played).toBe(1)

        jest.useRealTimers()
      })

      // The standings card is End Session's confirm: Keep Playing, or Android back, brings the round's
      // card back with the session untouched, and Next still goes on to the next word.
      it.each<[string, (utils: Utils) => Promise<unknown>]>([
        ['Keep Playing', (utils) => fireEvent.press(utils.getByText('Keep Playing'))],
        ['Android back', () => pressBack()]
      ])('backs out from %s, the round card back and the session untouched', async (_label, back) => {
        jest.useFakeTimers()
        store.dispatch(roundActions.addPnpPlayer())
        const utils = await renderGame()

        await endSession(utils)
        await back(utils)

        expect(utils.queryByText('Player 2 Wins!')).toBeNull()
        expect(utils.getByText('You Won!')).toBeTruthy()
        expect(session().standings).toEqual({ p2: { played: 1, wins: 1 } })
        expect(router.dismissTo).not.toHaveBeenCalled()

        await fireEvent.press(utils.getByText('Next'))
        expect(utils.getByText("Player 2's Word")).toBeTruthy()

        jest.useRealTimers()
      })
    })
  })

  describe('resuming a saved session', () => {
    it('comes back to the hand-off card for a word already handed off', async () => {
      seedPnp('handoff')
      const { getByLabelText, getByText, queryByTestId } = await renderGame()

      expect(getByText("Player 2's Turn")).toBeTruthy()
      expect(queryByTestId('pnp-answer-input')).toBeNull()
      expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
      expect(pnpRound()).toMatchObject({ phase: 'handoff', id: 1, puzzle: savedCat })

      await fireEvent.press(getByText('Ready'))
      expect(pnpRound().phase).toBe('playing')
    })

    // A card mounted with the screen adds its back listener before GameScreen's, so GameScreen's runs
    // first: it steps aside during a hand-off and lets the card swallow back.
    it('answers Android back on a resumed hand-off with the card, the same as the live one', async () => {
      seedPnp('handoff')
      const { getByText } = await renderGame()

      await pressBack()

      expect(getByText("Player 2's Turn")).toBeTruthy()
      expect(router.dismissTo).not.toHaveBeenCalled()
    })

    // GameScreen's handler reads the phase when back is pressed, not when it registered, so it only
    // steps aside while the hand-off is actually up.
    it('leaves on Android back again once Ready starts a resumed round', async () => {
      seedPnp('handoff')
      const { getByText } = await renderGame()

      await fireEvent.press(getByText('Ready'))
      await pressBack()

      expect(router.dismissTo).toHaveBeenCalledTimes(1)
      expect(router.dismissTo).toHaveBeenCalledWith(PNP_LOADOUT)
      expect(pnpRound()).toMatchObject({ phase: 'playing', id: 1, puzzle: savedCat })
    })

    it('comes back mid-guess for a round in play, unlocked, and finishes it normally', async () => {
      jest.useFakeTimers()
      seedPnp('playing', ['C', 'Z'])
      const utils = await renderGame()
      const { getByLabelText, getByText, queryByTestId, queryByText } = utils

      expect(queryByTestId('pnp-answer-input')).toBeNull()
      expect(queryByText("Player 2's Turn")).toBeNull()
      expect(getByLabelText('Wrong guesses: 1 of 6 (Z)')).toBeTruthy()

      await guess(utils, ['A', 'T'])
      await act(async () => {
        jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
      })

      expect(getByText('You Won!')).toBeTruthy()
      expect(pnpRound().guessedLetters).toEqual(['C', 'Z', 'A', 'T'])
      expect(stats().pnp).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })

      jest.useRealTimers()
    })

    it('comes back to a blank prompt, on the same round, for a prompt left with nothing typed', async () => {
      seedPnp('authoring')
      const { getByTestId } = await renderGame()

      // Nothing typed leaves no draft, so there's nothing to fill the fields with.
      expect(getByTestId('pnp-answer-input').props.value).toBe('')
      expect(getByTestId('pnp-hint-input').props.value).toBe('')
      expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1, puzzle: null })
    })

    // The round as redux-persist wrote it (JSON) and read it back through the slice's own migrate
    // (sanitizeRoundState) into a fresh store: a relaunch while the prompt was open. The store has the
    // active player too (the guest), which the Settings sheet's backup reads.
    it('comes back to the word and hint as typed, on the same round, for a prompt left mid-word', async () => {
      const first = await renderGame()
      await fireEvent.changeText(first.getByTestId('pnp-answer-input'), 'CAT')
      await fireEvent.changeText(first.getByTestId('pnp-hint-input'), 'A pet')
      const blob: unknown = JSON.parse(JSON.stringify(store.getState().round))
      await first.unmount()

      const roundStore = configureStore({ reducer: { round: roundReducer, activePlayer: activePlayerReducer }, preloadedState: { round: sanitizeRoundState(blob) } })
      const { getByLabelText, getByTestId } = await render(
        <Providers>
          <ReduxProvider store={roundStore}>
            <GameScreen mode='pnp' />
          </ReduxProvider>
        </Providers>
      )

      expect(getByTestId('pnp-answer-input').props.value).toBe('CAT')
      expect(getByTestId('pnp-hint-input').props.value).toBe('A pet')
      expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
      expect(roundStore.getState().round.pnp).toMatchObject({ phase: 'authoring', id: 1, puzzle: null, draft: { answer: 'CAT', hint: 'A pet' } })
    })

    it('starts a new prompt for a round that ended while the app was away, without recording it again', async () => {
      seedPnp('playing', ['C', 'A', 'T'])
      const { getByTestId, queryByText } = await renderGame()

      expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 2, puzzle: null, guessedLetters: [] })
      expect(getByTestId('pnp-answer-input').props.value).toBe('')
      expect(queryByText('You Won!')).toBeNull()
      expect(stats().pnp.played).toBe(0)
    })

    // A saved hand-off with no word behind it can only come from a stored blob (sanitizeRoundState
    // passes it: the word and the phase are checked separately), and no round action produces it. So
    // the screen reads its round from a store built from that blob, under the app's own Providers.
    it('starts a new prompt for a saved hand-off whose word went missing', async () => {
      const blob = { solo: initialRoundState.solo, pnp: { id: 4, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'handoff' }, activeMode: 'pnp' }
      const roundStore = configureStore({ reducer: { round: roundReducer, activePlayer: activePlayerReducer }, preloadedState: { round: sanitizeRoundState(blob) } })
      expect(roundStore.getState().round.pnp).toMatchObject({ phase: 'handoff', puzzle: null })

      const { getByTestId, queryByText } = await render(
        <Providers>
          <ReduxProvider store={roundStore}>
            <GameScreen mode='pnp' />
          </ReduxProvider>
        </Providers>
      )

      expect(roundStore.getState().round.pnp).toMatchObject({ phase: 'authoring', id: 5, puzzle: null })
      expect(getByTestId('pnp-answer-input').props.value).toBe('')
      expect(queryByText("Player 2's Turn")).toBeNull()
    })
  })
})

describe('LoadoutScreen - pass and play', () => {
  const renderLoadout = () =>
    render(
      <Providers>
        <LoadoutScreen mode='pnp' />
      </Providers>
    )

  it('starts a fresh session from New Session and opens the game', async () => {
    const { getByText, queryByText } = await renderLoadout()

    // Nothing to come back to yet, so New Session is the only way in.
    expect(queryByText('Continue')).toBeNull()

    await fireEvent.press(getByText('New Session'))

    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 1, puzzle: null })
    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
  })

  it('replaces a round left waiting with a blank prompt from New Session, recording nothing', async () => {
    seedPnp('playing', ['C', 'Z'])
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('New Session'))

    // Pass & Play keeps no record of how a session ends, only of rounds actually finished.
    expect(pnpRound()).toMatchObject({ phase: 'authoring', id: 2, puzzle: null, guessedLetters: [] })
    expect(stats().pnp.played).toBe(0)
    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
  })

  it.each<[string, PnpPhase, string[]]>([
    ['a word handed off', 'handoff', []],
    ['a round mid-guess', 'playing', ['C', 'Z']]
  ])('offers Continue for %s, and opens the game on it without resetting it', async (_label, phase, guessedLetters) => {
    seedPnp(phase, guessedLetters)
    const saved = pnpRound()
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('Continue'))

    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
    expect(pnpRound()).toEqual(saved)
  })

  it('offers Continue for a word half typed, and opens the game on it without resetting it', async () => {
    seedDraft('CAT', '')
    const saved = pnpRound()
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('Continue'))

    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
    expect(pnpRound()).toEqual(saved)
  })

  // New Session is always a fresh word: the half-typed one goes with the rest of the session.
  it('replaces a half-typed word with a blank prompt from New Session', async () => {
    seedDraft('CAT', 'A pet')
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('New Session'))

    expect(pnpRound()).toStrictEqual({ id: 2, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', session: createDefaultPnpSession() })
    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
  })

  // A hint is no word to come back to: Continue is for a board with something on it.
  it.each<[string, () => void]>([
    ['a prompt with nothing typed', () => seedPnp('authoring')],
    ['a prompt with only a hint typed', () => seedDraft('', 'A pet')],
    ['a prompt with only spaces typed', () => seedDraft('   ', '')],
    ['a round already decided', () => seedPnp('playing', ['C', 'A', 'T'])]
  ])('offers no Continue for %s', async (_label, seed) => {
    seed()
    const { getByText, queryByText } = await renderLoadout()

    expect(queryByText('Continue')).toBeNull()
    expect(getByText('New Session')).toBeTruthy()
  })

  it('switches Keep Each Word, the same preference the prompt reads at Next', async () => {
    // Reads the preference straight from its provider, beside the loadout.
    const AutoSaveProbe = () => <Text testID='auto-save'>{String(useAutoSaveCustom().autoSave)}</Text>
    const { getByLabelText, getByTestId, getByText } = await render(
      <Providers>
        <LoadoutScreen mode='pnp' />
        <AutoSaveProbe />
      </Providers>
    )

    expect(getByLabelText('Keep each word').props.value).toBe(false)
    expect(getByTestId('auto-save').props.children).toBe('false')

    await fireEvent(getByLabelText('Keep each word'), 'valueChange', true)
    expect(getByLabelText('Keep each word').props.value).toBe(true)
    expect(getByTestId('auto-save').props.children).toBe('true')

    // The whole row toggles it too, not just the switch.
    await fireEvent.press(getByText('Keep Each Word'))
    expect(getByTestId('auto-save').props.children).toBe('false')
  })

  // A round counted into the standings, the way the game screen leaves one: decided, then the next
  // prompt opened for its guesser.
  const playOneRound = () => {
    seedPnp('playing', ['C', 'A', 'T'])
    store.dispatch(roundActions.recordPnpResult({ roundId: pnpRound().id, result: 'win' }))
    store.dispatch(roundActions.startPnpAuthoring())
  }

  it('offers Continue for a session under way, and goes back to it as it was', async () => {
    playOneRound()
    const saved = pnpRound()
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('Continue'))

    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
    expect(pnpRound()).toEqual(saved)
  })

  it('starts a new session for the same table from New Session: the standings cleared, the first seat writing', async () => {
    store.dispatch(roundActions.addPnpPlayer())
    store.dispatch(roundActions.renamePnpPlayer({ id: 'p3', name: 'Cy' }))
    playOneRound()
    const players = pnpRound().session.players
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('New Session'))

    expect(pnpRound()).toMatchObject({ phase: 'authoring', puzzle: null, session: { players, standings: {}, writerId: 'p1', guesserId: 'p2', recordedRoundId: null } })
    expect(stats().pnp.played).toBe(0)
    expect(router.push).toHaveBeenCalledWith(PNP_GAME)
  })

  it('never touches the solo round left waiting', async () => {
    store.dispatch(roundActions.startSolo({ playerKey: GUEST_PLAYER_KEY, puzzle: { phrase: 'DOG', modeId: DEFAULT_MODE.id, sourceMode: 'random', packKey: 'pack-1', packLabel: 'Test Pack', puzzleId: 'puzzle-1', difficultyTier: 'easy' } }))
    store.dispatch(roundActions.saveSoloProgress({ playerKey: GUEST_PLAYER_KEY, guessedLetters: ['D'], hintRevealed: true }))
    const solo = selectSoloRound(store.getState().round, GUEST_PLAYER_KEY)
    const { getByText } = await renderLoadout()

    await fireEvent.press(getByText('New Session'))

    expect(selectSoloRound(store.getState().round, GUEST_PLAYER_KEY)).toEqual(solo)
  })
})
