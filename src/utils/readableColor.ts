import { getRgb, getTonalColor } from '@rific/auto-paper'

// WCAG 2's relative luminance (0 for black, 1 for white).
const luminance = (color: string): number => {
  const rgb = getRgb(color)
  if (!rgb) return 0
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG 2's contrast ratio, 1 (identical) to 21 (black on white). Order doesn't matter.
export const contrastRatio = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

// WCAG's floor for large text and UI parts: what a player's color needs on a card to read as a title.
export const MIN_ACCENT_CONTRAST = 3

// HSL lightness, the one getTonalColor sets.
const lightness = (color: string): number => {
  const rgb = getRgb(color)
  if (!rgb) return 0.5
  const channels = [rgb.r, rgb.g, rgb.b].map((channel) => channel / 255)
  return (Math.max(...channels) + Math.min(...channels)) / 2
}

const STEP = 0.02

// `color` itself while it reads on `background` at `minRatio`; otherwise the same hue and
// saturation, darkened (on a light background) or lightened (on a dark one) just until it does. So a
// player's light green or yellow title on a light card becomes a deeper green or gold, and a navy one
// on a dark card a lighter blue, while every color that already reads is left exactly as picked.
export const readableOn = (color: string, background: string, minRatio = MIN_ACCENT_CONTRAST): string => {
  if (contrastRatio(color, background) >= minRatio) return color
  const darken = luminance(background) > 0.18
  let l = lightness(color)
  let candidate = color
  while (darken ? l > 0 : l < 1) {
    l = darken ? Math.max(0, l - STEP) : Math.min(1, l + STEP)
    candidate = getTonalColor(color, l)
    if (contrastRatio(candidate, background) >= minRatio) return candidate
  }
  return candidate
}
