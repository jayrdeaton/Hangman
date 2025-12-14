import { JSX, ReactNode } from 'react'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { persistor, store } from '../store'
import { Theme } from './Theme'

export type ProvidersProps = { children: ReactNode }

export const Providers = ({ children }: ProvidersProps): JSX.Element => (
  <Provider store={store}>
    <PersistGate loading={null} persistor={persistor}>
      <Theme>{children}</Theme>
    </PersistGate>
  </Provider>
)
