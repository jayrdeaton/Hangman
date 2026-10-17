// Who the things kept per player belong to: stats and achievements, unlocked puzzles, the waiting solo
// round, colors, and the art, difficulty and pack picks (keyboard, sound and haptics stay the device's).
// A player is a @tastic/profile profile, by id, or the guest when no profile is picked. There are no
// profiles yet, so everyone is the guest for now; profiles plug in through activePlayerSlice's
// profileId, and everything below already keys on it.
//
// A profile's key is its id. Profile ids are `profile-<time>-<random>` (the fleet's generator), so the
// guest's key can never name a real profile, and neither has a ':' in it, which the per-player storage
// keys (see unlocks.ts) rely on.
export type PlayerKey = string

export const GUEST_PLAYER_KEY: PlayerKey = 'guest'

export const playerKeyFor = (profileId: string | null): PlayerKey => profileId ?? GUEST_PLAYER_KEY

// For the sanitizers of every per-player slice: a stored key worth keeping.
export const isPlayerKey = (value: unknown): value is PlayerKey => typeof value === 'string' && value.length > 0 && !value.includes(':')
