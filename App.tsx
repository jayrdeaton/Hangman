import { useUpdater } from '@rific/updater'
import React, { JSX } from 'react'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'

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
