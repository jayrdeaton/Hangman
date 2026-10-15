import { ConfirmDialog } from '@tastic/hud/chrome'
import { JSX } from 'react'

export type PnpHandoffDialogProps = {
  // False while the Game Menu or the Settings sheet is open, the same contract as PnpWordPrompt's
  // promptVisible: this card steps aside rather than fighting them for the screen.
  visible: boolean
  onReady: () => void
}

// The beat while the device changes hands: the fleet's shared card (@tastic/hud's ConfirmDialog, the
// same one every confirm in the app uses) with a title, one line, and a single Ready button. It names
// nobody and says nothing about not peeking. There's no Cancel: the round is already set up, so the
// only way forward is Ready. The card has no backdrop dismissal either, so a stray touch during the
// physical hand-off can't end it early or reach the keyboard underneath (Game is also locked until
// Ready, see its `locked` prop).
export const PnpHandoffDialog = ({ visible, onReady }: PnpHandoffDialogProps): JSX.Element => <ConfirmDialog visible={visible} icon='account-arrow-right' title='Your Turn' message='The word is set.' confirmLabel='Ready' onConfirm={onReady} />
