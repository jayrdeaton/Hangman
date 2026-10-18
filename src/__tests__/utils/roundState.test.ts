import { classicMode, DEFAULT_MODE, jengaMode, robotMode } from '@/modes/registry'
import { initialRoundState, type PnpRound, type RoundState, type SavedPuzzle, type SavedRound } from '@/redux/roundSlice'
import type { GameStartPayload } from '@/types/gameSession'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { createDefaultPnpSession, type PnpSession } from '@/utils/pnpSession'
import { countWrongGuesses, getPnpRemovalLoss, hasUnfinishedGuesses, isRoundDecided, isRoundPlayable, sanitizeRoundState, toGamePayload, toSavedPuzzle } from '@/utils/roundState'

const puzzle = (overrides: Partial<SavedPuzzle> = {}): SavedPuzzle => ({ phrase: 'HI THERE', modeId: 'classic', sourceMode: 'random', ...overrides })
const round = (guessedLetters: string[], overrides: Partial<SavedPuzzle> = {}): Pick<SavedRound, 'puzzle' | 'guessedLetters'> => ({ puzzle: puzzle(overrides), guessedLetters })

// 'HI THERE' has the letters E, H, I, R and T. Six wrong letters ends a round in every art today.
const ALL_LETTERS = ['H', 'I', 'T', 'E', 'R']
const SIX_WRONG = ['A', 'B', 'C', 'D', 'F', 'G']

describe('toSavedPuzzle and toGamePayload', () => {
  const payload: GameStartPayload = { phrase: 'HELLO WORLD', mode: robotMode, sourceMode: 'random', hint: 'A greeting', packKey: 'phrases', packLabel: 'Phrases', puzzleId: 'phrases:abc', difficultyTier: 'medium', packScope: 'single' }

  it('saves the art by its id instead of the mode itself', () => {
    const saved = toSavedPuzzle(payload)

    expect(saved).toEqual({ phrase: 'HELLO WORLD', modeId: 'robot', sourceMode: 'random', hint: 'A greeting', packKey: 'phrases', packLabel: 'Phrases', puzzleId: 'phrases:abc', difficultyTier: 'medium', packScope: 'single' })
    expect(saved).not.toHaveProperty('mode')
  })

  it('adds no keys a payload left out', () => {
    expect(toSavedPuzzle({ phrase: 'CAT', mode: classicMode, sourceMode: 'custom' })).toStrictEqual({ phrase: 'CAT', modeId: 'classic', sourceMode: 'custom' })
  })

  // What redux-persist writes is JSON, which a mode's React component wouldn't survive.
  it('round trips through JSON back to the same payload and the same mode', () => {
    const restored = toGamePayload(JSON.parse(JSON.stringify(toSavedPuzzle(payload))))

    expect(restored).toEqual(payload)
    expect(restored.mode).toBe(robotMode)
  })

  it('still resolves an art since hidden from the picker', () => {
    expect(toGamePayload(puzzle({ modeId: jengaMode.id })).mode).toBe(jengaMode)
  })

  it('falls back to the default art for an id that no longer exists', () => {
    expect(toGamePayload(puzzle({ modeId: 'retired-art' })).mode).toBe(DEFAULT_MODE)
  })
})

describe('countWrongGuesses', () => {
  it('counts only the guesses that are not in the phrase', () => {
    expect(countWrongGuesses('HELLO WORLD', ['H', 'Z', 'O', 'Q', 'X'])).toBe(3)
  })

  it('is zero with no guesses, or only right ones', () => {
    expect(countWrongGuesses('HELLO WORLD', [])).toBe(0)
    expect(countWrongGuesses('HELLO WORLD', ['W', 'D', 'L'])).toBe(0)
  })
})

describe('isRoundDecided', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('is false with no puzzle on the board', () => {
    expect(isRoundDecided({ puzzle: null, guessedLetters: SIX_WRONG })).toBe(false)
  })

  it('is true once every letter is found, the spaces needing no guess', () => {
    expect(isRoundDecided(round(ALL_LETTERS))).toBe(true)
    expect(isRoundDecided(round(['R', 'E', 'T', 'I', 'H', 'Z']))).toBe(true)
  })

  it('is false while any letter is still hidden', () => {
    expect(isRoundDecided(round([]))).toBe(false)
    expect(isRoundDecided(round(['H', 'I', 'T', 'E']))).toBe(false)
  })

  it("is true once the wrong guesses reach the art's mistake limit, and not one before", () => {
    expect(isRoundDecided(round(SIX_WRONG.slice(0, 5)))).toBe(false)
    expect(isRoundDecided(round(SIX_WRONG))).toBe(true)
  })

  it("takes the limit from the round's own art", () => {
    jest.replaceProperty(robotMode, 'maxMistakes', 3)

    expect(isRoundDecided(round(['A', 'B', 'C'], { modeId: 'robot' }))).toBe(true)
    expect(isRoundDecided(round(['A', 'B', 'C'], { modeId: 'classic' }))).toBe(false)
  })

  it("takes the default art's limit for an art id that no longer exists", () => {
    jest.replaceProperty(DEFAULT_MODE, 'maxMistakes', 2)

    expect(isRoundDecided(round(['A', 'B'], { modeId: 'retired-art' }))).toBe(true)
    expect(isRoundDecided(round(['A'], { modeId: 'retired-art' }))).toBe(false)
  })
})

describe('hasUnfinishedGuesses', () => {
  it('is true for a round with a guess on it that has not ended', () => {
    expect(hasUnfinishedGuesses(round(['H']))).toBe(true)
    expect(hasUnfinishedGuesses(round(['Z']))).toBe(true)
  })

  it('is false for an empty board or a fresh round, which cost nothing to leave', () => {
    expect(hasUnfinishedGuesses({ puzzle: null, guessedLetters: [] })).toBe(false)
    expect(hasUnfinishedGuesses(round([]))).toBe(false)
  })

  it('is false for a round already won or lost (it was recorded when it ended)', () => {
    expect(hasUnfinishedGuesses(round(ALL_LETTERS))).toBe(false)
    expect(hasUnfinishedGuesses(round(SIX_WRONG))).toBe(false)
  })
})

describe('isRoundPlayable', () => {
  it('is true for a word on the board that has not ended, guessed at or not', () => {
    expect(isRoundPlayable(round([]))).toBe(true)
    expect(isRoundPlayable(round(['H', 'Z']))).toBe(true)
  })

  it('is false for an empty board', () => {
    expect(isRoundPlayable({ puzzle: null, guessedLetters: [] })).toBe(false)
  })

  it('is false for a round already won or lost', () => {
    expect(isRoundPlayable(round(ALL_LETTERS))).toBe(false)
    expect(isRoundPlayable(round(SIX_WRONG))).toBe(false)
  })
})

describe('sanitizeRoundState', () => {
  const OTHER = 'profile-a'
  // The guest's solo round mid-guess, and another player's empty one.
  const guestSlot = (): SavedRound => ({ id: 4, puzzle: { phrase: 'HELLO WORLD', modeId: 'robot', sourceMode: 'random', hint: 'A greeting', packKey: 'phrases', packLabel: 'Phrases', puzzleId: 'phrases:abc', difficultyTier: 'easy', packScope: 'single' }, guessedLetters: ['H', 'Z'], hintRevealed: true })
  const otherSlot = (): SavedRound => ({ id: 1, puzzle: null, guessedLetters: [], hintRevealed: false })
  // Three players a round in, Player 3 writing for Player 1, the second seat shown.
  const session = (): PnpSession => ({
    players: [
      { id: 'p1', name: 'Player 1', profileId: null },
      { id: 'p2', name: 'Player 2', profileId: null },
      { id: 'p3', name: 'Player 3', profileId: null }
    ],
    standings: { p2: { played: 1, wins: 1 } },
    writerId: 'p3',
    guesserId: 'p1',
    recordedRoundId: null,
    source: 'write',
    focusedId: 'p2',
    turnId: null,
    recordedTurnRound: null
  })
  const validState = (): RoundState => ({
    solo: { [GUEST_PLAYER_KEY]: guestSlot(), [OTHER]: otherSlot() },
    pnp: { id: 9, puzzle: { phrase: 'CAT', modeId: 'classic', sourceMode: 'custom' }, guessedLetters: ['C'], hintRevealed: false, phase: 'playing', session: session() },
    activeMode: 'pnp',
    activeDoor: 'pnp'
  })

  // A stored blob with the guest's slot replaced, the rest left valid, and what it sanitizes to when
  // that slot is dropped: everything else, the other player's slot included.
  const withSolo = (slot: unknown): unknown => ({ ...validState(), solo: { ...validState().solo, [GUEST_PLAYER_KEY]: slot } })
  const withSoloPuzzle = (overrides: Record<string, unknown>): unknown => withSolo({ ...guestSlot(), puzzle: { ...guestSlot().puzzle, ...overrides } })
  const withoutGuest = (): RoundState => ({ ...validState(), solo: { [OTHER]: otherSlot() } })

  it('passes a valid state through unchanged', () => {
    expect(sanitizeRoundState(validState())).toEqual(validState())
  })

  it.each(['authoring', 'handoff', 'playing', null])('keeps the Pass & Play phase %s', (phase) => {
    const state = { ...validState(), pnp: { ...validState().pnp, phase } }

    expect(sanitizeRoundState(state)).toEqual(state)
  })

  it('keeps an empty round with its id', () => {
    const state = { ...validState(), solo: { [GUEST_PLAYER_KEY]: { id: 3, puzzle: null, guessedLetters: [], hintRevealed: false } } }

    expect(sanitizeRoundState(state)).toEqual(state)
  })

  // The store's migrate hands it the blob with redux-persist's own key on it, and puts that back itself.
  it("leaves out redux-persist's _persist key", () => {
    expect(sanitizeRoundState({ ...validState(), _persist: { version: 1, rehydrated: true } })).toEqual(validState())
  })

  it.each([
    ['nothing stored', undefined],
    ['null', null],
    ['a string', 'round'],
    ['a number', 42],
    ['a list', [validState()]],
    ['an empty object', {}]
  ])('falls back to the starting state for %s', (_label, value) => {
    expect(sanitizeRoundState(value)).toEqual(initialRoundState)
  })

  it('fills in the missing parts of a partial state', () => {
    expect(sanitizeRoundState({ solo: validState().solo })).toEqual({ ...initialRoundState, solo: validState().solo })
    expect(sanitizeRoundState({ pnp: validState().pnp, activeMode: 'pnp' })).toEqual({ ...validState(), solo: initialRoundState.solo })
  })

  it.each([
    ['a lowercase phrase', { phrase: 'hello world' }],
    ['an empty phrase', { phrase: '' }],
    ['a phrase of only spaces', { phrase: '   ' }],
    ['a phrase with punctuation', { phrase: "DON'T" }],
    ['a phrase with a digit', { phrase: 'ROUTE 66' }],
    ['a phrase that is not a string', { phrase: 42 }],
    ['no art id', { modeId: undefined }],
    ['an unknown source', { sourceMode: 'shared' }],
    ['a hint that is not a string', { hint: 7 }],
    ['a pack key that is not a string', { packKey: ['phrases'] }],
    ['an unknown difficulty', { difficultyTier: 'extreme' }],
    ['an unknown pack scope', { packScope: 'everything' }]
  ])('drops only the slot whose puzzle has %s', (_label, overrides) => {
    expect(sanitizeRoundState(withSoloPuzzle(overrides))).toEqual(withoutGuest())
  })

  it.each([
    ['a missing puzzle', { puzzle: undefined }],
    ['a puzzle that is not an object', { puzzle: 'HELLO' }]
  ])('drops only the slot with %s', (_label, overrides) => {
    expect(sanitizeRoundState(withSolo({ ...guestSlot(), ...overrides }))).toEqual(withoutGuest())
  })

  it.each([
    ['a lowercase letter', ['h']],
    ['two letters in one guess', ['HE']],
    ['a digit', ['1']],
    ['a number', [1]],
    ['a space', [' ']],
    ['a string instead of a list', 'HE'],
    ['no list at all', undefined]
  ])('drops only the slot whose guesses have %s', (_label, guessedLetters) => {
    expect(sanitizeRoundState(withSolo({ ...guestSlot(), guessedLetters }))).toEqual(withoutGuest())
  })

  it.each([
    ['an id that is not a number', { id: '4' }],
    ['an id that is not finite', { id: Number.NaN }],
    ['an infinite id', { id: Infinity }],
    ['no id', { id: undefined }],
    ['a hint flag that is not a boolean', { hintRevealed: 'yes' }]
  ])('drops only the slot with %s', (_label, overrides) => {
    expect(sanitizeRoundState(withSolo({ ...guestSlot(), ...overrides }))).toEqual(withoutGuest())
  })

  it.each([
    ['an empty key', ''],
    ['a key with a colon', 'profile:a']
  ])('drops a slot under %s, which no player could have', (_label, playerKey) => {
    expect(sanitizeRoundState({ ...validState(), solo: { ...validState().solo, [playerKey]: guestSlot() } })).toEqual(validState())
  })

  it.each([
    ['a list', [guestSlot()]],
    ['a string', 'guest'],
    ['null', null]
  ])('has no solo rounds when they are stored as %s', (_label, solo) => {
    expect(sanitizeRoundState({ ...validState(), solo }).solo).toEqual({})
  })

  // No migration (the app hadn't shipped): a version 1 blob's one solo round isn't a map of rounds by
  // player, so none of it passes, and the guest starts with no round waiting.
  it('drops a solo round saved before rounds were kept per player', () => {
    expect(sanitizeRoundState({ ...validState(), solo: guestSlot() })).toEqual({ ...validState(), solo: {} })
  })

  it('drops only a broken Pass & Play slot, keeping the solo one and the table playing it', () => {
    const state = { ...validState(), pnp: { ...validState().pnp, guessedLetters: ['c'] } }

    expect(sanitizeRoundState(state)).toEqual({ ...validState(), pnp: { ...initialRoundState.pnp, session: session() } })
  })

  describe('the Pass & Play session', () => {
    const withSession = (value: unknown): unknown => ({ ...validState(), pnp: { ...validState().pnp, session: value } })

    // No migration (the app hadn't shipped): a round saved before sessions has none to read.
    it('starts a fresh session, keeping the round, for a round saved without one', () => {
      const { session: _session, ...round } = validState().pnp

      expect(sanitizeRoundState({ ...validState(), pnp: round })).toEqual({ ...validState(), pnp: { ...validState().pnp, session: createDefaultPnpSession() } })
    })

    it('starts a fresh session, keeping the round, for a broken one', () => {
      expect(sanitizeRoundState(withSession({ ...session(), players: [] }))).toEqual({ ...validState(), pnp: { ...validState().pnp, session: createDefaultPnpSession() } })
    })

    it('keeps the count of the round stored with it', () => {
      expect(sanitizeRoundState(withSession({ ...session(), recordedRoundId: 9 })).pnp.session.recordedRoundId).toBe(9)
    })

    // A count of round 9 kept beside the empty round 0 would wrongly skip round 9's result later on.
    it('drops the count when the round falls back to the empty one', () => {
      const state = { ...validState(), pnp: { ...validState().pnp, guessedLetters: ['c'], session: { ...session(), recordedRoundId: 9 } } }

      expect(sanitizeRoundState(state).pnp).toEqual({ ...initialRoundState.pnp, session: session() })
    })

    // A relaunch mid-turn comes back to the same turn, and a counted one stays counted.
    it("keeps the pack turn and its counted round through a save and a relaunch, whatever happens to the written word's round", () => {
      const turn = { ...session(), source: 'packs', turnId: 'p2', recordedTurnRound: `${GUEST_PLAYER_KEY}:4` }

      expect(sanitizeRoundState(JSON.parse(JSON.stringify(withSession(turn)))).pnp.session).toEqual(turn)
      expect(sanitizeRoundState({ ...validState(), pnp: { ...validState().pnp, guessedLetters: ['c'], session: turn } }).pnp.session).toEqual(turn)
    })
  })

  it.each([
    ['an unknown phase', 'paused'],
    ['a phase that is not a string', 1],
    ['no phase', undefined]
  ])('clears %s, leaving the solo slot and the open game alone', (_label, phase) => {
    const sanitized = sanitizeRoundState({ ...validState(), pnp: { ...validState().pnp, phase } })

    expect(sanitized.pnp.phase).toBeNull()
    expect(sanitized.solo).toEqual(validState().solo)
    expect(sanitized.activeMode).toBe('pnp')
  })

  it.each([
    ['an unknown screen', 'home'],
    ['a number', 1],
    ['a boolean', true],
    ['nothing', undefined]
  ])('clears an open game of %s, and its door, leaving both rounds alone', (_label, activeMode) => {
    expect(sanitizeRoundState({ ...validState(), activeMode })).toEqual({ ...validState(), activeMode: null, activeDoor: null })
  })

  it("keeps the door an open game was played from, and takes the game's own for one that isn't a door", () => {
    expect(sanitizeRoundState({ ...validState(), activeMode: 'solo', activeDoor: 'pnp' })).toMatchObject({ activeMode: 'solo', activeDoor: 'pnp' })
    expect(sanitizeRoundState({ ...validState(), activeMode: 'solo', activeDoor: 'lobby' })).toMatchObject({ activeMode: 'solo', activeDoor: 'solo' })
    expect(sanitizeRoundState({ ...validState(), activeMode: 'solo', activeDoor: undefined })).toMatchObject({ activeMode: 'solo', activeDoor: 'solo' })
  })

  describe('the Pass & Play draft', () => {
    // A prompt still open on the board, with whatever was typed into it.
    const authoring = (draft: unknown): unknown => ({ ...validState(), pnp: { id: 9, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', draft, session: session() } })
    const authoringRound = { id: 9, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring', session: session() }

    it.each([
      ['a word and a hint', { answer: 'CAT', hint: 'A pet' }],
      ['a word alone', { answer: 'CAT', hint: '' }],
      ['a hint alone', { answer: '', hint: 'A pet' }]
    ])('keeps %s typed on a prompt still being written', (_label, draft) => {
      expect(sanitizeRoundState(authoring(draft))).toStrictEqual({ ...validState(), pnp: { ...authoringRound, draft } })
    })

    it('keeps only the word and hint of a stored draft', () => {
      expect(sanitizeRoundState(authoring({ answer: 'CAT', hint: 'A pet', keep: true })).pnp.draft).toStrictEqual({ answer: 'CAT', hint: 'A pet' })
    })

    // Only a prompt reads a draft back. Past it, the word was handed off (and setPnpWord drops the
    // draft), so one left over would only bring back a stale prompt later.
    it.each([
      ['a word handed off', 'handoff'],
      ['a round in play', 'playing'],
      ['no session', null],
      ['an unknown phase, read as no session', 'paused']
    ])('drops a draft left on %s, keeping the round', (_label, phase) => {
      const sanitized = sanitizeRoundState({ ...validState(), pnp: { ...validState().pnp, phase, draft: { answer: 'CAT', hint: 'A pet' } } })

      expect(sanitized).toStrictEqual({ ...validState(), pnp: { ...validState().pnp, phase: phase === 'paused' ? null : phase } })
    })

    it.each([
      ['null', null],
      ['a string', 'CAT'],
      ['a list', ['CAT', 'A pet']],
      ['a word that is not a string', { answer: 7, hint: 'A pet' }],
      ['a word the prompt would never let through', { answer: 'C4T!', hint: '' }],
      ['no word', { hint: 'A pet' }],
      ['a hint that is not a string', { answer: 'CAT', hint: null }],
      ['no hint', { answer: 'CAT' }]
    ])('drops a draft that is %s, keeping the prompt it was on', (_label, draft) => {
      expect(sanitizeRoundState(authoring(draft))).toStrictEqual({ ...validState(), pnp: authoringRound })
    })

    it('goes with a broken Pass & Play slot, which falls back to the empty round', () => {
      const state = { ...validState(), pnp: { id: 9, puzzle: null, guessedLetters: ['c'], hintRevealed: false, phase: 'authoring', draft: { answer: 'CAT', hint: '' }, session: session() } }

      expect(sanitizeRoundState(state)).toStrictEqual({ ...validState(), pnp: { ...initialRoundState.pnp, session: session() } })
    })
  })
})

describe('getPnpRemovalLoss', () => {
  // Ann writes CAT for Bo, with Cy also at the table and Bo a word in.
  const base = (): PnpRound => ({
    id: 4,
    puzzle: { phrase: 'CAT', modeId: 'classic', sourceMode: 'custom' },
    guessedLetters: ['C'],
    hintRevealed: false,
    phase: 'playing',
    session: {
      players: [
        { id: 'p1', name: 'Ann', profileId: 'profile-ann' },
        { id: 'p2', name: 'Bo', profileId: 'profile-bo' },
        { id: 'p3', name: 'Player 3', profileId: null }
      ],
      standings: { p2: { played: 1, wins: 0 } },
      writerId: 'p1',
      guesserId: 'p2',
      recordedRoundId: null,
      source: 'write',
      focusedId: 'p1',
      turnId: null,
      recordedTurnRound: null
    }
  })

  it('takes their standing for a player who has guessed this session', () => {
    expect(getPnpRemovalLoss(base(), 'p2').standing).toBe(true)
    expect(getPnpRemovalLoss(base(), 'p1').standing).toBe(false)
  })

  it.each(['handoff', 'playing'] as const)('takes the word %s with its writer or its guesser, not anyone else', (phase) => {
    const pnp = { ...base(), phase }

    expect(getPnpRemovalLoss(pnp, 'p1').word).toBe(true)
    expect(getPnpRemovalLoss(pnp, 'p2').word).toBe(true)
    expect(getPnpRemovalLoss(pnp, 'p3')).toEqual({ standing: false, word: false })
  })

  it('takes a word being written only from its writer, and only with something typed', () => {
    const writing: PnpRound = { ...base(), puzzle: null, guessedLetters: [], phase: 'authoring' }

    expect(getPnpRemovalLoss(writing, 'p1').word).toBe(false)
    expect(getPnpRemovalLoss({ ...writing, draft: { answer: 'CAT', hint: '' } }, 'p1').word).toBe(true)
    expect(getPnpRemovalLoss({ ...writing, draft: { answer: 'CAT', hint: '' } }, 'p2').word).toBe(false)
  })

  // Its result is in, so there's nothing left of it to lose.
  it('takes no word once the round is decided', () => {
    expect(getPnpRemovalLoss({ ...base(), guessedLetters: ['C', 'A', 'T'] }, 'p1').word).toBe(false)
    expect(getPnpRemovalLoss({ ...base(), session: { ...base().session, recordedRoundId: 4 } }, 'p2').word).toBe(false)
  })

  it('takes nothing with no session under way', () => {
    expect(getPnpRemovalLoss({ ...base(), phase: null, session: { ...base().session, standings: {} } }, 'p1')).toEqual({ standing: false, word: false })
  })
})
