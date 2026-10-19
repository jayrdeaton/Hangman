import { FadingScrollView, useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton } from '@rific/feedback-press'
import { useFocusChain } from '@rific/focus-chain'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { JSX, memo, useMemo, useRef, useState } from 'react'
import { Keyboard, StyleSheet, View } from 'react-native'
import { Text, TextInput } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useGameStats } from '@/hooks/useGameStats'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useUnlockToasts } from '@/hooks/useUnlockToasts'
import { CUSTOM_QUICK_PACK_LABEL, type CustomPack, type CustomPackEntryInput, getCustomPackPuzzles, saveCustomPack } from '@/utils/customPacks'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

import { FullScreenLayer } from './FullScreenLayer'
import { PAGE_MAX_WIDTH } from './PackPuzzlesPage'
import { ScreenHeader } from './ScreenHeader'

const EMPTY_ENTRY: CustomPackEntryInput = { answer: '', hint: '' }

export type PackEditorPageProps = {
  visible: boolean
  // The pack being edited, or null to create a new one. Deliberately NOT reset to null on leaving by
  // the caller - like Choose Packs' other page, this slides away rather than unmounting, so the form
  // has to hold steady through that slide instead of blanking out mid-way.
  editingKey: string | null
  onDismiss: () => void
  onSaved: (pack: CustomPack) => void
  // Unconditional - this page's own ConfirmDialog is what gates calling it, so by the time it runs
  // the player has already agreed. No confirm() inside it (see ConfirmDialog's own doc comment for
  // why: window.confirm() isn't reliable on web).
  onDelete: (key: string) => Promise<void>
  onShare: (key: string, label: string) => Promise<void>
}

// Create or edit a custom pack (Choose Packs' Create, or a custom pack's pencil): a page that slides
// in over Choose Packs' list (FullScreenLayer), under the same screen header with a Back arrow, and
// Share and Delete at its end once there's a saved pack behind editingKey.
// Memoized: it stays mounted (off the screen's edge) even while away, and always renders the full form
// below (every entry row, focus-chain registration and all) regardless of `visible`, and an
// always-mounted subtree still costs a re-render without this whenever something above it changes.
export const PackEditorPage = memo(({ visible, editingKey, onDismiss, onSaved, onDelete, onShare }: PackEditorPageProps): JSX.Element => (
  <FullScreenLayer visible={visible} from='right'>
    <View testID='pack-editor-panel' style={styles.panel} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
      {/* Keyed on the pack being edited (or 'new') so switching which pack you're editing - or from
          editing into creating - always starts the form fresh, without needing an effect to resync it.
          The page never unmounts this (it only slides away), so without the key the form would keep
          showing whatever it last had the next time it opens for a different pack. */}
      <PackEditorForm key={editingKey ?? 'new'} editingKey={editingKey} onCancel={onDismiss} onSaved={onSaved} onDelete={onDelete} onShare={onShare} />
    </View>
  </FullScreenLayer>
))
PackEditorPage.displayName = 'PackEditorPage'

type PackEditorFormProps = {
  editingKey: string | null
  onSaved: (pack: CustomPack) => void
  onCancel: () => void
  onDelete: (key: string) => Promise<void>
  onShare: (key: string, label: string) => Promise<void>
}

const PackEditorForm = ({ editingKey, onSaved, onCancel, onDelete, onShare }: PackEditorFormProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  // Cancel and Save rise with the keyboard, so they stay reachable while a field is being typed in.
  const keyboard = useKeyboard()
  const { recordCustomPackCreated } = useGameStats()
  const showUnlockToasts = useUnlockToasts()
  // Whoever is playing makes the pack, so it counts toward their custom pack achievements.
  const { profileId } = useActivePlayer()

  const editingPack = useMemo((): CustomPack | null => {
    if (!editingKey) return null
    const pack = getPuzzleManifest().find((item) => item.key === editingKey)
    if (!pack) return null
    // The list only ever needs the manifest summary, but the editor needs the full puzzle list to
    // prefill entries - createdAt/updatedAt aren't used by the editor so they're left blank rather
    // than looking up the full CustomPack record just for two unused timestamps.
    return { key: pack.key, label: pack.label, createdAt: '', updatedAt: '', puzzles: getCustomPackPuzzles(editingKey) }
  }, [editingKey])

  const [label, setLabel] = useState(editingPack?.label ?? '')
  const [entries, setEntries] = useState<CustomPackEntryInput[]>(editingPack && editingPack.puzzles.length > 0 ? editingPack.puzzles.map((puzzle) => ({ answer: puzzle.answer, hint: typeof puzzle.metadata?.hint === 'string' ? puzzle.metadata.hint : '' })) : [EMPTY_ENTRY])
  const [saving, setSaving] = useState(false)
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)

  // A blank row appended, purely for display, whenever the last REAL entry (in state) isn't blank
  // - not written into state itself until the player actually types into it (see updateEntry).
  // Derived during render, not grown via an effect + setState: an effect would still lag a render
  // behind the keystroke that fills in "the last row", and eslint's react-hooks "set-state-in-effect"
  // rule rejects that cascading-render shape anyway. Computed fresh every render instead, so the
  // blank row is already part of the SAME commit as the keystroke that made the real last row
  // non-blank - which is exactly what fixes the pack editor's keyboard flicker: the return-key chain
  // (see entryRows below) always advances onto a field that's already mounted, never one that gets
  // created and focused after the fact (the previous design's append-then-focus, which is what
  // actually caused the flicker - not @rific/focus-chain itself, which has no way to tell an
  // existing sibling apart from a component that just mounted this render).
  const lastRealEntry = entries[entries.length - 1]
  const displayEntries = lastRealEntry.answer.trim() === '' && (lastRealEntry.hint ?? '').trim() === '' ? entries : [...entries, EMPTY_ENTRY]

  // index === entries.length means this is the not-yet-real trailing row above - promotes it into
  // state (with whatever was just typed) rather than trying to update an out-of-bounds entry.
  const updateEntry = (index: number, patch: Partial<CustomPackEntryInput>) => setEntries((prev) => (index < prev.length ? prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) : [...prev, { ...EMPTY_ENTRY, ...patch }]))
  const removeEntry = (index: number) => setEntries((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  // Registration order IS focus order, and register() must be called during render - see
  // PnpWordPrompt's own comment on useFocusChain for why. The label leads the chain, then every
  // entry's answer/hint pair in list order.
  const register = useFocusChain()
  // Destructured to plain locals rather than kept as `labelReg.ref` etc. - eslint's react-hooks
  // "refs" rule flags property access shaped like `.ref`/`.focus` as if it were a raw ref read
  // during render, same as PnpWordPrompt's own registration does.
  // blurOnSubmit=false on every field below (see PnpWordPrompt's own comment on register()) - the
  // TextInput's native default would otherwise race each onSubmitEditing's own focus() call and
  // flicker the keyboard shut and back open between fields.
  const {
    ref: labelRef,
    props: { onSubmitEditing: focusFirstEntry, blurOnSubmit: labelBlurOnSubmit }
  } = register()

  // Holds the always-blank trailing row's answer-field instance, kept up to date by the ref
  // callback below (see entryRows) - written at commit time via the ref callback (fired by React
  // on commit), not synchronously during render, so eslint's react-hooks "refs" rule is fine with
  // it. Backs the "Add word" button below: since displayEntries above guarantees that row already
  // exists and is already mounted, the button can just focus it directly rather than adding then
  // focusing a new one.
  const lastAnswerElRef = useRef<{ focus: () => void } | null>(null)

  // Same rule handleSave itself applies when actually saving - surfaced here too so the button can
  // just be disabled instead of doing nothing (or popping an alert unreliably, see ConfirmDialog's
  // own doc comment on why native dialogs aren't trusted for feedback in this app) when pressed
  // with nothing to save.
  const hasValidEntry = entries.some((entry) => normalizePhrase(entry.answer).replace(/ /g, '').length > 0)

  const handleSave = async () => {
    // Falls back to "Custom" rather than blocking the save on an empty name - the field stays
    // freely editable either way, this just means leaving it blank isn't a dead end.
    const trimmedLabel = label.trim() || CUSTOM_QUICK_PACK_LABEL

    const validEntries = entries.filter((entry) => normalizePhrase(entry.answer).replace(/ /g, '').length > 0)
    setSaving(true)
    try {
      const pack = await saveCustomPack({ key: editingPack?.key, label: trimmedLabel, entries: validEntries })
      // editingKey (not editingPack: see its own useMemo above) is what distinguishes a brand-new
      // pack from editing one that already exists; only the former counts toward the custom pack
      // achievements, so re-saving edits to an existing pack doesn't inflate them.
      if (!editingKey) {
        // No round-end card here to fold this into (unlike a solved puzzle: see GameScreen's
        // handleSolved), so each unlock gets the fleet's achievement toast instead (useUnlockToasts:
        // its title, then whose it is, in its tier's color with its own icon).
        showUnlockToasts(recordCustomPackCreated(profileId), profileId)
      }
      onSaved(pack)
    } finally {
      setSaving(false)
    }
  }

  // Only reachable from the confirm dialog's own Delete button (see the ConfirmDialog rendered
  // below) - by the time this runs, the player has already agreed.
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
    const {
      ref: answerRef,
      props: { onSubmitEditing: focusHint, blurOnSubmit: answerBlurOnSubmit }
    } = register()
    const {
      ref: hintRef,
      props: { onSubmitEditing: focusNextAnswer, blurOnSubmit: hintBlurOnSubmit }
    } = register()
    // displayEntries above keeps a blank entry always mounted after the last real one, so there's
    // no special "last" case here - every hint field's return key just advances the chain onto the
    // next answer field, same as every other field, because that next field already exists.
    const isLast = index === displayEntries.length - 1
    // True for the not-yet-real trailing row (see displayEntries/updateEntry above) - nothing to
    // remove there yet, so its own remove button is disabled rather than a no-op tap.
    const isVirtual = index >= entries.length

    return (
      <View key={index} style={styles.entryRow}>
        <View style={styles.entryInputs}>
          <TextInput
            testID={`entry-answer-${index}`}
            // Merged with the chain's own ref callback: it always registers this field for the
            // return-key chain, and additionally keeps lastAnswerElRef pointed at whichever entry is
            // currently last - a ref write, but happening inside a ref callback (fired by React at
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
            label='Word or Phrase'
            autoCapitalize='characters'
            mode='outlined'
            dense
            maxLength={128}
          />
          <TextInput testID={`entry-hint-${index}`} ref={hintRef} onSubmitEditing={focusNextAnswer} blurOnSubmit={hintBlurOnSubmit} returnKeyType='next' style={styles.hintInput} value={entry.hint} onChangeText={(hint) => updateEntry(index, { hint })} label='Hint (Optional)' mode='outlined' dense maxLength={80} />
        </View>
        <IconButton icon='close' size={20} onPress={() => removeEntry(index)} disabled={isVirtual || entries.length === 1} accessibilityLabel={`Remove entry ${index + 1}`} />
      </View>
    )
  })

  // Leaving: a focused field keeps the keyboard up through the page's slide out unless it's put away
  // here.
  const handleCancel = () => {
    Keyboard.dismiss()
    onCancel()
  }

  return (
    <>
      <View style={[styles.column, { paddingLeft: insets.left, paddingRight: insets.right }]}>
        {/* Back, not Close: it steps back to Choose Packs' list, which is still under it. Share and Delete
            only once there's a saved pack behind editingKey. */}
        <ScreenHeader
          icon='arrow-left'
          label='Back'
          title={editingKey ? 'Edit Pack' : 'New Pack'}
          onPress={handleCancel}
          trailing={
            editingKey ? (
              <>
                <IconButton icon='share-variant' size={20} iconColor={theme.colors.onSurface} onPress={() => void handleSharePress()} accessibilityLabel='Share pack' />
                <IconButton icon='delete-outline' size={20} iconColor={theme.colors.danger} onPress={() => setConfirmDeleteVisible(true)} accessibilityLabel='Delete pack' />
              </>
            ) : undefined
          }
        />

        {/* automaticallyAdjustKeyboardInsets: on iOS the form itself keeps a focused field clear of the
            keyboard. */}
        <FadingScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled' automaticallyAdjustKeyboardInsets>
          {/* A section label rather than just another field like the entries below: this is the one field
              that names the whole thing the rest of the screen is building. */}
          <Text variant='titleMedium' style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            Pack Name
          </Text>
          <TextInput testID='pack-label-input' ref={labelRef} onSubmitEditing={focusFirstEntry} blurOnSubmit={labelBlurOnSubmit} returnKeyType='next' value={label} onChangeText={setLabel} mode='outlined' maxLength={60} />

          {entryRows}

          <Button icon='plus' onPress={() => lastAnswerElRef.current?.focus()} style={styles.addButton}>
            Add
          </Button>
        </FadingScrollView>

        {/* Pinned under the form, so Cancel and Save are reachable without scrolling through however many
            entries the pack has, and above the keyboard while it's up. */}
        <View style={[styles.footer, { paddingBottom: 12 + Math.max(insets.bottom, keyboard.overlap) }]}>
          <Button mode='outlined' onPress={handleCancel} style={styles.footerButton} contentStyle={styles.footerButtonContent}>
            Cancel
          </Button>
          <Button mode='contained' onPress={() => void handleSave()} loading={saving} disabled={saving || !hasValidEntry} style={styles.footerButton} contentStyle={styles.footerButtonContent}>
            Save
          </Button>
        </View>
      </View>

      <ConfirmDialog visible={confirmDeleteVisible} title='Delete Pack?' message={`This permanently deletes "${label}" and any unlock progress for it. This cannot be undone.`} icon='delete-outline' confirmLabel='Delete' cancelLabel='Cancel' destructive onConfirm={() => void handleConfirmDelete()} onCancel={() => setConfirmDeleteVisible(false)} />
    </>
  )
}

const styles = StyleSheet.create({
  addButton: { marginTop: 4 },
  column: { alignSelf: 'center', flex: 1, maxWidth: PAGE_MAX_WIDTH, width: '100%' },
  entryInputs: { flex: 1, gap: 8 },
  entryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 12
  },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  footerButton: { flex: 1 },
  footerButtonContent: { height: 48 },
  hintInput: { marginTop: 0 },
  panel: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16, paddingHorizontal: 16, paddingTop: 4 },
  sectionTitle: { fontWeight: '700', marginBottom: 4 }
})
