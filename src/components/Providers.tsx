import { keepAwakeActions, KeepAwakeProvider, type KeepAwakeSettings } from '@rific/core'
import { useHapticSettings } from '@rific/feedback-press'
import { Toaster, ToastProvider } from '@rific/toaster'
import * as ExpoHaptics from 'expo-haptics'
import * as ExpoKeepAwake from 'expo-keep-awake'
import { Fragment, JSX, ReactNode, useCallback } from 'react'
import { Platform } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import * as RNPaper from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider, useDispatch, useSelector } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { ActiveGameProvider } from '@/hooks/useActiveGame'
import { CatalogProvider } from '@/hooks/useCatalog'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { ProfilesProvider } from '@/hooks/useProfiles'
import { persistor, type RootState, store } from '@/redux/store'

import { AutoSaveCustomProvider } from './AutoSaveCustomProvider'
import { Haptic } from './Haptic'
import { KeyboardLayoutProvider } from './KeyboardLayoutProvider'
import { PackSelectionProvider } from './PackSelectionProvider'
import { PuzzleDefaultsProvider } from './PuzzleDefaultsProvider'
import { Theme } from './Theme'

export type ProvidersProps = { children: ReactNode }

// react-native-keyboard-controller has no web implementation - skip its provider there.
const KeyboardWrapper = Platform.OS === 'web' ? Fragment : KeyboardProvider

// The toaster only gets expo-haptics while the player's Vibrate setting is on, so its haptic ticks
// follow the same setting as every other haptic in the app. Today they can't fire anyway (the only
// controls that tick, the history and clear buttons, are hidden below), but this keeps it that way
// if either is ever shown. Must render inside Haptic, which provides the setting.
const HapticGatedToastProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const { settings } = useHapticSettings()
  return (
    <ToastProvider haptics={settings.vibrate ? ExpoHaptics : undefined} paper={RNPaper}>
      {children}
    </ToastProvider>
  )
}

// @rific/core's Keep Awake setting (Settings dialog), persisted as the store's `keepAwake` slice, the
// same bridge shape as the other games'. Handing it expo-keep-awake is what turns the feature on:
// /game's useKeepAwake('game') and hud's Keep Awake row both read the module from here.
const KeepAwakeBridge = ({ children }: { children: ReactNode }): JSX.Element => {
  const keepAwake = useSelector((state: RootState) => state.keepAwake)
  const dispatch = useDispatch()
  const onChange = useCallback((settings: KeepAwakeSettings) => dispatch(keepAwakeActions.initialize(settings)), [dispatch])
  return (
    <KeepAwakeProvider expoKeepAwake={ExpoKeepAwake} initialValue={keepAwake} onChange={onChange}>
      {children}
    </KeepAwakeProvider>
  )
}

export const Providers = ({ children }: ProvidersProps): JSX.Element => (
  <SafeAreaProvider>
    <KeyboardWrapper>
      <ReduxProvider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <KeepAwakeBridge>
            {/* Haptic wraps Theme, not the reverse: Theme's <Provider> renders react-native-paper's
                own Provider internally, which mounts a PortalHost near its own root - Portal content
                (auto-paper's Dialog in the Settings sheet, and the @tastic/hud cards in ConfirmDialog, RoundEndDialog and PnpWordPrompt,
                every one of which renders @rific/feedback-press Buttons/IconButtons inside) gets
                reparented to that host in the fiber tree, not left as a descendant of wherever it was
                written. A Haptic nested inside Theme would sit outside the portaled subtree entirely,
                so its injected `paper` (see Haptic.tsx) would never reach any Button rendered inside a
                Dialog. Hoisting Haptic above Theme makes it an ancestor of the PortalHost too, so
                portaled content stays inside its context regardless of where react-native-paper mounts
                the host. */}
            <Haptic>
              <Theme>
                {/* Nested inside Theme, not above it, for the same reason Haptic is hoisted above:
                    Toaster's Portal (when `paper` is injected, as here) reparents into the same
                    PortalHost react-native-paper's own Provider mounts inside Theme, and paper's own
                    useTheme() call needs to run below Theme's Provider to resolve the app's actual
                    computed theme rather than Paper's own default. */}
                <HapticGatedToastProvider>
                  <KeyboardLayoutProvider>
                    <AutoSaveCustomProvider>
                      {/* Above the pack selection, whose "every pack" follows its packsVersion, and
                          above every reader of the unlocked puzzles (usePuzzleUnlocks). */}
                      <CatalogProvider>
                        <PackSelectionProvider>
                          <PuzzleDefaultsProvider>
                            {/* Inside PersistGate, so its one mount-time catalog sweep sees the
                                rehydrated stats; and never keyed or gated, so it never remounts. */}
                            <GameStatsProvider>
                              {/* Inside GameStatsProvider and CatalogProvider: forgetting a profile
                                  that's gone from the shared roster clears its stats and unlocked
                                  puzzles. Holds everything below back until the launch reconcile is
                                  in. */}
                              <ProfilesProvider>
                                {/* Inside PersistGate too: the resume reads the rehydrated round slice. */}
                                <ActiveGameProvider>{children}</ActiveGameProvider>
                              </ProfilesProvider>
                            </GameStatsProvider>
                          </PuzzleDefaultsProvider>
                        </PackSelectionProvider>
                      </CatalogProvider>
                    </AutoSaveCustomProvider>
                  </KeyboardLayoutProvider>
                  <Toaster clearButton={null} historyButton={null} limit={3} />
                </HapticGatedToastProvider>
              </Theme>
            </Haptic>
          </KeepAwakeBridge>
        </PersistGate>
      </ReduxProvider>
    </KeyboardWrapper>
  </SafeAreaProvider>
)
