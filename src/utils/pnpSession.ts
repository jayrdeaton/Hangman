import type { Profile } from '@tastic/profile'

import { isPlayerKey } from './players'

// A Pass & Play session: who is at the table, how each of them has done guessing so far, and who
// writes and who guesses the word on the board. It lives with the Pass & Play round (roundSlice's
// pnp.session), so it's saved with it and comes back after a relaunch. A seat is a guest ("Player 2",
// renamable) or a profile from the roster, seated from the loadout (roundSlice's setPnpSeatProfile):
// the stats take each seat's profile id (see GameScreen's PnpRound), and a profile that's forgotten
// leaves its seats as guests (roundSlice's clearPnpProfile).
//
// Open-ended: a session runs until someone ends it from the round-over card (or starts a new one from
// the loadout), and its winner is whoever has the best win rate among the players who guessed at
// least once (see getSessionResult).

export const MIN_PNP_PLAYERS = 2
// Enough for a family or a table of friends, and few enough that the standings still fit the
// round-over card on a phone.
export const MAX_PNP_PLAYERS = 8
// Long enough for a real name, short enough to sit on one line in the standings and the chips.
export const MAX_PLAYER_NAME_LENGTH = 16

export type PnpPlayer = {
  // The seat's own id, stable for as long as the seat exists (a rename, or another player sitting
  // there, keeps it), so the standings and the writer and guesser follow the seat, not its name.
  id: string
  // A guest's own name. A profile's seat keeps a copy of the profile's name here (kept in step by
  // roundSlice whenever the roster changes), so every name check below covers the profiles at the
  // table too, and a forgotten profile's seat carries on as a guest under it; the screens show the
  // roster's name itself (getSeatIdentity).
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
}

// A seat as the screens show it: its name (a profile's own, live from the roster) and its profile
// (null for a guest, and for a seat whose profile has just left the roster, until it's forgotten).
export type PnpSeatIdentity = { name: string; profile: Profile | null }

// What the standings lists show: a seat with its rounds this session, and its profile, for its chip.
export type PnpStandingRow = { id: string; name: string; profile?: Profile | null; played: number; wins: number }

export type PnpSessionResult = { kind: 'winner'; winner: PnpStandingRow } | { kind: 'tie'; tied: PnpStandingRow[] } | { kind: 'none' }

const NO_STANDING: PnpStanding = Object.freeze({ played: 0, wins: 0 })

export const getStanding = (session: Pick<PnpSession, 'standings'>, playerId: string): PnpStanding => session.standings[playerId] ?? NO_STANDING

// Whether any round has been played this session: the loadout's cue to show the standings and offer
// Continue.
export const hasStandings = (session: Pick<PnpSession, 'standings'>): boolean => Object.values(session.standings).some((standing) => standing.played > 0)

export const getPlayerName = (players: PnpPlayer[], playerId: string): string => players.find((player) => player.id === playerId)?.name ?? ''

const identityOf = (player: PnpPlayer, profiles: readonly Profile[]): PnpSeatIdentity => {
  const profile = player.profileId ? (profiles.find((item) => item.id === player.profileId) ?? null) : null
  return { name: profile?.name ?? player.name, profile }
}

// Who sits in a seat, as the screens name them: a profile by the roster's name for it, a guest by
// their own.
export const getSeatIdentity = (players: PnpPlayer[], playerId: string, profiles: readonly Profile[]): PnpSeatIdentity => {
  const player = players.find((item) => item.id === playerId)
  return player ? identityOf(player, profiles) : { name: '', profile: null }
}

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

// The seat that takes over from the one at `index` once it's gone: the next one around the table,
// which has slid into its place.
export const seatAfterRemoved = (remaining: PnpPlayer[], index: number): string => remaining[index % remaining.length].id

export const sameName = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase()

// Trimmed, single-spaced and capped, the way every name is kept. Empty when there's nothing left.
export const normalizePlayerName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_NAME_LENGTH).trim()

// Whether another seat already goes by this name (any case): two players with one name would be
// impossible to tell apart in the standings or the prompt's For row.
export const isPlayerNameTaken = (players: PnpPlayer[], name: string, exceptId?: string): boolean => players.some((player) => player.id !== exceptId && sameName(player.name, normalizePlayerName(name)))

const SEAT_ID = /^p(\d+)$/

// The first "Player N" from `number` up that no seat but `exceptId` goes by.
const freeGuestName = (players: PnpPlayer[], number: number, exceptId?: string): string => {
  let n = number
  while (players.some((player) => player.id !== exceptId && sameName(player.name, `Player ${n}`))) n++
  return `Player ${n}`
}

// A new seat: the next id never used by a seat at the table, and the first "Player N" from the new
// seat's number up that nobody already goes by (a table of Player 1 and Player 3 adds Player 4).
export const createPlayer = (players: PnpPlayer[]): PnpPlayer => {
  const highest = Math.max(0, ...players.map((player) => Number(SEAT_ID.exec(player.id)?.[1] ?? 0)))
  return { id: `p${highest + 1}`, name: freeGuestName(players, players.length + 1), profileId: null }
}

// The guest name a seat takes when it's handed back to a guest (from a profile, or clearing a name
// another player now goes by): the first "Player N" from its own seat number up that nobody else at
// the table goes by, so the second seat is Player 2 again whenever it can be.
export const guestNameForSeat = (players: PnpPlayer[], playerId: string): string => freeGuestName(players, players.findIndex((player) => player.id === playerId) + 1, playerId)

// Whether a seat's name can't stand: a guest's name has to differ from everyone else's at the table.
// Two profiles may share one (the roster's names are the roster's; their chips tell them apart).
const nameClashes = (players: PnpPlayer[], player: PnpPlayer): boolean => players.some((other) => other.id !== player.id && sameName(other.name, player.name) && !(player.profileId && other.profileId))

// Every guest whose name another seat now goes by (a profile just seated, renamed or forgotten) takes
// their seat's guest name instead (guestNameForSeat), in seat order. Mutates the list it's given (the
// round slice's draft).
export const settleGuestNames = (players: PnpPlayer[]): void => {
  for (const player of players) if (!player.profileId && nameClashes(players, player)) player.name = guestNameForSeat(players, player.id)
}

// A new session's table: two guests, Player 1 writing first for Player 2.
export const createDefaultPnpSession = (): PnpSession => ({
  players: [
    { id: 'p1', name: 'Player 1', profileId: null },
    { id: 'p2', name: 'Player 2', profileId: null }
  ],
  standings: {},
  writerId: 'p1',
  guesserId: 'p2',
  recordedRoundId: null
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

const sanitizePlayers = (value: unknown): PnpPlayer[] | null => {
  if (!Array.isArray(value)) return null
  const players: PnpPlayer[] = []
  for (const item of value) {
    if (!isRecord(item) || !isPlayerKey(item.id) || typeof item.name !== 'string') return null
    const name = normalizePlayerName(item.name)
    if (item.profileId !== null && !isPlayerKey(item.profileId)) return null
    const player: PnpPlayer = { id: item.id, name, profileId: item.profileId }
    if (!name || players.some((other) => other.id === item.id || (player.profileId !== null && other.profileId === player.profileId)) || nameClashes([...players, player], player)) return null
    players.push(player)
  }
  return players.length >= MIN_PNP_PLAYERS && players.length <= MAX_PNP_PLAYERS ? players : null
}

// Checks a stored session before it's trusted (sanitizeRoundState runs it on the Pass & Play round's
// session). A table that doesn't pass (too few or too many seats, a seat without a usable id or name,
// two seats sharing an id, a guest going by another seat's name, one profile in two seats) starts a
// fresh session; with the table kept, a standing that doesn't pass is dropped (that seat hasn't
// guessed), and a writer or guesser who isn't at the table falls back to the first seat and the fair
// pick. `roundId` is the round stored with it: only a count of that round
// means anything (see recordedRoundId), so any other is dropped.
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
  return { players, standings, writerId, guesserId, recordedRoundId }
}
