import type { TriadicPalette } from '@rific/auto-paper'

// ThemeSettings.color widened from `string` to `string | TriadicPalette` in @rific/auto-paper
// 0.9.0 (an explicit, independently-picked triad rather than one derived from a single seed).
// This app only ever writes a plain string back via PalettePicker (see SettingsDrawer.tsx), so a
// TriadicPalette value can't come from anywhere in Hangman today — but the type still has to be
// narrowed to a single string everywhere a plain color is needed (PalettePicker's own `value`,
// ModeSelector/GameVisual's `color`). `.primary` is that palette's own seed, so it's the
// representative color if this branch is ever actually hit.
export const resolveSeedColor = (color: string | TriadicPalette): string => (typeof color === 'string' ? color : color.primary)
