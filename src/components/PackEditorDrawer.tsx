import { useAutoPaperTheme } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/haptic-press'
import { JSX, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text, TextInput } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DRAWER_HEADER_ROW_STYLE, DRAWER_HEADER_TITLE_WRAP_STYLE } from '@/constants/drawerHeader'
import { alert } from '@/utils/alert'
import { type CustomPack, type CustomPackEntryInput, getCustomPackPuzzles, saveCustomPack } from '@/utils/customPacks'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

import { ConfirmDialog } from './ConfirmDialog'

const EMPTY_ENTRY: CustomPackEntryInput = { answer: '', hint: '' }

export type PackEditorDrawerProps = {
  visible: boolean
  // The pack being edited, or null to create a new one. Deliberately NOT reset to null on dismiss
  // by the caller — like every other drawer here, this translates away rather than unmounting, so
  // the form needs to hold steady through that close animation instead of blanking out mid-slide.
  editingKey: string | null
  onDismiss: () => void
  onSaved: (pack: CustomPack) => void
  // Unconditional — this drawer's own ConfirmDialog is what gates calling it, so by the time it
  // runs the player has already agreed. No confirm() inside it (see ConfirmDialog's own doc
  // comment for why: window.confirm() isn't reliable on web).
  onDelete: (key: string) => Promise<void>
  onShare: (key: string, label: string) => Promise<void>
}

// Create/edit a custom pack — its own animated Drawer (reached from PacksScreen's "Create" button
// or a custom pack row's edit icon), stacked on top of PacksScreen the same way PackPuzzlesDrawer
// stacks on top of PuzzleDrawer, rather than swapping in as an unanimated step within the same
// panel. Close sits on the LEADING (left) side, matching every other drawer in the Game Menu's
// lineage (see PuzzleDrawer/PackPuzzlesDrawer) — freeing the trailing side for Share/Delete once
// there's an actual saved pack behind editingKey, rather than "back" and those two icons competing
// for the same corner.
export const PackEditorDrawer = ({ visible, editingKey, onDismiss, onSaved, onDelete, onShare }: PackEditorDrawerProps): JSX.Element => {
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()

  return (
    <Drawer open={visible} onClose={onDismiss} width={windowWidth}>
      <View testID='pack-editor-panel' style={[styles.panel, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {/* Keyed on the pack being edited (or 'new') so switching which pack you're editing — or
            from editing into creating — always starts the form fresh, without needing an effect to
            resync it. The Drawer above never unmounts this (translates only), so without the key
            the form would keep showing whatever it last had the next time visible flips back on
            for a different target. */}
        <PackEditorForm key={editingKey ?? 'new'} editingKey={editingKey} onCancel={onDismiss} onSaved={onSaved} onDelete={onDelete} onShare={onShare} />
      </View>
    </Drawer>
  )
}

type PackEditorFormProps = {
  editingKey: string | null
  onSaved: (pack: CustomPack) => void
  onCancel: () => void
  onDelete: (key: string) => Promise<void>
  onShare: (key: string, label: string) => Promise<void>
}

const PackEditorForm = ({ editingKey, onSaved, onCancel, onDelete, onShare }: PackEditorFormProps): JSX.Element => {
  const theme = useAutoPaperTheme()

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
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)

  const updateEntry = (index: number, patch: Partial<CustomPackEntryInput>) => setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  const removeEntry = (index: number) => setEntries((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  const addEntry = () => setEntries((prev) => [...prev, EMPTY_ENTRY])

  // Same rule handleSave itself applies when actually saving — surfaced here too so the button can
  // just be disabled instead of doing nothing (or popping an alert unreliably, see ConfirmDialog's
  // own doc comment on why native dialogs aren't trusted for feedback in this app) when pressed
  // with nothing to save.
  const hasValidEntry = entries.some((entry) => normalizePhrase(entry.answer).replace(/ /g, '').length > 0)

  const handleSave = async () => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      void alert('Name this pack', 'Give your pack a name before saving.')
      return
    }

    const validEntries = entries.filter((entry) => normalizePhrase(entry.answer).replace(/ /g, '').length > 0)
    setSaving(true)
    try {
      const pack = await saveCustomPack({ key: editingPack?.key, label: trimmedLabel, entries: validEntries })
      onSaved(pack)
    } finally {
      setSaving(false)
    }
  }

  // Only reachable from the confirm dialog's own Delete button (see the ConfirmDialog rendered
  // below) — by the time this runs, the player has already agreed.
  const handleConfirmDelete = async () => {
    if (!editingKey) return
    setConfirmDeleteVisible(false)
    await onDelete(editingKey)
    onCancel()
  }

  const handleSharePress = async () => {
    if (!editingKey) return
    await onShare(editingKey, label)
  }

  return (
    <>
      {/* Share/Delete only make sense once there's an actual saved pack behind editingKey — the
          trailing slot is a blank balancing spacer for a brand-new, not-yet-saved pack instead.
          Leading icon is arrow-left, not X — same left-anchored Game Menu lineage as
          PuzzleDrawer/PackPuzzlesDrawer/PacksScreen (see PuzzleDrawer's own header comment for why
          an arrow instead of a close X). */}
      <View style={styles.headerRow}>
        <IconButton icon='arrow-left' onPress={onCancel} accessibilityLabel='Close' />
        {/* Absolutely positioned (see DRAWER_HEADER_TITLE_WRAP_STYLE) so it centers on the row's
            true center rather than the leftover flex space — this is the header where that
            actually matters: Share+Delete (two icons) on the trailing side against a single arrow
            on the leading side is not a symmetric split. */}
        <View style={DRAWER_HEADER_TITLE_WRAP_STYLE}>
          <Text variant='titleLarge' style={styles.title} numberOfLines={1}>
            {editingKey ? 'Edit pack' : 'New pack'}
          </Text>
        </View>
        {editingKey ? (
          <View style={styles.rowActions}>
            <IconButton icon='share-variant' size={20} onPress={() => void handleSharePress()} accessibilityLabel='Share pack' />
            <IconButton icon='delete-outline' size={20} iconColor={theme.colors.danger} onPress={() => setConfirmDeleteVisible(true)} accessibilityLabel='Delete pack' />
          </View>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ConfirmDialog visible={confirmDeleteVisible} title='Delete pack?' message={`This permanently deletes "${label}" and any unlock progress for it. This cannot be undone.`} confirmLabel='Delete' destructive onConfirm={() => void handleConfirmDelete()} onCancel={() => setConfirmDeleteVisible(false)} />

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled'>
        {/* A list-item-header treatment (like "My packs"/"Built-in packs" above the rows they
            label) rather than just another form field identical to the entries below it — this is
            the one field that names the whole thing the rest of the screen is building. */}
        <Text variant='titleSmall' style={styles.sectionHeader}>
          Pack name
        </Text>
        <TextInput testID='pack-label-input' value={label} onChangeText={setLabel} mode='outlined' maxLength={60} />

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
      </ScrollView>

      {/* A fixed footer, not part of the scrollable content — same reasoning as PuzzleDrawer's own
          footer and PacksScreen's listFooter: Cancel/Save should be reachable without scrolling
          down through however many entries this pack has. */}
      <View style={styles.footer}>
        <Button mode='outlined' onPress={onCancel} style={styles.footerButton}>
          Cancel
        </Button>
        <Button mode='contained' onPress={() => void handleSave()} loading={saving} disabled={saving || !hasValidEntry} style={styles.footerButton}>
          Save pack
        </Button>
      </View>
    </>
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
  // Matches PuzzleDrawer's own fixed footer padding.
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  footerButton: { flex: 1 },
  headerRow: DRAWER_HEADER_ROW_STYLE,
  headerSpacer: { width: 40 },
  hintInput: { marginTop: 0 },
  panel: { flex: 1 },
  rowActions: { flexDirection: 'row' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24, paddingHorizontal: 16 },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 12
  },
  title: { textAlign: 'center' }
})
