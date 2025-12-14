import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Appearance, StatusBar, StyleSheet, useColorScheme, View } from 'react-native'
import { MD3DarkTheme as PaperDarkTheme, MD3LightTheme as PaperLightTheme, Provider as PaperProvider } from 'react-native-paper'
import { shallowEqual, useSelector } from 'react-redux'

import { RootState } from '../store'
import { getBlendedColor, getTriadicPalette, isDarkColor } from '../utils'

const selector = (state: RootState) => state.theme

const darkTheme = PaperDarkTheme
const lightTheme = PaperLightTheme

export type ThemeProps = {
  children: ReactNode
}

export const Theme = ({ children }: ThemeProps) => {
  const scheme = useColorScheme()
  const [theme, setTheme] = useState(lightTheme)
  const { appearance, color } = useSelector(selector, shallowEqual)
  const getTheme = useCallback(() => {
    const themeAppearance = appearance === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : appearance
    const baseTheme = themeAppearance === 'dark' ? darkTheme : lightTheme
    const nextTheme = { ...baseTheme }

    const colors = getTriadicPalette(color)
    const surface = baseTheme.colors.surface
    // primary
    nextTheme.colors.primary = colors.primary
    nextTheme.colors.onPrimary = isDarkColor(colors.primary) ? '#ffffff' : '#000000'
    nextTheme.colors.primaryContainer = getBlendedColor(colors.primary, surface, 0.15)
    nextTheme.colors.onPrimaryContainer = isDarkColor(nextTheme.colors.primaryContainer) ? '#ffffff' : '#000000'
    // secondary
    nextTheme.colors.secondary = colors.secondary
    nextTheme.colors.onSecondary = isDarkColor(colors.secondary) ? '#ffffff' : '#000000'
    nextTheme.colors.secondaryContainer = getBlendedColor(colors.secondary, surface, 0.15)
    nextTheme.colors.onSecondaryContainer = isDarkColor(nextTheme.colors.secondaryContainer) ? '#ffffff' : '#000000'
    // tertiary
    nextTheme.colors.tertiary = colors.tertiary
    nextTheme.colors.onTertiary = isDarkColor(colors.tertiary) ? '#ffffff' : '#000000'
    nextTheme.colors.tertiaryContainer = getBlendedColor(colors.tertiary, surface, 0.15)
    nextTheme.colors.onTertiaryContainer = isDarkColor(nextTheme.colors.tertiaryContainer) ? '#ffffff' : '#000000'

    const blended = getBlendedColor(color, colors.secondary, 0.5)
    const tintSurface = (alpha: number) => getBlendedColor(blended, surface, alpha)

    nextTheme.colors.surface = surface
    nextTheme.colors.surfaceVariant = tintSurface(0.2)
    nextTheme.colors.outline = getBlendedColor(color, baseTheme.colors.outline, 0.45)
    const grey = baseTheme.dark ? '#424242' : '#c2c2c2'
    const blendedGrey = getBlendedColor(blended, grey, 0.05)
    nextTheme.colors.elevation = {
      ...nextTheme.colors.elevation,
      level1: nextTheme.colors.surface,
      level2: getBlendedColor(blendedGrey, nextTheme.colors.surface, 0.25),
      level3: getBlendedColor(blendedGrey, nextTheme.colors.surface, 0.4),
      level4: getBlendedColor(blendedGrey, nextTheme.colors.surface, 0.55),
      level5: getBlendedColor(blendedGrey, nextTheme.colors.surface, 0.7)
    }

    setTheme(nextTheme)
  }, [appearance, color, scheme])
  useEffect(() => {
    getTheme()
  }, [appearance, color, getTheme])
  useEffect(() => {
    const subscription = Appearance.addChangeListener(getTheme)
    return () => {
      subscription.remove()
    }
  }, [getTheme])
  const backgroundColor = theme.colors.background
  return (
    <PaperProvider theme={theme}>
      <StatusBar backgroundColor={backgroundColor} barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={[styles.flex, { backgroundColor }]}>{children}</View>
    </PaperProvider>
  )
}
const styles = StyleSheet.create({
  flex: { flex: 1 }
})
