import * as AutoPaper from '@rific/auto-paper'
import { configureDrawer } from '@rific/drawer'
import { JSX } from 'react'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import { UpdateDialog } from '@/components/UpdateDialog'

// @rific/drawer no longer auto-detects @rific/auto-paper (Metro doesn't resolve a
// require()-in-try/catch into an ESM build's module graph), so every drawer's panel needs this
// injected explicitly once, near the app root, or it falls back to a solid (non-blurred) backdrop.
configureDrawer({ autoPaper: AutoPaper })

const App = (): JSX.Element => (
  <GestureHandlerRootView style={styles.flex}>
    <Providers>
      <Main />
      {/* The one automatic update check (see UpdateDialog.tsx). Inside Providers for the toast,
          theme and Portal host it needs. Its card only mounts its Portal once an update is found,
          so it lands above anything already open. */}
      <UpdateDialog />
    </Providers>
  </GestureHandlerRootView>
)

export default App

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
