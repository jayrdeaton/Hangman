import { Alert, Platform } from 'react-native'

// window.alert() blocks the JS thread synchronously, which also blocks the browser from
// painting. Calling it right after a state update (e.g. the winning/losing guess) would freeze
// the page before React ever gets to paint that final letter or mistake — the player would only
// ever see the dialog, never the completed board underneath it. Waiting two animation frames
// guarantees a real paint has happened first.
const nextPaint = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

// react-native-web's Alert is a no-op — fall back to the browser's native dialogs there.
export const alert = (title: string, message: string): Promise<void> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      void nextPaint().then(() => {
        window.alert(`${title}\n\n${message}`)
        resolve()
      })
      return
    }
    Alert.alert(title, message, [{ text: 'Ok', onPress: () => resolve() }])
  })

export const confirm = (title: string, message: string, confirmText = 'OK'): Promise<boolean> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(`${title}\n\n${message}`))
      return
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) }
    ])
  })

export default alert
