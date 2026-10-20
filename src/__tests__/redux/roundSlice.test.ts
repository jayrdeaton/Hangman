import { type Profile, profilesActions } from '@tastic/profile'

import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import reducer, { initialRoundState, roundActions, type RoundState, type SavedPuzzle, selectSoloRound } from '@/redux/roundSlice'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'
import { createDefaultPnpSession, type PnpSession } from '@/utils/pnpSession'

type RoundAction = Parameters<typeof reducer>[1]

const OTHER = 'profile-a'
const puzzle = (overrides: Partial<SavedPuzzle> = {}): SavedPuzzle => ({ phrase: 'HELLO WORLD', modeId: 'classic', sourceMode: 'random', ...overrides })
const run = (actions: RoundAction[], state: RoundState = initialRoundState): RoundState => actions.reduce<RoundState>((next, action) => reducer(next, action), state)
const startSolo = (overrides: Partial<SavedPuzzle> = {}, playerKey = GUEST_PLAYER_KEY) => roundActions.startSolo({ playerKey, puzzle: puzzle(overrides) })
const saveSolo = (guessedLetters: string[], hintRevealed = false, playerKey = GUEST_PLAYER_KEY) => roundActions.saveSoloProgress({ playerKey, guessedLetters, hintRevealed })
const guest = (state: RoundState) => selectSoloRound(state, GUEST_PLAYER_KEY)

// The guest's solo round mid-game and a Pass & Play round mid-game, to check each action leaves the
// other alone.
const midGame = (): RoundState => run([startSolo({ phrase: 'SOLO WORD', packKey: 'phrases', puzzleId: 'phrases:1' }), saveSolo(['S', 'Z'], true), roundActions.startPnpAuthoring(), roundActions.setPnpWord(puzzle({ phrase: 'PASS WORD', sourceMode: 'custom' })), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['P', 'Q'], hintRevealed: true })])

describe('roundSlice', () => {
  it('starts with no solo rounds, an empty Pass & Play round for a fresh two-guest session and no game open', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({
      solo: {},
      pnp: { id: 0, puzzle: null, guessedLetters: [], hintRevealed: false, phase: null, session: createDefaultPnpSession() },
      activeMode: null,
      activeDoor: null
    })
  })

  it('reads a player with no solo round saved as an empty one, the same object every time', () => {
    expect(guest(initialRoundState)).toEqual({ id: 0, puzzle: null, guessedLetters: [], hintRevealed: false })
    expect(selectSoloRound(initialRoundState, OTHER)).toBe(guest(initialRoundState))
  })
})

describe('the solo round', () => {
  it('startSolo puts the puzzle on the board under the next id, with no guesses or hint', () => {
    const before = midGame()
    const next = reducer(before, startSolo({ phrase: 'NEW ONE' }))

    expect(guest(next)).toEqual({ id: guest(before).id + 1, puzzle: puzzle({ phrase: 'NEW ONE' }), guessedLetters: [], hintRevealed: false })
  })

  // Game is keyed on the id, so the same phrase twice in a row still has to remount it.
  it('startSolo bumps the id even for the same puzzle twice in a row', () => {
    const first = reducer(initialRoundState, startSolo())
    const second = reducer(first, startSolo())

    expect(guest(first).id).toBe(1)
    expect(guest(second).id).toBe(2)
  })

  it('clearSolo empties the board under the next id', () => {
    const before = midGame()
    const next = reducer(before, roundActions.clearSolo(GUEST_PLAYER_KEY))

    expect(guest(next)).toEqual({ id: guest(before).id + 1, puzzle: null, guessedLetters: [], hintRevealed: false })
  })

  it('saveSoloProgress saves the guesses and hint on the same round, without a new id', () => {
    const before = run([startSolo()])
    const next = reducer(before, saveSolo(['H', 'X'], true))

    expect(guest(next)).toEqual({ ...guest(before), guessedLetters: ['H', 'X'], hintRevealed: true })
  })

  // Nothing to save the guesses onto: a stray save never makes up a round.
  it('saveSoloProgress is a no-op for a player with no round', () => {
    expect(reducer(initialRoundState, saveSolo(['H']))).toBe(initialRoundState)
  })

  it('never touches the Pass & Play round or the open game', () => {
    const before = run([roundActions.setActiveMode('solo')], midGame())
    const next = run([startSolo(), saveSolo(['A']), roundActions.clearSolo(GUEST_PLAYER_KEY)], before)

    expect(next.pnp).toEqual(before.pnp)
    expect(next.activeMode).toBe('solo')
  })
})

describe("each player's own solo round", () => {
  it("keeps every player's round, ids and guesses apart", () => {
    const next = run([startSolo({ phrase: 'GUEST WORD' }), saveSolo(['G']), startSolo({ phrase: 'OTHER WORD' }, OTHER), startSolo({ phrase: 'OTHER AGAIN' }, OTHER), saveSolo(['O', 'Z'], true, OTHER)])

    expect(guest(next)).toEqual({ id: 1, puzzle: puzzle({ phrase: 'GUEST WORD' }), guessedLetters: ['G'], hintRevealed: false })
    expect(selectSoloRound(next, OTHER)).toEqual({ id: 2, puzzle: puzzle({ phrase: 'OTHER AGAIN' }), guessedLetters: ['O', 'Z'], hintRevealed: true })
  })

  it("clearSolo and removeSolo touch only that player's round", () => {
    const before = run([startSolo({ phrase: 'GUEST WORD' }), startSolo({ phrase: 'OTHER WORD' }, OTHER)])

    expect(reducer(before, roundActions.clearSolo(OTHER)).solo[GUEST_PLAYER_KEY]).toEqual(before.solo[GUEST_PLAYER_KEY])
    expect(reducer(before, roundActions.removeSolo(OTHER)).solo).toEqual({ [GUEST_PLAYER_KEY]: before.solo[GUEST_PLAYER_KEY] })
  })
})

// Jay, 2026-10-20: a puzzle from a pack just switched off, never tried, was still what Ready picked up.
describe("a player's new packs or difficulty", () => {
  const nhl = (overrides: Partial<SavedPuzzle> = {}, playerKey = GUEST_PLAYER_KEY) => startSolo({ packKey: 'sports-nhl', puzzleId: 'nhl:1', difficultyTier: 'hard', ...overrides }, playerKey)
  const setPacks = (packKeys: string[] | null, playerKey = GUEST_PLAYER_KEY) => playerSettingsActions.setPackKeys({ playerKey, packKeys })
  const setDifficulty = (difficulty: 'any' | 'easy' | 'medium' | 'hard', playerKey = GUEST_PLAYER_KEY) => playerSettingsActions.setDifficulty({ playerKey, difficulty })

  it('drops an untouched round whose pack is no longer picked, under the next id, so Ready draws one from the new picks', () => {
    const before = run([nhl()])
    const next = reducer(before, setPacks(['animals']))

    expect(guest(next)).toEqual({ id: guest(before).id + 1, puzzle: null, guessedLetters: [], hintRevealed: false })
  })

  it('drops an untouched round of another difficulty, the hint opened or not', () => {
    const before = run([nhl(), saveSolo([], true)])

    expect(guest(reducer(before, setDifficulty('easy'))).puzzle).toBeNull()
  })

  it.each([
    ['its pack still picked', setPacks(['animals', 'sports-nhl'])],
    ['every pack picked', setPacks(null)],
    ['its own difficulty', setDifficulty('hard')],
    ['any difficulty', setDifficulty('any')]
  ])('keeps an untouched round with %s', (_label, action) => {
    const before = run([nhl()])

    expect(reducer(before, action)).toBe(before)
  })

  it('keeps a round with a guess on it for the player to finish', () => {
    const before = run([nhl(), saveSolo(['E'])])

    expect(guest(run([setPacks(['animals']), setDifficulty('easy')], before))).toEqual(guest(before))
  })

  it('never pulls the round out from under an open board', () => {
    const before = run([nhl(), roundActions.setActiveMode('solo')])

    expect(run([setPacks(['animals']), setDifficulty('easy')], before)).toBe(before)
  })

  // No pack drew it.
  it('keeps a shared puzzle', () => {
    const before = run([startSolo({ sourceMode: 'custom' })])

    expect(run([setPacks(['animals']), setDifficulty('easy')], before)).toBe(before)
  })

  it("touches only that player's round", () => {
    const before = run([nhl(), nhl({}, OTHER)])
    const next = reducer(before, setPacks(['animals'], OTHER))

    expect(guest(next)).toEqual(guest(before))
    expect(selectSoloRound(next, OTHER).puzzle).toBeNull()
  })
})

// A forgotten profile (usePlayerData's forgetPlayer): their Pass & Play seats stay at the table as guests.
describe('clearPnpProfile', () => {
  it('turns every seat holding that profile into a guest named for the seat, keeping the standings and the turn', () => {
    const base = midGame()
    const players = base.pnp.session.players.map((player, index) => ({ ...player, profileId: index === 0 ? OTHER : 'profile-b' }))
    const before: RoundState = { ...base, pnp: { ...base.pnp, session: { ...base.pnp.session, players, standings: { [players[0].id]: { played: 2, wins: 1 } } } } }

    const next = reducer(before, roundActions.clearPnpProfile(OTHER))

    expect(next.pnp.session.players).toEqual([{ ...players[0], profileId: null }, players[1]])
    expect(next.pnp.session.standings).toEqual(before.pnp.session.standings)
    expect({ writerId: next.pnp.session.writerId, guesserId: next.pnp.session.guesserId }).toEqual({ writerId: before.pnp.session.writerId, guesserId: before.pnp.session.guesserId })
    expect(next.pnp.puzzle).toEqual(before.pnp.puzzle)
  })

  it('changes nothing when no seat holds that profile', () => {
    const before = midGame()

    expect(reducer(before, roundActions.clearPnpProfile(OTHER))).toEqual(before)
  })

  // Guests are named by seat, whatever name the profile had.
  it("names the seat's guest for its number", () => {
    const seatTwo = (state: RoundState) => state.pnp.session.players[1]
    const before = run([roundActions.setPnpSeatProfile({ id: 'p1', profile: { id: OTHER, name: 'Sam' } }), roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: 'profile-b', name: 'Sam' } })])
    expect(seatTwo(before)).toEqual({ id: 'p2', name: 'Sam', profileId: 'profile-b' })

    const next = reducer(before, roundActions.clearPnpProfile('profile-b'))

    expect(seatTwo(next)).toEqual({ id: 'p2', name: 'Player 2', profileId: null })
    expect(next.pnp.session.players[0]).toEqual({ id: 'p1', name: 'Sam', profileId: OTHER })
  })
})

// Who sits in each Pass & Play seat: a guest, or a profile from the roster.
describe('setPnpSeatProfile', () => {
  const ALICE = { id: OTHER, name: 'Alice' }
  const players = (state: RoundState) => state.pnp.session.players
  const seat = (id: string, profile: { id: string; name: string } | null) => roundActions.setPnpSeatProfile({ id, profile })

  it("seats a profile under the profile's name, keeping the seat's id, standing and turn", () => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(puzzle({ phrase: 'CAT', sourceMode: 'custom' })), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['C', 'A', 'T'], hintRevealed: false }), roundActions.recordPnpResult({ roundId: 1, result: 'win' })])
    const next = reducer(before, seat('p2', ALICE))

    expect(players(next)).toEqual([
      { id: 'p1', name: 'Player 1', profileId: null },
      { id: 'p2', name: 'Alice', profileId: OTHER }
    ])
    expect(next.pnp.session.standings).toEqual({ p2: { played: 1, wins: 1 } })
    expect({ writerId: next.pnp.session.writerId, guesserId: next.pnp.session.guesserId, recordedRoundId: next.pnp.session.recordedRoundId }).toEqual({ writerId: 'p1', guesserId: 'p2', recordedRoundId: 1 })
    expect(next.pnp.puzzle).toEqual(before.pnp.puzzle)
  })

  it("hands a seat back to a guest under its own number's Player N", () => {
    const next = run([roundActions.addPnpPlayer(), seat('p2', ALICE), seat('p2', null)])

    expect(players(next)[1]).toEqual({ id: 'p2', name: 'Player 2', profileId: null })
  })

  // Their chips tell them apart (Jay, 2026-10-18: guests go by their seats, with no renaming).
  it("lets a guest share a seated profile's name", () => {
    const next = run([seat('p1', { id: OTHER, name: 'Player 2' })])

    expect(players(next).map((player) => player.name)).toEqual(['Player 2', 'Player 2'])
  })

  it('swaps one profile for another in a seat', () => {
    const next = run([seat('p1', ALICE), seat('p1', { id: 'profile-b', name: 'Bob' })])

    expect(players(next)[0]).toEqual({ id: 'p1', name: 'Bob', profileId: 'profile-b' })
  })

  it.each([
    ['a seat that is not at the table', seat('p9', ALICE)],
    ['the profile already in that seat', seat('p1', ALICE)],
    ['a profile seated elsewhere', seat('p2', ALICE)],
    ['a profile id that could not be a player', seat('p2', { id: 'bad:id', name: 'Eve' })],
    ["a guest's key as a profile id", seat('p2', { id: GUEST_PLAYER_KEY, name: 'Eve' })],
    ["a guest seat's key as a profile id", seat('p2', { id: guestSeatKey('p1'), name: 'Eve' })],
    ['a name that tidies to nothing', seat('p2', { id: 'profile-e', name: '   ' })]
  ])('changes nothing for %s', (_label, action) => {
    const before = run([seat('p1', ALICE)])

    expect(reducer(before, action)).toBe(before)
  })

  it('changes nothing for a guest handed back to a guest', () => {
    expect(reducer(initialRoundState, seat('p1', null))).toBe(initialRoundState)
  })

  it('adds a new seat named for where it sits', () => {
    const next = run([seat('p1', { id: OTHER, name: 'Player 3' }), roundActions.addPnpPlayer()])

    expect(players(next)[2]).toEqual({ id: 'p3', name: 'Player 3', profileId: null })
  })
})

// The seat the loadout shows, and where the table's words come from.
describe('focusPnpSeat and setPnpSource', () => {
  it('focuses a seat at the table', () => {
    const next = run([roundActions.addPnpPlayer(), roundActions.focusPnpSeat('p3')])

    expect(next.pnp.session.focusedId).toBe('p3')
  })

  it('changes nothing for a seat not at the table', () => {
    expect(reducer(initialRoundState, roundActions.focusPnpSeat('p9'))).toBe(initialRoundState)
  })

  it('switches the word source, touching nothing else', () => {
    const before = midGame()
    const next = reducer(before, roundActions.setPnpSource('packs'))

    expect(next.pnp.session.source).toBe('packs')
    expect({ ...next.pnp, session: { ...next.pnp.session, source: 'write' } }).toEqual(before.pnp)
    expect(next.solo).toBe(before.solo)
  })
})

// The seats keep their profiles' names in step with the roster, however it changes.
describe("the roster's names", () => {
  const profile = (id: string, name: string): Profile => ({ id, name, color: '#9c27b0', tag: '', createdAt: 1, updatedAt: 1 })
  const players = (state: RoundState) => state.pnp.session.players
  const seated = (): RoundState => run([roundActions.addPnpPlayer(), roundActions.setPnpSeatProfile({ id: 'p1', profile: { id: OTHER, name: 'Alice' } })])
  // @tastic/profile's actions, as the store hands them to this reducer.
  const fromRoster = ({ type, payload }: { type: string; payload: unknown }): RoundAction => ({ type, payload })

  it('follows a rename on the Profiles screen', () => {
    const next = reducer(seated(), fromRoster(profilesActions.update({ id: OTHER, patch: { name: 'Ally' } })))

    expect(players(next).map((player) => player.name)).toEqual(['Ally', 'Player 2', 'Player 3'])
  })

  it('follows a roster brought in from another game', () => {
    const next = reducer(seated(), fromRoster(profilesActions.setAll([profile(OTHER, 'Alicia')])))

    expect(players(next)[0]).toEqual({ id: 'p1', name: 'Alicia', profileId: OTHER })
  })

  it("changes nothing when no seated profile's name moved, or for a profile on no seat", () => {
    const before = seated()

    expect(reducer(before, fromRoster(profilesActions.setAll([profile(OTHER, 'Alice'), profile('profile-b', 'Bob')])))).toBe(before)
    expect(reducer(before, fromRoster(profilesActions.update({ id: OTHER, patch: { color: '#000000' } })))).toBe(before)
    expect(reducer(before, fromRoster(profilesActions.update({ id: 'profile-b', patch: { name: 'Bobby' } })))).toBe(before)
  })

  // Forgetting it is ProfilesProvider's (clearPnpProfile, through forgetPlayer).
  it("leaves a seat whose profile isn't on the roster brought in", () => {
    const before = seated()

    expect(reducer(before, fromRoster(profilesActions.setAll([])))).toBe(before)
  })
})

describe('the Pass & Play round', () => {
  it('startPnpAuthoring opens a blank board for the next word under the next id, keeping the session', () => {
    const before = midGame()
    const next = reducer(before, roundActions.startPnpAuthoring())

    expect(next.pnp).toEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', session: before.pnp.session })
  })

  // Game has been drawing this word live since composing began, so finalizing it must not remount it.
  it('setPnpWord keeps the id, sets the word with no guesses or hint, and hands off', () => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.savePnpProgress({ guessedLetters: ['A'], hintRevealed: true })])
    const next = reducer(before, roundActions.setPnpWord(puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' })))

    expect(next.pnp).toEqual({ id: before.pnp.id, puzzle: puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' }), guessedLetters: [], hintRevealed: false, phase: 'handoff', session: before.pnp.session })
  })

  it('setPnpDraft saves the word and hint being typed on the same round, without a new id', () => {
    const before = run([roundActions.startPnpAuthoring()])
    const next = reducer(before, roundActions.setPnpDraft({ answer: 'CAT', hint: 'A pet' }))

    expect(next.pnp).toEqual({ ...before.pnp, draft: { answer: 'CAT', hint: 'A pet' } })
  })

  it('setPnpDraft keeps a draft while either field has something in it', () => {
    const answerOnly = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' })])
    const hintOnly = run([roundActions.setPnpDraft({ answer: '', hint: 'A pet' })], answerOnly)

    expect(answerOnly.pnp.draft).toEqual({ answer: 'CAT', hint: '' })
    expect(hintOnly.pnp.draft).toEqual({ answer: '', hint: 'A pet' })
  })

  // Only present while there's something typed, so a cleared prompt saves the same round as no prompt.
  it('setPnpDraft removes the draft once both fields are empty', () => {
    const before = run([roundActions.startPnpAuthoring()])
    const next = run([roundActions.setPnpDraft({ answer: 'CAT', hint: 'A pet' }), roundActions.setPnpDraft({ answer: '', hint: '' })], before)

    expect(next.pnp).toStrictEqual(before.pnp)
    expect(next.pnp).not.toHaveProperty('draft')
  })

  // The same state object back, so the persisted round isn't rewritten for nothing.
  it('setPnpDraft is a no-op with nothing typed and no draft saved', () => {
    const before = run([roundActions.startPnpAuthoring()])

    expect(reducer(before, roundActions.setPnpDraft({ answer: '', hint: '' }))).toBe(before)
  })

  // The word is real now: the draft it came from would only bring a stale prompt back.
  it('setPnpWord drops the draft as it hands off', () => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'Secret', hint: 'Shh' })])
    const next = reducer(before, roundActions.setPnpWord(puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' })))

    expect(next.pnp).toStrictEqual({ id: before.pnp.id, puzzle: puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' }), guessedLetters: [], hintRevealed: false, phase: 'handoff', session: before.pnp.session })
  })

  it.each([
    ['startPnpAuthoring', roundActions.startPnpAuthoring()],
    ['startPnpSession', roundActions.startPnpSession()]
  ] as const)('%s starts the next round with no draft', (_label, action) => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: 'A pet' })])
    const next = reducer(before, action)

    expect(next.pnp).toStrictEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', session: before.pnp.session })
  })

  it('startPnpPlaying moves on from the hand-off without touching the round', () => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(puzzle())])
    const next = reducer(before, roundActions.startPnpPlaying())

    expect(next.pnp).toEqual({ ...before.pnp, phase: 'playing' })
  })

  it('savePnpProgress saves the guesses and hint on the same round, keeping its phase', () => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(puzzle()), roundActions.startPnpPlaying()])
    const next = reducer(before, roundActions.savePnpProgress({ guessedLetters: ['L', 'Q'], hintRevealed: true }))

    expect(next.pnp).toEqual({ ...before.pnp, guessedLetters: ['L', 'Q'], hintRevealed: true })
  })

  it('never touches the solo round or the open game', () => {
    const before = run([roundActions.setActiveMode('pnp')], midGame())
    const next = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' }), roundActions.setPnpWord(puzzle()), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['A'], hintRevealed: false }), roundActions.recordPnpResult({ roundId: before.pnp.id + 1, result: 'win' }), roundActions.addPnpPlayer(), roundActions.focusPnpSeat('p3'), roundActions.setPnpSource('packs'), roundActions.removePnpPlayer('p3'), roundActions.startPnpSession()], before)

    expect(next.solo).toEqual(before.solo)
    expect(next.activeMode).toBe('pnp')
  })
})

// The table playing Pass & Play (utils/pnpSession.ts), kept with its round.
describe('the Pass & Play session', () => {
  const session = (state: RoundState): PnpSession => state.pnp.session
  const word = puzzle({ phrase: 'CAT', sourceMode: 'custom' })
  // A round on the board in play, and the same round guessed to its end (CAT, solved or missed).
  const inPlay = (state: RoundState = initialRoundState): RoundState => run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(word), roundActions.startPnpPlaying()], state)
  const decide = (state: RoundState, result: 'win' | 'loss' = 'win'): RoundState => run([roundActions.savePnpProgress({ guessedLetters: result === 'win' ? ['C', 'A', 'T'] : ['Z', 'X', 'Q', 'W', 'E', 'R'], hintRevealed: false }), roundActions.recordPnpResult({ roundId: state.pnp.id, result })], state)
  const threePlayers = (): RoundState => run([roundActions.addPnpPlayer()])

  describe('recordPnpResult', () => {
    it("counts a win for the round's guesser, and marks the round counted", () => {
      const next = decide(inPlay())

      expect(session(next).standings).toEqual({ p2: { played: 1, wins: 1 } })
      expect(session(next).recordedRoundId).toBe(next.pnp.id)
    })

    it('counts a loss as a word played and none solved', () => {
      expect(session(decide(inPlay(), 'loss')).standings).toEqual({ p2: { played: 1, wins: 0 } })
    })

    it('leaves the writer and guesser as they are until the next prompt, so the card can name them', () => {
      const next = decide(inPlay())

      expect(session(next)).toMatchObject({ writerId: 'p1', guesserId: 'p2' })
    })

    // A relaunch between the count and the last guess being saved brings the round back undecided, and
    // finishing it again must not count it twice.
    it('counts a round once, however many times its end is reported', () => {
      const once = decide(inPlay())
      const twice = reducer(once, roundActions.recordPnpResult({ roundId: once.pnp.id, result: 'loss' }))

      expect(twice).toBe(once)
    })

    it.each<[string, (state: RoundState) => RoundState, (state: RoundState) => number]>([
      ['for another round', inPlay, (state) => state.pnp.id + 1],
      ['before the word is in play', (state) => run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(word)], state), (state) => state.pnp.id],
      ['while the word is being written', (state) => run([roundActions.startPnpAuthoring()], state), (state) => state.pnp.id]
    ])('counts nothing %s', (_label, setUp, roundId) => {
      const before = setUp(initialRoundState)

      expect(reducer(before, roundActions.recordPnpResult({ roundId: roundId(before), result: 'win' }))).toBe(before)
    })
  })

  describe('moving around the table', () => {
    it('has whoever guessed the decided round write the next word, for the fair pick', () => {
      const next = reducer(decide(inPlay()), roundActions.startPnpAuthoring())

      expect(session(next)).toMatchObject({ writerId: 'p2', guesserId: 'p1' })
    })

    it('moves on whether the guesser solved the word or not', () => {
      expect(session(reducer(decide(inPlay(), 'loss'), roundActions.startPnpAuthoring())).writerId).toBe('p2')
    })

    it("keeps the writer for a prompt over a round that wasn't decided (a fresh start, or a word left behind)", () => {
      expect(session(reducer(inPlay(), roundActions.startPnpAuthoring())).writerId).toBe('p1')
    })

    it('moves once: a second prompt in a row keeps the new writer', () => {
      const next = run([roundActions.startPnpAuthoring(), roundActions.startPnpAuthoring()], decide(inPlay()))

      expect(session(next).writerId).toBe('p2')
    })

    it('picks whoever has guessed the fewest words to guess the next one, ties around the table from the writer', () => {
      // p1 wrote for p2, the first of the two who had guessed nothing.
      const first = decide(inPlay(threePlayers()))
      expect(session(first).standings).toEqual({ p2: { played: 1, wins: 1 } })

      // Now p2 writes: p3 and p1 have guessed nothing, and p3 sits next after p2.
      const second = reducer(first, roundActions.startPnpAuthoring())
      expect(session(second)).toMatchObject({ writerId: 'p2', guesserId: 'p3' })
    })
  })

  describe('setPnpGuesser', () => {
    it("takes the writer's own pick while the word is being written", () => {
      const before = run([roundActions.startPnpAuthoring()], threePlayers())

      expect(session(reducer(before, roundActions.setPnpGuesser('p3'))).guesserId).toBe('p3')
    })

    it.each<[string, (state: RoundState) => RoundState, string]>([
      ['the writer', (state) => run([roundActions.startPnpAuthoring()], state), 'p1'],
      ['someone not at the table', (state) => run([roundActions.startPnpAuthoring()], state), 'p9'],
      ['anyone once the word is handed off', (state) => run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(word)], state), 'p3'],
      ['anyone mid-round', (state) => inPlay(state), 'p3']
    ])('ignores a pick of %s', (_label, setUp, pick) => {
      const before = setUp(threePlayers())

      expect(reducer(before, roundActions.setPnpGuesser(pick))).toBe(before)
    })

    it('is made again for every new prompt', () => {
      const picked = run([roundActions.startPnpAuthoring(), roundActions.setPnpGuesser('p3')], threePlayers())

      expect(session(reducer(picked, roundActions.startPnpAuthoring())).guesserId).toBe('p2')
    })
  })

  describe('startPnpSession', () => {
    const played = (): RoundState => run([roundActions.startPnpAuthoring()], decide(inPlay(threePlayers())))

    it('New Session clears the standings and keeps the table, the first seat writing a blank prompt', () => {
      const before = run([roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: OTHER, name: 'Bo' } })], played())
      const next = reducer(before, roundActions.startPnpSession())

      expect(next.pnp).toEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', session: { ...session(before), standings: {}, writerId: 'p1', guesserId: 'p2', recordedRoundId: null } })
    })
  })

  describe('addPnpPlayer', () => {
    it('adds the next guest seat at the end of the table', () => {
      expect(session(threePlayers()).players).toEqual([...createDefaultPnpSession().players, { id: 'p3', name: 'Player 3', profileId: null }])
    })

    it('stops at eight', () => {
      const eight = run(Array.from({ length: 6 }, () => roundActions.addPnpPlayer()))
      expect(session(eight).players).toHaveLength(8)

      expect(reducer(eight, roundActions.addPnpPlayer())).toBe(eight)
    })

    // The newcomer has guessed nothing, so they're the fair pick for a word not handed off yet.
    it('makes the fair pick again for the word being written', () => {
      const before = decide(inPlay())
      const writing = run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(word), roundActions.startPnpPlaying()], before)
      const next = reducer(decide(writing), roundActions.startPnpAuthoring())
      // p1 guessed p2's word, so p1 writes, for p2, the only other player so far.
      expect(session(next)).toMatchObject({ writerId: 'p1', guesserId: 'p2' })

      expect(session(reducer(next, roundActions.addPnpPlayer())).guesserId).toBe('p3')
    })

    it('leaves the guesser of a word already handed off alone', () => {
      const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(word)])

      expect(session(reducer(before, roundActions.addPnpPlayer())).guesserId).toBe('p2')
    })
  })

  // Jay, 2026-10-20: the seats dragged into a new order on the loadout.
  describe('reorderPnpPlayers', () => {
    const reorder = (state: RoundState, ids: string[]) => reducer(state, roundActions.reorderPnpPlayers(ids))

    it('puts the seats in the new order, the guests named for their new places, and everything kept by seat going with it', () => {
      const before = run([roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: OTHER, name: 'Alice' } }), roundActions.focusPnpSeat('p3')], decide(inPlay(threePlayers())))
      const next = reorder(before, ['p3', 'p1', 'p2'])

      expect(session(next).players).toEqual([
        { id: 'p3', name: 'Player 1', profileId: null },
        { id: 'p1', name: 'Player 2', profileId: null },
        { id: 'p2', name: 'Alice', profileId: OTHER }
      ])
      expect({ ...session(next), players: session(before).players }).toEqual(session(before))
    })

    it.each([
      ['the same order', ['p1', 'p2', 'p3']],
      ['a seat missing', ['p2', 'p1']],
      ['a seat twice', ['p2', 'p2', 'p1']],
      ['a seat not at the table', ['p2', 'p1', 'p9']]
    ])('changes nothing for %s', (_label, ids) => {
      const before = threePlayers()

      expect(reorder(before, ids)).toBe(before)
    })
  })

  describe('removePnpPlayer', () => {
    const remove = (state: RoundState, id: string) => reducer(state, roundActions.removePnpPlayer(id))
    const ids = (state: RoundState) => session(state).players.map((player) => player.id)
    // Player 2 writing the next word, for Player 3 (Player 1 wrote the first, for Player 2).
    const p2Writing = (): RoundState => run([roundActions.startPnpAuthoring()], decide(inPlay(threePlayers())))
    const p2WordInPlay = (): RoundState => run([roundActions.setPnpWord(word), roundActions.startPnpPlaying()], p2Writing())

    it('never goes below two players', () => {
      expect(remove(initialRoundState, 'p2')).toBe(initialRoundState)
    })

    // Jay, 2026-10-20: a parent's seat, for the children to play on their own. Its guest is Single
    // Player's, who keeps what they have (see usePlayerData's forgetGuestSeat).
    it('removes seat 1 like any other, the seats after it moving up a number', () => {
      const next = remove(threePlayers(), 'p1')

      expect(session(next).players).toEqual([
        { id: 'p2', name: 'Player 1', profileId: null },
        { id: 'p3', name: 'Player 2', profileId: null }
      ])
      expect(session(next)).toMatchObject({ writerId: 'p2', guesserId: 'p3', focusedId: 'p2' })
    })

    it('removes the seat and its standing, the guests after it moving up a number', () => {
      const before = run([roundActions.startPnpAuthoring()], decide(inPlay(threePlayers())))
      const next = remove(before, 'p2')

      expect(session(next).players).toEqual([
        { id: 'p1', name: 'Player 1', profileId: null },
        { id: 'p3', name: 'Player 2', profileId: null }
      ])
      expect(session(next).standings).toEqual({})
    })

    it("shows the seat that took the focused seat's place, or the one before for the last", () => {
      const four = run([roundActions.addPnpPlayer(), roundActions.addPnpPlayer()])

      expect(session(remove(run([roundActions.focusPnpSeat('p2')], four), 'p2')).focusedId).toBe('p3')
      expect(session(remove(run([roundActions.focusPnpSeat('p4')], four), 'p4')).focusedId).toBe('p3')
      // Another seat leaving leaves the focus where it was.
      expect(session(remove(run([roundActions.focusPnpSeat('p4')], four), 'p2')).focusedId).toBe('p4')
    })

    it('hands the next word to the seat after a writer who leaves, at a blank prompt', () => {
      const before = run([roundActions.setPnpDraft({ answer: 'CAT', hint: '' })], p2Writing())
      const next = remove(before, 'p2')

      expect(session(next)).toMatchObject({ writerId: 'p3', guesserId: 'p1' })
      expect(next.pnp).toMatchObject({ id: before.pnp.id + 1, phase: 'authoring', puzzle: null })
      expect(next.pnp).not.toHaveProperty('draft')
    })

    it("picks again, keeping the word being written, when the writer's pick leaves", () => {
      const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' }), roundActions.setPnpGuesser('p3')], threePlayers())
      const next = remove(before, 'p3')

      expect(session(next)).toMatchObject({ writerId: 'p1', guesserId: 'p2' })
      expect(next.pnp).toMatchObject({ id: before.pnp.id, draft: { answer: 'CAT', hint: '' } })
    })

    it.each([
      ['writer', 'p2'],
      ['guesser', 'p3']
    ])('replaces a word handed off or in play with a blank prompt when its %s leaves', (_role, id) => {
      const before = p2WordInPlay()
      const next = remove(before, id)

      expect(next.pnp).toMatchObject({ id: before.pnp.id + 1, phase: 'authoring', puzzle: null, guessedLetters: [] })
      expect(ids(next)).not.toContain(id)
      expect(session(next).guesserId).not.toBe(session(next).writerId)
    })

    it('keeps a word in play that has nothing to do with the player who leaves', () => {
      const before = inPlay(threePlayers())
      const next = remove(before, 'p3')

      expect({ ...next.pnp, session: undefined }).toEqual({ ...before.pnp, session: undefined })
      expect(session(next)).toMatchObject({ writerId: 'p1', guesserId: 'p2' })
    })

    // A decided round's guesser is the one writing next, so their leaving passes the word on to the
    // seat after theirs; anyone else leaving leaves them to write it.
    it('makes the move around the table a decided round was waiting for, without the player who left', () => {
      const decided = decide(inPlay(threePlayers()))

      const guesserGone = remove(decided, 'p2')
      expect(session(guesserGone)).toMatchObject({ writerId: 'p3', guesserId: 'p1', recordedRoundId: null })
      // The next prompt has no move of its own left to make.
      expect(session(reducer(guesserGone, roundActions.startPnpAuthoring())).writerId).toBe('p3')

      // Player 2's word for Player 3 decided, and Player 2 leaving: Player 3 writes, for Player 1.
      const writerGone = remove(decide(p2WordInPlay()), 'p2')
      expect(session(writerGone)).toMatchObject({ writerId: 'p3', guesserId: 'p1' })
    })

    it('wraps to the first seat when the last seat writing leaves', () => {
      const before = run([roundActions.addPnpPlayer(), roundActions.startPnpAuthoring(), roundActions.setPnpWord(word), roundActions.startPnpPlaying()])
      // p1 wrote for p2, then p2 for p3 (nothing guessed, next after p2), so p3 writes next.
      const p2Writing = run([roundActions.startPnpAuthoring()], decide(before))
      const p3Writing = run([roundActions.setPnpWord(word), roundActions.startPnpPlaying()], p2Writing)
      const next = run([roundActions.startPnpAuthoring()], decide(p3Writing))
      expect(session(next).writerId).toBe('p3')

      expect(session(remove(next, 'p3')).writerId).toBe('p1')
    })
  })
})

// The table on the packs takes turns, each one player's own solo round (utils/packTurns.ts).
describe('pack turns', () => {
  const session = (state: RoundState): PnpSession => state.pnp.session
  const ALICE = 'profile-a'
  const BOB = 'profile-b'
  // Alice and Bob at the table, each with a fresh solo round (both round 1: ids only differ within one
  // player's slot), and a guest in the third seat.
  const table = (): RoundState => run([roundActions.addPnpPlayer(), roundActions.setPnpSeatProfile({ id: 'p1', profile: { id: ALICE, name: 'Alice' } }), roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: BOB, name: 'Bob' } }), roundActions.setPnpSource('packs'), startSolo({ phrase: 'ALICE WORD' }, ALICE), startSolo({ phrase: 'BOB WORD' }, BOB)])
  const count = (playerKey: string, roundId: number, result: 'win' | 'loss' = 'win') => roundActions.recordPackTurn({ playerKey, roundId, result })

  describe('startPackTurn', () => {
    it("starts with the first seat, the turn's round still to be counted", () => {
      const next = reducer(table(), roundActions.startPackTurn())

      expect(session(next)).toMatchObject({ turnId: 'p1', recordedTurnRound: null })
    })

    it('goes around the table by the fair pick, touching nothing a written word needs', () => {
      const first = run([roundActions.startPackTurn(), count(ALICE, 1)], table())
      const second = reducer(first, roundActions.startPackTurn())
      expect(session(second)).toMatchObject({ turnId: 'p2', recordedTurnRound: null })

      const third = run([count(BOB, 1, 'loss'), roundActions.startPackTurn()], second)
      expect(session(third).turnId).toBe('p3')
      expect(session(third)).toMatchObject({ writerId: 'p1', guesserId: 'p2', recordedRoundId: null })
      expect({ ...third.pnp, session: undefined }).toEqual({ ...initialRoundState.pnp, session: undefined })
    })
  })

  describe('recordPackTurn', () => {
    it("counts the turn's round for its seat, keeping it by its player and id", () => {
      const next = run([roundActions.startPackTurn(), count(ALICE, 1)], table())

      expect(session(next)).toMatchObject({ standings: { p1: { played: 1, wins: 1 } }, recordedTurnRound: `${ALICE}:1` })
      expect(session(reducer(run([roundActions.startPackTurn()], table()), count(ALICE, 1, 'loss'))).standings).toEqual({ p1: { played: 1, wins: 0 } })
    })

    // Its end reported again after a relaunch counts nothing.
    it('counts a turn once, however many times its end is reported', () => {
      const once = run([roundActions.startPackTurn(), count(ALICE, 1)], table())

      expect(reducer(once, count(ALICE, 1, 'loss'))).toBe(once)
    })

    // Alice's round 1 and Bob's round 1 are two rounds.
    it("counts another player's round with the same id on their own turn", () => {
      const next = run([roundActions.startPackTurn(), count(ALICE, 1), roundActions.startPackTurn(), count(BOB, 1)], table())

      expect(session(next)).toMatchObject({ standings: { p1: { played: 1, wins: 1 }, p2: { played: 1, wins: 1 } }, recordedTurnRound: `${BOB}:1` })
    })

    it.each<[string, (state: RoundState) => RoundState, RoundAction]>([
      ['with no turn', (state) => state, count(ALICE, 1)],
      ['for a round that is not on the board', (state) => run([roundActions.startPackTurn()], state), count(ALICE, 2)],
      ['for a player with no round', (state) => run([roundActions.startPackTurn()], state), count(GUEST_PLAYER_KEY, 1)],
      ['once its seat has left the table', (state) => run([roundActions.startPackTurn(), count(ALICE, 1), roundActions.startPackTurn(), roundActions.removePnpPlayer('p2')], state), count(BOB, 1)]
    ])('counts nothing %s', (_label, setUp, action) => {
      const before = setUp(table())

      expect(reducer(before, action)).toBe(before)
    })
  })

  // The standings are the seat's, whichever way it played.
  it('shares the standings with written words, both ways', () => {
    const written = run([roundActions.startPnpAuthoring(), roundActions.setPnpWord(puzzle({ phrase: 'CAT', sourceMode: 'custom' })), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['C', 'A', 'T'], hintRevealed: false })], table())
    const both = run([roundActions.recordPnpResult({ roundId: written.pnp.id, result: 'win' }), roundActions.startPackTurn()], written)

    // p2 guessed the written word, so the fair pick is the first of the two who haven't played.
    expect(session(both).turnId).toBe('p1')
    expect(session(reducer(both, count(ALICE, 1))).standings).toEqual({ p1: { played: 1, wins: 1 }, p2: { played: 1, wins: 1 } })
  })

  it('keeps the turn through a switch of word source, and through a switch of who sits in its seat', () => {
    const before = run([roundActions.startPackTurn()], table())
    const switched = run([roundActions.setPnpSource('write'), roundActions.setPnpSource('packs'), roundActions.setPnpSeatProfile({ id: 'p1', profile: null })], before)

    expect(session(switched)).toMatchObject({ turnId: 'p1', recordedTurnRound: null })
  })

  it('ends the turn with its seat when it leaves, the next going to the fair pick, and only then', () => {
    const before = run([roundActions.startPackTurn(), count(ALICE, 1), roundActions.startPackTurn()], table())

    expect(session(reducer(before, roundActions.removePnpPlayer('p3')))).toMatchObject({ turnId: 'p2', recordedTurnRound: null })
    const gone = reducer(before, roundActions.removePnpPlayer('p2'))
    expect(session(gone)).toMatchObject({ turnId: null, recordedTurnRound: null })
    // The seat that slid into its place, who hasn't played, is next.
    expect(session(reducer(gone, roundActions.startPackTurn())).turnId).toBe('p3')
  })

  it('starts the rotation over from the first seat after New session', () => {
    const before = run([roundActions.startPackTurn(), count(ALICE, 1), roundActions.startPackTurn()], table())
    const next = reducer(before, roundActions.startPnpSession())

    expect(session(next)).toMatchObject({ standings: {}, turnId: null, recordedTurnRound: null })
    expect(session(reducer(next, roundActions.startPackTurn())).turnId).toBe('p1')
    // The rounds themselves stay in their players' slots.
    expect(selectSoloRound(next, BOB)).toEqual(selectSoloRound(before, BOB))
  })
})

describe('setRoundArt', () => {
  const setArt = (modeId: string, playerKey = GUEST_PLAYER_KEY) => roundActions.setRoundArt({ playerKey, modeId })

  it("switches the art on the player's waiting round, keeping its id and guesses", () => {
    const before = midGame()
    const next = reducer(before, setArt('robot'))

    expect(guest(next)).toEqual({ ...guest(before), puzzle: { ...guest(before).puzzle, modeId: 'robot' } })
  })

  // Each guest seat is a player of its own: the word waiting for the second seat's guest is theirs, by
  // the seat's own key, never Single Player's guest's.
  it('switches the art on the Pass & Play word for its guesser, a guest seat by its own key, keeping its id and guesses', () => {
    const before = midGame()
    const next = reducer(before, setArt('robot', guestSeatKey('p2')))

    expect(next.pnp).toEqual({ ...before.pnp, puzzle: { ...before.pnp.puzzle, modeId: 'robot' } })
    expect(reducer(before, setArt('robot')).pnp).toBe(before.pnp)
    expect(reducer(before, setArt('robot', guestSeatKey('p1'))).pnp).toBe(before.pnp)
  })

  // From the hand-off on, the board is the guesser's (Jay, 2026-10-18).
  it('leaves the Pass & Play word alone for anyone but its guesser', () => {
    const before = run([roundActions.setPnpSeatProfile({ id: 'p2', profile: { id: OTHER, name: 'Alice' } })], midGame())

    expect(reducer(before, setArt('robot')).pnp).toBe(before.pnp)
    expect(reducer(before, setArt('robot', OTHER)).pnp.puzzle?.modeId).toBe('robot')
  })

  it("leaves every other player's waiting round on its own art", () => {
    const before = run([startSolo({}, OTHER)], midGame())
    const next = reducer(before, setArt('robot'))

    expect(selectSoloRound(next, OTHER)).toEqual(selectSoloRound(before, OTHER))
  })

  it('switches only the round with a puzzle on it', () => {
    const before = run([startSolo()])
    const next = reducer(before, setArt('candle'))

    expect(guest(next).puzzle?.modeId).toBe('candle')
    expect(next.pnp).toEqual(before.pnp)
  })

  // The same state object back, so the persisted round isn't rewritten for nothing.
  it('is a no-op with no puzzle on either board', () => {
    const before = run([roundActions.startPnpAuthoring()])

    expect(reducer(before, setArt('robot'))).toBe(before)
  })
})

describe('setActiveMode', () => {
  it('records the open game screen, and clears it', () => {
    const solo = reducer(initialRoundState, roundActions.setActiveMode('solo'))
    const pnp = reducer(solo, roundActions.setActiveMode('pnp'))
    const none = reducer(pnp, roundActions.setActiveMode(null))

    expect([solo.activeMode, pnp.activeMode, none.activeMode]).toEqual(['solo', 'pnp', null])
    expect(none.solo).toEqual(initialRoundState.solo)
    expect(none.pnp).toEqual(initialRoundState.pnp)
  })

  // The Pass & Play table on the packs plays its pack turns on the solo game, and goes back to its own
  // page.
  it('records the door the game was played from: its own unless said, and none with no game', () => {
    const own = reducer(initialRoundState, roundActions.setActiveMode('pnp'))
    const fromPnp = reducer(own, roundActions.setActiveMode('solo', 'pnp'))
    const none = reducer(fromPnp, roundActions.setActiveMode(null))

    expect([own.activeDoor, fromPnp.activeDoor, none.activeDoor]).toEqual(['pnp', 'pnp', null])
    expect(fromPnp.activeMode).toBe('solo')
  })
})

describe('reset', () => {
  it('puts both rounds and the open game back to the start', () => {
    const before = run([roundActions.setActiveMode('pnp')], midGame())

    expect(reducer(before, roundActions.reset())).toEqual(initialRoundState)
  })
})
