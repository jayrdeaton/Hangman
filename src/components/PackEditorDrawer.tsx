import { useAutoPaperTheme } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { useFocusChain } from '@rific/focus-chain'
import { Button, IconButton } from '@rific/haptic-press'
import { ScrollView, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useMemo, useRef, useState } from 'react'
import { Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text, TextInput } from 'react-native-paper'

import { DRAWER_PACK_DETAIL_Z_INDEX } from '@/constants/drawerStacking'
import { CUSTOM_QUICK_PACK_LABEL, type CustomPack, type CustomPackEntryInput, getCustomPackPuzzles, saveCustomPack } from '@/utils/customPacks'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

import { ConfirmDialog } from './ConfirmDialog'

const EMPTY_ENTRY: CustomPackEntryInput = { answer: '', hint: '' }
// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

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
// Memoized: stays mounted (translated off-screen) even while closed, and always renders the full
// form below (every entry row, focus-chain registration and all) regardless of `visible` — see
// PuzzleDrawer's own memo comment for why an always-mounted, never-visible-right-now subtree
// still costs a re-render without this whenever an unrelated ancestor state change bubbles
// through it.
export const PackEditorDrawer = memo(({ visible, editingKey, onDismiss, onSaved, onDelete, onShare }: PackEditorDrawerProps): JSX.Element => {
  const { width: windowWidth } = useWindowDimensions()

  return (
    <Drawer open={visible} onClose={onDismiss} width={windowWidth} zIndex={DRAWER_PACK_DETAIL_Z_INDEX}>
      <View testID='pack-editor-panel' style={styles.panel} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {/* Keyed on the pack being edited (or 'new') so switching which pack you're editing — or
            from editing into creating — always starts the form fresh, without needing an effect to
            resync it. The Drawer above never unmounts this (translates only), so without the key
            the form would keep showing whatever it last had the next time visible flips back on
            for a different target. */}
        <PackEditorForm key={editingKey ?? 'new'} editingKey={editingKey} onCancel={onDismiss} onSaved={onSaved} onDelete={onDelete} onShare={onShare} />
      </View>
    </Drawer>
  )
})
PackEditorDrawer.displayName = 'PackEditorDrawer'

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

  // A blank row appended, purely for display, whenever the last REAL entry (in state) isn't blank
  // — not written into state itself until the player actually types into it (see updateEntry).
  // Derived during render, not grown via an effect + setState: an effect would still lag a render
  // behind the keystroke that fills in "the last row", and eslint's react-hooks "set-state-in-effect"
  // rule rejects that cascading-render shape anyway. Computed fresh every render instead, so the
  // blank row is already part of the SAME commit as the keystroke that made the real last row
  // non-blank — which is exactly what fixes the pack editor's keyboard flicker: the return-key chain
  // (see entryRows below) always advances onto a field that's already mounted, never one that gets
  // created and focused after the fact (the previous design's append-then-focus, which is what
  // actually caused the flicker — not @rific/focus-chain itself, which has no way to tell an
  // existing sibling apart from a component that just mounted this render).
  const lastRealEntry = entries[entries.length - 1]
  const displayEntries = lastRealEntry.answer.trim() === '' && (lastRealEntry.hint ?? '').trim() === '' ? entries : [...entries, EMPTY_ENTRY]

  // index === entries.length means this is the not-yet-real trailing row above — promotes it into
  // state (with whatever was just typed) rather than trying to update an out-of-bounds entry.
  const updateEntry = (index: number, patch: Partial<CustomPackEntryInput>) => setEntries((prev) => (index < prev.length ? prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) : [...prev, { ...EMPTY_ENTRY, ...patch }]))
  const removeEntry = (index: number) => setEntries((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  // Registration order IS focus order, and register() must be called during render — see
  // PnpWordPrompt's own comment on useFocusChain for why. The label leads the chain, then every
  // entry's answer/hint pair in list order.
  const register = useFocusChain()
  // Destructured to plain locals rather than kept as `labelReg.ref` etc. — eslint's react-hooks
  // "refs" rule flags property access shaped like `.ref`/`.focus` as if it were a raw ref read
  // during render, same as PnpWordPrompt's own registration does.
  // blurOnSubmit=false on every field below (see PnpWordPrompt's own comment on register()) — the
  // TextInput's native default would otherwise race each onSubmitEditing's own focus() call and
  // flicker the keyboard shut and back open between fields.
  const { ref: labelRef, onSubmitEditing: focusFirstEntry, blurOnSubmit: labelBlurOnSubmit } = register()

  // Holds the always-blank trailing row's answer-field instance, kept up to date by the ref
  // callback below (see entryRows) — written at commit time via the ref callback (fired by React
  // on commit), not synchronously during render, so eslint's react-hooks "refs" rule is fine with
  // it. Backs the "Add word" button below: since displayEntries above guarantees that row already
  // exists and is already mounted, the button can just focus it directly rather than adding then
  // focusing a new one.
  const lastAnswerElRef = useRef<{ focus: () => void } | null>(null)

  // Same rule handleSave itself applies when actually saving — surfaced here too so the button can
  // just be disabled instead of doing nothing (or popping an alert unreliably, see ConfirmDialog's
  // own doc comment on why native dialogs aren't trusted for feedback in this app) when pressed
  // with nothing to save.
  const hasValidEntry = entries.some((entry) => normalizePhrase(entry.answer).replace(/ /g, '').length > 0)

  const handleSave = async () => {
    // Falls back to "Custom" rather than blocking the save on an empty name — the field stays
    // freely editable either way, this just means leaving it blank isn't a dead end.
    const trimmedLabel = label.trim() || CUSTOM_QUICK_PACK_LABEL

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

  const entryRows = displayEntries.map((entry, index) => {
    const { ref: answerRef, onSubmitEditing: focusHint, blurOnSubmit: answerBlurOnSubmit } = register()
    const { ref: hintRef, onSubmitEditing: focusNextAnswer, blurOnSubmit: hintBlurOnSubmit } = register()
    // displayEntries above keeps a blank entry always mounted after the last real one, so there's
    // no special "last" case here — every hint field's return key just advances the chain onto the
    // next answer field, same as every other field, because that next field already exists.
    const isLast = index === displayEntries.length - 1
    // True for the not-yet-real trailing row (see displayEntries/updateEntry above) — nothing to
    // remove there yet, so its own remove button is disabled rather than a no-op tap.
    const isVirtual = index >= entries.length

    return (
      <View key={index} style={styles.entryRow}>
        <View style={styles.entryInputs}>
          <TextInput
            testID={`entry-answer-${index}`}
            // Merged with the chain's own ref callback: it always registers this field for the
            // return-key chain, and additionally keeps lastAnswerElRef pointed at whichever entry is
            // currently last — a ref write, but happening inside a ref callback (fired by React at
            // commit time), not synchronously during render, so it's fine here.
            ref={(el: Parameters<typeof answerRef>[0]) => {
              answerRef(el)
              if (isLast) lastAnswerElRef.current = el
            }}
            onSubmitEditing={focusHint}
            blurOnSubmit={answerBlurOnSubmit}
            returnKeyType='next'
            value={entry.answer}
            onChangeText={(answer) => updateEntry(index, { answer })}
            label='Word or phrase'
            autoCapitalize='characters'
            mode='outlined'
            dense
            maxLength={128}
          />
          <TextInput testID={`entry-hint-${index}`} ref={hintRef} onSubmitEditing={focusNextAnswer} blurOnSubmit={hintBlurOnSubmit} returnKeyType='next' style={styles.hintInput} value={entry.hint} onChangeText={(hint) => updateEntry(index, { hint })} label='Hint (optional)' mode='outlined' dense maxLength={80} />
        </View>
        <IconButton icon='close' size={20} onPress={() => removeEntry(index)} disabled={isVirtual || entries.length === 1} accessibilityLabel={`Remove entry ${index + 1}`} />
      </View>
    )
  })

  return (
    <>
      {/* footerAboveKeyboard: this form's own entries can run long enough that the last row's
          fields sit right where the keyboard covers the screen — without it, Cancel/Save (in the
          footer below) would be hidden behind the keyboard while a mid-form field is focused. */}
      <ScrollViewProvider footerAboveKeyboard>
        {/* Share/Delete only make sense once there's an actual saved pack behind editingKey — no
            trailing action at all for a brand-new, not-yet-saved pack instead (ScrollViewHeader
            centers the title independently of whether a trailing action is present, unlike the old
            hand-rolled row, which needed a balancing spacer). Leading icon is arrow-left, not X —
            same left-anchored Game Menu lineage as PuzzleDrawer/PackPuzzlesDrawer/PacksScreen (see
            PuzzleDrawer's own header comment for why an arrow instead of a close X). 'Close', not
            the Appbar.BackAction default of 'Back' — see PuzzleDrawer's own ScrollViewHeader
            comment for why. Custom IconButton, not the default callback-driven Appbar.BackAction —
            filled tertiary, matching every other back/close action in the app; IconButton already
            fires the app's own haptic convention on press itself, so this needs no manual
            selection() call the way the callback form used to. */}
        <ScrollViewHeader
          title={editingKey ? 'Edit pack' : 'New pack'}
          actionSize={40}
          backAction={
            <IconButton
              icon='arrow-left'
              mode='contained'
              hitSlop={ICON_ACTION_HIT_SLOP}
              containerColor={theme.colors.tertiary}
              iconColor={theme.colors.onTertiary}
              onPress={() => {
                // The Drawer this panel lives in never unmounts on close, only translates
                // off-screen (see PackEditorDrawer's own doc comment above) — so a focused
                // TextInput keeps native focus and the OS keyboard stays up through the close
                // animation unless dismissed here.
                Keyboard.dismiss()
                onCancel()
              }}
              accessibilityLabel='Close'
            />
          }
          trailingAction={
            editingKey ? (
              <View style={styles.rowActions}>
                <IconButton icon='share-variant' size={20} onPress={() => void handleSharePress()} accessibilityLabel='Share pack' />
                <IconButton icon='delete-outline' size={20} iconColor={theme.colors.danger} onPress={() => setConfirmDeleteVisible(true)} accessibilityLabel='Delete pack' />
              </View>
            ) : undefined
          }
        />

        <ScrollView keyboardAware showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled'>
          {/* A list-item-header treatment (like "My packs"/"Built-in packs" above the rows they
            label) rather than just another form field identical to the entries below it — this is
            the one field that names the whole thing the rest of the screen is building. */}
          <Text variant='titleSmall' style={styles.sectionHeader}>
            Pack name
          </Text>
          <TextInput testID='pack-label-input' ref={labelRef} onSubmitEditing={focusFirstEntry} blurOnSubmit={labelBlurOnSubmit} returnKeyType='next' value={label} onChangeText={setLabel} mode='outlined' maxLength={60} />

          {entryRows}

          <Button icon='plus' onPress={() => lastAnswerElRef.current?.focus()} style={styles.addButton}>
            Add word
          </Button>
        </ScrollView>

        {/* Not part of the scrollable content — same reasoning as PuzzleDrawer's own footer and
            PacksScreen's listFooter: Cancel/Save should be reachable without scrolling down
            through however many entries this pack has. */}
        <ScrollViewFooter style={styles.footer}>
          <Button
            mode='outlined'
            onPress={() => {
              Keyboard.dismiss()
              onCancel()
            }}
            style={styles.footerButton}
          >
            Cancel
          </Button>
          <Button mode='contained' onPress={() => void handleSave()} loading={saving} disabled={saving || !hasValidEntry} style={styles.footerButton}>
            Save pack
          </Button>
        </ScrollViewFooter>
      </ScrollViewProvider>

      <ConfirmDialog visible={confirmDeleteVisible} title='Delete pack?' message={`This permanently deletes "${label}" and any unlock progress for it. This cannot be undone.`} confirmLabel='Delete' destructive onConfirm={() => void handleConfirmDelete()} onCancel={() => setConfirmDeleteVisible(false)} />
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
  // Matches PuzzleDrawer's own footer padding. alignItems override matches every other migrated
  // footer's stretch-not-center reasoning (see PuzzleDrawer's own footer comment) — inert here in
  // practice (footerButton's flex:1 splits width, not height, and both buttons share one natural
  // height), kept for consistency with the rest.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 12,
    // Matches ScrollViewHeader's own actionMargin — see PuzzleDrawer's own footer comment for why.
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  footerButton: { flex: 1 },
  hintInput: { marginTop: 0 },
  panel: { flex: 1 },
  rowActions: { flexDirection: 'row' },
  // paddingBottom matches sectionHeader's own marginTop above exactly — the scrollable content's
  // last field sits the same distance from what follows it (the footer) as the first sits from
  // the header.
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 12
  }
})
