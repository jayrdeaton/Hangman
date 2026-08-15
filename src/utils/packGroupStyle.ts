import type { MD3Theme } from 'react-native-paper'

type ThemeTriad = 'primary' | 'secondary' | 'tertiary'

type PackGroupDef = { icon: string; triad: ThemeTriad }

// Keyed by the exact `group` strings puzzleCatalog.generated.ts ships (see that file's own
// "group" fields) — alphabetical here on purpose, matching getPuzzleManifest's own group sort
// (puzzleCatalog.ts's compareManifestItems), so scrolling a pack list cycles primary -> secondary
// -> tertiary -> primary group to group in the same order the labels themselves already read in,
// rather than jumping around. Custom packs (every user-created pack — see customPacks.ts, which
// never sets `group`) have no entry here on purpose; they fall through to CUSTOM_GROUP below,
// which continues the same cycle rather than breaking it (13 groups total, 13 % 3 = 1 -> secondary).
const PACK_GROUPS: Record<string, PackGroupDef> = {
  Business: { icon: 'briefcase-outline', triad: 'primary' },
  Games: { icon: 'gamepad-variant-outline', triad: 'secondary' },
  Geography: { icon: 'earth', triad: 'tertiary' },
  History: { icon: 'bank-outline', triad: 'primary' },
  Language: { icon: 'translate', triad: 'secondary' },
  Media: { icon: 'movie-open-outline', triad: 'tertiary' },
  Mythology: { icon: 'sword-cross', triad: 'primary' },
  Nature: { icon: 'leaf', triad: 'secondary' },
  Other: { icon: 'shape-outline', triad: 'tertiary' },
  Science: { icon: 'flask-outline', triad: 'primary' },
  Sports: { icon: 'basketball', triad: 'secondary' },
  Transportation: { icon: 'car-outline', triad: 'tertiary' }
}

const CUSTOM_GROUP: PackGroupDef = { icon: 'star-four-points-outline', triad: 'secondary' }

// Falls back to CUSTOM_GROUP both when a pack has no group at all (every custom pack) and for any
// future built-in group this map hasn't caught up with yet, rather than rendering no icon/color.
const groupDef = (group: string | undefined): PackGroupDef => (group === undefined ? CUSTOM_GROUP : (PACK_GROUPS[group] ?? CUSTOM_GROUP))

export const packGroupLabel = (group: string | undefined): string => group ?? 'Custom'

export const packGroupIcon = (group: string | undefined): string => groupDef(group).icon

// The container/onContainer pair goes on the row's own background/text (the "container behind"
// half of the pairing every other themed drawer in this app now uses — see AchievementsDrawer's
// own doc comments); `color` is the small vibrant accent on top (the group icon's own badge
// background), and `onColor` is what sits ON that badge (the icon glyph itself) — the theme's own
// computed contrast for that exact hue, not react-native-paper's generic light/dark fallback
// (Avatar.Icon's own getContrastingColor, a fixed white/rgba(0,0,0,.54) split with no idea what
// hue it's contrasting against), which is wrong the moment a seed color is light enough — a pale
// yellow primary needs dark text, and the generic fallback has no way to know that.
export const packGroupColors = (group: string | undefined, theme: MD3Theme): { color: string; onColor: string; container: string; onContainer: string } => {
  const { triad } = groupDef(group)
  if (triad === 'primary') return { color: theme.colors.primary, onColor: theme.colors.onPrimary, container: theme.colors.primaryContainer, onContainer: theme.colors.onPrimaryContainer }
  if (triad === 'secondary') return { color: theme.colors.secondary, onColor: theme.colors.onSecondary, container: theme.colors.secondaryContainer, onContainer: theme.colors.onSecondaryContainer }
  return { color: theme.colors.tertiary, onColor: theme.colors.onTertiary, container: theme.colors.tertiaryContainer, onContainer: theme.colors.onTertiaryContainer }
}
