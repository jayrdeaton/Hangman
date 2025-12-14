import { JSX, ReactNode } from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { persistor, store } from '../store'
import { Theme } from './Theme'

export type ProvidersProps = { children: ReactNode }

export const Providers = ({ children }: ProvidersProps): JSX.Element => (
  <SafeAreaProvider>
    <KeyboardProvider>
      <ReduxProvider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <Theme>{children}</Theme>
        </PersistGate>
      </ReduxProvider>
    </KeyboardProvider>
  </SafeAreaProvider>
)
