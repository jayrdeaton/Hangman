import { Fragment, JSX, ReactNode } from 'react'
import { Platform } from 'react-native'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { persistor, store } from '@/redux/store'

import { AutoSaveCustomProvider } from './AutoSaveCustomProvider'
import { KeyboardLayoutProvider } from './KeyboardLayoutProvider'
import { PackSelectionProvider } from './PackSelectionProvider'
import { Theme } from './Theme'

export type ProvidersProps = { children: ReactNode }

// react-native-keyboard-controller has no web implementation — skip its provider there.
const KeyboardWrapper = Platform.OS === 'web' ? Fragment : KeyboardProvider

export const Providers = ({ children }: ProvidersProps): JSX.Element => (
  <SafeAreaProvider>
    <KeyboardWrapper>
      <ReduxProvider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <Theme>
            <KeyboardLayoutProvider>
              <AutoSaveCustomProvider>
                <PackSelectionProvider>{children}</PackSelectionProvider>
              </AutoSaveCustomProvider>
            </KeyboardLayoutProvider>
          </Theme>
        </PersistGate>
      </ReduxProvider>
    </KeyboardWrapper>
  </SafeAreaProvider>
)
