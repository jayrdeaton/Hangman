import { act, fireEvent, render } from '@testing-library/react-native'

import { WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import { achievementsActions } from '@/redux/achievementsSlice'
import { store } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { confirm } from '@/utils/alert'
import { addCustomPuzzle } from '@/utils/customPacks'
import * as puzzlePicker from '@/utils/puzzlePicker'

jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

// PnpWordPrompt also pulls buildCustomPuzzle from this same module for its live preview -
// spreading the real module keeps that working and only overrides the one export the
// Keep-this-word tests below assert on.
jest.mock('@/utils/customPacks', () => ({
  ...jest.requireActual('@/utils/customPacks'),
  addCustomPuzzle: jest.fn().mockResolvedValue({ key: 'custom:test', label: 'Pass & Play', createdAt: '', updatedAt: '', puzzles: [] })
}))

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
// The real stats store: what a round recorded is read straight from it.
const stats = () => store.getState().achievements.stats
const mockConfirm = jest.mocked(confirm)
const mockAddCustomPuzzle = jest.mocked(addCustomPuzzle)

const visualMode: GameMode = {
  id: 'test-pnp-visual',
  label: 'Test PnP Visual',
  description: 'A test mode with artwork',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// A hand-typed word has no pack behind it, so no packKey/puzzleId - matching what resolvePuzzle
// really returns for sourceMode 'custom' (see puzzlePicker.ts). difficultyTier IS included, same
// as the real thing: every test here types 'CAT', which scores 'hard' (see the comment on the
// live-preview test below), so this is what the real resolvePuzzle would actually compute for it.
const pnpPayload = (phrase: string, mode: GameMode = visualMode): GameStartPayload => ({ phrase, mode, sourceMode: 'custom', difficultyTier: 'hard' })

const renderApp = () =>
  render(
    <Providers>
      <Main />
    </Providers>
  )

describe('Main - pass and play', () => {
  beforeEach(() => {
    mockResolvePuzzle.mockReset()
    store.dispatch(achievementsActions.reset())
    mockConfirm.mockClear()
    mockAddCustomPuzzle.mockClear()
  })

  // Cold start through to "a round is in play".
  const playThroughToRound = async (utils: Awaited<ReturnType<typeof renderApp>>, phrase: string) => {
    await fireEvent.press(utils.getByLabelText('Game Menu'))
    await fireEvent.press(utils.getByText('Pass & Play'))
    await fireEvent.changeText(utils.getByTestId('pnp-answer-input'), phrase)
    await fireEvent.press(utils.getByText('Next'))
    await fireEvent.press(utils.getByText('Ready'))
  }

  // None of these appear in CAT. Game's own maxMistakes is frozen from config.mode the moment
  // composing begins (see Main.tsx) - classicMode, the app's real default - not from whatever mode
  // the mocked resolvePuzzle payload happens to carry, so the loss-path tests need a genuine
  // six-miss run rather than a shortcut mode with a lower limit.
  const WRONG_LETTERS_FOR_CAT = ['Z', 'X', 'Q', 'W', 'E', 'R']

  const loseTheRound = async (getByText: Awaited<ReturnType<typeof renderApp>>['getByText']) => {
    for (const letter of WRONG_LETTERS_FOR_CAT) {
      await fireEvent.press(getByText(letter))
    }
  }

  it('loops: compose a word, hand off, play, then compose the next word', async () => {
    jest.useFakeTimers()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    // Composing is a screen, not a dialog over a blank board: the artwork and blank row render the
    // whole time, and the app bar above stays reachable.
    expect(getByTestId('pnp-answer-input')).toBeTruthy()
    expect(getByLabelText('Secret word display')).toBeTruthy()
    expect(getByLabelText('Game Menu')).toBeTruthy()

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.press(getByText('Next'))

    // Handoff exists only as a beat while the device changes hands, so it's just a target to tap -
    // no instructions, nobody named. The real round is already mounted underneath it (not a blank
    // screen), because there's nothing about an unstarted round that needs concealing.
    expect(getByText('Ready')).toBeTruthy()
    expect(getByLabelText('Secret word display')).toBeTruthy()

    await fireEvent.press(getByText('Ready'))

    await fireEvent.press(getByText('C'))
    await fireEvent.press(getByText('A'))
    await fireEvent.press(getByText('T'))

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    // Whoever is holding the device is "you" - no player attribution, no score line.
    expect(getByText('You Won!')).toBeTruthy()
    // Only the continue button changes, because continuing here means writing the next word.
    expect(getByText('Next')).toBeTruthy()

    await fireEvent.press(getByText('Next'))

    // Straight back to composing, with the fields cleared for whoever is next.
    expect(getByTestId('pnp-answer-input').props.value).toBe('')
    expect(getByTestId('pnp-hint-input').props.value).toBe('')

    jest.useRealTimers()
  })

  it('loops on a loss too', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByText, getByTestId, findByText } = utils

    await playThroughToRound(utils, 'CAT')

    // Game holds the dialog back ~450ms so the final artwork paints first (its lossTimeoutRef).
    await loseTheRound(getByText)

    expect(await findByText('You Lost!')).toBeTruthy()

    await fireEvent.press(getByText('Next'))
    expect(getByTestId('pnp-answer-input')).toBeTruthy()
  })

  it('never touches the solo achievement record on a win', async () => {
    jest.useFakeTimers()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByText } = utils

    await playThroughToRound(utils, 'CAT')
    await fireEvent.press(getByText('C'))
    await fireEvent.press(getByText('A'))
    await fireEvent.press(getByText('T'))

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You Won!')).toBeTruthy()
    // A word someone typed on the spot shouldn't inflate the solve count or the win streak, and
    // their choice not to write a hint shouldn't hand out No Hints Needed for free. It goes on the
    // Pass & Play record instead.
    expect(stats()).toMatchObject({ solo: { played: 0, wins: 0, losses: 0, draws: 0 }, soloStreak: { currentWinStreak: 0, bestWinStreak: 0 }, noHintWins: 0, flawlessWins: 0, lettersGuessed: 0 })
    expect(stats().pnp).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })

    jest.useRealTimers()
  })

  // A loss is a separate branch (handleLost) from a win, so a win-only test doesn't cover it: losing
  // to someone else's word must not break your solo streak either.
  it('never touches the solo achievement record on a loss', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByText, findByText } = utils

    await playThroughToRound(utils, 'CAT')
    await loseTheRound(getByText)

    expect(await findByText('You Lost!')).toBeTruthy()
    expect(stats().solo).toEqual({ played: 0, wins: 0, losses: 0, draws: 0 })
    expect(stats().pnp).toEqual({ played: 1, wins: 0, losses: 1, draws: 0 })
  })

  it('keeps the game menu available during a session', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByTestId } = utils

    await playThroughToRound(utils, 'CAT')

    // Whoever is holding the device can still change settings or start a different puzzle. Nothing
    // is locked and there's no exit affordance to find.
    expect(getByLabelText('Game Menu')).toBeTruthy()
    await fireEvent.press(getByLabelText('Game Menu'))
    expect(getByTestId('puzzle-drawer-panel').props.accessibilityViewIsModal).toBe(true)
  })

  it('leaves the session by starting a Random puzzle from the menu, with no confirmation', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, queryByText } = utils

    await playThroughToRound(utils, 'CAT')

    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'SOLO', mode: visualMode, sourceMode: 'random', packKey: 'p', packLabel: 'P', puzzleId: 'x', difficultyTier: 'easy' } })
    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Random'))

    // Straight back to a normal round - nothing to confirm, no pass-and-play surface left behind.
    expect(queryByText('Pick a word')).toBeNull()
    expect(getByLabelText('Secret word display')).toBeTruthy()
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('previews the puzzle live while composing: blanks grow and the difficulty updates per keystroke', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    // Defaults to Easy before anything's typed, rather than being absent - so the pill doesn't pop
    // into existence (and shift the layout below it) on the first valid keystroke.
    expect(getByLabelText('Difficulty: Easy')).toBeTruthy()

    // Few distinct letters means most of the alphabet is a miss, which is what makes a short word
    // hard in hangman - see scoreDifficulty in customPacks.ts.
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByLabelText('Secret word display')).toBeTruthy()

    // More distinct letters, so more guesses land: the same scorer calls this easy, and the readout
    // has to follow the typing rather than being computed once.
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'THE QUICK BROWN FOX')
    expect(getByLabelText('Difficulty: Easy')).toBeTruthy()
  })

  it('turns a typed hyphen or slash into a space, the same word break the board makes', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const { getByLabelText, getByText, getByTestId } = await renderApp()

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'Spider-Man')
    expect(getByTestId('pnp-answer-input').props.value).toBe('Spider Man')

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'Face/Off')
    expect(getByTestId('pnp-answer-input').props.value).toBe('Face Off')
  })

  it('carries the difficulty badge and pip row straight through Hand off, unchanged', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')

    // Both read from the exact same label text - not just "a difficulty badge exists on both
    // screens" - so a real drift between the preview's scoring and the session's would fail this.
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByLabelText('Wrong guesses: 0 of 6')).toBeTruthy()
    const boardBeforeHandoff = getByLabelText('Secret word display')

    await fireEvent.press(getByText('Next'))

    // Game is mounted from the moment composing itself begins, not the instant Hand off is
    // pressed (see Main.tsx's buildPnpDraftSession/effectiveSession) - this is the SAME board the
    // handoff dialog is now floating over, not a fresh screen with its own idea of what to show.
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByLabelText('Wrong guesses: 0 of 6')).toBeTruthy()
    // Same underlying instance, not merely equal-looking output from a fresh one - this is what
    // actually rules out the remount that used to flicker at Hand off, independent of whether the
    // data on either side of it happens to match.
    expect(getByLabelText('Secret word display')).toBe(boardBeforeHandoff)
  })

  it('shows the on-screen keyboard behind the prompt, not a dead gap where it would sit once play starts', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    expect(getByText('Q')).toBeTruthy()
  })

  it('keeps the game menu reachable during handoff', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.press(getByText('Next'))

    // The handoff dialog's own backdrop sits over the app bar too, but the app bar's hamburger is
    // its own button, wired straight to the menu regardless of what the dialog underneath it does
    // on dismiss - so the menu is reachable independent of the dialog's own dismiss behavior.
    await fireEvent.press(getByLabelText('Game Menu'))

    expect(getByTestId('puzzle-drawer-panel').props.accessibilityViewIsModal).toBe(true)
  })

  // The hand-off is the fleet's shared card (@tastic/hud's ConfirmDialog), which has no backdrop to
  // tap away: a stray touch while the device changes hands can't end it early, so Ready is the only
  // way into the round.
  it('starts the round only from Ready, with no backdrop that could dismiss the hand-off early', async () => {
    jest.useFakeTimers()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId, queryByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.press(getByText('Next'))

    expect(getByText('Your Turn')).toBeTruthy()
    expect(queryByTestId('dialog-backdrop')).toBeNull()

    await fireEvent.press(getByText('Ready'))
    await fireEvent.press(getByText('C'))
    await fireEvent.press(getByText('A'))
    await fireEvent.press(getByText('T'))

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You Won!')).toBeTruthy()

    jest.useRealTimers()
  })

  it('locks the board during handoff - the real round is mounted underneath, but not guessable until Ready', async () => {
    jest.useFakeTimers()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId, queryByText } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.press(getByText('Next'))

    // Solving it here would prove the board is only VISUALLY covered, not actually locked - the
    // on-screen Keyboard's own `disabled` state (see Game's `locked` prop) is what has to stop
    // this, since RTL presses call straight through the DOM/element tree rather than respecting
    // the handoff dialog's real stacking order.
    await fireEvent.press(getByText('C'))
    await fireEvent.press(getByText('A'))
    await fireEvent.press(getByText('T'))
    expect(queryByText('You Won!')).toBeNull()

    await fireEvent.press(getByText('Ready'))

    await fireEvent.press(getByText('C'))
    await fireEvent.press(getByText('A'))
    await fireEvent.press(getByText('T'))

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You Won!')).toBeTruthy()

    jest.useRealTimers()
  })

  it('titles the prompt to match the button that launched it', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    // getByText demands exactly one match: the drawer's OWN "Pass & Play" button is still mounted
    // behind this (PuzzleDrawer's Drawer translates rather than unmounts on close), but is hidden
    // from accessibility while closed, so it doesn't collide with the prompt's title bar here.
    expect(getByText('Pass & Play')).toBeTruthy()
  })

  it('steps the word prompt aside for the menu, and keeps the half-typed word through the round trip', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils
    const drawerPanel = () => getByTestId('puzzle-drawer-panel', { includeHiddenElements: true })

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'BANANA BREAD')
    await fireEvent.changeText(getByTestId('pnp-hint-input'), 'Breakfast loaf')
    // Hidden before the menu opens, so the word stays hidden when the prompt comes back: the prompt
    // stays mounted behind the menu, keeping its show/hide toggle.
    await fireEvent.press(getByLabelText('Hide solution'))
    expect(getByTestId('pnp-answer-input').props.secureTextEntry).toBe(true)

    // Closing means "let me at the menu": the one interpretation that isn't surprising, and the
    // way out of pass and play (start a Random puzzle from there).
    await fireEvent.press(getByLabelText('Close'))
    expect(drawerPanel().props.accessibilityViewIsModal).toBe(true)

    // Closing the menu brings the prompt back with the word intact - the component stays mounted
    // while hidden, so nothing typed is thrown away for opening the menu.
    await fireEvent.press(getByLabelText('Close'))
    expect(getByTestId('pnp-answer-input').props.value).toBe('BANANA BREAD')
    expect(getByTestId('pnp-hint-input').props.value).toBe('Breakfast loaf')
    expect(getByTestId('pnp-answer-input').props.secureTextEntry).toBe(true)
    expect(getByLabelText('Show solution')).toBeTruthy()
    // And the preview behind it is still tracking that word.
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
  })

  it('leaves pass and play entirely by starting a Random puzzle from the menu, opened via the close ✕', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId, queryByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')

    // The corner ✕ means "let me at the menu", never anything to the round itself.
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'SOLO', mode: visualMode, sourceMode: 'random', packKey: 'p', packLabel: 'P', puzzleId: 'x', difficultyTier: 'easy' } })
    await fireEvent.press(getByLabelText('Close'))
    await fireEvent.press(getByText('Random'))

    // Composing is behind us and a real round is on screen.
    expect(queryByTestId('pnp-answer-input')).toBeNull()
    expect(getByLabelText('Secret word display')).toBeTruthy()
  })

  it('does not save the authored word anywhere by default - Keep this word starts off', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    expect(getByLabelText('Keep this word').props.value).toBe(false)

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.press(getByText('Next'))

    expect(mockAddCustomPuzzle).not.toHaveBeenCalled()
  })

  it('saves the authored word and hint to the Pass & Play pack once Keep this word is switched on before Hand off', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))
    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT')
    await fireEvent.changeText(getByTestId('pnp-hint-input'), 'A pet')
    await fireEvent(getByLabelText('Keep this word'), 'valueChange', true)
    await fireEvent.press(getByText('Next'))

    // The RAW typed hint, not the resolved/normalized payload - matches what Main.tsx's
    // handlePnpAuthored actually passes to addCustomPuzzle. Second arg is the dedicated pass-and-
    // play pack label, not the general Custom one.
    expect(mockAddCustomPuzzle).toHaveBeenCalledWith({ answer: 'CAT', hint: 'A pet' }, 'Pass & Play')
  })

  it('rejects a character that is not a letter or space, and toasts about it rather than silently dropping it', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: pnpPayload('CAT') })
    const utils = await renderApp()
    const { getByLabelText, getByText, getByTestId, findByText } = utils

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & Play'))

    await fireEvent.changeText(getByTestId('pnp-answer-input'), 'CAT!')

    // Rejected at the source, not just at normalize-time - otherwise the field would show "CAT!"
    // while the preview behind it silently showed blanks for "CAT", which is its own confusing
    // inconsistency distinct from the missing feedback.
    expect(getByTestId('pnp-answer-input').props.value).toBe('CAT')
    expect(await findByText('Only Letters and Spaces')).toBeTruthy()
  })
})
