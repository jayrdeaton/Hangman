import { BlurView, useBlur, useThemeSettings } from '@rific/auto-paper'
import { Drawer, DrawerEdgeSwipe } from '@rific/drawer'
import { JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, ScrollView as RNScrollView, Share, StyleSheet, View } from 'react-native'
import { Button, IconButton, SegmentedButtons, Text, TextInput } from 'react-native-paper'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { usePackSelection } from '@/hooks/usePackSelection'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { addCustomPuzzle, buildCustomPuzzle } from '@/utils/customPacks'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { buildPuzzleLink } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'

import { ModeSelector } from './ModeSelector'
import { PacksScreen } from './PacksScreen'

const DIFFICULTY_OPTIONS: { label: string; value: 'any' | PuzzleDifficultyTier }[] = [
  { label: 'Any', value: 'any' },
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' }
]

// Read-only in Custom mode — a single typed word doesn't have a difficulty to filter by, it just
// IS a difficulty (the same scoring buildCustomPuzzle already applies when the word gets saved),
// so there's no "Any" here and every button is disabled; value alone drives which one lights up.
const CUSTOM_DIFFICULTY_OPTIONS: { label: string; value: PuzzleDifficultyTier; disabled: true }[] = [
  { label: 'Easy', value: 'easy', disabled: true },
  { label: 'Medium', value: 'medium', disabled: true },
  { label: 'Hard', value: 'hard', disabled: true }
]

const CUSTOM_FORM_ANNOUNCEMENT = {
  shown: 'Custom puzzle form shown',
  hidden: 'Pack picker and difficulty options shown'
}

const DRAWER_WIDTH = 380
const SHADOW_COLOR = '#000'

export type PuzzleDrawerProps = {
  visible: boolean
  onDismiss: () => void
  onRequestOpen: () => void
  initialConfig: PuzzleConfig
  onConfirm: (payload: GameStartPayload, config: PuzzleConfig) => void
  packsVersion?: number
  onPacksChanged?: () => void
  // Fired live, on every change — not staged behind the confirm button — so the art style updates
  // the round already in progress immediately, and the difficulty filter is already in effect the
  // moment the current round ends, without the player having to also press New Puzzle/Start Puzzle
  // just to save what they picked. See Main.tsx's handleModeChange/handleDifficultyChange.
  onModeChange?: (mode: GameMode) => void
  onDifficultyChange?: (difficulty: 'any' | PuzzleDifficultyTier) => void
}

export const PuzzleDrawer = ({ visible, onDismiss, onRequestOpen, initialConfig, onConfirm, packsVersion = 0, onPacksChanged = () => {}, onModeChange = () => {}, onDifficultyChange = () => {} }: PuzzleDrawerProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const blur = useBlur()
  const insets = useSafeAreaInsets()
  // packsVersion isn't read here — it's a change counter bumped whenever a custom pack is
  // created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const translateX = useSharedValue(-DRAWER_WIDTH)
  // The persisted default (see usePackSelection) — read and written live, not staged in `draft`
  // like the rest of this config, so toggling a pack takes effect immediately for every future
  // round rather than only once "New puzzle" is pressed.
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()

  const [draft, setDraft] = useState<PuzzleConfig>(initialConfig)
  // Starts revealed — this is the player composing their own word, not hiding it from themselves,
  // so masking by default only made typos harder to catch. The toggle still lets them hide it
  // afterward (e.g. before handing the device to whoever's guessing).
  const [isRevealed, setIsRevealed] = useState(true)
  const [packsScreenVisible, setPacksScreenVisible] = useState(false)
  // Whether the secret-word form (opened via "Custom", backed out of via "Cancel" — see below) is
  // showing. Decoupled from draft.sourceMode (which only matters at confirm time, below) so
  // opening and canceling it doesn't touch the pack/difficulty selection sitting right above it —
  // the two are independent choices now, not one mode you switch between.
  const [customFormOpen, setCustomFormOpen] = useState(initialConfig.sourceMode === 'custom')
  const [savingCustom, setSavingCustom] = useState(false)
  const hasAnnouncedRef = useRef(false)

  const packSummaryLabel = useMemo(() => {
    if (selectedPackKeys.length === 0) return 'No packs selected'
    if (selectedPackKeys.length === manifest.length) return 'All packs'
    return `${selectedPackKeys.length} of ${manifest.length} packs`
  }, [selectedPackKeys, manifest.length])

  // null for a blank/unscoreable phrase (same validation buildCustomPuzzle already applies before
  // a word can be saved) — doubles as both "what tier does this word score as" for the read-only
  // Difficulty display below, and "is there actually a valid word yet" for gating the confirm
  // button, so the two can never disagree about what's typed.
  const customPreviewPuzzle = useMemo(() => buildCustomPuzzle('preview', '', { answer: draft.customPhrase }), [draft.customPhrase])

  const updateDraft = useCallback((patch: Partial<PuzzleConfig>) => setDraft((d) => ({ ...d, ...patch })), [])

  // Resets the draft from whatever's currently playing each time the drawer opens, and also
  // whenever initialConfig's sourceMode/customPhrase/customHint change while already open — that
  // combination only changes on a fresh shared-puzzle link arriving (Main.tsx swaps in a new
  // pendingShare), since the drawer's own confirm action changes config and closes the drawer in
  // the same step. Without reacting to those fields here, a share link opened while the drawer was
  // already open silently failed to update the draft. Drawer/DrawerEdgeSwipe (from @rific/drawer)
  // own the actual open/close animation, so this effect only has to mirror the prop into editable
  // local state — a legitimate external-system sync.
  //
  // Deliberately narrower than "any initialConfig change": mode and difficulty are now also live
  // (see onModeChange/onDifficultyChange below), which mutates Main.tsx's config — and therefore
  // this same initialConfig prop — while the drawer is still open. Resetting the whole draft on
  // every one of those echoes would wipe an in-progress custom word the player hasn't confirmed yet
  // just because they tapped a different mode card.
  /* eslint-disable react-hooks/set-state-in-effect -- syncs the draft from an external prop, not derived from other state */
  useEffect(() => {
    if (!visible) return
    const initialCustomFormOpen = initialConfig.sourceMode === 'custom'
    // An unconfirmed Custom-toggle edit gets discarded right here on reopen. That reversion is not
    // something the user just did, so treat it like the very first run below and skip the
    // announcement it would otherwise trigger.
    if (customFormOpen !== initialCustomFormOpen) hasAnnouncedRef.current = false
    setDraft(initialConfig)
    setCustomFormOpen(initialCustomFormOpen)
    setIsRevealed(true)
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- customFormOpen is read only to detect a
       discarded edit on reopen, not to resync; including it would re-run this on every toggle. */
  }, [visible, initialConfig.sourceMode, initialConfig.customPhrase, initialConfig.customHint])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Announces the newly-shown section to screen readers when the Custom toggle changes — skipped
  // on the very first run (and on any reset-driven reversion above) so opening the drawer doesn't
  // announce anything before the user has acted.
  useEffect(() => {
    if (!hasAnnouncedRef.current) {
      hasAnnouncedRef.current = true
      return
    }
    AccessibilityInfo.announceForAccessibility(customFormOpen ? CUSTOM_FORM_ANNOUNCEMENT.shown : CUSTOM_FORM_ANNOUNCEMENT.hidden)
  }, [customFormOpen])

  const handleConfirm = useCallback(async () => {
    const configToResolve: PuzzleConfig = { ...draft, sourceMode: customFormOpen ? 'custom' : 'random' }
    const result = resolvePuzzle(configToResolve, selectedPackKeys)
    if (!result.ok) {
      void alert(customFormOpen ? 'Enter a valid word' : 'No puzzles available', result.error)
      return
    }
    if (customFormOpen) {
      // Saved under the raw typed text (not result.payload.phrase, already normalized/upper-cased)
      // so it lands in the Custom pack the same way a word typed straight into the pack editor
      // would — see PackEditorStep in PacksScreen.tsx.
      setSavingCustom(true)
      try {
        await addCustomPuzzle({ answer: draft.customPhrase, hint: draft.customHint || undefined })
      } finally {
        setSavingCustom(false)
      }
      onPacksChanged()
    }
    onConfirm(result.payload, configToResolve)
  }, [draft, customFormOpen, onConfirm, onPacksChanged, selectedPackKeys])

  const handleShare = useCallback(async () => {
    const result = resolvePuzzle({ ...draft, sourceMode: 'custom' }, selectedPackKeys)
    if (!result.ok) {
      void alert("Can't share this puzzle", result.error)
      return
    }
    const link = buildPuzzleLink(result.payload)
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(link)
        void alert('Copied to clipboard', 'Send this link to a friend. Opening it starts them on your puzzle.')
        return
      }
      await Share.share({ message: `Can you guess my Hangman puzzle? ${link}` })
    } catch {
      void alert("Couldn't share", 'Something went wrong sharing this puzzle. Please try again.')
    }
  }, [draft, selectedPackKeys])

  const handleSelectMode = useCallback(
    (mode: GameMode) => {
      updateDraft({ mode })
      onModeChange(mode)
    },
    [updateDraft, onModeChange]
  )

  const handleSelectDifficulty = useCallback(
    (value: 'any' | PuzzleDifficultyTier) => {
      updateDraft({ difficulty: value })
      onDifficultyChange(value)
    },
    [updateDraft, onDifficultyChange]
  )

  const handleOpenCustom = useCallback(() => setCustomFormOpen(true), [])

  // A distinct action from opening, not the same button toggled back off — un-pressing an
  // already-pressed toggle silently changed what the confirm button at the bottom would do
  // (play the typed word vs. draw from packs) without making that obvious, and left it unclear
  // whether the typed word survived. "Cancel" is unambiguous about both: it backs out AND clears
  // the draft, matching PackEditorStep's own Cancel in PacksScreen.tsx.
  const handleCancelCustom = useCallback(() => {
    setCustomFormOpen(false)
    updateDraft({ customPhrase: '', customHint: '' })
  }, [updateDraft])

  return (
    <>
      <DrawerEdgeSwipe enabled={!visible} onOpen={onRequestOpen} translateX={translateX} width={DRAWER_WIDTH} />
      <Drawer open={visible} onClose={onDismiss} translateX={translateX} width={DRAWER_WIDTH}>
        {/* PacksScreen renders as a full-width Drawer of its own, stacked on top of this one while
            "Choose packs" is open — visually complete coverage, but this panel's own content stays
            mounted underneath it (Drawer never unmounts on close, just translates). Without
            factoring packsScreenVisible in here too, this panel's title/close button/fields would
            stay reachable by screen readers and keyboard focus while invisible behind the screen
            covering them. */}
        <View testID='puzzle-drawer-panel' style={[styles.panelContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={visible && !packsScreenVisible} accessibilityElementsHidden={!visible || packsScreenVisible} importantForAccessibility={visible && !packsScreenVisible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible && !packsScreenVisible ? onDismiss : undefined}>
          <BlurView blur={blur} style={StyleSheet.absoluteFill} />
          <View style={styles.headerRow}>
            <Text variant='titleLarge'>Game Menu</Text>
            <IconButton icon='close' onPress={onDismiss} accessibilityLabel='Close' />
          </View>

          <RNScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
            {/* The hero: the visual/tactile choice (what the round looks and feels like) leads,
                ahead of the more utilitarian pack/difficulty/custom-word controls below it. No
                label — the mode cards are self-explanatory without one. */}
            <ModeSelector selected={draft.mode} color={settings.color} onSelect={handleSelectMode} />

            <Text variant='titleMedium' style={styles.heroAdjacentSectionLabel}>
              Difficulty
            </Text>
            {/* A filter to pick from in pack mode; a live read-out of the typed word's own scored
                tier in Custom mode (blank/unscoreable text just leaves nothing selected). */}
            {customFormOpen ? <SegmentedButtons value={customPreviewPuzzle?.difficultyTier ?? ''} onValueChange={() => {}} buttons={CUSTOM_DIFFICULTY_OPTIONS} /> : <SegmentedButtons value={draft.difficulty} onValueChange={(value) => handleSelectDifficulty(value as 'any' | PuzzleDifficultyTier)} buttons={DIFFICULTY_OPTIONS} />}

            <Text variant='titleMedium' style={styles.sectionLabel}>
              Puzzle
            </Text>
            <Button mode='outlined' icon='format-list-checks' onPress={() => setPacksScreenVisible(true)} contentStyle={styles.choosePacksContent}>
              {packSummaryLabel}
            </Button>
            {/* Opens the form below; pack/difficulty selection above stays untouched either way.
                Backing out is a separate, explicitly-labeled action (Cancel) — not this same
                button un-pressed — so what it does is never ambiguous. */}
            <Button mode='outlined' icon={customFormOpen ? 'close' : 'pencil-plus-outline'} onPress={customFormOpen ? handleCancelCustom : handleOpenCustom} style={styles.customToggleButton} contentStyle={styles.choosePacksContent}>
              {customFormOpen ? 'Cancel' : 'Custom'}
            </Button>

            {/* The custom word form, when open, sits below the Custom toggle. */}
            {customFormOpen ? (
              <View style={styles.customForm}>
                <TextInput testID='phrase-input' value={draft.customPhrase} onChangeText={(customPhrase) => updateDraft({ customPhrase })} label='Secret word (letters and spaces)' autoCapitalize='characters' secureTextEntry={!isRevealed} maxLength={128} mode='outlined' right={<TextInput.Icon icon={isRevealed ? 'eye-off' : 'eye'} onPress={() => setIsRevealed((r) => !r)} accessibilityLabel={isRevealed ? 'Hide secret word' : 'Show secret word'} accessibilityState={{ selected: isRevealed }} />} />
                <TextInput testID='hint-input' style={styles.hintInput} value={draft.customHint} onChangeText={(customHint) => updateDraft({ customHint })} label='Hint for the guesser (optional)' maxLength={80} mode='outlined' />
                <Button mode='outlined' icon='share-variant' onPress={() => void handleShare()} disabled={!customPreviewPuzzle} style={styles.shareButton}>
                  Share this puzzle
                </Button>
              </View>
            ) : null}
          </RNScrollView>

          {/* A fixed footer, not part of the scrollable content — leaving the button inline at the
              end of a form this short left a large dead gap below it instead of avoiding one.
              Docking it here closes that gap and keeps the primary action reachable without
              scrolling. No divider above it — the padding alone reads as separate from the
              content without adding a hard line. */}
          <View style={styles.footer}>
            <Button mode='contained' icon='play' onPress={() => void handleConfirm()} loading={savingCustom} disabled={savingCustom || (customFormOpen && !customPreviewPuzzle)} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
              {customFormOpen ? 'Start puzzle' : 'New puzzle'}
            </Button>
          </View>
        </View>
      </Drawer>

      <PacksScreen visible={packsScreenVisible} onDismiss={() => setPacksScreenVisible(false)} selectedKeys={selectedPackKeys} onChangeSelectedKeys={setSelectedPackKeys} packsVersion={packsVersion} onPacksChanged={onPacksChanged} />
    </>
  )
}

const styles = StyleSheet.create({
  choosePacksContent: { justifyContent: 'flex-start' },
  confirmContent: { height: 52 },
  confirmLabel: { fontSize: 16, fontWeight: '700' },
  customForm: { paddingTop: 16 },
  customToggleButton: { marginTop: 8 },
  flex: { flex: 1 },
  footer: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  // A tighter top margin than a standalone section would use — right under the mode cards, so it
  // reads as "here's what you just picked" rather than a new, unrelated block starting.
  heroAdjacentSectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 12
  },
  hintInput: { marginTop: 8 },
  panelContent: {
    elevation: 8,
    flex: 1,
    overflow: 'hidden',
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  scrollContent: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 8
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  },
  shareButton: { marginTop: 12 }
})
