import { ConfirmDialog } from '@tastic/hud/chrome'
import { JSX } from 'react'

export type PnpHandoffDialogProps = {
  // False while the Settings sheet is open (or the game screen isn't the one showing), the same
  // contract as PnpWordPrompt's promptVisible: this card steps aside rather than fighting it for the
  // screen.
  visible: boolean
  // Who the word is for, and who wrote it.
  guesserName: string
  writerName: string
  onReady: () => void
}

// The beat while the device changes hands: the fleet's shared card (@tastic/hud's ConfirmDialog, the
// same one every confirm in the app uses) naming who to hand it to ("Player 2's Turn") and whose word
// is waiting, with a single Ready button. It says nothing about not peeking. There's no Cancel: the
// round is already set up, so the only way forward is Ready. The card has no backdrop dismissal
// either, so a stray touch during the physical hand-off can't end it early or reach the keyboard
// underneath (Game is also locked until Ready, see its `locked` prop).
export const PnpHandoffDialog = ({ visible, guesserName, writerName, onReady }: PnpHandoffDialogProps): JSX.Element => <ConfirmDialog visible={visible} icon='account-arrow-right' title={`${guesserName}'s Turn`} message={`${writerName}'s word is set.`} confirmLabel='Ready' onConfirm={onReady} />
