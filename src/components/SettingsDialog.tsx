import { AppearancePicker, ColorPicker, useThemeSettings } from '@rific/auto-paper'
import { JSX, useState } from 'react'
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native'
import { Button, Card, List, Switch, Text, TextInput } from 'react-native-paper'

import { release } from '@/constants/release'
import { clearAchievements } from '@/utils/achievements'
import { alert, confirm } from '@/utils/alert'
import { clearPuzzleUnlocks, exportPuzzleUnlocks, mergePuzzleUnlocks } from '@/utils/unlocks'

import { DialogShell } from './DialogShell'

export type SettingsDialogProps = {
  visible: boolean
  onDismiss: () => void
  onUnlocksChanged: () => void
}

export const SettingsDialog = ({ visible, onDismiss, onUnlocksChanged }: SettingsDialogProps): JSX.Element => {
  const { settings, set } = useThemeSettings()
  const [importText, setImportText] = useState('')

  const handleExport = async () => {
    const payload = await exportPuzzleUnlocks()
    // Share.share has no web implementation — it silently resolves without doing anything there.
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(payload)
      void alert('Copied to clipboard', 'Paste this into "Import progress" on another device to restore it.')
      return
    }
    await Share.share({ message: payload })
  }

  const handleImport = async () => {
    if (!importText.trim()) {
      void alert('Paste a backup first', 'Paste an exported progress backup, then tap Import.')
      return
    }
    try {
      const result = await mergePuzzleUnlocks(importText)
      onUnlocksChanged()
      setImportText('')
      void alert('Import complete', `Merged ${result.importedCount} entries. Added ${result.addedCount} new unlocks.`)
    } catch (_error) {
      void alert('Invalid backup', 'Could not parse that backup. Please paste valid backup JSON.')
    }
  }

  const handleResetProgress = async () => {
    const confirmed = await confirm('Reset progress?', 'This permanently clears every unlocked puzzle and achievement. This cannot be undone.', 'Reset')
    if (!confirmed) return
    await clearPuzzleUnlocks()
    await clearAchievements()
    onUnlocksChanged()
  }

  return (
    <DialogShell visible={visible} onDismiss={onDismiss} title='Settings'>
      <ScrollView showsVerticalScrollIndicator={false}>
        <List.Section>
          <List.Subheader>Appearance</List.Subheader>
          <View style={styles.block}>
            <AppearancePicker value={settings.appearance} onChange={(appearance) => set({ appearance })} />
          </View>

          <View style={[styles.block, styles.row]}>
            <View style={styles.rowText}>
              <Text variant='bodyLarge'>Accent color</Text>
              <Text variant='bodySmall' style={styles.muted}>
                Themes the whole app
              </Text>
            </View>
            <ColorPicker value={settings.color} onChange={(color) => set({ color })} />
          </View>

          <List.Item title='Blur effects' description='Frosted dialogs and menus' right={() => <Switch value={settings.blur} onValueChange={(blur) => set({ blur })} />} />
        </List.Section>

        <List.Section>
          <List.Subheader>Progress backup</List.Subheader>
          <View style={styles.block}>
            <Button mode='contained-tonal' icon='export-variant' onPress={handleExport}>
              Export progress
            </Button>
            <TextInput mode='outlined' label='Paste backup to import' value={importText} onChangeText={setImportText} multiline style={styles.importInput} />
            <Button mode='contained-tonal' icon='import' onPress={handleImport} style={styles.spaced}>
              Import progress
            </Button>
            <Text variant='bodySmall' style={styles.muted}>
              Imports merge with your existing progress.
            </Text>
          </View>
        </List.Section>

        <List.Section>
          <List.Subheader>Danger zone</List.Subheader>
          <View style={styles.block}>
            <Button mode='outlined' icon='delete-outline' textColor={COLORS.danger} onPress={() => void handleResetProgress()}>
              Reset all progress
            </Button>
          </View>
        </List.Section>

        <Card style={styles.versionCard} mode='contained'>
          <Card.Content>
            <Text variant='bodySmall' style={styles.muted}>
              Ad-Free Hangman · OTA v{release.otaVersion}
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>
    </DialogShell>
  )
}

const COLORS = {
  danger: '#b00020'
}

const styles = StyleSheet.create({
  block: {
    paddingVertical: 4
  },
  importInput: { marginTop: 12 },
  muted: { marginTop: 8, opacity: 0.7 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  rowText: { flexShrink: 1 },
  spaced: { marginTop: 12 },
  versionCard: {
    marginBottom: 8,
    marginTop: 8
  }
})
