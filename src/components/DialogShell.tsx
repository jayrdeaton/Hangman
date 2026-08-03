import { Dialog } from '@rific/auto-paper'
import { IconButton } from '@rific/haptic-press'
import { JSX, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

export type DialogShellProps = {
  visible: boolean
  onDismiss: () => void
  title: string
  children: ReactNode
}

export const DialogShell = ({ visible, onDismiss, title, children }: DialogShellProps): JSX.Element => (
  <Dialog visible={visible} onDismiss={onDismiss}>
    <View style={styles.headerRow}>
      <Text variant='titleLarge'>{title}</Text>
      <IconButton icon='close' onPress={onDismiss} accessibilityLabel='Close' />
    </View>

    <Dialog.Content style={styles.content}>{children}</Dialog.Content>
  </Dialog>
)

const styles = StyleSheet.create({
  content: { maxHeight: 480 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16
  }
})
