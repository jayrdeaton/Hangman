import { useFocusChain } from '@rific/focus-chain'
import { Button, Switch } from '@rific/haptic-press'
import { JSX, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Snackbar, Text, TextInput } from 'react-native-paper'

import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { buildCustomPuzzle } from '@/utils/customPacks'

import { DialogShell } from './DialogShell'

export type PnpWordPromptProps = {
  answer: string
  hint: string
  // Owned by Main, not local state — Main mounts the real Game continuously for the entire pass-
  // and-play round (see Main.tsx) and needs the live phrase to feed it, so this dialog is now
  // purely the input surface, not a second place the word lives.
  onAnswerChange: (value: string) => void
  onHintChange: (value: string) => void
  // False while the game menu is open — the dialog steps out of the way rather than fighting it.
  // This component stays mounted either way, so the half-typed word survives the round trip.
  promptVisible: boolean
  // Dismissing the dialog means "let me at the menu", which is also how you leave pass and play
  // (start a Random puzzle). Closing the menu brings this straight back.
  onRequestMenu: () => void
  onSubmit: () => void
}

// Entering a pass-and-play word — just the input dialog. The board behind it (artwork, blanks,
// difficulty, keyboard) is the real Game, mounted continuously by Main for the whole round, not a
// second preview rendering owned here — see Main.tsx for why that distinction matters (the
// previous split-owned-preview design was the actual source of a flicker at Hand off, not just a
// data-mismatch problem no amount of prop-matching could fully fix).
//
// Dismissing (the title bar's ✕, or a backdrop tap) opens the game menu instead of doing anything to
// the round, and the dialog also hides on its own whenever the menu is open — so the two never
// compete for the screen, and "closing" has one obvious meaning rather than the surprising one it
// used to have.
//
// Says nothing about how to play, and names nobody — any number of people can be passing the device.
export const PnpWordPrompt = ({ answer, hint, onAnswerChange, onHintChange, promptVisible, onRequestMenu, onSubmit }: PnpWordPromptProps): JSX.Element => {
  // Revealed by default: you can't reliably type a word you can't see, and this is the one moment
  // it's meant to be visible. The toggle covers handing the device over early.
  const [isRevealed, setIsRevealed] = useState(true)
  // Shown briefly when a keystroke gets rejected — letters/spaces are stripped from `answer` as you
  // type (see handleAnswerChange) rather than silently dropped only at normalize-time, so what's on
  // screen never gets ahead of what the real board behind the dialog is showing.
  const [showInvalidCharToast, setShowInvalidCharToast] = useState(false)
  // Global, not local — the same preference Main.tsx's handlePnpAuthored reads at Hand off to
  // decide whether to keep the word. This is the only place left to set it now that authoring a
  // word only happens here (see useAutoSaveCustom for why it defaults off and what "on" means).
  const { autoSave, setAutoSave } = useAutoSaveCustom()

  const handleAnswerChange = (text: string) => {
    const cleaned = text.replace(/[^A-Za-z ]/g, '')
    if (cleaned !== text) setShowInvalidCharToast(true)
    onAnswerChange(cleaned)
  }

  // Registration order IS focus order, and register() must be called during render — useFocusChain
  // resets its counter every render, so calling it conditionally would misnumber the chain.
  const register = useFocusChain()
  const { ref: answerRef, onSubmitEditing: focusHint } = register()
  const { ref: hintRef } = register()

  // The same builder the drawer's custom form uses (and that Main uses to score the live board
  // behind this dialog), so what counts as a valid, submittable word can't drift between the two
  // places one can be authored. null while blank — that's all this is needed for here now.
  const preview = buildCustomPuzzle('preview', '', { answer })

  const handleStart = () => {
    if (!preview) return
    onSubmit()
  }

  return (
    <>
      {/* DialogShell rather than a bare Dialog — it already pairs a title with a close IconButton in
          one header row, which is exactly what's needed now that there's a title, rather than a
          bespoke corner icon. "Pass & play" matches the button that launches this, in PuzzleDrawer. */}
      <DialogShell visible={promptVisible} onDismiss={onRequestMenu} title='Pass & play'>
        <TextInput
          testID='pnp-answer-input'
          ref={answerRef}
          // Advances to the hint field rather than submitting — the chain's whole job here.
          onSubmitEditing={focusHint}
          returnKeyType='next'
          submitBehavior='submit'
          value={answer}
          onChangeText={handleAnswerChange}
          label='Solution'
          autoCapitalize='characters'
          autoFocus
          secureTextEntry={!isRevealed}
          maxLength={128}
          mode='outlined'
          right={<TextInput.Icon icon={isRevealed ? 'eye-off' : 'eye'} onPress={() => setIsRevealed((r) => !r)} accessibilityLabel={isRevealed ? 'Hide solution' : 'Show solution'} accessibilityState={{ selected: isRevealed }} />}
        />
        <TextInput
          testID='pnp-hint-input'
          ref={hintRef}
          // Last link in the chain, so this is a real submit. Deliberately NOT the chain's own
          // onSubmitEditing for this field — with no next field to focus it resolves to a no-op, so
          // wiring it here (or spreading the whole Registration) would silently swallow the submit.
          onSubmitEditing={handleStart}
          returnKeyType='done'
          style={styles.hintInput}
          value={hint}
          onChangeText={onHintChange}
          label='Hint (optional)'
          maxLength={80}
          mode='outlined'
        />
        {/* Written at Hand off, not here — see Main.tsx's handlePnpAuthored — so this switch only
            needs to reflect the shared preference, not act on it itself. */}
        <View style={styles.autoSaveRow}>
          <View style={styles.flex}>
            <Text variant='bodyLarge'>Keep this word</Text>
            <Text variant='bodySmall' style={styles.muted}>
              Saves it to your Custom pack
            </Text>
          </View>
          <Switch value={autoSave} onValueChange={setAutoSave} accessibilityLabel='Keep this word' />
        </View>
        <Button mode='contained' icon='arrow-right' onPress={handleStart} disabled={!preview} style={styles.startButton} contentStyle={styles.startContent} labelStyle={styles.startLabel}>
          Hand off
        </Button>
      </DialogShell>

      {/* A sibling of DialogShell, not nested inside it — that card clips its own content (see
          auto-paper's Dialog: overflow: 'hidden'), which would squash a Snackbar down into the
          card's own bounds instead of anchoring to the bottom of the screen. */}
      <Snackbar visible={showInvalidCharToast} onDismiss={() => setShowInvalidCharToast(false)} duration={2000}>
        Only letters and spaces
      </Snackbar>
    </>
  )
}

const styles = StyleSheet.create({
  autoSaveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 16
  },
  flex: { flex: 1 },
  hintInput: { marginTop: 8 },
  muted: { marginTop: 8, opacity: 0.7 },
  startButton: { marginTop: 16 },
  startContent: { height: 48 },
  startLabel: { fontSize: 16, fontWeight: '700' }
})
