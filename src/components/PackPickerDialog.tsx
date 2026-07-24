import { JSX, useMemo, useState } from 'react'
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native'
import { Button, Checkbox, IconButton, Text, TextInput } from 'react-native-paper'

import { alert, confirm } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { type CustomPack, deleteCustomPack, exportCustomPack, getCustomPackPuzzles, importCustomPack, isCustomPackKey } from '@/utils/customPacks'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

import { DialogShell } from './DialogShell'
import { PackBuilderDialog } from './PackBuilderDialog'
import { PackDetailDialog } from './PackDetailDialog'
import { PackRow } from './PackRow'

export type PackPickerDialogProps = {
  visible: boolean
  onDismiss: () => void
  selectedKeys: string[]
  onChangeSelectedKeys: (keys: string[]) => void
  packsVersion: number
  onPacksChanged: () => void
}

export const PackPickerDialog = ({ visible, onDismiss, selectedKeys, onChangeSelectedKeys, packsVersion, onPacksChanged }: PackPickerDialogProps): JSX.Element => {
  // packsVersion isn't read inside the memo — it's a change counter bumped whenever a custom pack
  // is created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const customPacks = useMemo(() => manifest.filter((item) => isCustomPackKey(item.key)), [manifest])
  const builtInPacks = useMemo(() => manifest.filter((item) => !isCustomPackKey(item.key)), [manifest])

  const [detailPackKey, setDetailPackKey] = useState<string | null>(null)
  const [builderVisible, setBuilderVisible] = useState(false)
  const [editingPack, setEditingPack] = useState<CustomPack | null>(null)
  const [importVisible, setImportVisible] = useState(false)
  const [importText, setImportText] = useState('')
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

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

  const handleCreatePack = () => {
    setEditingPack(null)
    setBuilderVisible(true)
  }

  const handleEditPack = (key: string) => {
    const pack = getPuzzleManifest().find((item) => item.key === key)
    if (!pack) return
    // The picker only ever needs the manifest summary, but the builder needs the full puzzle list
    // to prefill entries — createdAt/updatedAt aren't used by the builder so they're left blank
    // rather than looking up the full CustomPack record just for two unused timestamps.
    setEditingPack({ key: pack.key, label: pack.label, createdAt: '', updatedAt: '', puzzles: getCustomPackPuzzles(key) })
    setBuilderVisible(true)
  }

  const handleSaved = (pack: CustomPack) => {
    setBuilderVisible(false)
    setEditingPack(null)
    selectKey(pack.key)
    onPacksChanged()
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

  return (
    <>
      <DialogShell visible={visible} onDismiss={onDismiss} title='Choose packs'>
        <View style={styles.headerRow}>
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

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} keyboardShouldPersistTaps='handled'>
          <View style={styles.sectionHeaderRow}>
            <Text variant='titleSmall' style={styles.sectionHeader}>
              My packs
            </Text>
            <View style={styles.sectionActions}>
              <Button compact icon='plus' onPress={handleCreatePack}>
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
                    <IconButton icon='pencil-outline' size={20} onPress={() => handleEditPack(item.key)} accessibilityLabel={`Edit ${item.label}`} />
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
            <PackRow key={item.key} label={item.label} subtitle={`${commaString(item.count)} puzzles`} onPress={() => toggle(item.key)} leading={<Checkbox status={selectedSet.has(item.key) ? 'checked' : 'unchecked'} onPress={() => toggle(item.key)} />} trailing={<IconButton icon='information-outline' size={20} onPress={() => setDetailPackKey(item.key)} accessibilityLabel={`View ${item.label} contents`} />} />
          ))}
        </ScrollView>
      </DialogShell>

      <PackDetailDialog visible={detailPackKey !== null} onDismiss={() => setDetailPackKey(null)} packKey={detailPackKey} />
      <PackBuilderDialog visible={builderVisible} onDismiss={() => setBuilderVisible(false)} editingPack={editingPack} onSaved={handleSaved} />
    </>
  )
}

const styles = StyleSheet.create({
  emptyText: { marginBottom: 12, opacity: 0.7 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 4
  },
  importBlock: { marginBottom: 12 },
  importButton: { marginTop: 8 },
  importInput: { minHeight: 80 },
  muted: { opacity: 0.7 },
  quickActions: { flexDirection: 'row' },
  rowActions: { flexDirection: 'row' },
  scroll: { paddingTop: 8 },
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
  }
})
