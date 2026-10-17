import * as SplashScreen from 'expo-splash-screen'

import { markSplashReady, pendingSplashGates } from '@/utils/splashGate'

// The splash waits on exactly what the first screen needs to read asynchronously. The player's art,
// difficulty and packs aren't on the list: they're in redux (playerSettingsSlice), which has rehydrated
// before anything renders, so a gate for them would only ever be marked straight away.
describe('splashGate', () => {
  it('waits on the theme, the icon font and the keyboard layout, and nothing else', () => {
    expect(pendingSplashGates().sort()).toEqual(['fonts', 'keyboardLayout', 'theme'])
  })

  it('hides the splash once every gate is in', () => {
    markSplashReady('theme')
    markSplashReady('fonts')
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled()

    markSplashReady('keyboardLayout')

    expect(pendingSplashGates()).toEqual([])
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
  })
})
