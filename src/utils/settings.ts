import AsyncStorage from '@react-native-async-storage/async-storage'

const COLOR_KEY = 'primary_color'
const THEME_KEY = 'theme_override'

export type ThemeOverride = 'system' | 'light' | 'dark'

export const getSavedColor = async (): Promise<string | null> => {
  try {
    const v = await AsyncStorage.getItem(COLOR_KEY)
    return v
  } catch (_e) {
    return null
  }
}

export const saveColor = async (color: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(COLOR_KEY, color)
  } catch (_e) {
    // ignore write errors for now
  }
}

export const getSavedTheme = async (): Promise<ThemeOverride | null> => {
  try {
    const v = await AsyncStorage.getItem(THEME_KEY)
    if (!v) return null
    return v as ThemeOverride
  } catch (_e) {
    return null
  }
}

export const saveTheme = async (value: ThemeOverride): Promise<void> => {
  try {
    await AsyncStorage.setItem(THEME_KEY, value)
  } catch (_e) {
    // ignore
  }
}

export const resetSettings = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([COLOR_KEY, THEME_KEY])
  } catch (_e) {
    // ignore
  }
}
