import { BlurView, useBlur, useThemeSettings } from '@rific/auto-paper'
import { Drawer, DrawerEdgeSwipe } from '@rific/drawer'
import { JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, ScrollView as RNScrollView, Share, StyleSheet, View } from 'react-native'
import { Button, IconButton, SegmentedButtons, Text, TextInput } from 'react-native-paper'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload, PuzzleSourceMode } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { buildPuzzleLink } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'

import { ModeSelector } from './ModeSelector'
import { PackPickerDialog } from './PackPickerDialog'

const SOURCE_OPTIONS: { label: string; value: PuzzleSourceMode }[] = [
  { label: 'Random', value: 'random' },
  { label: 'Custom', value: 'custom' }
]

const DIFFICULTY_OPTIONS: { label: string; value: 'any' | PuzzleDifficultyTier }[] = [
  { label: 'Any', value: 'any' },
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' }
]

const SOURCE_MODE_ANNOUNCEMENT: Record<PuzzleSourceMode, string> = {
  random: 'Pack picker and difficulty options shown',
  custom: 'Custom puzzle form shown'
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
}

export const PuzzleDrawer = ({ visible, onDismiss, onRequestOpen, initialConfig, onConfirm, packsVersion = 0, onPacksChanged = () => {} }: PuzzleDrawerProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const blur = useBlur()
  const insets = useSafeAreaInsets()
  // packsVersion isn't read here — it's a change counter bumped whenever a custom pack is
  // created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const translateX = useSharedValue(-DRAWER_WIDTH)

  const [draft, setDraft] = useState<PuzzleConfig>(initialConfig)
  // Starts revealed — this is the player composing their own word, not hiding it from themselves,
  // so masking by default only made typos harder to catch. The toggle still lets them hide it
  // afterward (e.g. before handing the device to whoever's guessing).
  const [isRevealed, setIsRevealed] = useState(true)
  const [packPickerVisible, setPackPickerVisible] = useState(false)
  const hasAnnouncedRef = useRef(false)

  const packSummaryLabel = useMemo(() => {
    if (draft.packKeys.length === 0) return 'No packs selected'
    if (draft.packKeys.length === manifest.length) return 'All packs'
    return `${draft.packKeys.length} of ${manifest.length} packs`
  }, [draft.packKeys, manifest.length])

  const updateDraft = useCallback((patch: Partial<PuzzleConfig>) => setDraft((d) => ({ ...d, ...patch })), [])

  // Resets the draft from whatever's currently playing each time the drawer opens, and also
  // whenever initialConfig itself changes while already open — the only way that happens is a
  // fresh shared-puzzle link arriving (Main.tsx swaps in a new pendingShare), since the drawer's
  // own confirm action changes config and closes the drawer in the same step. Without reacting to
  // initialConfig here, a share link opened while the drawer was already open silently failed to
  // update the draft. Drawer/DrawerEdgeSwipe (from @rific/drawer) own the actual open/close
  // animation, so this effect only has to mirror the prop into editable local state — a
  // legitimate external-system sync.
  /* eslint-disable react-hooks/set-state-in-effect -- syncs the draft from an external prop, not derived from other state */
  useEffect(() => {
    if (!visible) return
    // An unconfirmed sourceMode edit gets discarded right here on reopen. That reversion is not
    // something the user just did, so treat it like the very first run below and skip the
    // announcement it would otherwise trigger.
    if (draft.sourceMode !== initialConfig.sourceMode) hasAnnouncedRef.current = false
    setDraft(initialConfig)
    setIsRevealed(true)
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- draft is read only to detect a discarded
       edit on reopen, not to resync; including it would re-run this on every keystroke. */
  }, [visible, initialConfig])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Announces the newly-shown section to screen readers when Puzzle source changes — skipped on
  // the very first run (and on any reset-driven reversion above) so opening the drawer doesn't
  // announce anything before the user has acted.
  useEffect(() => {
    if (!hasAnnouncedRef.current) {
      hasAnnouncedRef.current = true
      return
    }
    AccessibilityInfo.announceForAccessibility(SOURCE_MODE_ANNOUNCEMENT[draft.sourceMode])
  }, [draft.sourceMode])

  const handleConfirm = useCallback(() => {
    const result = resolvePuzzle(draft)
    if (!result.ok) {
      void alert(draft.sourceMode === 'custom' ? 'Enter a valid word' : 'No puzzles available', result.error)
      return
    }
    onConfirm(result.payload, draft)
  }, [draft, onConfirm])

  const handleShare = useCallback(async () => {
    const result = resolvePuzzle({ ...draft, sourceMode: 'custom' })
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
  }, [draft])

  const handleSelectMode = useCallback((mode: GameMode) => updateDraft({ mode }), [updateDraft])

  return (
    <>
      <DrawerEdgeSwipe enabled={!visible} onOpen={onRequestOpen} translateX={translateX} width={DRAWER_WIDTH} />
      <Drawer open={visible} onClose={onDismiss} translateX={translateX} width={DRAWER_WIDTH}>
        <View testID='puzzle-drawer-panel' style={[styles.panelContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
          <BlurView blur={blur} style={StyleSheet.absoluteFill} />
          <View style={styles.headerRow}>
            <Text variant='titleLarge'>Change puzzle</Text>
            <IconButton icon='close' onPress={onDismiss} accessibilityLabel='Close' />
          </View>

          <RNScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
            <Text variant='titleMedium' style={styles.sectionLabel}>
              Puzzle source
            </Text>
            <SegmentedButtons value={draft.sourceMode} onValueChange={(value) => updateDraft({ sourceMode: value as PuzzleSourceMode })} buttons={SOURCE_OPTIONS} />

            {/* Custom inputs and the Random controls are mutually exclusive, so they share this one
                slot right under Puzzle source — whichever is relevant appears in the same place. */}
            {draft.sourceMode === 'custom' ? (
              <View style={styles.customForm}>
                <TextInput testID='phrase-input' value={draft.customPhrase} onChangeText={(customPhrase) => updateDraft({ customPhrase })} label='Secret word (letters and spaces)' autoCapitalize='characters' secureTextEntry={!isRevealed} maxLength={128} mode='outlined' right={<TextInput.Icon icon={isRevealed ? 'eye-off' : 'eye'} onPress={() => setIsRevealed((r) => !r)} accessibilityLabel={isRevealed ? 'Hide secret word' : 'Show secret word'} accessibilityState={{ selected: isRevealed }} />} />
                <TextInput testID='hint-input' style={styles.hintInput} value={draft.customHint} onChangeText={(customHint) => updateDraft({ customHint })} label='Hint for the guesser (optional)' maxLength={80} mode='outlined' />
                <Button mode='outlined' icon='share-variant' onPress={() => void handleShare()} style={styles.shareButton}>
                  Share this puzzle
                </Button>
              </View>
            ) : (
              <>
                <Text variant='titleMedium' style={styles.sectionLabel}>
                  Choose packs
                </Text>
                <Button mode='outlined' icon='format-list-checks' onPress={() => setPackPickerVisible(true)} contentStyle={styles.packPickerContent}>
                  {packSummaryLabel}
                </Button>

                <Text variant='titleMedium' style={styles.sectionLabel}>
                  Difficulty
                </Text>
                <SegmentedButtons value={draft.difficulty} onValueChange={(value) => updateDraft({ difficulty: value as 'any' | PuzzleDifficultyTier })} buttons={DIFFICULTY_OPTIONS} />
              </>
            )}

            <Text variant='titleMedium' style={styles.sectionLabel}>
              Game mode
            </Text>
            <ModeSelector selected={draft.mode} color={settings.color} onSelect={handleSelectMode} />
          </RNScrollView>

          <View style={styles.footer}>
            <Button mode='contained' icon='play' onPress={handleConfirm} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
              {draft.sourceMode === 'custom' ? 'Start this puzzle' : 'New puzzle'}
            </Button>
          </View>
        </View>
      </Drawer>

      <PackPickerDialog visible={packPickerVisible} onDismiss={() => setPackPickerVisible(false)} selectedKeys={draft.packKeys} onChangeSelectedKeys={(packKeys) => updateDraft({ packKeys })} packsVersion={packsVersion} onPacksChanged={onPacksChanged} />
    </>
  )
}

const styles = StyleSheet.create({
  confirmContent: { height: 52 },
  confirmLabel: { fontSize: 16, fontWeight: '700' },
  customForm: { paddingTop: 16 },
  flex: { flex: 1 },
  footer: { padding: 16 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  hintInput: { marginTop: 8 },
  packPickerContent: { justifyContent: 'flex-start' },
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
    paddingBottom: 24,
    paddingHorizontal: 16
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  },
  shareButton: { marginTop: 12 }
})
