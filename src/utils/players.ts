// Who the things kept per player belong to: stats and achievements, unlocked puzzles, the waiting solo
// round, colors, and the art, difficulty and pack picks (keyboard, sound and haptics stay the device's).
// A player is a @tastic/profile profile, by id; a Pass & Play guest seat's own guest, by the seat's id;
// or, with neither, Single Player's guest. The active one is activePlayerSlice's (the loadout's player:
// Single Player's pick, or the Pass & Play table's focused seat, and in a Pass & Play round whoever's
// turn it is), and everything below keys on it. The roster itself is the fleet's (see useProfiles'
// ProfilesProvider).
//
// A profile's key is its id. Single Player's guest is 'guest', and each guest seat at the Pass & Play
// table is `guest-<seat id>` (Jay, 2026-10-18: each guest seat has its own art, difficulty, packs,
// colors, waiting solo round and unlocked puzzles), from the seat's stable id, never its "Player N",
// which renumbers as seats come and go. Seat 1's guest is Single Player's guest, though, 'guest' (see
// SINGLE_PLAYER_SEAT_ID). Profile ids are `profile-<time>-<random>` (the fleet's
// generator), and a stored id that could be a guest's is never taken for a profile's (isProfileId), so
// no guest's key can name a real profile. None of them has a ':' in it, which the per-player storage
// keys (see unlocks.ts) rely on. A guest's stats stay the device's: only a profile has a bucket of its
// own (see useGameStats).
export type PlayerKey = string

export const GUEST_PLAYER_KEY: PlayerKey = 'guest'

const GUEST_SEAT_KEY_PREFIX = `${GUEST_PLAYER_KEY}-`

// Seat 1 at the Pass & Play table is Single Player's guest's (Jay, 2026-10-19): whoever plays alone is
// nearly always Player 1 when the table comes out, so they're one player, with one art, set of colors,
// packs, waiting puzzle and unlocked puzzles, the way a profile is the same player at either door. Its
// guest is keyed and referred to as Single Player's guest wherever the seat sits, and the seat can leave
// the table like any other (Jay, 2026-10-20: a parent's seat, for the children to play on their own),
// though unlike any other seat's guest (usePlayerData's forgetGuestSeat), theirs keeps everything.
export const SINGLE_PLAYER_SEAT_ID = 'p1'

// A guest seat's own key: `guest-p2` for the seat whose id is p2, and Single Player's for seat 1.
export const guestSeatKey = (seatId: string): PlayerKey => (seatId === SINGLE_PLAYER_SEAT_ID ? GUEST_PLAYER_KEY : `${GUEST_SEAT_KEY_PREFIX}${seatId}`)

// The seat a guest sitting at `seatId` is referred to by (PlayerRef's seatId): none for seat 1, whose
// guest is Single Player's.
export const guestSeatRef = (seatId: string | null): string | null => (seatId === SINGLE_PLAYER_SEAT_ID ? null : seatId)

export const isGuestSeatKey = (key: PlayerKey): boolean => key.startsWith(GUEST_SEAT_KEY_PREFIX)

// Who a player is: a profile's id, or for a guest null and the guest seat they sit in (null for Single
// Player's guest, seat 1's included). A profile is the same player in any seat, so a profile's seatId is
// always null.
export type PlayerRef = { profileId: string | null; seatId: string | null }

export const playerKeyFor = (profileId: string | null, seatId: string | null = null): PlayerKey => profileId ?? (seatId ? guestSeatKey(seatId) : GUEST_PLAYER_KEY)

// For the sanitizers of every per-player slice: a stored key worth keeping.
export const isPlayerKey = (value: unknown): value is PlayerKey => typeof value === 'string' && value.length > 0 && !value.includes(':')

// A stored id that could be a profile's: a player key that isn't a guest's.
export const isProfileId = (value: unknown): value is string => isPlayerKey(value) && value !== GUEST_PLAYER_KEY && !isGuestSeatKey(value)
