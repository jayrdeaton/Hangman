import { Dialog } from '@rific/auto-paper'
import { Button } from '@rific/haptic-press'
import { JSX } from 'react'
import { StyleSheet } from 'react-native'
import { Avatar, useTheme } from 'react-native-paper'

export type PnpHandoffDialogProps = {
  // False while the game menu is open, same contract as PnpWordPrompt's promptVisible — this
  // dialog steps aside rather than fighting the drawer for the screen.
  visible: boolean
  onReady: () => void
}

// A beat while the device changes hands — mechanical, not instructional, so it says nothing about
// not peeking and names nobody.
//
// No title, no close button: unlike the word prompt this replaces, there's nothing here to
// configure or bail out of — the round is already fully set up, so dismissing this dialog any way
// at all (backdrop tap, Escape, hardware back) means the exact same thing pressing Ready does.
// Still worth it as a dialog rather than nothing: its backdrop is what stops a stray touch during
// the physical hand-off from landing on the real keyboard underneath (see Game's `locked` prop) —
// a stray touch can now end the hand-off a beat early, but that's strictly better than it reaching
// the keyboard and burning a guess.
export const PnpHandoffDialog = ({ visible, onReady }: PnpHandoffDialogProps): JSX.Element => {
  const theme = useTheme()

  return (
    <Dialog visible={visible} onDismiss={onReady}>
      <Dialog.Content style={styles.content}>
        {/* Secondary, not primary (Avatar.Icon's default) — this is the second player's turn. */}
        <Avatar.Icon size={88} icon='account-arrow-right' color={theme.colors.onSecondary} style={{ backgroundColor: theme.colors.secondary }} />
        <Button mode='contained' onPress={onReady} accessibilityLabel='Ready to guess' style={styles.readyButton} contentStyle={styles.readyContent} labelStyle={styles.readyLabel}>
          Ready
        </Button>
      </Dialog.Content>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', paddingVertical: 16 },
  readyButton: { marginTop: 24, width: 220 },
  readyContent: { height: 52 },
  readyLabel: { fontSize: 16, fontWeight: '700' }
})
