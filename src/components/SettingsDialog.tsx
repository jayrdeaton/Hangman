import { SegmentedButtons } from '@rific/feedback-press'
import { useUpdateErrorToast } from '@rific/toaster'
import { BaseSettingsDialog } from '@tastic/hud/chrome'
import { JSX } from 'react'

import { release } from '@/constants/release'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'

import { SettingsSection } from './SettingsSection'

export type SettingsDialogProps = {
  visible: boolean
  onDismiss: () => void
}

const KEYBOARD_BUTTONS = [
  { value: 'qwerty', label: 'QWERTY' },
  { value: 'abc', label: 'ABC' }
]

// The fleet's shared Settings sheet (the cog in the game screen's top-right corner), the same
// @tastic/hud BaseSettingsDialog every @tastic game wraps. It brings Sound, Haptics, Appearance and the
// version with Check for Updates; Hangman adds its keyboard layout below them. Not passed: Lock
// Orientation and Edge Guard (Hangman is portrait-locked by the OS and has no edge-swipe controls) or
// How to Play (no guide yet), so those rows stay hidden. rotation is 0 because Hangman never draws a
// rotation of its own. The palette picker stays in Customize, next to the art it recolors.
//
// Must render inside Providers, like UpdateDialog: the update-error toast needs the ToastProvider and
// the sheet's Portal needs the Portal.Host auto-paper's Provider mounts inside Theme.
export const SettingsDialog = ({ visible, onDismiss }: SettingsDialogProps): JSX.Element => {
  const onUpdateError = useUpdateErrorToast('Update Failed')
  const { layout, setLayout } = useKeyboardLayout()

  return (
    <BaseSettingsDialog visible={visible} onDismiss={onDismiss} rotation={0} version={release.otaVersion} onUpdateError={onUpdateError}>
      <SettingsSection label='KEYBOARD'>
        <SegmentedButtons value={layout} onValueChange={(value) => setLayout(value as typeof layout)} buttons={KEYBOARD_BUTTONS} />
      </SettingsSection>
    </BaseSettingsDialog>
  )
}
