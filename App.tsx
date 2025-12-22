import { reloadAsync } from 'expo-updates'
import React, { JSX, useEffect } from 'react'
import { AppState, AppStateStatus } from 'react-native'

import { Main, Providers } from './src/components'
import { checkForUpdate, getUpdateConfirmation } from './src/utils'

const App = (): JSX.Element => {
  useEffect(() => {
    const checkAndPrompt = async () => {
      if (__DEV__) return
      try {
        const update = await checkForUpdate()
        if (!update) return
        const confirmation = await getUpdateConfirmation(update)
        if (!confirmation) return
        await reloadAsync()
      } catch {}
    }
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') checkAndPrompt()
    })
    checkAndPrompt()
    return subscription.remove
  }, [])
  return (
    <Providers>
      <Main />
    </Providers>
  )
}

export default App
