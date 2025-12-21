import { JSX, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import PagerView from 'react-native-pager-view'
import { Appbar } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Game } from './Game'
import { Setup } from './Setup'

export const Main = (): JSX.Element => {
  const insets = useSafeAreaInsets()
  const [phrase, setPhrase] = useState('')
  const pagerRef = useRef<PagerView>(null)
  const handleStart = (value: string) => {
    setPhrase(value)
    pagerRef.current?.setPage(1)
  }
  const handleStop = () => {
    setPhrase('')
    pagerRef.current?.setPage(0)
  }
  return (
    <View style={[StyleSheet.absoluteFill, { paddingBottom: insets.bottom }]}>
      <Appbar.Header>
        {phrase && <Appbar.Action icon='close' onPress={handleStop} accessibilityLabel='Exit Game' />}
        <Appbar.Content title='Hangman' />
      </Appbar.Header>
      <PagerView ref={pagerRef} scrollEnabled={false} style={styles.flex}>
        <Setup onStart={handleStart} phrase={phrase} />
        <Game onStop={handleStop} phrase={phrase} />
      </PagerView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
