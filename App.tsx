import * as AutoPaper from '@rific/auto-paper'
import { configureDrawer } from '@rific/drawer'
import { useUpdater } from '@rific/updater'
import React, { JSX } from 'react'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'

// @rific/drawer no longer auto-detects @rific/auto-paper (Metro doesn't resolve a
// require()-in-try/catch into an ESM build's module graph), so every drawer's panel needs this
// injected explicitly once, near the app root, or it falls back to a solid (non-blurred) backdrop.
configureDrawer({ autoPaper: AutoPaper })

const App = (): JSX.Element => {
  useUpdater()

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Providers>
        <Main />
      </Providers>
    </GestureHandlerRootView>
  )
}

export default App

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
