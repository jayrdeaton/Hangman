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

// The SELECTED segment's own fill in PuzzleDrawer's Difficulty picker — full-saturation
// success/warning/danger rather than useDifficultyContainerColors' muted container tint, so the
// checked tier reads as solid and vibrant the same way every other button in this app now does,
// with the UNCHECKED segments left on the muted container fill instead (see PuzzleDrawer's own
// difficultyOptions comment for the checked/unchecked split).
export const useDifficultyVibrantColors = (): Record<PuzzleDifficultyTier, string> => {
  const theme = useAutoPaperTheme()
  return useMemo(
    () => ({
      easy: theme.colors.success,
      medium: theme.colors.warning,
      hard: theme.colors.danger
    }),
    [theme.colors.success, theme.colors.warning, theme.colors.danger]
  )
}

// Text/icon color that stays legible on top of useDifficultyVibrantColors' own fill — the
// selected segment's label, paired with that hook the same way useDifficultyColors pairs with
// useDifficultyContainerColors for the unchecked ones.
export const useDifficultyOnVibrantColors = (): Record<PuzzleDifficultyTier, string> => {
  const theme = useAutoPaperTheme()
  return useMemo(
    () => ({
      easy: theme.colors.onSuccess,
      medium: theme.colors.onWarning,
      hard: theme.colors.onDanger
    }),
    [theme.colors.onSuccess, theme.colors.onWarning, theme.colors.onDanger]
  )
}

export type DifficultyOptionColors = { container: string; onContainer: string; onVibrant: string; vibrant: string }

// The full vibrant/container pairing for every difficulty CHOICE a player picks from — the three
// real tiers plus "Any", which isn't a tier at all (colored with the theme's own primary instead,
// so it still pops when selected rather than being the one option that looks unfinished next to
// three colored ones — see PuzzleDrawer's own original comment on this). One shared hook rather
// than each picker (PuzzleDrawer's own Difficulty segmented control, PackPuzzleList's own
// difficulty filter menu) hand-rolling the same four-way color set, so a change here can't drift
// between the two.
export const useDifficultyOptionColors = (): Record<'any' | PuzzleDifficultyTier, DifficultyOptionColors> => {
  const theme = useAutoPaperTheme()
  const onContainerColors = useDifficultyColors()
  const containerColors = useDifficultyContainerColors()
  const vibrantColors = useDifficultyVibrantColors()
  const onVibrantColors = useDifficultyOnVibrantColors()
  const anyContainerColor = useMemo(() => getContainerColor(theme.colors.primary, theme.colors.surface), [theme.colors.primary, theme.colors.surface])
  return useMemo(
    () => ({
      any: { vibrant: theme.colors.primary, onVibrant: theme.colors.onPrimary, container: anyContainerColor, onContainer: theme.colors.onPrimaryContainer },
      easy: { vibrant: vibrantColors.easy, onVibrant: onVibrantColors.easy, container: containerColors.easy, onContainer: onContainerColors.easy },
      medium: { vibrant: vibrantColors.medium, onVibrant: onVibrantColors.medium, container: containerColors.medium, onContainer: onContainerColors.medium },
      hard: { vibrant: vibrantColors.hard, onVibrant: onVibrantColors.hard, container: containerColors.hard, onContainer: onContainerColors.hard }
    }),
    [theme.colors.primary, theme.colors.onPrimary, theme.colors.onPrimaryContainer, anyContainerColor, vibrantColors, onVibrantColors, containerColors, onContainerColors]
  )
}
