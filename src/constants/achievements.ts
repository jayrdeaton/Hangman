import { tieredFamily } from '@tastic/achievements'

import type { AchievementDefinition, StatsState } from '@/types/stats'
import { getTotalPlayed, getTotalWins } from '@/utils/statsEngine'

export { ACHIEVEMENT_TIER_COLORS } from '@tastic/achievements'

// How many modes the Customize carousel offers (VISIBLE_MODES in src/modes/registry.ts). Hardcoded so
// this file doesn't pull every mode's artwork into whatever imports the catalog; the catalog test
// checks it still matches the registry.
export const VISIBLE_MODE_COUNT = 10

// Every achievement, in the order the Achievements list shows them and the round-end card lists fresh
// unlocks. The ids become stored unlock keys, so they're permanent once the app ships: rename a title,
// never an id. A tiered family's ids are `${id}_bronze`, `${id}_silver` and `${id}_gold`.
//
// Jay's calls (2026-10-15): the solve ladders stop at 2,500 (the old 5,000 to 20,000 ladder is gone);
// Flawless Debut keeps the fleet's id and gold tier but asks for the first puzzle to be solved with no
// wrong guess; Pass & Play's ladder is 5 / 25 / 100; shared-link puzzles count as solo rounds.
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  {
    id: 'first_game_played',
    title: 'First Word',
    description: 'Play your first puzzle.',
    tier: 'bronze',
    icon: 'flag-checkered',
    isUnlocked: (stats) => getTotalPlayed(stats) >= 1
  },
  {
    id: 'first_ever_win',
    title: 'Solved It',
    description: 'Solve your first puzzle.',
    tier: 'bronze',
    icon: 'star',
    isUnlocked: (stats) => getTotalWins(stats) >= 1
  },
  {
    id: 'flawless_debut',
    title: "Beginner's Luck",
    description: 'Solve the very first puzzle you play without a wrong guess.',
    tier: 'gold',
    icon: 'star-circle',
    scope: 'device',
    isUnlocked: (stats) => stats.firstGameFlawless
  },
  ...tieredFamily<StatsState>({
    id: 'puzzles_solved',
    titles: { bronze: 'Getting Started', silver: 'Word Nerd', gold: 'Century Club' },
    description: (n) => `Solve ${n} puzzles.`,
    icon: 'medal-outline',
    thresholds: { bronze: 10, silver: 50, gold: 100 },
    value: (stats) => stats.solo.wins
  }),
  ...tieredFamily<StatsState>({
    id: 'puzzles_solved_veteran',
    titles: { bronze: 'Hangman Legend', silver: 'Puzzle Fanatic', gold: 'Word Wizard' },
    description: (n) => `Solve ${n.toLocaleString('en-US')} puzzles.`,
    icon: 'trophy-outline',
    thresholds: { bronze: 500, silver: 1000, gold: 2500 },
    value: (stats) => stats.solo.wins
  }),
  ...tieredFamily<StatsState>({
    id: 'win_streak',
    titles: { bronze: 'On a Roll', silver: 'On Fire', gold: 'Unstoppable' },
    description: (n) => `Solve ${n} puzzles in a row.`,
    icon: 'fire',
    thresholds: { bronze: 5, silver: 10, gold: 20 },
    value: (stats) => stats.soloStreak.bestWinStreak
  }),
  ...tieredFamily<StatsState>({
    id: 'flawless',
    titles: { bronze: 'Flawless Victory', silver: 'Spotless', gold: 'Perfectionist' },
    description: (n) => (n === 1 ? 'Solve a puzzle without a single wrong guess.' : `Solve ${n} puzzles without a single wrong guess.`),
    icon: 'shield-check-outline',
    thresholds: { bronze: 1, silver: 10, gold: 50 },
    value: (stats) => stats.flawlessWins
  }),
  ...tieredFamily<StatsState>({
    id: 'no_hints_needed',
    titles: { bronze: 'No Hints Needed', silver: 'Self-Reliant', gold: 'Mind Reader' },
    description: (n) => (n === 1 ? 'Solve a puzzle without revealing its hint.' : `Solve ${n} puzzles without revealing their hints.`),
    icon: 'lightbulb-off-outline',
    thresholds: { bronze: 1, silver: 25, gold: 100 },
    value: (stats) => stats.noHintWins
  }),
  ...tieredFamily<StatsState>({
    id: 'mode_explorer',
    titles: { bronze: 'Sketcher', silver: 'Illustrator', gold: 'Mode Master' },
    description: (n) => (n === VISIBLE_MODE_COUNT ? 'Solve a puzzle in every mode.' : `Solve a puzzle in ${n} different modes.`),
    icon: 'palette-outline',
    thresholds: { bronze: 3, silver: 6, gold: VISIBLE_MODE_COUNT },
    value: (stats) => stats.wonModeIds.length
  }),
  ...tieredFamily<StatsState>({
    id: 'packs_completed',
    titles: { bronze: 'Collection Complete', silver: 'Collector', gold: 'Completionist' },
    description: (n) => (n === 1 ? 'Unlock every puzzle in a built-in pack.' : `Unlock every puzzle in ${n} built-in packs.`),
    icon: 'check-decagram-outline',
    thresholds: { bronze: 1, silver: 5, gold: 15 },
    value: (stats) => stats.completedPackKeys.length
  }),
  {
    id: 'first_custom_pack',
    title: 'Pack Rat',
    description: 'Create your first custom pack.',
    tier: 'bronze',
    icon: 'folder-plus-outline',
    isUnlocked: (stats) => stats.customPacksCreated >= 1
  },
  ...tieredFamily<StatsState>({
    id: 'packs_created',
    titles: { bronze: 'Curator', silver: 'Pack Architect', gold: 'Master Curator' },
    description: (n) => `Create ${n} custom packs.`,
    icon: 'folder-star-outline',
    thresholds: { bronze: 5, silver: 15, gold: 30 },
    value: (stats) => stats.customPacksCreated
  }),
  ...tieredFamily<StatsState>({
    id: 'local_matches',
    titles: { bronze: 'Party Starter', silver: 'Game Night Regular', gold: 'Social Butterfly' },
    description: (n) => `Play ${n} Pass & Play rounds.`,
    icon: 'account-group',
    thresholds: { bronze: 5, silver: 25, gold: 100 },
    value: (stats) => stats.pnp.played
  }),
  ...tieredFamily<StatsState>({
    id: 'days_played',
    titles: { bronze: 'Regular Visitor', silver: 'Dedicated', gold: 'Devoted' },
    description: (n) => `Play ${n} days in a row.`,
    icon: 'calendar-check',
    thresholds: { bronze: 3, silver: 14, gold: 30 },
    value: (stats) => stats.bestDayStreak
  })
]
