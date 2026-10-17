import reducer, { initialRoundState, roundActions, type RoundState, type SavedPuzzle } from '@/redux/roundSlice'

type RoundAction = Parameters<typeof reducer>[1]

const puzzle = (overrides: Partial<SavedPuzzle> = {}): SavedPuzzle => ({ phrase: 'HELLO WORLD', modeId: 'classic', sourceMode: 'random', ...overrides })
const run = (actions: RoundAction[], state: RoundState = initialRoundState): RoundState => actions.reduce<RoundState>((next, action) => reducer(next, action), state)

// A solo round mid-game and a Pass & Play round mid-game, to check each action leaves the other alone.
const midGame = (): RoundState => run([roundActions.startSolo(puzzle({ phrase: 'SOLO WORD', packKey: 'phrases', puzzleId: 'phrases:1' })), roundActions.saveSoloProgress({ guessedLetters: ['S', 'Z'], hintRevealed: true }), roundActions.startPnpAuthoring(), roundActions.setPnpWord(puzzle({ phrase: 'PASS WORD', sourceMode: 'custom' })), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['P', 'Q'], hintRevealed: true })])

describe('roundSlice', () => {
  it('starts with two empty rounds and no game open', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({
      solo: { id: 0, puzzle: null, guessedLetters: [], hintRevealed: false },
      pnp: { id: 0, puzzle: null, guessedLetters: [], hintRevealed: false, phase: null },
      activeMode: null
    })
  })
})

describe('the solo round', () => {
  it('startSolo puts the puzzle on the board under the next id, with no guesses or hint', () => {
    const before = midGame()
    const next = reducer(before, roundActions.startSolo(puzzle({ phrase: 'NEW ONE' })))

    expect(next.solo).toEqual({ id: before.solo.id + 1, puzzle: puzzle({ phrase: 'NEW ONE' }), guessedLetters: [], hintRevealed: false })
  })

  // Game is keyed on the id, so the same phrase twice in a row still has to remount it.
  it('startSolo bumps the id even for the same puzzle twice in a row', () => {
    const first = reducer(initialRoundState, roundActions.startSolo(puzzle()))
    const second = reducer(first, roundActions.startSolo(puzzle()))

    expect(first.solo.id).toBe(1)
    expect(second.solo.id).toBe(2)
  })

  it('clearSolo empties the board under the next id', () => {
    const before = midGame()
    const next = reducer(before, roundActions.clearSolo())

    expect(next.solo).toEqual({ id: before.solo.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false })
  })

  it('saveSoloProgress saves the guesses and hint on the same round, without a new id', () => {
    const before = run([roundActions.startSolo(puzzle())])
    const next = reducer(before, roundActions.saveSoloProgress({ guessedLetters: ['H', 'X'], hintRevealed: true }))

    expect(next.solo).toEqual({ ...before.solo, guessedLetters: ['H', 'X'], hintRevealed: true })
  })

  it('never touches the Pass & Play round or the open game', () => {
    const before = run([roundActions.setActiveMode('solo')], midGame())
    const next = run([roundActions.startSolo(puzzle()), roundActions.saveSoloProgress({ guessedLetters: ['A'], hintRevealed: false }), roundActions.clearSolo()], before)

    expect(next.pnp).toEqual(before.pnp)
    expect(next.activeMode).toBe('solo')
  })
})

describe('the Pass & Play round', () => {
  it('startPnpAuthoring opens a blank board for the next word under the next id', () => {
    const before = midGame()
    const next = reducer(before, roundActions.startPnpAuthoring())

    expect(next.pnp).toEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase: 'authoring' })
  })

  // Game has been drawing this word live since composing began, so finalizing it must not remount it.
  it('setPnpWord keeps the id, sets the word with no guesses or hint, and hands off', () => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.savePnpProgress({ guessedLetters: ['A'], hintRevealed: true })])
    const next = reducer(before, roundActions.setPnpWord(puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' })))

    expect(next.pnp).toEqual({ id: before.pnp.id, puzzle: puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' }), guessedLetters: [], hintRevealed: false, phase: 'handoff' })
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

    expect(next.pnp).toStrictEqual({ id: before.pnp.id, puzzle: puzzle({ phrase: 'SECRET', sourceMode: 'custom', hint: 'Shh' }), guessedLetters: [], hintRevealed: false, phase: 'handoff' })
  })

  it.each([
    ['startPnpAuthoring', roundActions.startPnpAuthoring(), 'authoring'],
    ['endPnp', roundActions.endPnp(), null]
  ] as const)('%s starts the next round with no draft', (_label, action, phase) => {
    const before = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: 'A pet' })])
    const next = reducer(before, action)

    expect(next.pnp).toStrictEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase })
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

  it('endPnp empties the round under the next id, with no phase', () => {
    const before = midGame()
    const next = reducer(before, roundActions.endPnp())

    expect(next.pnp).toEqual({ id: before.pnp.id + 1, puzzle: null, guessedLetters: [], hintRevealed: false, phase: null })
  })

  it('never touches the solo round or the open game', () => {
    const before = run([roundActions.setActiveMode('pnp')], midGame())
    const next = run([roundActions.startPnpAuthoring(), roundActions.setPnpDraft({ answer: 'CAT', hint: '' }), roundActions.setPnpWord(puzzle()), roundActions.startPnpPlaying(), roundActions.savePnpProgress({ guessedLetters: ['A'], hintRevealed: false }), roundActions.endPnp()], before)

    expect(next.solo).toEqual(before.solo)
    expect(next.activeMode).toBe('pnp')
  })
})

describe('setRoundArt', () => {
  it('switches the art on both waiting rounds, keeping their ids and guesses', () => {
    const before = midGame()
    const next = reducer(before, roundActions.setRoundArt('robot'))

    expect(next.solo).toEqual({ ...before.solo, puzzle: { ...before.solo.puzzle, modeId: 'robot' } })
    expect(next.pnp).toEqual({ ...before.pnp, puzzle: { ...before.pnp.puzzle, modeId: 'robot' } })
  })

  it('switches only the round with a puzzle on it', () => {
    const before = run([roundActions.startSolo(puzzle())])
    const next = reducer(before, roundActions.setRoundArt('candle'))

    expect(next.solo.puzzle?.modeId).toBe('candle')
    expect(next.pnp).toEqual(before.pnp)
  })

  // The same state object back, so the persisted round isn't rewritten for nothing.
  it('is a no-op with no puzzle on either board', () => {
    const before = run([roundActions.startPnpAuthoring()])

    expect(reducer(before, roundActions.setRoundArt('robot'))).toBe(before)
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
