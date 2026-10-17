import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, SegmentedButtons } from '@rific/feedback-press'
import { useUpdateErrorToast } from '@rific/toaster'
import { BaseSettingsDialog } from '@tastic/hud/chrome'
import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { release } from '@/constants/release'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { alert } from '@/utils/alert'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { mergePuzzleUnlocks, parseProgressBackup } from '@/utils/unlocks'

import { SettingsSection } from './SettingsSection'

export type SettingsDialogProps = {
  visible: boolean
  onDismiss: () => void
  // Called after a backup is imported, so every screen re-reads the unlocked puzzles.
  onUnlocksChanged?: () => void
}

const KEYBOARD_BUTTONS = [
  { value: 'qwerty', label: 'QWERTY' },
  { value: 'abc', label: 'ABC' }
]

// The fleet's shared Settings sheet (the cog in the game screen's top-right corner), the same
// @tastic/hud BaseSettingsDialog every @tastic game wraps. It brings Sound, Haptics, Appearance and the
// version with Check for Updates; Hangman adds its keyboard layout and the progress backup below them.
// Not passed: Lock Orientation and Edge Guard (Hangman is portrait-locked by the OS and has no
// edge-swipe controls) or How to Play (no guide yet), so those rows stay hidden. rotation is 0 because
// Hangman never draws a rotation of its own. The palette picker stays in Customize, next to the art it
// recolors.
//
// Must render inside Providers, like UpdateDialog: the update-error toast needs the ToastProvider and
// the sheet's Portal needs the Portal.Host auto-paper's Provider mounts inside Theme.
export const SettingsDialog = ({ visible, onDismiss, onUnlocksChanged = () => {} }: SettingsDialogProps): JSX.Element => {
  const { colors } = useAutoPaperTheme()
  const onUpdateError = useUpdateErrorToast('Update Failed')
  const { layout, setLayout } = useKeyboardLayout()

  const handleExport = async () => {
    try {
      const shared = await shareProgressBackupFile()
      if (!shared) void alert("Couldn't Share", 'Sharing is not available on this device.')
    } catch {
      void alert("Couldn't Share", 'Something went wrong sharing your progress backup. Please try again.')
    }
  }

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box - see hangmanFile.ts's own doc comments for why. parseProgressBackup validates
  // the shape first so picking a custom pack file by mistake surfaces as "Invalid backup" instead
  // of silently merging zero entries (mergePuzzleUnlocks alone is lenient about bare-map shapes and
  // wouldn't otherwise catch that).
  const handleImport = async () => {
    const raw = await pickHangmanFile()
    if (!raw) return

    try {
      parseProgressBackup(raw)
      const result = await mergePuzzleUnlocks(raw)
      onUnlocksChanged()
      void alert('Import Complete', `Merged ${result.importedCount} entries. Added ${result.addedCount} new unlocks.`)
    } catch {
      void alert('Invalid Backup', 'Could not read that as a Hangman progress backup file.')
    }
  }

  return (
    <BaseSettingsDialog visible={visible} onDismiss={onDismiss} rotation={0} version={release.otaVersion} onUpdateError={onUpdateError}>
      <SettingsSection label='KEYBOARD'>
        <SegmentedButtons value={layout} onValueChange={(value) => setLayout(value as typeof layout)} buttons={KEYBOARD_BUTTONS} />
      </SettingsSection>
      {/* Outlined, like the sheet's own Check for Updates. The file holds the unlocked puzzles only:
          stats and achievements aren't in it. */}
      <SettingsSection label='BACKUP'>
        <View style={styles.backupButtons}>
          <Button mode='outlined' icon='export-variant' onPress={() => void handleExport()} style={styles.backupButton}>
            Export
          </Button>
          <Button mode='outlined' icon='import' onPress={() => void handleImport()} style={styles.backupButton}>
            Import
          </Button>
        </View>
        <Text variant='bodySmall' style={{ color: colors.onSurfaceVariant }}>
          Saves your unlocked puzzles to a file. Importing one adds its puzzles to yours.
        </Text>
      </SettingsSection>
    </BaseSettingsDialog>
  )
}

const styles = StyleSheet.create({
  backupButton: { flex: 1 },
  backupButtons: { flexDirection: 'row', gap: 12 }
})
