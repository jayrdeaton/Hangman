import { Drawer } from '@rific/drawer'
import { JSX, useEffect, useMemo, useState } from 'react'
import { Platform, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Button, Checkbox, IconButton, Text, TextInput } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { alert, confirm } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { type CustomPack, type CustomPackEntryInput, deleteCustomPack, exportCustomPack, getCustomPackPuzzles, importCustomPack, isCustomPackKey, saveCustomPack } from '@/utils/customPacks'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

import { PackDetailContent } from './PackDetailContent'
import { PackRow } from './PackRow'

export type PacksScreenProps = {
  visible: boolean
  onDismiss: () => void
  selectedKeys: string[]
  onChangeSelectedKeys: (keys: string[]) => void
  packsVersion: number
  onPacksChanged: () => void
}

type PacksStep = { screen: 'list' } | { screen: 'detail'; key: string } | { screen: 'editor'; key: string | null }

const EMPTY_ENTRY: CustomPackEntryInput = { answer: '', hint: '' }
const LIST_STEP: PacksStep = { screen: 'list' }

export const PacksScreen = ({ visible, onDismiss, selectedKeys, onChangeSelectedKeys, packsVersion, onPacksChanged }: PacksScreenProps): JSX.Element => {
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()

  // packsVersion isn't read inside the memo — it's a change counter bumped whenever a custom pack
  // is created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const customPacks = useMemo(() => manifest.filter((item) => isCustomPackKey(item.key)), [manifest])
  const builtInPacks = useMemo(() => manifest.filter((item) => !isCustomPackKey(item.key)), [manifest])
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  const [step, setStep] = useState<PacksStep>(LIST_STEP)
  const [importVisible, setImportVisible] = useState(false)
  const [importText, setImportText] = useState('')

  // Always reopens at the list, same as the puzzle drawer resetting its own draft on open —
  // otherwise a screen left mid-edit on last close would silently resume there next time.
  /* eslint-disable react-hooks/set-state-in-effect -- resets local UI state on an external prop transition, not derived from other state */
  useEffect(() => {
    if (visible) setStep(LIST_STEP)
  }, [visible])
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggle = (key: string) => {
    const next = new Set(selectedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChangeSelectedKeys(Array.from(next))
  }

  const selectKey = (key: string) => {
    if (selectedSet.has(key)) return
    onChangeSelectedKeys([...selectedKeys, key])
  }

  const handleSaved = (pack: CustomPack) => {
    selectKey(pack.key)
    onPacksChanged()
    setStep(LIST_STEP)
  }

  const handleDelete = async (key: string, label: string) => {
    const confirmed = await confirm('Delete pack?', `This permanently deletes "${label}" and any unlock progress for it. This cannot be undone.`, 'Delete')
    if (!confirmed) return

    await deleteCustomPack(key)
    if (selectedSet.has(key)) onChangeSelectedKeys(selectedKeys.filter((k) => k !== key))
    onPacksChanged()
  }

  const handleShare = async (key: string, label: string) => {
    const payload = await exportCustomPack(key)
    if (!payload) return

    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(payload)
        void alert('Copied to clipboard', `Send this to a friend. Pasting it into "Import pack" adds "${label}" to their packs.`)
        return
      }
      await Share.share({ message: payload })
    } catch {
      void alert("Couldn't share", 'Something went wrong sharing this pack. Please try again.')
    }
  }

  const handleImport = async () => {
    if (!importText.trim()) {
      void alert('Paste a pack first', 'Paste a pack backup, then tap Import.')
      return
    }
    try {
      const pack = await importCustomPack(importText)
      setImportText('')
      setImportVisible(false)
      selectKey(pack.key)
      onPacksChanged()
      void alert('Pack imported', `Added "${pack.label}" (${commaString(pack.puzzles.length)} puzzles) to your packs.`)
    } catch (_error) {
      void alert('Invalid pack', 'Could not parse that backup. Please paste a valid pack backup.')
    }
  }

  const title = step.screen === 'list' ? 'Choose packs' : step.screen === 'detail' ? (getPuzzleManifest().find((item) => item.key === step.key)?.label ?? '') : step.key ? 'Edit pack' : 'New pack'

  return (
    <Drawer open={visible} onClose={onDismiss} width={windowWidth}>
      <View testID='packs-screen-panel' style={[styles.panel, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}>
        <View style={styles.headerRow}>
          {step.screen === 'list' ? <IconButton icon='close' onPress={onDismiss} accessibilityLabel='Close' /> : <IconButton icon='arrow-left' onPress={() => setStep(LIST_STEP)} accessibilityLabel='Back to packs' />}
          <Text variant='titleLarge' style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {/* Balances the header row so the title stays visually centered against the leading icon. */}
          <View style={styles.headerSpacer} />
        </View>

        {step.screen === 'list' ? (
          <>
            <View style={styles.selectionRow}>
              <Text variant='bodySmall' style={styles.muted}>
                {commaString(selectedSet.size)} of {commaString(manifest.length)} selected
              </Text>
              <View style={styles.quickActions}>
                <Button compact onPress={() => onChangeSelectedKeys(manifest.map((item) => item.key))}>
                  Select all
                </Button>
                <Button compact onPress={() => onChangeSelectedKeys([])}>
                  Clear
                </Button>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled'>
              <View style={styles.sectionHeaderRow}>
                <Text variant='titleSmall' style={styles.sectionHeader}>
                  My packs
                </Text>
                <View style={styles.sectionActions}>
                  <Button compact icon='plus' onPress={() => setStep({ screen: 'editor', key: null })}>
                    Create
                  </Button>
                  <Button compact icon='import' onPress={() => setImportVisible((v) => !v)}>
                    Import
                  </Button>
                </View>
              </View>

              {importVisible ? (
                <View style={styles.importBlock}>
                  <TextInput testID='pack-import-input' mode='outlined' label='Paste a pack backup' value={importText} onChangeText={setImportText} multiline style={styles.importInput} />
                  <Button mode='contained-tonal' onPress={() => void handleImport()} style={styles.importButton}>
                    Import pack
                  </Button>
                </View>
              ) : null}

              {customPacks.length === 0 ? (
                <Text variant='bodySmall' style={styles.emptyText}>
                  No custom packs yet — tap Create to build your own.
                </Text>
              ) : (
                customPacks.map((item) => (
                  <PackRow
                    key={item.key}
                    label={item.label}
                    subtitle={`${commaString(item.count)} puzzles`}
                    onPress={() => toggle(item.key)}
                    leading={<Checkbox status={selectedSet.has(item.key) ? 'checked' : 'unchecked'} onPress={() => toggle(item.key)} />}
                    trailing={
                      <View style={styles.rowActions}>
                        <IconButton icon='pencil-outline' size={20} onPress={() => setStep({ screen: 'editor', key: item.key })} accessibilityLabel={`Edit ${item.label}`} />
                        <IconButton icon='share-variant' size={20} onPress={() => void handleShare(item.key, item.label)} accessibilityLabel={`Share ${item.label}`} />
                        <IconButton icon='delete-outline' size={20} onPress={() => void handleDelete(item.key, item.label)} accessibilityLabel={`Delete ${item.label}`} />
                      </View>
                    }
                  />
                ))
              )}

              <Text variant='titleSmall' style={styles.sectionHeader}>
                Built-in packs
              </Text>
              {builtInPacks.map((item) => (
                <PackRow key={item.key} label={item.label} subtitle={`${commaString(item.count)} puzzles`} onPress={() => toggle(item.key)} leading={<Checkbox status={selectedSet.has(item.key) ? 'checked' : 'unchecked'} onPress={() => toggle(item.key)} />} trailing={<IconButton icon='information-outline' size={20} onPress={() => setStep({ screen: 'detail', key: item.key })} accessibilityLabel={`View ${item.label} contents`} />} />
              ))}
            </ScrollView>
          </>
        ) : null}

        {step.screen === 'detail' ? (
          <View style={styles.stepBody}>
            <PackDetailContent packKey={step.key} />
          </View>
        ) : null}

        {/* Keyed on the pack being edited (or 'new') so switching which pack you're editing — or
            from editing into creating — always starts the form fresh, without needing an effect to
            resync it the way the old dialog-based builder did. */}
        {step.screen === 'editor' ? <PackEditorStep key={step.key ?? 'new'} editingKey={step.key} onSaved={handleSaved} onCancel={() => setStep(LIST_STEP)} /> : null}
      </View>
    </Drawer>
  )
}

type PackEditorStepProps = {
  editingKey: string | null
  onSaved: (pack: CustomPack) => void
  onCancel: () => void
}

const PackEditorStep = ({ editingKey, onSaved, onCancel }: PackEditorStepProps): JSX.Element => {
  const editingPack = useMemo((): CustomPack | null => {
    if (!editingKey) return null
    const pack = getPuzzleManifest().find((item) => item.key === editingKey)
    if (!pack) return null
    // The list only ever needs the manifest summary, but the editor needs the full puzzle list to
    // prefill entries — createdAt/updatedAt aren't used by the editor so they're left blank rather
    // than looking up the full CustomPack record just for two unused timestamps.
    return { key: pack.key, label: pack.label, createdAt: '', updatedAt: '', puzzles: getCustomPackPuzzles(editingKey) }
  }, [editingKey])

  const [label, setLabel] = useState(editingPack?.label ?? '')
  const [entries, setEntries] = useState<CustomPackEntryInput[]>(editingPack && editingPack.puzzles.length > 0 ? editingPack.puzzles.map((puzzle) => ({ answer: puzzle.answer, hint: typeof puzzle.metadata?.hint === 'string' ? puzzle.metadata.hint : '' })) : [EMPTY_ENTRY])
  const [saving, setSaving] = useState(false)

  const updateEntry = (index: number, patch: Partial<CustomPackEntryInput>) => setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  const removeEntry = (index: number) => setEntries((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  const addEntry = () => setEntries((prev) => [...prev, EMPTY_ENTRY])

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
    <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled'>
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

      <Button icon='plus' onPress={addEntry} style={styles.addButton}>
        Add word
      </Button>

      <View style={styles.footer}>
        <Button mode='outlined' onPress={onCancel} style={styles.footerButton}>
          Cancel
        </Button>
        <Button mode='contained' onPress={() => void handleSave()} loading={saving} disabled={saving} style={styles.footerButton}>
          Save pack
        </Button>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  addButton: { marginTop: 4 },
  emptyText: { marginBottom: 12, opacity: 0.7 },
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  headerSpacer: { width: 40 },
  hintInput: { marginTop: 0 },
  importBlock: { marginBottom: 12 },
  importButton: { marginTop: 8 },
  importInput: { minHeight: 80 },
  muted: { opacity: 0.7 },
  panel: { flex: 1 },
  quickActions: { flexDirection: 'row' },
  rowActions: { flexDirection: 'row' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24, paddingHorizontal: 16 },
  sectionActions: { flexDirection: 'row' },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 12
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  selectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4,
    paddingHorizontal: 16
  },
  stepBody: { flex: 1, paddingHorizontal: 16 },
  title: { flex: 1, textAlign: 'center' }
})
