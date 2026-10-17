import reducer, { initialRoundState, roundActions, type RoundState, type SavedPuzzle, selectSoloRound } from '@/redux/roundSlice'
import { GUEST_PLAYER_KEY } from '@/utils/players'
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
      activeMode: null
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
    const next = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' }), roundActions.setPnpWord(puzzle()), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['A'], hintRevealed: false }), roundActions.recordPnpResult({ roundId: before.pnp.id + 1, result: 'win' }), roundActions.addPnpPlayer(), roundActions.renamePnpPlayer({ id: 'p1', name: 'Ann' }), roundActions.removePnpPlayer('p3'), roundActions.startPnpSession(), roundActions.endPnpSession()], before)

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

  describe('startPnpSession and endPnpSession', () => {
    const played = (): RoundState => run([roundActions.startPnpAuthoring()], decide(inPlay(threePlayers())))

    it('New Session clears the standings and keeps the table, the first seat writing a blank prompt', () => {
      const before = run([roundActions.renamePnpPlayer({ id: 'p2', name: 'Bo' })], played())
      const next = reducer(before, roundActions.startPnpSession())

      expect(next.pnp).toEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', session: { ...session(before), standings: {}, writerId: 'p1', guesserId: 'p2', recordedRoundId: null } })
    })

    it('End Session clears the standings and keeps the table with nothing in play, leaving the finished board drawn', () => {
      const before = decide(inPlay(threePlayers()))
      const next = reducer(before, roundActions.endPnpSession())

      expect(next.pnp).toEqual({ ...before.pnp, phase: null, session: { ...session(before), standings: {}, writerId: 'p1', guesserId: 'p2', recordedRoundId: null } })
    })

    it('End Session drops a word being written', () => {
      const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' })])

      expect(reducer(before, roundActions.endPnpSession()).pnp).not.toHaveProperty('draft')
    })

    it('starts the next visit at a prompt for the first seat, with no move around the table', () => {
      const next = run([roundActions.endPnpSession(), roundActions.startPnpAuthoring()], decide(inPlay()))

      expect(session(next)).toMatchObject({ writerId: 'p1', guesserId: 'p2', standings: {} })
      expect(next.pnp.phase).toBe('authoring')
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

  describe('renamePnpPlayer', () => {
    it('renames the seat, tidied, keeping its id and standing', () => {
      const before = decide(inPlay())
      const next = reducer(before, roundActions.renamePnpPlayer({ id: 'p2', name: '  Bo   Diddley ' }))

      expect(session(next).players[1]).toEqual({ id: 'p2', name: 'Bo Diddley', profileId: null })
      expect(session(next).standings).toEqual(session(before).standings)
    })

    it.each([
      ['a blank name', 'p2', '   '],
      ['a name another seat goes by', 'p2', 'player 1'],
      ['a seat not at the table', 'p9', 'Bo']
    ])('ignores %s', (_label, id, name) => {
      expect(reducer(initialRoundState, roundActions.renamePnpPlayer({ id, name }))).toBe(initialRoundState)
    })

    it('takes a change of case on the same seat', () => {
      expect(session(reducer(initialRoundState, roundActions.renamePnpPlayer({ id: 'p1', name: 'PLAYER 1' }))).players[0].name).toBe('PLAYER 1')
    })
  })

  describe('removePnpPlayer', () => {
    const remove = (state: RoundState, id: string) => reducer(state, roundActions.removePnpPlayer(id))
    const ids = (state: RoundState) => session(state).players.map((player) => player.id)

    it('never goes below two players', () => {
      expect(remove(initialRoundState, 'p2')).toBe(initialRoundState)
    })

    it('removes the seat and its standing', () => {
      const before = run([roundActions.startPnpAuthoring()], decide(inPlay(threePlayers())))
      const next = remove(before, 'p2')

      expect(ids(next)).toEqual(['p1', 'p3'])
      expect(session(next).standings).toEqual({})
    })

    it('hands the next word to the seat after a writer who leaves, at a blank prompt', () => {
      const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' })], threePlayers())
      const next = remove(before, 'p1')

      expect(session(next)).toMatchObject({ writerId: 'p2', guesserId: 'p3' })
      expect(next.pnp).toMatchObject({ id: before.pnp.id + 1, phase: 'authoring', puzzle: null })
      expect(next.pnp).not.toHaveProperty('draft')
    })

    it("picks again, keeping the word being written, when the writer's pick leaves", () => {
      const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' }), roundActions.setPnpGuesser('p3')], threePlayers())
      const next = remove(before, 'p3')

      expect(session(next)).toMatchObject({ writerId: 'p1', guesserId: 'p2' })
      expect(next.pnp).toMatchObject({ id: before.pnp.id, draft: { answer: 'CAT', hint: '' } })
    })

    it.each(['p1', 'p2'])('replaces a word handed off or in play with a blank prompt when %s, its writer or guesser, leaves', (id) => {
      const before = inPlay(threePlayers())
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

      const writerGone = remove(decided, 'p1')
      expect(session(writerGone)).toMatchObject({ writerId: 'p2', guesserId: 'p3' })
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

describe('setRoundArt', () => {
  const setArt = (modeId: string, playerKey = GUEST_PLAYER_KEY) => roundActions.setRoundArt({ playerKey, modeId })

  it("switches the art on the player's waiting round and the Pass & Play one, keeping their ids and guesses", () => {
    const before = midGame()
    const next = reducer(before, setArt('robot'))

    expect(guest(next)).toEqual({ ...guest(before), puzzle: { ...guest(before).puzzle, modeId: 'robot' } })
    expect(next.pnp).toEqual({ ...before.pnp, puzzle: { ...before.pnp.puzzle, modeId: 'robot' } })
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
})

describe('reset', () => {
  it('puts both rounds and the open game back to the start', () => {
    const before = run([roundActions.setActiveMode('pnp')], midGame())

    expect(reducer(before, roundActions.reset())).toEqual(initialRoundState)
  })
})
