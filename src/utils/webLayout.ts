import { Platform } from 'react-native'

// Native ignores this (Platform.select falls through to {}) — it only shapes the web layout,
// where nothing constrains width the way a physical phone screen would.
const shell = (maxWidth: number) => Platform.select({ web: { alignSelf: 'center' as const, maxWidth, width: '100%' as const }, default: {} })

// The gameplay screen (gallows + on-screen keyboard) stays phone-narrow deliberately — word games
// like Wordle keep this column tight even on desktop; stretching it wide just distorts the drawing.
export const gameShell = shell(480)
