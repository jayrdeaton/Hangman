import '@tastic/core'

import { type ThemeSettings, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import { act, render, waitFor } from '@testing-library/react-native'
import { setBackgroundColorAsync } from 'expo-system-ui'
import { useEffect } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { Theme } from '@/components/Theme'
import { store } from '@/redux/store'

// Stubbed so the calls can be read back. The bare '@tastic/core' import above stands in for the app
// loading it through @tastic/hud/chrome: that import alone runs core's module-scope
// setBackgroundColorAsync('#000000') (its useThemedRootBackground.ts) before anything renders.
jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined)
}))

const mockSetBackgroundColorAsync = jest.mocked(setBackgroundColorAsync)

// Reads the surface Theme's Provider actually computed (what Main.tsx paints behind every screen), and
// hands out its settings setter.
let paintedSurface: string | null = null
let setThemeSettings: ((patch: Partial<ThemeSettings>) => void) | null = null
const ThemeProbe = () => {
  const { colors } = useAutoPaperTheme()
  const { set } = useThemeSettings()
  useEffect(() => {
    paintedSurface = colors.surface
    setThemeSettings = set
  }, [colors.surface, set])
  return null
}

const renderTheme = () =>
  render(
    <ReduxProvider store={store}>
      <Theme>
        <ThemeProbe />
      </Theme>
    </ReduxProvider>
  )

describe('Theme', () => {
  it("repaints the root with the theme's surface after @tastic/core's import-time black", async () => {
    expect(mockSetBackgroundColorAsync).toHaveBeenCalledWith('#000000')

    await renderTheme()
    await waitFor(() => expect(paintedSurface).not.toBeNull())

    expect(mockSetBackgroundColorAsync).toHaveBeenLastCalledWith(paintedSurface)
  })

  it('repaints it again when the appearance changes', async () => {
    await renderTheme()
    await waitFor(() => expect(setThemeSettings).not.toBeNull())
    await act(async () => {
      setThemeSettings?.({ appearance: 'light' })
    })
    const light = paintedSurface

    await act(async () => {
      setThemeSettings?.({ appearance: 'dark' })
    })

    expect(paintedSurface).not.toBe(light)
    expect(mockSetBackgroundColorAsync).toHaveBeenLastCalledWith(paintedSurface)
  })
})
