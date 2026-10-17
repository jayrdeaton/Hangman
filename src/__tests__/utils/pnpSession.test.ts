import { createDefaultPnpSession, createPlayer, formatWinRate, getSessionResult, getStanding, getStandingRows, hasStandings, isPlayerNameTaken, joinNames, MAX_PLAYER_NAME_LENGTH, normalizePlayerName, pickFairGuesser, type PnpPlayer, type PnpSession, type PnpStandingRow, rankStandingRows, sanitizePnpSession, seatAfterRemoved } from '@/utils/pnpSession'

const player = (id: string, name = `Name ${id}`): PnpPlayer => ({ id, name, profileId: null })
const table = (...ids: string[]): PnpPlayer[] => ids.map((id) => player(id))
const row = (id: string, played: number, wins: number): PnpStandingRow => ({ id, name: `Name ${id}`, played, wins })

describe('createDefaultPnpSession', () => {
  it('seats two guests, Player 1 writing for Player 2, with nothing played', () => {
    expect(createDefaultPnpSession()).toEqual({
      players: [
        { id: 'p1', name: 'Player 1', profileId: null },
        { id: 'p2', name: 'Player 2', profileId: null }
      ],
      standings: {},
      writerId: 'p1',
      guesserId: 'p2',
      recordedRoundId: null
    })
  })

  it('hands out a fresh session every time, so one table never shares state with another', () => {
    expect(createDefaultPnpSession()).not.toBe(createDefaultPnpSession())
    expect(createDefaultPnpSession().players).not.toBe(createDefaultPnpSession().players)
  })
})

describe('standings', () => {
  it('reads a seat with no entry as nothing played', () => {
    expect(getStanding({ standings: { p1: { played: 2, wins: 1 } } }, 'p2')).toEqual({ played: 0, wins: 0 })
  })

  it('has standings once any round is played', () => {
    expect(hasStandings({ standings: {} })).toBe(false)
    expect(hasStandings({ standings: { p2: { played: 1, wins: 0 } } })).toBe(true)
  })

  it('lists every seat in seat order with its rounds', () => {
    expect(getStandingRows({ players: [player('p1', 'Ann'), player('p2', 'Bo')], standings: { p2: { played: 3, wins: 2 } } })).toEqual([
      { id: 'p1', name: 'Ann', played: 0, wins: 0 },
      { id: 'p2', name: 'Bo', played: 3, wins: 2 }
    ])
  })
})

describe('pickFairGuesser', () => {
  const session = (standings: PnpSession['standings'], players = table('p1', 'p2', 'p3', 'p4')) => ({ players, standings })

  it('picks the other player with two at the table', () => {
    expect(pickFairGuesser(session({ p2: { played: 9, wins: 9 } }, table('p1', 'p2')), 'p1')).toBe('p2')
    expect(pickFairGuesser(session({}, table('p1', 'p2')), 'p2')).toBe('p1')
  })

  it('picks whoever has guessed the fewest words, never the writer', () => {
    expect(pickFairGuesser(session({ p1: { played: 0, wins: 0 }, p2: { played: 2, wins: 2 }, p3: { played: 1, wins: 0 }, p4: { played: 3, wins: 1 } }), 'p1')).toBe('p3')
  })

  it('counts words guessed, not words solved', () => {
    expect(pickFairGuesser(session({ p2: { played: 2, wins: 0 }, p3: { played: 1, wins: 1 }, p4: { played: 2, wins: 0 } }), 'p1')).toBe('p3')
  })

  it('breaks a tie around the table, starting from the seat after the writer', () => {
    expect(pickFairGuesser(session({}), 'p1')).toBe('p2')
    expect(pickFairGuesser(session({}), 'p3')).toBe('p4')
    // Wrapping past the last seat back to the first.
    expect(pickFairGuesser(session({}), 'p4')).toBe('p1')
    expect(pickFairGuesser(session({ p1: { played: 1, wins: 1 }, p4: { played: 1, wins: 0 } }), 'p3')).toBe('p2')
  })
})

describe('seatAfterRemoved', () => {
  it('is the seat that slid into the removed one, wrapping from the end', () => {
    const remaining = table('p1', 'p3', 'p4')
    expect(seatAfterRemoved(remaining, 1)).toBe('p3')
    expect(seatAfterRemoved(remaining, 3)).toBe('p1')
  })
})

describe('names', () => {
  it('trims, single-spaces and caps a name', () => {
    expect(normalizePlayerName('  Grand   Ma  ')).toBe('Grand Ma')
    expect(normalizePlayerName('A'.repeat(30))).toHaveLength(MAX_PLAYER_NAME_LENGTH)
    // Capping never leaves a trailing space.
    expect(normalizePlayerName(`${'A'.repeat(MAX_PLAYER_NAME_LENGTH - 1)} B`)).toBe('A'.repeat(MAX_PLAYER_NAME_LENGTH - 1))
    expect(normalizePlayerName('   ')).toBe('')
  })

  it('knows a name another seat goes by, in any case, but not the seat itself', () => {
    const players = [player('p1', 'Ann'), player('p2', 'Bo')]
    expect(isPlayerNameTaken(players, ' ann ')).toBe(true)
    expect(isPlayerNameTaken(players, 'Ann', 'p1')).toBe(false)
    expect(isPlayerNameTaken(players, 'Cy')).toBe(false)
  })

  it('joins names the way a sentence would', () => {
    expect(joinNames(['Ann'])).toBe('Ann')
    expect(joinNames(['Ann', 'Bo'])).toBe('Ann and Bo')
    expect(joinNames(['Ann', 'Bo', 'Cy'])).toBe('Ann, Bo and Cy')
  })
})

describe('createPlayer', () => {
  it('adds the next guest seat with the next number', () => {
    expect(createPlayer(createDefaultPnpSession().players)).toEqual({ id: 'p3', name: 'Player 3', profileId: null })
  })

  // A new id is never one a seat at the table has, and a default name never one a seat goes by.
  it('skips an id and a name already taken', () => {
    expect(createPlayer([player('p1', 'Player 1'), player('p3', 'Player 3')])).toEqual({ id: 'p4', name: 'Player 4', profileId: null })
    expect(createPlayer([player('p2', 'Ann'), player('p7', 'Bo')])).toEqual({ id: 'p8', name: 'Player 3', profileId: null })
  })
})

describe('the session result', () => {
  it('has no result when nobody has guessed', () => {
    expect(getSessionResult([row('p1', 0, 0), row('p2', 0, 0)])).toEqual({ kind: 'none' })
  })

  // A 0% "best" would crown someone for missing every word they guessed.
  it('has no winner when nobody has solved a word', () => {
    expect(getSessionResult([row('p1', 0, 0), row('p2', 2, 0)])).toEqual({ kind: 'none' })
    expect(getSessionResult([row('p1', 1, 0), row('p2', 2, 0)])).toEqual({ kind: 'none' })
  })

  it('picks the best win rate among the players who guessed, however few words that was', () => {
    expect(getSessionResult([row('p1', 4, 3), row('p2', 1, 1), row('p3', 0, 0)])).toEqual({ kind: 'winner', winner: row('p2', 1, 1) })
  })

  // Not more wins or more words: equal rates are equal (Jay's call).
  it('calls equal best rates a tie, however many words each guessed', () => {
    expect(getSessionResult([row('p1', 2, 1), row('p2', 4, 2), row('p3', 3, 0)])).toEqual({ kind: 'tie', tied: [row('p1', 2, 1), row('p2', 4, 2)] })
  })

  it('ranks best rate first, more solved breaking an equal rate, then seat order, with the players who never guessed last', () => {
    const rows = [row('p1', 0, 0), row('p2', 2, 1), row('p3', 3, 3), row('p4', 4, 2), row('p5', 2, 1), row('p6', 0, 0)]
    expect(rankStandingRows(rows).map(({ id }) => id)).toEqual(['p3', 'p4', 'p2', 'p5', 'p1', 'p6'])
  })

  it('formats a rate, and "-" for nothing played', () => {
    expect(formatWinRate({ played: 3, wins: 2 })).toBe('67%')
    expect(formatWinRate({ played: 0, wins: 0 })).toBe('-')
  })
})

describe('sanitizePnpSession', () => {
  const ROUND = 7
  const valid = (): PnpSession => ({ players: [player('p1', 'Ann'), player('p2', 'Bo'), player('p3', 'Cy')], standings: { p2: { played: 3, wins: 2 } }, writerId: 'p3', guesserId: 'p1', recordedRoundId: ROUND })

  it('passes a valid session through unchanged', () => {
    expect(sanitizePnpSession(valid(), ROUND)).toEqual(valid())
  })

  it('keeps a profile on a seat', () => {
    const session = { ...valid(), players: [{ ...player('p1', 'Ann'), profileId: 'profile-1' }, player('p2', 'Bo')], writerId: 'p1', guesserId: 'p2' }
    expect(sanitizePnpSession(session, ROUND)).toEqual(session)
  })

  it.each([
    ['nothing stored', undefined],
    ['a string', 'session'],
    ['a list', [valid()]],
    ['no players', { ...valid(), players: undefined }],
    ['one player', { ...valid(), players: [player('p1')] }],
    ['nine players', { ...valid(), players: table('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9') }],
    ['a seat with no id', { ...valid(), players: [player('p1'), { name: 'Bo', profileId: null }] }],
    ['a seat id with a colon', { ...valid(), players: [player('p1'), player('p:2')] }],
    ['two seats with one id', { ...valid(), players: [player('p1', 'Ann'), player('p1', 'Bo')] }],
    ['two seats with one name', { ...valid(), players: [player('p1', 'Ann'), player('p2', 'ANN')] }],
    ['a blank name', { ...valid(), players: [player('p1'), player('p2', '   ')] }],
    ['a name that is not a string', { ...valid(), players: [player('p1'), { id: 'p2', name: 2, profileId: null }] }],
    ['a profile that is not a string', { ...valid(), players: [player('p1'), { id: 'p2', name: 'Bo', profileId: 4 }] }],
    ['no profile at all', { ...valid(), players: [player('p1'), { id: 'p2', name: 'Bo' }] }]
  ])('starts a fresh session for %s', (_label, value) => {
    expect(sanitizePnpSession(value, ROUND)).toEqual(createDefaultPnpSession())
  })

  it('tidies a stored name the way a rename would', () => {
    expect(sanitizePnpSession({ ...valid(), players: [player('p1', '  Ann  '), player('p2', 'Bo'), player('p3', 'Cy')] }, ROUND).players[0].name).toBe('Ann')
  })

  it.each([
    ['not an object', 3],
    ['negative', { played: -1, wins: 0 }],
    ['more wins than words', { played: 1, wins: 2 }],
    ['fractional', { played: 1.5, wins: 1 }],
    ['nothing played', { played: 0, wins: 0 }],
    ['missing its wins', { played: 2 }]
  ])('drops a standing that is %s, keeping the table', (_label, standing) => {
    expect(sanitizePnpSession({ ...valid(), standings: { p1: standing, p2: valid().standings.p2 } }, ROUND)).toEqual(valid())
  })

  it("drops a standing for a seat that isn't at the table", () => {
    expect(sanitizePnpSession({ ...valid(), standings: { ...valid().standings, p9: { played: 1, wins: 1 } } }, ROUND)).toEqual(valid())
  })

  it('reads standings that are not an object as none', () => {
    expect(sanitizePnpSession({ ...valid(), standings: [1, 2] }, ROUND).standings).toEqual({})
  })

  it('falls back to the first seat writing for a writer not at the table', () => {
    expect(sanitizePnpSession({ ...valid(), writerId: 'p9', guesserId: 'p3' }, ROUND)).toMatchObject({ writerId: 'p1', guesserId: 'p3' })
  })

  it('falls back to the fair pick for a guesser not at the table, or the writer themselves', () => {
    // p1 and p2 have guessed nothing and three words: p1, the seat after the writer, is the pick.
    expect(sanitizePnpSession({ ...valid(), guesserId: 'p9' }, ROUND).guesserId).toBe('p1')
    expect(sanitizePnpSession({ ...valid(), guesserId: 'p3' }, ROUND).guesserId).toBe('p1')
  })

  // Only the count of the round stored beside it means anything.
  it('keeps the counted round only when it is the round stored with it', () => {
    expect(sanitizePnpSession(valid(), ROUND + 1).recordedRoundId).toBeNull()
    expect(sanitizePnpSession(valid(), null).recordedRoundId).toBeNull()
    expect(sanitizePnpSession({ ...valid(), recordedRoundId: '7' }, ROUND).recordedRoundId).toBeNull()
  })
})
