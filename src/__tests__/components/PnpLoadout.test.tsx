import { type Profile, profilesActions } from '@tastic/profile'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler, View } from 'react-native'

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
  store.dispatch(profilesActions.setAll([]))
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

// Each seat's picker, once there's a profile on the roster: who sits there, a guest or a profile.
describe('PnpLoadout - seating profiles', () => {
  const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'AL', createdAt: 1, updatedAt: 1 }
  const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'BO', createdAt: 2, updatedAt: 2 }
  const players = () => session().players
  // A seat's popover only shows once hud's useAutoAlign has measured its trigger, and the jest
  // preset's View never answers measureInWindow: this one does, from near the page's top left.
  let measure: jest.SpyInstance
  beforeEach(() => {
    store.dispatch(profilesActions.setAll([ALICE, BOB]))
    measure = jest.spyOn(View.prototype as unknown as { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }, 'measureInWindow').mockImplementation((callback) => callback(80, 160, 120, 28))
  })
  afterEach(() => {
    measure.mockRestore()
  })

  type Screen = Awaited<ReturnType<typeof renderLoadout>>
  // A seat's trigger is the name of whoever sits there, as the fleet's pickers write it.
  const openSeat = (screen: Screen, name: string) => fireEvent.press(screen.getByLabelText(name.toUpperCase()))
  const pick = async (screen: Screen, seatName: string, row: string) => {
    await openSeat(screen, seatName)
    await fireEvent.press(screen.getByText(row))
  }

  it('keeps every seat a plain guest row with nobody on the roster', async () => {
    store.dispatch(profilesActions.setAll([]))
    const { queryByLabelText, getByText } = await renderLoadout()

    expect(getByText('Player 1')).toBeTruthy()
    expect(queryByLabelText('PLAYER 1')).toBeNull()
  })

  it('gives every seat a picker named for who sits there: Guest, every profile, then Manage', async () => {
    const screen = await renderLoadout()

    expect(screen.getByLabelText('PLAYER 1')).toBeTruthy()
    expect(screen.getByLabelText('PLAYER 2')).toBeTruthy()
    await openSeat(screen, 'Player 2')

    expect(screen.getByText('Guest')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Manage')).toBeTruthy()
  })

  it("seats a profile under its own name and chip, with no rename, keeping the seat's turn", async () => {
    const screen = await renderLoadout()

    await pick(screen, 'Player 2', 'Alice')

    expect(players()[1]).toEqual({ id: 'p2', name: 'Alice', profileId: ALICE.id })
    expect(session()).toMatchObject({ writerId: 'p1', guesserId: 'p2' })
    expect(screen.getByLabelText('ALICE')).toBeTruthy()
    expect(screen.getByText('AL')).toBeTruthy()
    expect(screen.queryByLabelText('Rename Alice')).toBeNull()
    expect(screen.getByLabelText('Rename Player 1')).toBeTruthy()
    // The popover closed with the pick.
    expect(screen.queryByText('Manage')).toBeNull()
  })

  it('sits a profile in one seat at most', async () => {
    const screen = await renderLoadout()
    await pick(screen, 'Player 2', 'Alice')

    await pick(screen, 'Player 1', 'Alice')

    expect(players().map((player) => player.profileId)).toEqual([null, ALICE.id])
    // Still open: a taken profile's row does nothing.
    expect(screen.getByText('Manage')).toBeTruthy()
  })

  it("hands a seat back to a guest from Guest, under its own seat's Player N", async () => {
    store.dispatch(roundActions.renamePnpPlayer({ id: 'p2', name: 'Grandma' }))
    const screen = await renderLoadout()
    await pick(screen, 'Grandma', 'Bob')

    await pick(screen, 'Bob', 'Guest')

    expect(players()[1]).toEqual({ id: 'p2', name: 'Player 2', profileId: null })
    expect(screen.getByLabelText('PLAYER 2')).toBeTruthy()
    expect(screen.getByLabelText('Rename Player 2')).toBeTruthy()
  })

  it("gives a guest going by the profile's name their seat's guest name", async () => {
    store.dispatch(roundActions.renamePnpPlayer({ id: 'p1', name: 'alice' }))
    const screen = await renderLoadout()

    await pick(screen, 'Player 2', 'Alice')

    expect(players().map((player) => player.name)).toEqual(['Player 1', 'Alice'])
  })

  it("won't let a guest be renamed to a seated profile's name", async () => {
    const screen = await renderLoadout()
    await pick(screen, 'Player 2', 'Alice')

    await fireEvent.press(screen.getByLabelText('Rename Player 1'))
    await fireEvent.changeText(screen.getByTestId('player-name-input'), 'ALICE')

    expect(screen.getByText('Another player has this name')).toBeTruthy()
    await fireEvent.press(screen.getByText('Save'))
    expect(players()[0].name).toBe('Player 1')
  })

  // A seat's standing belongs to the seat: whoever sits there next carries it on.
  it('asks before switching who sits in a seat with a standing, saying who takes it over, and keeps it on Cancel', async () => {
    winRound()
    const screen = await renderLoadout()

    await pick(screen, 'Player 2', 'Bob')

    expect(screen.getByText('Switch to Bob?')).toBeTruthy()
    expect(screen.getByText("Bob takes over Player 2's standing this session: 1 of 1 solved.")).toBeTruthy()
    expect(players()[1].profileId).toBeNull()

    await fireEvent.press(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByText('Switch to Bob?')).toBeNull())
    expect(players()[1].profileId).toBeNull()

    await pick(screen, 'Player 2', 'Bob')
    await fireEvent.press(screen.getByText('Switch'))

    expect(players()[1]).toEqual({ id: 'p2', name: 'Bob', profileId: BOB.id })
    expect(session().standings).toEqual({ p2: { played: 1, wins: 1 } })
  })

  it("names the seat's next guest in the confirm when handing a seat with a standing back to a guest", async () => {
    store.dispatch(roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: BOB.id, name: BOB.name } }))
    winRound()
    const screen = await renderLoadout()

    await pick(screen, 'Bob', 'Guest')

    expect(screen.getByText('Switch to Player 2?')).toBeTruthy()
    expect(screen.getByText("Player 2 takes over Bob's standing this session: 1 of 1 solved.")).toBeTruthy()
  })

  it('switches a seat that has played nothing straight away', async () => {
    winRound()
    const screen = await renderLoadout()

    await pick(screen, 'Player 1', 'Alice')

    expect(screen.queryByText('Switch to Alice?')).toBeNull()
    expect(players()[0].profileId).toBe(ALICE.id)
  })

  it('opens the Profiles screen from Manage', async () => {
    const screen = await renderLoadout()

    await pick(screen, 'Player 1', 'Manage')

    expect(router.push).toHaveBeenCalledWith('/profiles')
    expect(screen.queryByText('Manage')).toBeNull()
  })

  it('closes on a press away', async () => {
    const screen = await renderLoadout()
    await openSeat(screen, 'Player 1')

    await fireEvent.press(screen.getByLabelText('Dismiss'))

    expect(screen.queryByText('Manage')).toBeNull()
  })

  it('closes an open seat picker on Android back first, then goes back', async () => {
    const screen = await renderLoadout()
    await openSeat(screen, 'Player 1')

    await pressBack()
    expect(screen.queryByText('Manage')).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()

    await pressBack()
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it('cancels the switch confirm on Android back, leaving the seat as it was', async () => {
    winRound()
    const screen = await renderLoadout()
    await pick(screen, 'Player 2', 'Bob')

    await pressBack()

    await waitFor(() => expect(screen.queryByText('Switch to Bob?')).toBeNull())
    expect(players()[1].profileId).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("shows each seated profile's chip and roster name in the standings", async () => {
    store.dispatch(roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: BOB.id, name: BOB.name } }))
    winRound()
    store.dispatch(profilesActions.update({ id: BOB.id, patch: { name: 'Bobby' } }))
    const { getByTestId } = await renderLoadout()

    const standings = within(getByTestId('pnp-standings'))
    expect(standings.getAllByLabelText(/solved|guessed/).map((entry) => entry.props.accessibilityLabel)).toEqual(['Bobby: 1 of 1 solved, 100%', 'Player 1: no words guessed yet'])
    expect(standings.getByText('BO')).toBeTruthy()
    expect(standings.getAllByTestId('player-mark-slot')).toHaveLength(1)
  })
})
