import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler } from 'react-native'

import { LoadoutScreen } from '@/components/LoadoutScreen'
import { Providers } from '@/components/Providers'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { roundActions, type SavedPuzzle } from '@/redux/roundSlice'
import { store } from '@/redux/store'

// The Pass & Play loadout's own rows: the players at the table and the session's standings. Its
// Continue, New Session and Keep Each Word are covered with the game screen in PnpFlow.test.tsx.

const session = () => store.getState().round.pnp.session
const names = () => session().players.map((player) => player.name)
const CAT: SavedPuzzle = { phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'custom', difficultyTier: 'hard' }

// A word in play for the current pick, and the same round won and counted.
const putWordInPlay = () => {
  store.dispatch(roundActions.startPnpAuthoring())
  store.dispatch(roundActions.setPnpWord(CAT))
  store.dispatch(roundActions.startPnpPlaying())
}
const winRound = () => {
  putWordInPlay()
  store.dispatch(roundActions.savePnpProgress({ guessedLetters: ['C', 'A', 'T'], hintRevealed: false }))
  store.dispatch(roundActions.recordPnpResult({ roundId: store.getState().round.pnp.id, result: 'win' }))
  store.dispatch(roundActions.startPnpAuthoring())
}

// Android's back button: the newest listener first, stopping at the first that handles it.
type BackListener = () => boolean | null | undefined
let backListeners: BackListener[] = []
let addBackListener: jest.SpyInstance
const pressBack = () =>
  act(async () => {
    for (const listener of [...backListeners].reverse()) if (listener()) return
  })

beforeEach(() => {
  jest.clearAllMocks()
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

const renderLoadout = () =>
  render(
    <Providers>
      <LoadoutScreen mode='pnp' />
    </Providers>
  )

describe('PnpLoadout - players', () => {
  it('seats two guests to start, neither removable, with room to add more', async () => {
    const { getByText, queryByLabelText, getByLabelText } = await renderLoadout()

    expect(getByText('Players')).toBeTruthy()
    expect(getByText('Player 1')).toBeTruthy()
    expect(getByText('Player 2')).toBeTruthy()
    expect(getByLabelText('Rename Player 1')).toBeTruthy()
    expect(queryByLabelText('Remove Player 1')).toBeNull()
    expect(queryByLabelText('Remove Player 2')).toBeNull()
    expect(getByText('Add Player')).toBeTruthy()
    expect(getByText('Up to 8 players')).toBeTruthy()
  })

  it('adds players up to eight, then offers no more', async () => {
    const { getByText, queryByText, getByLabelText } = await renderLoadout()

    await fireEvent.press(getByText('Add Player'))
    expect(names()).toEqual(['Player 1', 'Player 2', 'Player 3'])
    expect(getByText('Player 3')).toBeTruthy()
    // With three, any one of them can go.
    expect(getByLabelText('Remove Player 1')).toBeTruthy()

    for (let i = 0; i < 5; i++) await fireEvent.press(getByText('Add Player'))
    expect(names()).toHaveLength(8)
    expect(queryByText('Add Player')).toBeNull()
  })

  it('renames a player from the row or its pencil, keeping their seat', async () => {
    const { getByTestId, getByText, getByLabelText, queryByTestId } = await renderLoadout()

    await fireEvent.press(getByText('Player 2'))
    expect(getByTestId('player-name-input').props.value).toBe('Player 2')
    await fireEvent.changeText(getByTestId('player-name-input'), 'Bo')
    await fireEvent.press(getByText('Save'))

    expect(session().players[1]).toEqual({ id: 'p2', name: 'Bo', profileId: null })
    expect(queryByTestId('player-name-input')).toBeNull()

    await fireEvent.press(getByLabelText('Rename Player 1'))
    expect(getByTestId('player-name-input').props.value).toBe('Player 1')
    await fireEvent.changeText(getByTestId('player-name-input'), 'Ann')
    await fireEvent(getByTestId('player-name-input'), 'submitEditing')

    expect(names()).toEqual(['Ann', 'Bo'])
    expect(getByText('Ann')).toBeTruthy()
  })

  it('closes the name dialog on Android back without renaming, before back leaves the page', async () => {
    const { getByTestId, getByText, queryByTestId } = await renderLoadout()

    await fireEvent.press(getByText('Player 2'))
    await fireEvent.changeText(getByTestId('player-name-input'), 'Bo')
    await pressBack()

    expect(queryByTestId('player-name-input')).toBeNull()
    expect(names()).toEqual(['Player 1', 'Player 2'])
    expect(router.replace).not.toHaveBeenCalled()

    await pressBack()
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it("removes a player who'd take nothing with them straight away", async () => {
    store.dispatch(roundActions.addPnpPlayer())
    const { getByLabelText, queryByText } = await renderLoadout()

    await fireEvent.press(getByLabelText('Remove Player 3'))

    expect(names()).toEqual(['Player 1', 'Player 2'])
    expect(queryByText('Remove Player 3?')).toBeNull()
    expect(queryByText('Player 3')).toBeNull()
  })

  it('asks first when their standing would go with them, and keeps them on Cancel', async () => {
    store.dispatch(roundActions.addPnpPlayer())
    winRound()
    const { getByLabelText, getByText, queryByText } = await renderLoadout()

    await fireEvent.press(getByLabelText('Remove Player 2'))
    expect(getByText('Remove Player 2?')).toBeTruthy()
    expect(getByText('Their standing this session goes with them.')).toBeTruthy()

    await fireEvent.press(getByText('Cancel'))
    expect(names()).toEqual(['Player 1', 'Player 2', 'Player 3'])
    await waitFor(() => expect(queryByText('Remove Player 2?')).toBeNull())

    await fireEvent.press(getByLabelText('Remove Player 2'))
    await fireEvent.press(getByText('Remove'))
    expect(names()).toEqual(['Player 1', 'Player 3'])
    expect(session().standings).toEqual({})
  })

  it('asks first when the word waiting on the board would go too', async () => {
    store.dispatch(roundActions.addPnpPlayer())
    putWordInPlay()
    const { getByLabelText, getByText } = await renderLoadout()

    await fireEvent.press(getByLabelText('Remove Player 1'))
    expect(getByText('The word waiting on the board goes too.')).toBeTruthy()

    await fireEvent.press(getByText('Remove'))
    expect(names()).toEqual(['Player 2', 'Player 3'])
    expect(store.getState().round.pnp).toMatchObject({ phase: 'authoring', puzzle: null })
  })
})

describe('PnpLoadout - standings', () => {
  it('shows none before a round has been played', async () => {
    const { queryByText, queryByTestId } = await renderLoadout()

    expect(queryByText('Standings')).toBeNull()
    expect(queryByTestId('pnp-standings')).toBeNull()
  })

  it("ranks the session's players by win rate once a round has been played, with their rates", async () => {
    store.dispatch(roundActions.addPnpPlayer())
    winRound()
    const { getByText, getByTestId } = await renderLoadout()

    expect(getByText('Standings')).toBeTruthy()
    const standings = within(getByTestId('pnp-standings'))
    expect(standings.getAllByLabelText(/solved|guessed/).map((entry) => entry.props.accessibilityLabel)).toEqual(['Player 2: 1 of 1 solved, 100%', 'Player 1: no words guessed yet', 'Player 3: no words guessed yet'])
  })
})
