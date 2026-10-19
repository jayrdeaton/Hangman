import { getBlendedColor, getColorRoles, useAutoPaperTheme } from '@rific/auto-paper'
import { JSX, type ReactNode, useMemo } from 'react'
import { ThemeProvider } from 'react-native-paper'

import { readableOn } from '@/utils/readableColor'

// The card as seen, rather than the plain surface: it's frosted over the dimmed board, which shades it
// a little toward the text color (6% matched the light card in the web preview, 2026-10-19). Judged
// against the plain surface, Hangman's own red, which reads on the card, would have been darkened too.
const CARD_SHADE = 0.06

// The gameplay dialogs draw their titles, icons, outlined buttons and focused fields in the theme's
// primary, which is the player's own color as picked. A light one (the picker's Lime, Amber, Cyan or
// Yellow) all but vanishes on a light card: Player 3's light green title read at 1.5:1 (Jay,
// 2026-10-19). Wrapped in this, the dialog gets a primary that reads on the card at 3:1, a deeper
// shade of the same color (a lighter one on a dark card), with its filled buttons following it. Every
// color that already reads is left exactly as picked (the theme passes through unchanged). Always the
// one provider, so a color crossing the line (the hand-off switching players) never remounts an open
// dialog. The dialogs render through Paper's Portal, which carries the theme from where it's declared,
// so wrapping the dialog's element is enough, as long as the wrapper sits above whatever reads the
// theme (each dialog's exported component is its card inside this).
export const ReadableAccent = ({ children }: { children: ReactNode }): JSX.Element => {
  const theme = useAutoPaperTheme()
  const { primary, surface, onSurface } = theme.colors
  const accentTheme = useMemo(() => {
    const ink = readableOn(primary, getBlendedColor(onSurface, surface, CARD_SHADE))
    if (ink === primary) return theme
    return { ...theme, colors: { ...theme.colors, primary: ink, onPrimary: getColorRoles(ink, surface).onColor } }
  }, [theme, primary, surface, onSurface])
  return <ThemeProvider theme={accentTheme}>{children}</ThemeProvider>
}
