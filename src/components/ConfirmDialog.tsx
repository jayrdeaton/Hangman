import { Dialog } from '@rific/auto-paper'
import { Button } from '@rific/haptic-press'
import { JSX } from 'react'
import { Text } from 'react-native-paper'

export type ConfirmDialogProps = {
  visible: boolean
  title: string
  message: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// An in-app replacement for window.confirm()/Alert.alert(), for actions that need a real yes/no
// choice before proceeding. Prefer this over @/utils/alert's confirm() for anything destructive:
// on web, confirm() depends on the browser's own native dialog, which some browser/automation
// environments silently auto-decline (returns false with no visible prompt at all) — from the
// player's side that's indistinguishable from the action just not working. A dialog rendered by
// the app itself has no such dependency.
export const ConfirmDialog = ({ visible, title, message, confirmLabel, destructive = false, onConfirm, onCancel }: ConfirmDialogProps): JSX.Element => (
  <Dialog visible={visible} onDismiss={onCancel}>
    <Dialog.Title>{title}</Dialog.Title>
    <Dialog.Content>
      <Text variant='bodyMedium'>{message}</Text>
    </Dialog.Content>
    <Dialog.Actions>
      <Button testID='confirm-dialog-cancel' onPress={onCancel}>
        Cancel
      </Button>
      <Button testID='confirm-dialog-confirm' onPress={onConfirm} textColor={destructive ? '#b00020' : undefined}>
        {confirmLabel}
      </Button>
    </Dialog.Actions>
  </Dialog>
)
