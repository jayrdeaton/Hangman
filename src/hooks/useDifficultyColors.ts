import { getColorRoles, useAutoPaperTheme } from '@rific/auto-paper'
import { useMemo } from 'react'

import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

// A fill/container color, not a text color — for the currently-selected segment in PuzzleDrawer's
// Difficulty picker, so its background reads as "this tier" instead of the theme's generic
// selected-segment tint. Only used for the "Any" segment, which stands in for a difficulty tier
// using theme.colors.primary (the app's own accent) rather than one of the semantic tiers below —
// those get their container straight from the theme (successContainer/warningContainer/
// dangerContainer), so this plain helper is only needed for the one case that isn't a semantic role.
export const getContainerColor = (baseHex: string, surface: string): string => getColorRoles(baseHex, surface).container

// Shared by PuzzleInfoRow's difficulty badge and PuzzleDrawer's difficulty picker, so both reflect
// the exact same colors. easy/medium/hard map onto @rific/auto-paper's success/warning/danger theme
// roles (see useComputedTheme.ts) rather than Hangman defining its own hex — those roles already
// exist for every app built on this theme system. `danger`, not `error` — MD3's own error role is
// deliberately left untouched by the theme (react-native-paper's TextInput/HelperText/Badge read it
// directly for real form validation), so a "hard" badge needing the same getColorRoles treatment as
// easy/medium gets its own namespace instead of borrowing that one.
export const useDifficultyColors = (): Record<PuzzleDifficultyTier, string> => {
  const theme = useAutoPaperTheme()
  return useMemo(
    () => ({
      easy: theme.colors.onSuccessContainer,
      medium: theme.colors.onWarningContainer,
      hard: theme.colors.onDangerContainer
    }),
    [theme.colors.onSuccessContainer, theme.colors.onWarningContainer, theme.colors.onDangerContainer]
  )
}

// The fill for whichever segment is currently selected in PuzzleDrawer's Difficulty picker —
// sibling to useDifficultyColors above (that one's for the badge text shown during play), kept
// separate rather than folded into one return value since PuzzleInfoRow's badge only ever needs
// the text color and has no use for a container fill.
export const useDifficultyContainerColors = (): Record<PuzzleDifficultyTier, string> => {
  const theme = useAutoPaperTheme()
  return useMemo(
    () => ({
      easy: theme.colors.successContainer,
      medium: theme.colors.warningContainer,
      hard: theme.colors.dangerContainer
    }),
    [theme.colors.successContainer, theme.colors.warningContainer, theme.colors.dangerContainer]
  )
}
