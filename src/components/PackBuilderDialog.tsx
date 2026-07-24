import { JSX, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, IconButton, TextInput } from 'react-native-paper'

import { alert } from '@/utils/alert'
import { type CustomPack, type CustomPackEntryInput, MAX_ENTRIES_PER_PACK, saveCustomPack } from '@/utils/customPacks'
import { normalizePhrase } from '@/utils/normalizePhrase'

import { DialogShell } from './DialogShell'

export type PackBuilderDialogProps = {
  visible: boolean
  onDismiss: () => void
  editingPack: CustomPack | null
  onSaved: (pack: CustomPack) => void
}

const EMPTY_ENTRY: CustomPackEntryInput = { answer: '', hint: '' }

export const PackBuilderDialog = ({ visible, onDismiss, editingPack, onSaved }: PackBuilderDialogProps): JSX.Element => {
  const [label, setLabel] = useState('')
  const [entries, setEntries] = useState<CustomPackEntryInput[]>([EMPTY_ENTRY])
  const [saving, setSaving] = useState(false)

  // Resets the draft from whichever pack is being edited (or a blank pack) each time the dialog
  // opens — the same "sync from an external prop on open" pattern PuzzleDrawer uses for its own
  // draft, not state derived from other state.
  /* eslint-disable react-hooks/set-state-in-effect -- syncs the draft from an external prop on open */
  useEffect(() => {
    if (!visible) return
    setLabel(editingPack?.label ?? '')
    setEntries(editingPack && editingPack.puzzles.length > 0 ? editingPack.puzzles.map((puzzle) => ({ answer: puzzle.answer, hint: typeof puzzle.metadata?.hint === 'string' ? puzzle.metadata.hint : '' })) : [EMPTY_ENTRY])
  }, [visible, editingPack])
  /* eslint-enable react-hooks/set-state-in-effect */

  const updateEntry = (index: number, patch: Partial<CustomPackEntryInput>) => setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  const removeEntry = (index: number) => setEntries((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  const addEntry = () => setEntries((prev) => (prev.length >= MAX_ENTRIES_PER_PACK ? prev : [...prev, EMPTY_ENTRY]))

  const handleSave = async () => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      void alert('Name this pack', 'Give your pack a name before saving.')
      return
    }

    const validEntries = entries.filter((entry) => normalizePhrase(entry.answer).replace(/ /g, '').length > 0)
    if (validEntries.length === 0) {
      void alert('Add a word', 'Add at least one word or phrase using letters A-Z to this pack.')
      return
    }

    setSaving(true)
    try {
      const pack = await saveCustomPack({ key: editingPack?.key, label: trimmedLabel, entries: validEntries })
      onSaved(pack)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell visible={visible} onDismiss={onDismiss} title={editingPack ? 'Edit pack' : 'New pack'}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
        <TextInput testID='pack-label-input' value={label} onChangeText={setLabel} label='Pack name' mode='outlined' maxLength={60} />

        {entries.map((entry, index) => (
          <View key={index} style={styles.entryRow}>
            <View style={styles.entryInputs}>
              <TextInput testID={`entry-answer-${index}`} value={entry.answer} onChangeText={(answer) => updateEntry(index, { answer })} label='Word or phrase' autoCapitalize='characters' mode='outlined' dense maxLength={128} />
              <TextInput testID={`entry-hint-${index}`} style={styles.hintInput} value={entry.hint} onChangeText={(hint) => updateEntry(index, { hint })} label='Hint (optional)' mode='outlined' dense maxLength={80} />
            </View>
            <IconButton icon='close' size={20} onPress={() => removeEntry(index)} disabled={entries.length === 1} accessibilityLabel={`Remove entry ${index + 1}`} />
          </View>
        ))}

        <Button icon='plus' onPress={addEntry} disabled={entries.length >= MAX_ENTRIES_PER_PACK} style={styles.addButton}>
          Add word
        </Button>

        <View style={styles.footer}>
          <Button mode='outlined' onPress={onDismiss} style={styles.footerButton}>
            Cancel
          </Button>
          <Button mode='contained' onPress={() => void handleSave()} loading={saving} disabled={saving} style={styles.footerButton}>
            Save pack
          </Button>
        </View>
      </ScrollView>
    </DialogShell>
  )
}

const styles = StyleSheet.create({
  addButton: { marginTop: 4 },
  entryInputs: { flex: 1, gap: 8 },
  entryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 12
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20
  },
  footerButton: { flex: 1 },
  hintInput: { marginTop: 0 }
})
