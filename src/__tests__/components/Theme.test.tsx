import '@tastic/core'

import { type ThemeSettings, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import { act, render, waitFor } from '@testing-library/react-native'
import { setBackgroundColorAsync } from 'expo-system-ui'
import { useEffect } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { boardColor } from '@/components/BoardBackground'
import { Theme } from '@/components/Theme'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerThemeActions } from '@/redux/playerThemeSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY } from '@/utils/players'

// Stubbed so the calls can be read back. The bare '@tastic/core' import above stands in for the app
// loading it through @tastic/hud/chrome: that import alone runs core's module-scope
// setBackgroundColorAsync('#000000') (its useThemedRootBackground.ts) before anything renders.
jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined)
}))

const mockSetBackgroundColorAsync = jest.mocked(setBackgroundColorAsync)

// Reads the board color for the theme Theme's Provider actually computed (what BoardBackground paints
// behind every screen), and hands out its settings setter.
let paintedBoard: string | null = null
let setThemeSettings: ((patch: Partial<ThemeSettings>) => void) | null = null
let liveSettings: ThemeSettings | null = null
const ThemeProbe = () => {
  const { colors, dark } = useAutoPaperTheme()
  const { settings, set } = useThemeSettings()
  useEffect(() => {
    paintedBoard = boardColor(dark, colors.surface)
    setThemeSettings = set
    liveSettings = settings
  }, [colors.surface, dark, set, settings])
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
  it("repaints the root with the board's color after @tastic/core's import-time black", async () => {
    expect(mockSetBackgroundColorAsync).toHaveBeenCalledWith('#000000')

    await renderTheme()
    await waitFor(() => expect(paintedBoard).not.toBeNull())

    expect(mockSetBackgroundColorAsync).toHaveBeenLastCalledWith(paintedBoard)
  })

  it('repaints it again when the appearance changes', async () => {
    await renderTheme()
    await waitFor(() => expect(setThemeSettings).not.toBeNull())
    await act(async () => {
      setThemeSettings?.({ appearance: 'light' })
    })
    const light = paintedBoard

    await act(async () => {
      setThemeSettings?.({ appearance: 'dark' })
    })

    expect(paintedBoard).not.toBe(light)
    expect(mockSetBackgroundColorAsync).toHaveBeenLastCalledWith(paintedBoard)
  })
})

// Each player's colors (the palette and its harmony): the live theme always holds the active player's.
describe("Theme's per-player colors", () => {
  const OTHER = 'profile-a'
  const live = () => ({ color: liveSettings?.color, harmony: liveSettings?.harmony })
  const saved = (playerKey = GUEST_PLAYER_KEY) => store.getState().playerTheme[playerKey]
  const setActivePlayer = (profileId: string | null) =>
    act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer(profileId))
    })

  beforeEach(() => {
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerThemeActions.reset())
    liveSettings = null
  })

  it("saves the colors on screen as the guest's when the guest has none", async () => {
    await renderTheme()
    await waitFor(() => expect(liveSettings).not.toBeNull())

    expect(saved()).toEqual(live())
  })

  it("saves a palette change as the active player's", async () => {
    await renderTheme()
    await waitFor(() => expect(setThemeSettings).not.toBeNull())

    await act(async () => {
      setThemeSettings?.({ color: '#2196f3', harmony: 'triadic' })
    })

    expect(saved()).toEqual({ color: '#2196f3', harmony: 'triadic' })
  })

  // Appearance and Blur stay the device's.
  it('leaves the saved colors alone when only the appearance changes', async () => {
    await renderTheme()
    await waitFor(() => expect(setThemeSettings).not.toBeNull())
    const before = store.getState().playerTheme

    await act(async () => {
      setThemeSettings?.({ appearance: 'dark' })
    })

    expect(store.getState().playerTheme).toBe(before)
  })

  it("puts a player's saved colors on screen when they become the active player, and the guest's back after", async () => {
    store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: OTHER, theme: { color: '#4caf50', harmony: 'analogous' } }))
    await renderTheme()
    await waitFor(() => expect(liveSettings).not.toBeNull())
    const guestColors = live()

    await setActivePlayer(OTHER)
    expect(live()).toEqual({ color: '#4caf50', harmony: 'analogous' })
    // Putting them on screen writes nothing: they already match.
    expect(saved(OTHER)).toEqual({ color: '#4caf50', harmony: 'analogous' })

    await setActivePlayer(null)
    expect(live()).toEqual(guestColors)
  })

  it('keeps the colors on screen for a player with none saved, and saves them as theirs', async () => {
    await renderTheme()
    await waitFor(() => expect(liveSettings).not.toBeNull())
    const onScreen = live()

    await setActivePlayer(OTHER)

    expect(live()).toEqual(onScreen)
    expect(saved(OTHER)).toEqual(onScreen)
  })
})
