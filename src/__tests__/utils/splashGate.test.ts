import * as SplashScreen from 'expo-splash-screen'

import { markSplashReady, pendingSplashGates } from '@/utils/splashGate'

// The splash waits on exactly what the first screen needs to read asynchronously. The player's art,
// difficulty and packs aren't on the list: they're in redux (playerSettingsSlice), which has rehydrated
// before anything renders, so a gate for them would only ever be marked straight away. The profile
// roster is: it's reconciled with the fleet's shared one first (ProfilesProvider).
describe('splashGate', () => {
  it('waits on the theme, the icon font, the keyboard layout and the profile roster, and nothing else', () => {
    expect(pendingSplashGates().sort()).toEqual(['fonts', 'keyboardLayout', 'profiles', 'theme'])
  })

  it('hides the splash once every gate is in', () => {
    markSplashReady('theme')
    markSplashReady('fonts')
    markSplashReady('keyboardLayout')
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled()

    markSplashReady('profiles')

    expect(pendingSplashGates()).toEqual([])
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1)
  })
})
