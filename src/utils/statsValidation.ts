import { DEFAULT_DAY_STREAK, DEFAULT_OUTCOME_RECORD, DEFAULT_WIN_STREAK } from '@tastic/achievements'

import type { ProfileStats, StatsState } from '@/types/stats'

// Fresh nested objects and arrays, so nothing in a default is ever shared with stats built from it.
export const createDefaultProfileStats = (): ProfileStats => ({
  ...DEFAULT_DAY_STREAK,
  solo: { ...DEFAULT_OUTCOME_RECORD },
  soloStreak: { ...DEFAULT_WIN_STREAK },
  pnp: { ...DEFAULT_OUTCOME_RECORD },
  flawlessWins: 0,
  noHintWins: 0,
  wonModeIds: [],
  completedPackKeys: [],
  customPacksCreated: 0,
  lettersGuessed: 0,
  lettersCorrect: 0,
  firstGameResult: null,
  firstGameFlawless: false
})

export const createDefaultStats = (): StatsState => ({ ...createDefaultProfileStats(), profiles: {} })

export const DEFAULT_STATS: StatsState = createDefaultStats()

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isCount = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isOutcomeRecord = (value: unknown): boolean => isRecord(value) && isCount(value.played) && isCount(value.wins) && isCount(value.losses) && isCount(value.draws)
const isWinStreak = (value: unknown): boolean => isRecord(value) && isCount(value.currentWinStreak) && isCount(value.bestWinStreak)
const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string')

// Each stored field's check, for the device bucket and every profile's alike. A field missing entirely
// (from before a field was added) passes, and migrateStats below fills it in, so adding a stat later
// never wipes anyone's progress.
const FIELD_CHECKS: [keyof ProfileStats, (value: unknown) => boolean][] = [
  ['solo', isOutcomeRecord],
  ['soloStreak', isWinStreak],
  ['pnp', isOutcomeRecord],
  ['flawlessWins', isCount],
  ['noHintWins', isCount],
  ['wonModeIds', isStringList],
  ['completedPackKeys', isStringList],
  ['customPacksCreated', isCount],
  ['lettersGuessed', isCount],
  ['lettersCorrect', isCount],
  ['firstGameResult', (v) => v === null || v === 'win' || v === 'loss' || v === 'draw'],
  ['firstGameFlawless', (v) => typeof v === 'boolean'],
  ['distinctDaysPlayed', isCount],
  ['currentDayStreak', isCount],
  ['bestDayStreak', isCount],
  ['lastPlayedDate', (v) => v === null || typeof v === 'string']
]

export const isValidProfileStats = (value: unknown): value is ProfileStats => isRecord(value) && FIELD_CHECKS.every(([key, check]) => value[key] === undefined || check(value[key]))

// Checks the persisted blob before the slice accepts it; one that fails falls back to the defaults. Only
// the device bucket decides that: a profile's bucket that fails its own checks is dropped by
// migrateStats on its own, so one bad bucket never costs every player their record.
export const isValidStats = (value: unknown): value is StatsState => {
  if (!isValidProfileStats(value)) return false
  const { profiles } = value as { profiles?: unknown }
  return profiles === undefined || isRecord(profiles)
}

const migrateProfileStats = (stored: ProfileStats): ProfileStats => ({ ...createDefaultProfileStats(), ...stored })

// Fills any field a stored bucket lacks with its default, and drops a profile's bucket that isn't one.
export const migrateStats = (stored: StatsState): StatsState => {
  const { profiles: storedProfiles, ...device } = stored
  const profiles: StatsState['profiles'] = {}
  for (const [profileId, bucket] of Object.entries(storedProfiles ?? {})) {
    if (isValidProfileStats(bucket)) profiles[profileId] = migrateProfileStats(bucket)
  }
  return { ...migrateProfileStats(device as ProfileStats), profiles }
}
