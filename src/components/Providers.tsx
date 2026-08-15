import { Toaster, ToastProvider } from '@rific/toaster'
import * as ExpoHaptics from 'expo-haptics'
import { Fragment, JSX, ReactNode } from 'react'
import { Platform } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import * as RNPaper from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { persistor, store } from '@/redux/store'

import { AutoSaveCustomProvider } from './AutoSaveCustomProvider'
import { Haptic } from './Haptic'
import { KeyboardLayoutProvider } from './KeyboardLayoutProvider'
import { PackSelectionProvider } from './PackSelectionProvider'
import { PuzzleDefaultsProvider } from './PuzzleDefaultsProvider'
import { SoundSettingsProvider } from './SoundSettingsProvider'
import { Theme } from './Theme'

export type ProvidersProps = { children: ReactNode }

// react-native-keyboard-controller has no web implementation — skip its provider there.
const KeyboardWrapper = Platform.OS === 'web' ? Fragment : KeyboardProvider

export const Providers = ({ children }: ProvidersProps): JSX.Element => (
  <SafeAreaProvider>
    <KeyboardWrapper>
      <ReduxProvider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          {/* Haptic wraps Theme, not the reverse: Theme's <Provider> renders react-native-paper's
              own Provider internally, which mounts a PortalHost near its own root — Portal content
              (auto-paper's Dialog, used by ConfirmDialog/RoundEndDialog/PnpHandoffDialog/DialogShell,
              every one of which renders @rific/haptic-press Buttons/IconButtons inside) gets
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
              <ToastProvider haptics={ExpoHaptics} paper={RNPaper}>
                <KeyboardLayoutProvider>
                  <SoundSettingsProvider>
                    <AutoSaveCustomProvider>
                      <PackSelectionProvider>
                        <PuzzleDefaultsProvider>{children}</PuzzleDefaultsProvider>
                      </PackSelectionProvider>
                    </AutoSaveCustomProvider>
                  </SoundSettingsProvider>
                </KeyboardLayoutProvider>
                <Toaster clearButton={null} historyButton={null} limit={1} />
              </ToastProvider>
            </Theme>
          </Haptic>
        </PersistGate>
      </ReduxProvider>
    </KeyboardWrapper>
  </SafeAreaProvider>
)
