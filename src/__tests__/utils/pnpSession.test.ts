import type { Profile } from '@tastic/profile'

import { createDefaultPnpSession, createPlayer, formatWinRate, getFocusedSeat, getSeatIdentity, getSessionResult, getStanding, getStandingRows, guestName, hasStandings, joinNames, MAX_PLAYER_NAME_LENGTH, normalizePlayerName, numberGuests, packTurnRoundKey, pickFairGuesser, pickNextTurn, type PnpPlayer, type PnpSession, type PnpStandingRow, rankStandingRows, sanitizePnpSession, seatAfterRemoved, seatPlayer } from '@/utils/pnpSession'

const player = (id: string, name = `Name ${id}`): PnpPlayer => ({ id, name, profileId: null })
const table = (...ids: string[]): PnpPlayer[] => ids.map((id) => player(id))
const row = (id: string, played: number, wins: number): PnpStandingRow => ({ id, name: `Name ${id}`, played, wins })

describe('createDefaultPnpSession', () => {
  it('seats two guests, Player 1 writing for Player 2, with nothing played, the players writing, the first seat shown and no pack turn yet', () => {
    expect(createDefaultPnpSession()).toEqual({
      players: [
        { id: 'p1', name: 'Player 1', profileId: null },
        { id: 'p2', name: 'Player 2', profileId: null }
      ],
      standings: {},
      writerId: 'p1',
      guesserId: 'p2',
      recordedRoundId: null,
      source: 'write',
      focusedId: 'p1',
      turnId: null,
      recordedTurnRound: null
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
      { id: 'p1', name: 'Ann', profile: null, played: 0, wins: 0 },
      { id: 'p2', name: 'Bo', profile: null, played: 3, wins: 2 }
    ])
  })

  // A profile's seat goes by the roster's name for it, live, with the profile for its chip.
  it("names a profile's seat from the roster, and reads one whose profile has left it as its stored name", () => {
    const alice: Profile = { id: 'profile-a', name: 'Alice Liddell', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }
    const players = [player('p1', 'Ann'), { id: 'p2', name: 'Alice', profileId: alice.id }, { id: 'p3', name: 'Gone', profileId: 'profile-gone' }]

    expect(getStandingRows({ players, standings: {} }, [alice])).toEqual([
      { id: 'p1', name: 'Ann', profile: null, played: 0, wins: 0 },
      { id: 'p2', name: 'Alice Liddell', profile: alice, played: 0, wins: 0 },
      { id: 'p3', name: 'Gone', profile: null, played: 0, wins: 0 }
    ])
    expect(getSeatIdentity(players, 'p2', [alice])).toEqual({ name: 'Alice Liddell', profile: alice })
    expect(getSeatIdentity(players, 'p1', [alice])).toEqual({ name: 'Ann', profile: null })
    expect(getSeatIdentity(players, 'p9', [alice])).toEqual({ name: '', profile: null })
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

// The table on the packs: each turn goes to the same fair pick, the last turn's seat in the writer's
// place.
describe('pickNextTurn', () => {
  const session = (standings: PnpSession['standings'], turnId: string | null, players = table('p1', 'p2', 'p3')) => ({ players, standings, turnId })

  it('starts a session with the first seat, whoever has guessed the fewest words going first', () => {
    expect(pickNextTurn(session({}, null))).toBe('p1')
    // Written words count too: the standings are the seat's, whichever way it played.
    expect(pickNextTurn(session({ p1: { played: 2, wins: 1 }, p2: { played: 1, wins: 1 } }, null))).toBe('p3')
  })

  it('goes around the table, nobody playing twice in a row', () => {
    const standings: PnpSession['standings'] = {}
    const order: string[] = []
    let turnId: string | null = null
    for (let turn = 0; turn < 7; turn++) {
      turnId = pickNextTurn(session(standings, turnId))
      order.push(turnId)
      standings[turnId] = { played: (standings[turnId]?.played ?? 0) + 1, wins: 0 }
    }
    expect(order).toEqual(['p1', 'p2', 'p3', 'p1', 'p2', 'p3', 'p1'])
    // Two at the table take it in turns.
    expect(pickNextTurn(session({ p1: { played: 1, wins: 0 } }, 'p1', table('p1', 'p2')))).toBe('p2')
    expect(pickNextTurn(session({ p1: { played: 1, wins: 0 }, p2: { played: 1, wins: 1 } }, 'p2', table('p1', 'p2')))).toBe('p1')
  })

  it('sends a newcomer, who has played nothing, next', () => {
    const players = table('p1', 'p2', 'p3', 'p4')
    expect(pickNextTurn(session({ p1: { played: 2, wins: 1 }, p2: { played: 2, wins: 0 }, p3: { played: 1, wins: 1 } }, 'p3', players))).toBe('p4')
  })

  it("keeps a turn's round apart from another player's round with the same id", () => {
    expect(packTurnRoundKey('profile-a', 3)).toBe('profile-a:3')
    expect(packTurnRoundKey('profile-a', 3)).not.toBe(packTurnRoundKey('guest', 3))
  })
})

describe('getFocusedSeat', () => {
  it('is the seat the loadout shows, or the first for a focus that is no seat', () => {
    const players = table('p1', 'p2', 'p3')
    expect(getFocusedSeat({ players, focusedId: 'p2' })).toBe(players[1])
    expect(getFocusedSeat({ players, focusedId: 'p9' })).toBe(players[0])
  })
})

// Each guest seat is a player of its own (2026-10-18), by the seat's own id.
describe('seatPlayer', () => {
  it("is a seat's profile while the roster has it, else the seat's own guest", () => {
    const seated: PnpPlayer = { id: 'p2', name: 'Alice', profileId: 'profile-a' }
    expect(seatPlayer(seated, [{ id: 'profile-a' }])).toEqual({ profileId: 'profile-a', seatId: null })
    expect(seatPlayer(seated, [])).toEqual({ profileId: null, seatId: 'p2' })
    expect(seatPlayer({ id: 'p3', name: 'Player 3', profileId: null }, [{ id: 'profile-a' }])).toEqual({ profileId: null, seatId: 'p3' })
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

  it('joins names the way a sentence would', () => {
    expect(joinNames(['Ann'])).toBe('Ann')
    expect(joinNames(['Ann', 'Bo'])).toBe('Ann and Bo')
    expect(joinNames(['Ann', 'Bo', 'Cy'])).toBe('Ann, Bo and Cy')
  })
})

describe('createPlayer', () => {
  it('adds the next guest seat, named for its seat', () => {
    expect(createPlayer(createDefaultPnpSession().players)).toEqual({ id: 'p3', name: 'Player 3', profileId: null })
  })

  // A new id is never one a seat at the table has.
  it('skips an id already taken, naming the seat for where it sits', () => {
    expect(createPlayer([player('p1', 'Player 1'), player('p3', 'Player 2')])).toEqual({ id: 'p4', name: 'Player 3', profileId: null })
    expect(createPlayer([player('p2', 'Player 1'), player('p7', 'Player 2')])).toEqual({ id: 'p8', name: 'Player 3', profileId: null })
  })
})

// Guests are "Player N" by seat (Jay, 2026-10-18: no renaming; a player who wants a name makes a
// profile).
describe('guest names', () => {
  const seated = (id: string, name: string, profileId: string): PnpPlayer => ({ id, name, profileId })

  it('names a guest for their seat', () => {
    expect(guestName(0)).toBe('Player 1')
    expect(guestName(7)).toBe('Player 8')
  })

  it('numbers every guest by seat, leaving the profiles their own names', () => {
    const players = [seated('p1', 'Alice', 'profile-a'), player('p3', 'Player 3'), player('p4', 'Grandma')]
    numberGuests(players)
    expect(players.map((item) => item.name)).toEqual(['Alice', 'Player 2', 'Player 3'])
  })

  // Their chips tell them apart.
  it("lets a guest share a profile's name", () => {
    const players = [seated('p1', 'Player 2', 'profile-a'), player('p2', 'Player 2')]
    numberGuests(players)
    expect(players.map((item) => item.name)).toEqual(['Player 2', 'Player 2'])
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
  const valid = (): PnpSession => ({ players: [player('p1', 'Player 1'), player('p2', 'Player 2'), player('p3', 'Player 3')], standings: { p2: { played: 3, wins: 2 } }, writerId: 'p3', guesserId: 'p1', recordedRoundId: ROUND, source: 'packs', focusedId: 'p2', turnId: 'p1', recordedTurnRound: 'guest:4' })

  it('passes a valid session through unchanged', () => {
    expect(sanitizePnpSession(valid(), ROUND)).toEqual(valid())
  })

  it('keeps a profile on a seat', () => {
    const session = { ...valid(), players: [{ ...player('p1', 'Ann'), profileId: 'profile-1' }, player('p2', 'Player 2')], writerId: 'p1', guesserId: 'p2' }
    expect(sanitizePnpSession(session, ROUND)).toEqual(session)
  })

  it('keeps two profiles sharing a name', () => {
    const session = {
      ...valid(),
      players: [
        { ...player('p1', 'Sam'), profileId: 'profile-1' },
        { ...player('p2', 'Sam'), profileId: 'profile-2' }
      ],
      writerId: 'p1',
      guesserId: 'p2'
    }
    expect(sanitizePnpSession(session, ROUND)).toEqual(session)
  })

  it.each([
    ['nothing stored', undefined],
    ['a string', 'session'],
    ['a list', [valid()]],
    ['no players', { ...valid(), players: undefined }],
    ['one player', { ...valid(), players: [player('p1', 'Player 1')] }],
    ['nine players', { ...valid(), players: table('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9') }],
    ['a seat with no id', { ...valid(), players: [player('p1'), { name: 'Bo', profileId: null }] }],
    ['a seat id with a colon', { ...valid(), players: [player('p1'), player('p:2')] }],
    ['two seats with one id', { ...valid(), players: [player('p1', 'Ann'), player('p1', 'Bo')] }],
    [
      'one profile in two seats',
      {
        ...valid(),
        players: [
          { ...player('p1', 'Ann'), profileId: 'profile-1' },
          { ...player('p2', 'Bo'), profileId: 'profile-1' }
        ]
      }
    ],
    ["a profile's seat with a blank name", { ...valid(), players: [player('p1'), { id: 'p2', name: '   ', profileId: 'profile-2' }] }],
    ['a name that is not a string', { ...valid(), players: [player('p1'), { id: 'p2', name: 2, profileId: null }] }],
    ['a profile that is not a string', { ...valid(), players: [player('p1'), { id: 'p2', name: 'Bo', profileId: 4 }] }],
    ["a guest's key as a seat's profile", { ...valid(), players: [player('p1'), { id: 'p2', name: 'Bo', profileId: 'guest-p1' }] }],
    ['no profile at all', { ...valid(), players: [player('p1'), { id: 'p2', name: 'Bo' }] }]
  ])('starts a fresh session for %s', (_label, value) => {
    expect(sanitizePnpSession(value, ROUND)).toEqual(createDefaultPnpSession())
  })

  it("tidies a profile's stored name, and names every guest for their seat, whatever was stored", () => {
    const players = [{ id: 'p1', name: '  Ann  ', profileId: 'profile-1' }, player('p2', 'Grandma'), player('p3', '   ')]
    expect(sanitizePnpSession({ ...valid(), players }, ROUND).players.map((item) => item.name)).toEqual(['Ann', 'Player 2', 'Player 3'])
  })

  it.each([
    ['missing', undefined],
    ['not one', 'turns']
  ])('has the players writing for a word source %s', (_label, source) => {
    expect(sanitizePnpSession({ ...valid(), source }, ROUND).source).toBe('write')
  })

  it('shows the first seat for a focus not at the table', () => {
    expect(sanitizePnpSession({ ...valid(), focusedId: 'p9' }, ROUND).focusedId).toBe('p1')
    expect(sanitizePnpSession({ ...valid(), focusedId: undefined }, ROUND).focusedId).toBe('p1')
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

  it('has no pack turn for a turn whose seat is not at the table, and none counted with it', () => {
    expect(sanitizePnpSession({ ...valid(), turnId: 'p9' }, ROUND)).toMatchObject({ turnId: null, recordedTurnRound: null })
    expect(sanitizePnpSession({ ...valid(), turnId: undefined }, ROUND)).toMatchObject({ turnId: null, recordedTurnRound: null })
  })

  it.each([
    ['missing', undefined],
    ['not a string', 4],
    ['without a round id', 'guest'],
    ['with a round id that is no count', 'guest:four'],
    ['under a key no player could have', 'a:b:4']
  ])('keeps a pack turn whose counted round is %s, still to be counted', (_label, recordedTurnRound) => {
    expect(sanitizePnpSession({ ...valid(), recordedTurnRound }, ROUND)).toMatchObject({ turnId: 'p1', recordedTurnRound: null })
  })
})
