import type { Profile } from '@tastic/profile'

import { guestSeatRef, isPlayerKey, isProfileId, type PlayerRef, SINGLE_PLAYER_SEAT_ID } from './players'

// A Pass & Play session: who is at the table, how each of them has done so far, who writes and who
// guesses the word on the board, where the words come from and which seat the loadout is showing. It
// lives with the Pass & Play round (roundSlice's pnp.session), so it's saved with it and comes back
// after a relaunch. A seat is a guest ("Player 2", by seat number) or a profile from the roster, seated
// from the loadout (roundSlice's setPnpSeatProfile): the stats take each seat's profile id (see
// GameScreen's PnpRound), and a profile that's forgotten leaves its seats as guests (roundSlice's
// clearPnpProfile). Each guest seat is a player of its own (utils/players.ts' guestSeatKey: its own art,
// difficulty, packs, colors, waiting solo round and unlocked puzzles), kept for as long as the seat is at
// the table, a profile sitting there in the meantime included (see seatPlayer and usePlayerData's
// forgetGuestSeat). Seat 1's guest is Single Player's guest (players.ts' SINGLE_PLAYER_SEAT_ID), so
// seat 1 is always first and never leaves.
//
// The players take turns, either writing words for each other or from the packs (a pack turn: one
// player's own solo round, see packTurns.ts). Both count into the same standings, by seat, so a
// session can switch between them and carry on. A session is open-ended: it runs until someone ends it
// from the round-over card (or starts a new one from the loadout), and its winner is whoever has the
// best win rate among the players who guessed at least once (see getSessionResult).

export const MIN_PNP_PLAYERS = 2
// Enough for a family or a table of friends, and few enough that the standings still fit the
// round-over card on a phone.
export const MAX_PNP_PLAYERS = 8
// The cap on the copy of a profile's name a seat keeps, short enough for the standings and the chips.
export const MAX_PLAYER_NAME_LENGTH = 16

// Where the table's words come from: the packs (each player's own art, difficulty and packs, taking
// turns), or the players write them for each other.
export type WordSource = 'packs' | 'write'

export type PnpPlayer = {
  // The seat's own id, stable for as long as the seat exists (another player sitting there keeps
  // it), so the standings and the writer and guesser follow the seat, not who sits in it, and so does
  // the seat's own guest's data (its key is guestSeatKey of this id).
  id: string
  // A guest's "Player N", N its seat number (kept in step by roundSlice as seats come and go: there's
  // no renaming a guest; a player who wants a name makes a profile). A profile's seat keeps a copy of
  // the profile's name here (kept in step by roundSlice whenever the roster changes), for the moment
  // between a profile leaving the roster and it being forgotten; the screens show the roster's name
  // itself (getSeatIdentity).
  name: string
  // The seat's @tastic/profile profile, or null for a guest. One profile sits in one seat at most.
  profileId: string | null
}

// One player's rounds this session, as the guesser: words played and words solved.
export type PnpStanding = { played: number; wins: number }

export type PnpSession = {
  // In seat order: "around the table" means down this list and back to the top.
  players: PnpPlayer[]
  // By seat id. A seat with no entry hasn't guessed this session.
  standings: Record<string, PnpStanding>
  writerId: string
  // Who the word on the board is for: the fair pick while it's being written (the writer can change
  // it), then fixed once it's handed off. Never the writer.
  guesserId: string
  // The round last counted into the standings, by its round id. A round counts once however many
  // times its end is reported (a relaunch mid-round included), and while it's the round on the board
  // its result is in and its guesser writes the next word (see roundSlice's startPnpAuthoring).
  recordedRoundId: number | null
  source: WordSource
  // The seat the loadout shows: its player is the active player there, so the page's art, difficulty,
  // packs and colors are theirs (see LoadoutScreen).
  focusedId: string
  // The seat whose pack turn it is: under way, or played and counted until the next one starts (so the
  // next fair pick goes around the table after it). Null before a session's first pack turn, after a
  // new session or End Session, and once the seat it named leaves the table.
  turnId: string | null
  // The pack turn's round once it's been counted into the standings, as packTurnRoundKey has it (a
  // player's key and their round's id: solo round ids only differ within one player's slot), or null
  // while the turn is still to be counted. A turn counts once, and the round counted is still the
  // turn's while it's unfinished on the board (its last guess lost to a relaunch, see roundSlice's
  // recordPackTurn).
  recordedTurnRound: string | null
}

// What a seat needs of a profile: its id, and its name for the seat's copy (see PnpPlayer's name).
export type SeatedProfile = { id: string; name: string }

// A seat as the screens show it: its name (a profile's own, live from the roster) and its profile
// (null for a guest, and for a seat whose profile has just left the roster, until it's forgotten).
export type PnpSeatIdentity = { name: string; profile: Profile | null }

// What the standings lists show: a seat with its rounds this session, and its profile, for its chip.
export type PnpStandingRow = { id: string; name: string; profile?: Profile | null; played: number; wins: number }

export type PnpSessionResult = { kind: 'winner'; winner: PnpStandingRow } | { kind: 'tie'; tied: PnpStandingRow[] } | { kind: 'none' }

const NO_STANDING: PnpStanding = Object.freeze({ played: 0, wins: 0 })

export const getStanding = (session: Pick<PnpSession, 'standings'>, playerId: string): PnpStanding => session.standings[playerId] ?? NO_STANDING

// Whether any round has been decided this session: the loadout's cue to show each seat's standing and
// offer a new session.
export const hasStandings = (session: Pick<PnpSession, 'standings'>): boolean => Object.values(session.standings).some((standing) => standing.played > 0)

// The seat the loadout shows (the first, for a focus that isn't a seat).
export const getFocusedSeat = (session: Pick<PnpSession, 'players' | 'focusedId'>): PnpPlayer => session.players.find((player) => player.id === session.focusedId) ?? session.players[0]

const identityOf = (player: PnpPlayer, profiles: readonly Profile[]): PnpSeatIdentity => {
  const profile = player.profileId ? (profiles.find((item) => item.id === player.profileId) ?? null) : null
  return { name: profile?.name ?? player.name, profile }
}

// Who sits in a seat, as the screens name them: a profile by the roster's name for it, a guest by
// their seat's Player N.
export const getSeatIdentity = (players: PnpPlayer[], playerId: string, profiles: readonly Profile[]): PnpSeatIdentity => {
  const player = players.find((item) => item.id === playerId)
  return player ? identityOf(player, profiles) : { name: '', profile: null }
}

// Who plays for a seat: its profile while the roster has it, otherwise the seat's own guest (a seat
// whose profile has just left the roster plays as its guest until the profile is forgotten, which makes
// the seat a guest's for good), seat 1's being Single Player's guest.
export const seatPlayer = (player: PnpPlayer, profiles: readonly { id: string }[]): PlayerRef => (player.profileId && profiles.some((profile) => profile.id === player.profileId) ? { profileId: player.profileId, seatId: null } : { profileId: null, seatId: guestSeatRef(player.id) })

// The other players in seat order starting from the one after `playerId`, wrapping: the order ties
// are broken in.
const aroundTheTableFrom = (players: PnpPlayer[], playerId: string): PnpPlayer[] => {
  const index = players.findIndex((player) => player.id === playerId)
  return index < 0 ? players : [...players.slice(index + 1), ...players.slice(0, index)]
}

// The fair pick for who guesses the writer's word: whoever has guessed the fewest words this session,
// ties going around the table from the seat after the writer's. With two players that's always the
// other one.
export const pickFairGuesser = (session: Pick<PnpSession, 'players' | 'standings'>, writerId: string): string => {
  let pick: PnpPlayer | null = null
  for (const player of aroundTheTableFrom(session.players, writerId)) {
    if (!pick || getStanding(session, player.id).played < getStanding(session, pick.id).played) pick = player
  }
  return pick?.id ?? writerId
}

// Who plays the next pack turn: the same fair pick, the last turn's seat in the writer's place (so
// nobody plays twice in a row, and ties go around the table after them), or, with no turn played yet,
// whoever has guessed the fewest words, ties from the first seat.
export const pickNextTurn = (session: Pick<PnpSession, 'players' | 'standings' | 'turnId'>): string => pickFairGuesser(session, session.turnId ?? '')

// A pack turn's round, as recordedTurnRound keeps it: the player's key and the round's id.
export const packTurnRoundKey = (playerKey: string, roundId: number): string => `${playerKey}:${roundId}`

// The seat that takes over from the one at `index` once it's gone: the next one around the table,
// which has slid into its place.
export const seatAfterRemoved = (remaining: PnpPlayer[], index: number): string => remaining[index % remaining.length].id

// Trimmed, single-spaced and capped, the way a profile's name is copied onto its seat. Empty when
// there's nothing left.
export const normalizePlayerName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim()

// A guest's name at a seat: "Player 2" for the second seat (`index` is the seat's place, from 0).
export const guestName = (index: number): string => `Player ${index + 1}`

// Every guest named for their seat's number, as seats come and go. A profile named "Player 2" can sit
// beside the second seat's guest: their chips tell them apart. Mutates the list it's given (the round
// slice's draft).
export const numberGuests = (players: PnpPlayer[]): void => {
  players.forEach((player, index) => {
    if (!player.profileId) player.name = guestName(index)
  })
}

const SEAT_ID = /^p(\d+)$/

// A new guest seat at the end of the table: the next id never used by a seat at the table, named for
// its seat. An id can come back once its seat has left (removing a seat forgets its guest's data, see
// usePlayerData's forgetGuestSeat), so a new seat never finds a leaver's art or colors waiting.
export const createPlayer = (players: PnpPlayer[]): PnpPlayer => {
  const highest = Math.max(0, ...players.map((player) => Number(SEAT_ID.exec(player.id)?.[1] ?? 0)))
  return { id: `p${highest + 1}`, name: guestName(players.length), profileId: null }
}

// A new session's table: two guests, Player 1 writing first for Player 2, the players writing the
// words.
export const createDefaultPnpSession = (): PnpSession => ({
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

// In seat order, each seat named and given its profile the way getSeatIdentity does (`profiles` is the
// roster; without it every seat reads as its stored name, with no profile).
export const getStandingRows = (session: Pick<PnpSession, 'players' | 'standings'>, profiles: readonly Profile[] = []): PnpStandingRow[] => session.players.map((player) => ({ id: player.id, ...identityOf(player, profiles), ...getStanding(session, player.id) }))

// Positive when `b` has the better win rate, compared without division so equal rates (1 of 2 and
// 2 of 4) are exactly equal.
const compareRates = (a: PnpStandingRow, b: PnpStandingRow): number => b.wins * a.played - a.wins * b.played

// Best win rate first, more words solved breaking an equal rate, then seat order; players who haven't
// guessed yet go last, in seat order.
export const rankStandingRows = (rows: PnpStandingRow[]): PnpStandingRow[] =>
  rows
    .map((row, seat) => ({ row, seat }))
    .sort((a, b) => {
      const aGuessed = a.row.played > 0
      if (aGuessed !== b.row.played > 0) return aGuessed ? -1 : 1
      return compareRates(a.row, b.row) || b.row.wins - a.row.wins || a.seat - b.seat
    })
    .map(({ row }) => row)

// The session's winner: the best win rate among the players who guessed at least once. Equal best
// rates are a tie (Jay's call). A session nobody guessed in, or one where nobody solved a word, has
// no winner: a 0% "best" would crown someone for losing every word they guessed.
export const getSessionResult = (rows: PnpStandingRow[]): PnpSessionResult => {
  const guessed = rows.filter((row) => row.played > 0)
  if (!guessed.some((row) => row.wins > 0)) return { kind: 'none' }
  const best = guessed.reduce((leader, row) => (compareRates(leader, row) > 0 ? row : leader))
  const tied = guessed.filter((row) => compareRates(row, best) === 0)
  return tied.length === 1 ? { kind: 'winner', winner: tied[0] } : { kind: 'tie', tied }
}

// The fleet's "-" for a rate with nothing played yet, as on the Stats screen, rather than a 0% that
// reads as a real result.
export const formatWinRate = ({ wins, played }: PnpStanding): string => (played > 0 ? `${Math.round((wins / played) * 100)}%` : '-')

// "Player 1", "Player 1 and Player 2", "Player 1, Player 2 and Player 3".
export const joinNames = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const SOURCES: WordSource[] = ['packs', 'write']
// A player's key (no ':' in it, see players.ts) and a round id.
const TURN_ROUND_KEY = /^[^:]+:\d+$/

// The seats that pass, in order, every guest named for their seat (a guest's stored name isn't
// trusted: names come from the seat), or null for a table that can't stand (seat 1 not first among
// them included: its guest is Single Player's, see SINGLE_PLAYER_SEAT_ID).
const sanitizePlayers = (value: unknown): PnpPlayer[] | null => {
  if (!Array.isArray(value)) return null
  const players: PnpPlayer[] = []
  for (const item of value) {
    if (!isRecord(item) || !isPlayerKey(item.id) || typeof item.name !== 'string') return null
    if (item.profileId !== null && !isProfileId(item.profileId)) return null
    const profileId = item.profileId
    const name = profileId ? normalizePlayerName(item.name) : guestName(players.length)
    if (!name || players.some((other) => other.id === item.id || (profileId !== null && other.profileId === profileId))) return null
    players.push({ id: item.id, name, profileId })
  }
  return players.length >= MIN_PNP_PLAYERS && players.length <= MAX_PNP_PLAYERS && players[0].id === SINGLE_PLAYER_SEAT_ID ? players : null
}

// Checks a stored session before it's trusted (sanitizeRoundState runs it on the Pass & Play round's
// session). A table that doesn't pass (too few or too many seats, seat 1 not first, a seat without a usable id, a
// profile's seat without a usable name, two seats sharing an id, one profile in two seats) starts a
// fresh session. With the table kept, a standing that doesn't pass is dropped (that seat hasn't
// guessed); a writer, focus or guesser who isn't at the table falls back to the first seat and the
// fair pick; a word source that isn't one is the players writing; a pack turn whose seat isn't at the
// table is no turn (and a turn's counted round that isn't one, or comes with no turn, is still to be
// counted); and every guest is named for their seat. `roundId` is the round stored with it: only a
// count of that round means anything (see recordedRoundId), so any other is dropped.
export const sanitizePnpSession = (value: unknown, roundId: number | null): PnpSession => {
  const players = isRecord(value) ? sanitizePlayers(value.players) : null
  if (!isRecord(value) || !players) return createDefaultPnpSession()
  const standings: Record<string, PnpStanding> = {}
  const storedStandings = isRecord(value.standings) ? value.standings : {}
  for (const { id } of players) {
    const standing = storedStandings[id]
    if (isRecord(standing) && isCount(standing.played) && isCount(standing.wins) && standing.played > 0 && standing.wins <= standing.played) standings[id] = { played: standing.played, wins: standing.wins }
  }
  const isSeat = (id: unknown): id is string => typeof id === 'string' && players.some((player) => player.id === id)
  const writerId = isSeat(value.writerId) ? value.writerId : players[0].id
  const guesserId = isSeat(value.guesserId) && value.guesserId !== writerId ? value.guesserId : pickFairGuesser({ players, standings }, writerId)
  const recordedRoundId = roundId !== null && value.recordedRoundId === roundId ? roundId : null
  const source = SOURCES.includes(value.source as WordSource) ? (value.source as WordSource) : 'write'
  const focusedId = isSeat(value.focusedId) ? value.focusedId : players[0].id
  const turnId = isSeat(value.turnId) ? value.turnId : null
  const recordedTurnRound = turnId && typeof value.recordedTurnRound === 'string' && TURN_ROUND_KEY.test(value.recordedTurnRound) ? value.recordedTurnRound : null
  return { players, standings, writerId, guesserId, recordedRoundId, source, focusedId, turnId, recordedTurnRound }
}
