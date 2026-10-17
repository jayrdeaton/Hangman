import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, SegmentedButtons } from '@rific/feedback-press'
import { useUpdateErrorToast } from '@rific/toaster'
import { BaseSettingsDialog } from '@tastic/hud/chrome'
import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { release } from '@/constants/release'
import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { useSelectArt } from '@/hooks/useSelectArt'
import { alert } from '@/utils/alert'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { mergePuzzleUnlocks, parseProgressBackup } from '@/utils/unlocks'

import { ArtPicker } from './ArtPicker'
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

// The fleet's shared Settings sheet (the cog on Home, both loadouts and the game screen), the same
// @tastic/hud BaseSettingsDialog every @tastic game wraps. It brings Sound, Haptics, Appearance and the
// version with Check for Updates; Hangman adds the player's art, its keyboard layout and the progress
// backup below Appearance. Not passed: Lock Orientation and Edge Guard (Hangman is portrait-locked by
// the OS and has no edge-swipe controls) or How to Play (no guide yet), so those rows stay hidden.
// rotation is 0 because Hangman never draws a rotation of its own. The palette picker isn't here: it
// sits at the top of the loadouts (ColorsRow) until the player picker takes it over.
//
// Must render inside Providers, like UpdateDialog: the update-error toast needs the ToastProvider and
// the sheet's Portal needs the Portal.Host auto-paper's Provider mounts inside Theme.
export const SettingsDialog = ({ visible, onDismiss, onUnlocksChanged = () => {} }: SettingsDialogProps): JSX.Element => {
  const { colors } = useAutoPaperTheme()
  const onUpdateError = useUpdateErrorToast('Update Failed')
  const { layout, setLayout } = useKeyboardLayout()
  // Read here, not inside the sections: the sheet's rows render through a Paper Portal, at the nearest
  // Portal.Host, so a context read in them comes from wherever that host sits. Every screen mounts its
  // own host inside Providers today, but read here they can't land outside PuzzleDefaultsProvider.
  const { mode } = usePuzzleDefaults()
  const selectArt = useSelectArt()
  // The backup is the active player's: Export saves their unlocked puzzles, Import adds to them.
  const { key: playerKey } = useActivePlayer()

  const handleExport = async () => {
    try {
      const shared = await shareProgressBackupFile(playerKey)
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
      const result = await mergePuzzleUnlocks(playerKey, raw)
      onUnlocksChanged()
      void alert('Import Complete', `Merged ${result.importedCount} entries. Added ${result.addedCount} new unlocks.`)
    } catch {
      void alert('Invalid Backup', 'Could not read that as a Hangman progress backup file.')
    }
  }

  return (
    <BaseSettingsDialog visible={visible} onDismiss={onDismiss} rotation={0} version={release.otaVersion} onUpdateError={onUpdateError}>
      {/* The active player's, like the backup below; next to Appearance, the other look. Picked
          mid-round, it redraws the board behind the sheet (see useSelectArt). */}
      <SettingsSection label='ART'>
        <ArtPicker selected={mode} onSelect={selectArt} />
      </SettingsSection>
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
