import { Button, IconButton, Switch } from '@rific/feedback-press'
import { useFocusChain } from '@rific/focus-chain'
import { useToast } from '@rific/toaster'
import { overlayActionStyles, OverlayBackdrop, OverlayCard, useOverlayCardColors } from '@tastic/hud/chrome'
import type { Profile } from '@tastic/profile'
import { JSX, useEffect, useState } from 'react'
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native'
import { Portal, Text, TextInput, useTheme } from 'react-native-paper'
import Animated from 'react-native-reanimated'

import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { SCREEN_GUTTER, useKeyboardLiftedCard } from '@/hooks/useKeyboardLiftedCard'
import { buildCustomPuzzle } from '@/utils/customPacks'
import { WORD_SEPARATORS } from '@/utils/normalizePhrase'

import { PlayerChip, PlayerLine } from './PlayerIdentity'

// A seat the word could be for, with its profile when one sits there (for its chip).
export type PnpGuesserOption = { id: string; name: string; profile?: Profile | null }

export type PnpWordPromptProps = {
  // Who is writing, for the title, and their profile when they sit as one (their chip leads it).
  writerName: string
  writerProfile?: Profile | null
  // Everyone the word could be for (every player but the writer), in seat order. With more than one,
  // the card shows a For row of them, the current pick selected.
  guessers: PnpGuesserOption[]
  guesserId: string
  onGuesserChange: (playerId: string) => void
  answer: string
  hint: string
  // Owned by the game screen, not local state: it mounts the real Game continuously for the entire
  // pass-and-play round (see GameScreen.tsx) and needs the live phrase to feed it, so this card is
  // purely the input surface, not a second place the word lives.
  onAnswerChange: (value: string) => void
  onHintChange: (value: string) => void
  // False while the Settings sheet is open (or the game screen isn't the one showing): the card steps
  // out of the way rather than fighting it. The typed word and hint survive the round trip because the
  // game screen owns them; this component stays mounted (rendering nothing) so its own show/hide
  // toggle survives too.
  promptVisible: boolean
  // Closing the card leaves the game for the Pass & Play loadout, the same as the game screen's back
  // corner (which the card covers).
  onClose: () => void
  onSubmit: () => void
}

// The 4pt slop the drawer headers' icon buttons use, for a 48pt close target.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }
// The writer's chip beside the title: a headlineSmall line tall.
const TITLE_CHIP_SIZE = 32

// Entering a pass-and-play word, on the fleet's card (@tastic/hud's OverlayBackdrop and OverlayCard,
// the card the confirms, the hand-off and the result use): the writer's name as its title ("Player 1's
// Word") with a plain close glyph in the corner, the Word and Hint fields, who the word is for (with
// three or more players), the Keep This Word switch, and Next. The board
// behind it (artwork, blanks, difficulty, keyboard) is the real Game, mounted continuously by the game
// screen for the whole round, not a second preview rendering owned here; see GameScreen.tsx for why
// that matters (the old split-owned preview was the source of a flicker at Hand off).
//
// The close glyph (and Android's back button) leaves for the Pass & Play loadout, and the card also
// hides on its own whenever the Settings sheet is open, so the two never compete for the screen. No
// backdrop dismissal, like every fleet card: a stray tap beside the card while typing can't throw the
// prompt away.
//
// The card rises to clear the software keyboard, and never grows past the room it has: above the
// keyboard when it's up, inside the safe area always (useKeyboardLiftedCard). Past that, the fields
// scroll between the title and Next, so the title, the close glyph and Next stay on screen even at
// the largest text sizes or with the keyboard up on a short phone.
//
// A player sitting as a profile has their chip beside their name, in the title and the For row
// (PlayerIdentity), so the right person is holding the device.
//
// Says nothing about how to play. Two players need no For row: the word can only be for the other one.
export const PnpWordPrompt = ({ writerName, writerProfile, guessers, guesserId, onGuesserChange, answer, hint, onAnswerChange, onHintChange, promptVisible, onClose, onSubmit }: PnpWordPromptProps): JSX.Element | null => {
  const theme = useTheme()
  const { fg, fgMuted } = useOverlayCardColors()
  const { overlayStyle, cardMaxHeight, liftStyle, onCardLayout } = useKeyboardLiftedCard()
  // Revealed by default: you can't reliably type a word you can't see, and this is the one moment
  // it's meant to be visible. The toggle covers handing the device over early.
  const [isRevealed, setIsRevealed] = useState(true)
  // Global, not local: the same preference GameScreen.tsx's handlePnpAuthored reads at Hand off to decide
  // whether to keep the word. This is the only place left to set it now that authoring a word only
  // happens here (see useAutoSaveCustom for why it defaults off and what "on" means).
  const { autoSave, setAutoSave } = useAutoSaveCustom()
  // Warns when a keystroke gets rejected: anything but letters and spaces is stripped from `answer`
  // as you type (see handleAnswerChange) rather than silently dropped only at normalize-time, so
  // what's on screen never gets ahead of what the real board behind the card is showing.
  // @rific/toaster's <Toaster/> (mounted once in Providers.tsx) is keyboard-aware, unlike Paper's own
  // Snackbar, which this card needs since the keyboard is up for the entire time this can fire.
  const { warning } = useToast()

  useEffect(() => {
    if (!promptVisible) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => subscription.remove()
  }, [promptVisible, onClose])

  // A hyphen, dash or slash becomes a space rather than a rejected keystroke: it's the same word
  // break normalizePhrase makes, so a typed Spider-Man shows SPIDER MAN here exactly as it plays.
  const handleAnswerChange = (text: string) => {
    const separated = text.replace(WORD_SEPARATORS, ' ')
    const cleaned = separated.replace(/[^A-Za-z ]/g, '')
    if (cleaned !== separated) warning('Only Letters and Spaces')
    onAnswerChange(cleaned)
  }

  // Registration order IS focus order, and register() must be called during render: useFocusChain
  // resets its counter every render, so calling it conditionally would misnumber the chain.
  const register = useFocusChain()
  // blurOnSubmit=false: without it, the TextInput's own native default (blurOnSubmit=true on a
  // single-line field) races the chain's focusHint() call below, blurring right after it just
  // focused and producing a keyboard close/reopen flicker between fields.
  const {
    ref: answerRef,
    props: { onSubmitEditing: focusHint, blurOnSubmit }
  } = register()
  const { ref: hintRef } = register()

  // The same builder the pack editor's entries go through (and whose scorer GameScreen uses for the
  // live board behind this card), so what counts as a valid, submittable word can't drift between
  // the two places one can be authored. null while blank, which is all this is needed for here.
  const preview = buildCustomPuzzle('preview', '', { answer })

  const handleStart = () => {
    if (!preview) return
    onSubmit()
  }

  if (!promptVisible) return null

  return (
    <Portal>
      <OverlayBackdrop style={[styles.overlay, overlayStyle]}>
        <Animated.View testID='pnp-card' style={[styles.lift, liftStyle]} onLayout={onCardLayout}>
          <OverlayCard accessibilityViewIsModal style={[styles.card, { maxHeight: cardMaxHeight }]}>
            {/* Names who is writing, so the device is in the right hands before anything is typed. */}
            <PlayerLine profile={writerProfile} size={TITLE_CHIP_SIZE} style={styles.titleLine}>
              <Text variant='headlineSmall' accessibilityRole='header' style={[styles.title, writerProfile && styles.titleBeside, { color: theme.colors.primary }]}>
                {writerName}&apos;s Word
              </Text>
            </PlayerLine>
            <ScrollView style={styles.body} contentContainerStyle={styles.fields} keyboardShouldPersistTaps='handled' alwaysBounceVertical={false}>
              <TextInput
                testID='pnp-answer-input'
                ref={answerRef}
                // Advances to the hint field rather than submitting: the chain's whole job here.
                onSubmitEditing={focusHint}
                blurOnSubmit={blurOnSubmit}
                returnKeyType='next'
                submitBehavior='submit'
                value={answer}
                onChangeText={handleAnswerChange}
                label='Word or Phrase'
                autoCapitalize='characters'
                autoCorrect={false}
                spellCheck={false}
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
                // onSubmitEditing for this field: with no next field to focus it resolves to a no-op,
                // so wiring it here (or spreading the whole Registration) would swallow the submit.
                onSubmitEditing={handleStart}
                returnKeyType='done'
                value={hint}
                onChangeText={onHintChange}
                label='Hint (Optional)'
                autoCapitalize='none'
                autoCorrect={false}
                spellCheck={false}
                maxLength={80}
                mode='outlined'
              />
              {/* Who the word is for: the fair pick (whoever has guessed the fewest words) is already
                  selected, and the writer can pick anyone else at the table instead. */}
              {guessers.length > 1 ? (
                <View style={styles.forRow}>
                  <Text variant='bodyLarge' style={[styles.forLabel, { color: fg }]}>
                    For
                  </Text>
                  <View style={styles.chips}>
                    {guessers.map((player) => (
                      <PlayerChip key={player.id} id={player.id} name={player.name} profile={player.profile} selected={player.id === guesserId} onSelect={onGuesserChange} accessibilityLabel={`For ${player.name}`} />
                    ))}
                  </View>
                </View>
              ) : null}
              {/* Written at Hand off, not here (see GameScreen.tsx's handlePnpAuthored), so this switch
                  only needs to reflect the shared preference, not act on it itself. */}
              <View style={styles.autoSaveRow}>
                <View style={styles.flex}>
                  <Text variant='bodyLarge' style={{ color: fg }}>
                    Keep This Word
                  </Text>
                  <Text variant='bodySmall' style={[styles.caption, { color: fgMuted }]}>
                    Saves it to your Pass & Play pack
                  </Text>
                </View>
                <Switch value={autoSave} onValueChange={setAutoSave} accessibilityLabel='Keep this word' />
              </View>
            </ScrollView>
            <View style={overlayActionStyles.actions}>
              <Button mode='contained' onPress={handleStart} disabled={!preview} style={overlayActionStyles.actionButtonSingle} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
                Next
              </Button>
            </View>
            {/* A plain glyph in the card's top-right corner, outside the column so the title stays
                centered on the card. */}
            <IconButton icon='close' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={fg} onPress={onClose} accessibilityLabel='Close' style={styles.close} />
          </OverlayCard>
        </Animated.View>
      </OverlayBackdrop>
    </Portal>
  )
}

const styles = StyleSheet.create({
  autoSaveRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 4
  },
  // Takes only the height the fields need, and gives it up (then scrolls) when the card meets its
  // maxHeight, so the title and Next keep theirs.
  body: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  caption: { marginTop: 4 },
  // 24 on top and bottom, the card's own padding today (hud's overlayStyles.card), pinned here because
  // a form needs the height more than the confirms do, with the keyboard up on a small phone.
  card: { paddingVertical: 24, width: '100%' },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  close: { margin: 0, position: 'absolute', right: 8, top: 8 },
  fields: { gap: 8 },
  flex: { flex: 1 },
  // The label sits level with the first line of chips (32 tall, its own line 24), however many lines
  // they wrap into.
  forLabel: { paddingTop: 4 },
  forRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, paddingTop: 4 },
  // Full width so the card inside can take its 360 maximum, as it does straight in the backdrop.
  lift: { alignItems: 'center', width: '100%' },
  overlay: { paddingHorizontal: SCREEN_GUTTER },
  // Clear of the close glyph in the corner on both sides (its 40 box sits 8 in, 24 past the card's own
  // padding), so a long name wraps before running under it and the title stays centered on the card.
  title: { fontWeight: 'bold', paddingHorizontal: 24, textAlign: 'center' },
  // Beside the writer's chip, the clearance moves out to the line holding both.
  titleBeside: { paddingHorizontal: 0 },
  titleLine: { paddingHorizontal: 24 }
})
