import AsyncStorage from '@react-native-async-storage/async-storage'

import { VISIBLE_MODES } from '@/modes/registry'

const ACHIEVEMENTS_KEY = 'achievements_v1'

export type AchievementId = 'mode_master' | 'pack_complete' | 'flawless' | 'no_hints' | 'win_streak_5' | 'win_streak_10' | 'win_streak_20' | 'milestone_10' | 'milestone_50' | 'milestone_100' | 'milestone_500' | 'milestone_1000' | 'milestone_2500' | 'milestone_5000' | 'milestone_10000' | 'milestone_20000' | 'packs_created_1' | 'packs_created_5' | 'packs_created_15' | 'packs_created_30' | 'pnp_played_5' | 'pnp_played_25' | 'pnp_played_100' | 'pnp_played_250'

export type AchievementDefinition = {
  id: AchievementId
  title: string
  description: string
  icon: string
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  { id: 'mode_master', title: 'Mode Master', description: 'Win a puzzle in every game mode.', icon: 'palette-outline' },
  { id: 'pack_complete', title: 'Collection Complete', description: 'Fully unlock every puzzle in a category pack.', icon: 'check-decagram-outline' },
  { id: 'flawless', title: 'Flawless Victory', description: 'Win a puzzle without a single wrong guess.', icon: 'shield-check-outline' },
  { id: 'no_hints', title: 'No Hints Needed', description: 'Win a puzzle without revealing its hint.', icon: 'lightbulb-off-outline' },
  { id: 'win_streak_5', title: 'On a Roll', description: 'Win 5 puzzles in a row.', icon: 'fire' },
  { id: 'win_streak_10', title: 'On Fire', description: 'Win 10 puzzles in a row.', icon: 'fire' },
  { id: 'win_streak_20', title: 'Unstoppable', description: 'Win 20 puzzles in a row.', icon: 'fire' },
  { id: 'milestone_10', title: 'Getting Started', description: 'Solve 10 puzzles.', icon: 'medal-outline' },
  { id: 'milestone_50', title: 'Word Nerd', description: 'Solve 50 puzzles.', icon: 'medal-outline' },
  { id: 'milestone_100', title: 'Century Club', description: 'Solve 100 puzzles.', icon: 'medal-outline' },
  { id: 'milestone_500', title: 'Hangman Legend', description: 'Solve 500 puzzles.', icon: 'medal-outline' },
  { id: 'milestone_1000', title: 'Puzzle Fanatic', description: 'Solve 1,000 puzzles.', icon: 'trophy-outline' },
  { id: 'milestone_2500', title: 'Word Wizard', description: 'Solve 2,500 puzzles.', icon: 'trophy-variant-outline' },
  { id: 'milestone_5000', title: 'Vocabulary Virtuoso', description: 'Solve 5,000 puzzles.', icon: 'trophy-award' },
  { id: 'milestone_10000', title: 'Hangman Sage', description: 'Solve 10,000 puzzles.', icon: 'crown-outline' },
  { id: 'milestone_20000', title: 'Living Legend', description: 'Solve 20,000 puzzles.', icon: 'crown' },
  { id: 'packs_created_1', title: 'Pack Rat', description: 'Create your first custom pack.', icon: 'folder-plus-outline' },
  { id: 'packs_created_5', title: 'Curator', description: 'Create 5 custom packs.', icon: 'folder-multiple-outline' },
  { id: 'packs_created_15', title: 'Pack Architect', description: 'Create 15 custom packs.', icon: 'folder-star-outline' },
  { id: 'packs_created_30', title: 'Master Curator', description: 'Create 30 custom packs.', icon: 'folder-star' },
  { id: 'pnp_played_5', title: 'Party Starter', description: 'Play 5 pass & play games.', icon: 'account-group-outline' },
  { id: 'pnp_played_25', title: 'Game Night Regular', description: 'Play 25 pass & play games.', icon: 'account-group' },
  { id: 'pnp_played_100', title: 'Social Butterfly', description: 'Play 100 pass & play games.', icon: 'party-popper' },
  { id: 'pnp_played_250', title: 'Pass & Play Legend', description: 'Play 250 pass & play games.', icon: 'crown-outline' }
]

export const ACHIEVEMENT_DEFINITIONS_BY_ID: Record<AchievementId, AchievementDefinition> = Object.fromEntries(ACHIEVEMENT_DEFINITIONS.map((def) => [def.id, def])) as Record<AchievementId, AchievementDefinition>

export type AchievementStats = {
  unlockedIds: AchievementId[]
  wonModeIds: string[]
  currentStreak: number
  bestStreak: number
  totalSolved: number
  totalLost: number
  lettersGuessed: number
  lettersCorrect: number
  pnpWins: number
  pnpLosses: number
  flawlessWins: number
  noHintWins: number
  customPacksCreated: number
}

export const DEFAULT_ACHIEVEMENT_STATS: AchievementStats = {
  unlockedIds: [],
  wonModeIds: [],
  currentStreak: 0,
  bestStreak: 0,
  totalSolved: 0,
  totalLost: 0,
  lettersGuessed: 0,
  lettersCorrect: 0,
  pnpWins: 0,
  pnpLosses: 0,
  flawlessWins: 0,
  noHintWins: 0,
  customPacksCreated: 0
}

const VALID_IDS = new Set<string>(ACHIEVEMENT_DEFINITIONS.map((def) => def.id))

// Always builds a fresh object with its own unlockedIds/wonModeIds arrays — never spread
// DEFAULT_ACHIEVEMENT_STATS directly, since a shallow copy shares its array references and a
// later `stats.unlockedIds.push(...)` would mutate the shared module-level default in place.
const cloneDefaultStats = (): AchievementStats => ({ ...DEFAULT_ACHIEVEMENT_STATS, unlockedIds: [], wonModeIds: [] })

const normalizeStats = (raw: unknown): AchievementStats => {
  if (!raw || typeof raw !== 'object') return cloneDefaultStats()

  const input = raw as Record<string, unknown>
  const unlockedIds = Array.isArray(input.unlockedIds) ? input.unlockedIds.filter((id): id is AchievementId => typeof id === 'string' && VALID_IDS.has(id)) : []
  const wonModeIds = Array.isArray(input.wonModeIds) ? input.wonModeIds.filter((id): id is string => typeof id === 'string') : []
  const currentStreak = typeof input.currentStreak === 'number' && Number.isFinite(input.currentStreak) ? input.currentStreak : 0
  const bestStreak = typeof input.bestStreak === 'number' && Number.isFinite(input.bestStreak) ? input.bestStreak : 0
  const totalSolved = typeof input.totalSolved === 'number' && Number.isFinite(input.totalSolved) ? input.totalSolved : 0
  const totalLost = typeof input.totalLost === 'number' && Number.isFinite(input.totalLost) ? input.totalLost : 0
  const lettersGuessed = typeof input.lettersGuessed === 'number' && Number.isFinite(input.lettersGuessed) ? input.lettersGuessed : 0
  const lettersCorrect = typeof input.lettersCorrect === 'number' && Number.isFinite(input.lettersCorrect) ? input.lettersCorrect : 0
  const pnpWins = typeof input.pnpWins === 'number' && Number.isFinite(input.pnpWins) ? input.pnpWins : 0
  const pnpLosses = typeof input.pnpLosses === 'number' && Number.isFinite(input.pnpLosses) ? input.pnpLosses : 0
  const flawlessWins = typeof input.flawlessWins === 'number' && Number.isFinite(input.flawlessWins) ? input.flawlessWins : 0
  const noHintWins = typeof input.noHintWins === 'number' && Number.isFinite(input.noHintWins) ? input.noHintWins : 0
  const customPacksCreated = typeof input.customPacksCreated === 'number' && Number.isFinite(input.customPacksCreated) ? input.customPacksCreated : 0

  return { unlockedIds: [...new Set(unlockedIds)], wonModeIds: [...new Set(wonModeIds)], currentStreak, bestStreak, totalSolved, totalLost, lettersGuessed, lettersCorrect, pnpWins, pnpLosses, flawlessWins, noHintWins, customPacksCreated }
}

export const getAchievementStats = async (): Promise<AchievementStats> => {
  try {
    const raw = await AsyncStorage.getItem(ACHIEVEMENTS_KEY)
    if (!raw) return cloneDefaultStats()
    return normalizeStats(JSON.parse(raw))
  } catch (_e) {
    return cloneDefaultStats()
  }
}

const saveStats = async (stats: AchievementStats): Promise<void> => {
  await AsyncStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(stats))
}

export const clearAchievements = async (): Promise<void> => {
  await AsyncStorage.removeItem(ACHIEVEMENTS_KEY)
}

export type SolveResult = {
  modeId: string
  wrongGuesses: number
  guessCount: number
  hintWasAvailable: boolean
  hintRevealed: boolean
  packKey?: string
  packUnlockedCount?: number
  packTotalCount?: number
}

export const recordSolve = async (result: SolveResult): Promise<AchievementId[]> => {
  const stats = await getAchievementStats()
  const newlyUnlocked: AchievementId[] = []

  const unlock = (id: AchievementId) => {
    if (!stats.unlockedIds.includes(id)) {
      stats.unlockedIds.push(id)
      newlyUnlocked.push(id)
    }
  }

  stats.totalSolved += 1
  stats.currentStreak += 1
  stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak)
  stats.lettersGuessed += result.guessCount
  stats.lettersCorrect += result.guessCount - result.wrongGuesses

  if (!stats.wonModeIds.includes(result.modeId)) stats.wonModeIds.push(result.modeId)
  // VISIBLE_MODES, not ALL_MODES — a hidden mode isn't offered in the picker anymore, so
  // requiring a win in it too would make this permanently unearnable for anyone who hasn't
  // already won one from before it was hidden. A won id that happens to be hidden still counts
  // toward wonModeIds itself (see the push above) — this only changes the target count.
  if (stats.wonModeIds.length >= VISIBLE_MODES.length) unlock('mode_master')

  // Tallied every qualifying win, not just the first — unlike unlock() above, which only ever
  // fires once per id. These are what the Achievements list's per-badge counts (see
  // AchievementsDrawer.tsx) are reading, so "Flawless Victory" and "No Hints Needed" can show how
  // many times each was actually earned rather than just a locked/unlocked state.
  if (result.wrongGuesses === 0) {
    stats.flawlessWins += 1
    unlock('flawless')
  }
  if (result.hintWasAvailable && !result.hintRevealed) {
    stats.noHintWins += 1
    unlock('no_hints')
  }
  if (result.packKey && result.packTotalCount && result.packTotalCount > 0 && (result.packUnlockedCount ?? 0) >= result.packTotalCount) unlock('pack_complete')

  if (stats.currentStreak >= 5) unlock('win_streak_5')
  if (stats.currentStreak >= 10) unlock('win_streak_10')
  if (stats.currentStreak >= 20) unlock('win_streak_20')
  if (stats.totalSolved >= 10) unlock('milestone_10')
  if (stats.totalSolved >= 50) unlock('milestone_50')
  if (stats.totalSolved >= 100) unlock('milestone_100')
  if (stats.totalSolved >= 500) unlock('milestone_500')
  if (stats.totalSolved >= 1000) unlock('milestone_1000')
  if (stats.totalSolved >= 2500) unlock('milestone_2500')
  if (stats.totalSolved >= 5000) unlock('milestone_5000')
  if (stats.totalSolved >= 10000) unlock('milestone_10000')
  if (stats.totalSolved >= 20000) unlock('milestone_20000')

  await saveStats(stats)
  return newlyUnlocked
}

export type LossResult = {
  wrongGuesses: number
  guessCount: number
}

export const recordLoss = async (result: LossResult): Promise<void> => {
  const stats = await getAchievementStats()
  stats.totalLost += 1
  stats.currentStreak = 0
  stats.lettersGuessed += result.guessCount
  stats.lettersCorrect += result.guessCount - result.wrongGuesses
  await saveStats(stats)
}

// Pass-and-play results are tracked in their own counters, entirely separate from the solo stats
// above — a friend's win or loss shouldn't move the solo streak, feed the milestone achievements,
// or count toward totalSolved/totalLost (see Main.tsx's handleSolved/handleLost for the same
// split). The pnp_played_* ladder still unlocks off these counters, but on total rounds played
// (win + loss combined) rather than wins alone -- losing a pass-and-play round is still a round
// played with a friend.
const unlockPnpPlayedTiers = (stats: AchievementStats, unlock: (id: AchievementId) => void): void => {
  const totalPlayed = stats.pnpWins + stats.pnpLosses
  if (totalPlayed >= 5) unlock('pnp_played_5')
  if (totalPlayed >= 25) unlock('pnp_played_25')
  if (totalPlayed >= 100) unlock('pnp_played_100')
  if (totalPlayed >= 250) unlock('pnp_played_250')
}

export const recordPnpWin = async (): Promise<AchievementId[]> => {
  const stats = await getAchievementStats()
  const newlyUnlocked: AchievementId[] = []
  const unlock = (id: AchievementId) => {
    if (!stats.unlockedIds.includes(id)) {
      stats.unlockedIds.push(id)
      newlyUnlocked.push(id)
    }
  }

  stats.pnpWins += 1
  unlockPnpPlayedTiers(stats, unlock)

  await saveStats(stats)
  return newlyUnlocked
}

export const recordPnpLoss = async (): Promise<AchievementId[]> => {
  const stats = await getAchievementStats()
  const newlyUnlocked: AchievementId[] = []
  const unlock = (id: AchievementId) => {
    if (!stats.unlockedIds.includes(id)) {
      stats.unlockedIds.push(id)
      newlyUnlocked.push(id)
    }
  }

  stats.pnpLosses += 1
  unlockPnpPlayedTiers(stats, unlock)

  await saveStats(stats)
  return newlyUnlocked
}

// Counts lifetime pack creations (via the Pack Editor's "New pack" flow, not editing an existing
// one) -- never decremented on delete, same as totalSolved above only ever growing regardless of
// what later happens to the puzzle unlock it counted.
export const recordCustomPackCreated = async (): Promise<AchievementId[]> => {
  const stats = await getAchievementStats()
  const newlyUnlocked: AchievementId[] = []
  const unlock = (id: AchievementId) => {
    if (!stats.unlockedIds.includes(id)) {
      stats.unlockedIds.push(id)
      newlyUnlocked.push(id)
    }
  }

  stats.customPacksCreated += 1
  if (stats.customPacksCreated >= 1) unlock('packs_created_1')
  if (stats.customPacksCreated >= 5) unlock('packs_created_5')
  if (stats.customPacksCreated >= 15) unlock('packs_created_15')
  if (stats.customPacksCreated >= 30) unlock('packs_created_30')

  await saveStats(stats)
  return newlyUnlocked
}
