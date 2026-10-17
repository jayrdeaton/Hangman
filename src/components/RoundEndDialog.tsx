import { Button } from '@rific/feedback-press'
import { overlayActionStyles, OverlayBackdrop, OverlayCard, useOverlayCardColors } from '@tastic/hud/chrome'
import { JSX, useEffect } from 'react'
import { AccessibilityInfo, BackHandler, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Icon, Portal, ProgressBar, Text, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fitSketchWordFontSize, SketchWord, sketchWordWidth } from '@/components/SketchWord'
import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import type { UnlockedAchievement } from '@/types/stats'
import { commaString } from '@/utils/commaString'

export type RoundEndOutcome = 'win' | 'loss'

export type CategoryProgress = {
  label: string
  unlockedCount: number
  totalCount: number
}

export type RoundEndDialogProps = {
  visible: boolean
  outcome: RoundEndOutcome | null
  phrase: string
  // Every letter guessed this round, right or wrong. On a loss, the answer's letters missing from
  // here are the ones the player never found, and they draw in red.
  guessedLetters: string[]
  categoryProgress?: CategoryProgress | null
  // What the round just unlocked, in catalog order (see GameScreen's handleSolved and handleLost).
  unlockedAchievements?: UnlockedAchievement[]
  onDismiss: () => void
}

// The card's geometry, from @tastic/hud: OverlayBackdrop here keeps the card 24 from the screen edges
// (the same as ConfirmDialog and Solitaire's banners, plus the safe area top and bottom), and
// overlayStyles.card caps the card at 360 wide with 32 of padding, a 1pt border and a 16 gap between
// its rows. What's left inside is the room the answer can use.
const SCREEN_GUTTER = 24
const CARD_MAX_WIDTH = 360
const CARD_PADDING = 32
const CARD_BORDER = 1
const CARD_GAP = 16
// The card's height outside the scrolling body: padding and border, the 64pt icon, the title (one
// headlineLarge line, 40), the Next row (40) and the three gaps between those four and the body.
const CARD_CHROME_HEIGHT = CARD_PADDING * 2 + CARD_BORDER * 2 + 64 + 40 + 40 + CARD_GAP * 3
// Rough heights of the body's other blocks, only used to leave the answer room for them: the unlock
// block's heading, each unlock row under it (a 28pt badge plus the gap), and the progress caption (up
// to two lines) with its bar. If one runs taller, the body scrolls a little rather than anything
// going off-screen.
const UNLOCKS_HEADER_HEIGHT = 30
const UNLOCK_ROW_HEIGHT = 34
const PROGRESS_HEIGHT = 46
// The answer's largest size: big enough to read as the round's headline beneath the title, small
// enough that a two- or three-word answer still wraps into a few lines on a phone.
const ANSWER_MAX_FONT_SIZE = 40
// The answer shrinks to fit the card's height down to this size and no further; an answer still too
// tall at it scrolls instead (only the very longest catalog answers, on small phones). Width always
// wins over this: a word too long for the card at this size shrinks until it fits.
const ANSWER_HEIGHT_FIT_FLOOR = 20
// Missed letters on a loss are red. In light mode that's the theme's error color (MD3's error tone
// 40). In dark mode the theme's error is tone 80, a pale pink meant for text on dark surfaces, which
// barely reads as red next to the white letters, so the card uses the same error palette's tone 50:
// still clearly red, about 3.5:1 on the dark card.
const MISSED_LETTER_DARK = '#DC362E'
// The answer's own wrapping row: the space between words on a line, and between lines (a share of
// the font size, so it scales with the letters).
const ANSWER_COLUMN_GAP = 16
const ANSWER_ROW_GAP_RATIO = 0.2
// Writing starts a beat after the card appears, then moves left to right one letter at a time across
// the whole answer, word breaks included, at SketchWord's own blank stagger.
const ANSWER_START_DELAY_MS = 150
const ANSWER_LETTER_STAGGER_MS = 90

// How many lines the answer wraps into at `fontSize`: the same greedy wrap its flexWrap row does, a
// word moving down a line once it no longer fits after the words before it.
const answerLineCount = (wordLengths: number[], fontSize: number, width: number): number => {
  let lines = 1
  let lineWidth = 0
  for (const letterCount of wordLengths) {
    const wordWidth = sketchWordWidth(letterCount, fontSize)
    if (lineWidth > 0 && lineWidth + ANSWER_COLUMN_GAP + wordWidth > width) {
      lines++
      lineWidth = wordWidth
    } else {
      lineWidth += (lineWidth > 0 ? ANSWER_COLUMN_GAP : 0) + wordWidth
    }
  }
  return lines
}

// The answer's font size: the largest (up to ANSWER_MAX_FONT_SIZE) at which its longest word fits
// the card's width and, down to ANSWER_HEIGHT_FIT_FLOOR, at which all its lines fit `heightBudget`.
export const fitAnswerFontSize = (wordLengths: number[], width: number, heightBudget: number): number => {
  const widthFit = fitSketchWordFontSize(Math.max(...wordLengths), width, ANSWER_MAX_FONT_SIZE)
  const floor = Math.min(widthFit, ANSWER_HEIGHT_FIT_FLOOR)
  for (let fontSize = widthFit; fontSize > floor; fontSize--) {
    const lines = answerLineCount(wordLengths, fontSize, width)
    if (lines * fontSize + (lines - 1) * fontSize * ANSWER_ROW_GAP_RATIO <= heightBudget) return fontSize
  }
  return floor
}

// The round's last word: the fleet's result card (@tastic/hud's OverlayBackdrop and OverlayCard, the
// card the confirms and Solitaire's win and loss banners use). A win shows a trophy and "You Won!" in
// the primary color, a loss a muted skull and "You Lost!". Under the title the answer writes itself
// left to right in the board's own sketch letters; on a loss, the letters the player never found draw
// in the theme's error red. Pack progress (wins only) and any new achievements follow, then Next.
//
// No backdrop dismissal, like every fleet card: a stray tap after the round can't skip to the next
// puzzle. Next is the only way on, and Android's back button counts as Next. The card never runs off
// the screen: it stops at the safe area, and the answer, unlocks and progress scroll between the
// title and Next, so Next always stays in reach.
export const RoundEndDialog = ({ visible, outcome, phrase, guessedLetters, categoryProgress, unlockedAchievements, onDismiss }: RoundEndDialogProps): JSX.Element | null => {
  const theme = useTheme()
  const { fg, fgMuted } = useOverlayCardColors()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Not gated on outcome === 'win': a loss can still unlock something (the first puzzle played, a
  // Pass & Play rounds rung, a day streak).
  const hasUnlocks = Boolean(unlockedAchievements?.length)
  const won = outcome === 'win'

  // The card is a plain overlay rather than a native modal, so nothing tells a screen reader it
  // appeared: this announces the result, the answer and any unlocks.
  useEffect(() => {
    if (!visible || !outcome) return
    const base = outcome === 'win' ? `You won! The answer was ${phrase}.` : `You lost! The answer was ${phrase}.`
    const unlockSuffix = hasUnlocks ? ` Achievement${unlockedAchievements!.length > 1 ? 's' : ''} unlocked: ${unlockedAchievements!.map((achievement) => achievement.title).join(', ')}.` : ''
    AccessibilityInfo.announceForAccessibility(base + unlockSuffix)
  }, [visible, outcome, phrase, hasUnlocks, unlockedAchievements])

  useEffect(() => {
    if (!visible) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss()
      return true
    })
    return () => subscription.remove()
  }, [visible, onDismiss])

  if (!visible || !outcome) return null

  // Words wrap whole (each is its own SketchWord, as on the board), so only the longest word has to
  // fit the card's width; the lines they wrap into share the height left after everything else.
  const words = phrase.split(' ')
  const showProgress = won && Boolean(categoryProgress && categoryProgress.totalCount > 0)
  const cardMaxHeight = windowHeight - insets.top - insets.bottom - SCREEN_GUTTER * 2
  const answerWidth = Math.min(CARD_MAX_WIDTH, windowWidth - SCREEN_GUTTER * 2) - CARD_PADDING * 2 - CARD_BORDER * 2
  const otherBodyHeight = (hasUnlocks ? CARD_GAP + UNLOCKS_HEADER_HEIGHT + UNLOCK_ROW_HEIGHT * unlockedAchievements!.length : 0) + (showProgress ? CARD_GAP + PROGRESS_HEIGHT : 0)
  const answerFontSize = fitAnswerFontSize(
    words.map((word) => word.length),
    answerWidth,
    cardMaxHeight - CARD_CHROME_HEIGHT - otherBodyHeight
  )
  const missedColor = theme.dark ? MISSED_LETTER_DARK : theme.colors.error
  // Each letter's place in the whole answer (not just its word), so the writing runs on across word
  // breaks instead of restarting in every word.
  let letterIndex = 0
  const answerWords = words.map((word) => {
    const letters = word.split('')
    const letterDelaysMs = letters.map(() => ANSWER_START_DELAY_MS + letterIndex++ * ANSWER_LETTER_STAGGER_MS)
    const letterColors = letters.map((letter) => (won || guessedLetters.includes(letter) ? fg : missedColor))
    return { letters, letterDelaysMs, letterColors }
  })

  return (
    <Portal>
      <OverlayBackdrop style={[styles.overlay, { paddingBottom: insets.bottom + SCREEN_GUTTER, paddingTop: insets.top + SCREEN_GUTTER }]}>
        <OverlayCard accessibilityViewIsModal style={[styles.card, { maxHeight: cardMaxHeight }]}>
          <Icon source={won ? 'trophy' : 'skull-outline'} size={64} color={won ? theme.colors.primary : fgMuted} />
          <Text variant='headlineLarge' style={[styles.title, { color: won ? theme.colors.primary : fg }]}>
            {won ? 'You Won!' : 'You Lost!'}
          </Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} alwaysBounceVertical={false}>
            <View accessible accessibilityLabel={`The answer was ${phrase}`} style={[styles.answer, { rowGap: answerFontSize * ANSWER_ROW_GAP_RATIO }]}>
              {answerWords.map(({ letters, letterDelaysMs, letterColors }, i) => (
                <SketchWord key={i} letters={letters} fontSize={answerFontSize} color={fg} letterColors={letterColors} letterDelaysMs={letterDelaysMs} />
              ))}
            </View>
            {/* Every newly unlocked achievement at once, for as long as the card is up: the fleet's
                tier-colored badge (the achievement's own icon, black on its bronze, silver or gold,
                as on the Stats & Achievements screen) beside its title. A left-aligned list, centered as a
                block. */}
            {hasUnlocks ? (
              <View style={styles.achievements}>
                <Text variant='titleMedium' style={[styles.achievementsHeading, { color: fg }]}>
                  Achievement{unlockedAchievements!.length > 1 ? 's' : ''} Unlocked
                </Text>
                {unlockedAchievements!.map((achievement) => (
                  <View key={achievement.id} style={styles.unlockRow}>
                    <View style={[styles.unlockBadge, { backgroundColor: ACHIEVEMENT_TIER_COLORS[achievement.tier] }]}>
                      <Icon source={achievement.icon} size={18} color='#000000' />
                    </View>
                    {/* flexShrink so a long title wraps at large text sizes instead of running off. */}
                    <Text variant='bodyLarge' style={[styles.unlockTitle, { color: fg }]}>
                      {achievement.title}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {showProgress && categoryProgress ? (
              <View style={styles.progress}>
                <Text variant='bodySmall' style={[styles.progressLabel, { color: fgMuted }]}>
                  {commaString(categoryProgress.unlockedCount)} of {commaString(categoryProgress.totalCount)} unlocked in {categoryProgress.label}
                </Text>
                <View style={styles.progressBarWrapper}>
                  <ProgressBar progress={categoryProgress.unlockedCount / categoryProgress.totalCount} style={[styles.progressBar, { backgroundColor: theme.colors.surfaceVariant }]} />
                </View>
              </View>
            ) : null}
          </ScrollView>
          {/* One button that already knows where to draw the next puzzle from (see
              GameStartPayload.packScope and GameScreen's handleRoundEnd: still inside the pack the
              player was browsing if they were browsing one, otherwise back to their whole
              selection). No separate "stay in this pack" action needed since it's not really a
              choice, just what continuing already means given how this round started. */}
          <View style={overlayActionStyles.actions}>
            <Button mode='contained' onPress={onDismiss} style={overlayActionStyles.actionButtonSingle} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
              Next
            </Button>
          </View>
        </OverlayCard>
      </OverlayBackdrop>
    </Portal>
  )
}

const styles = StyleSheet.create({
  achievements: { alignItems: 'flex-start', alignSelf: 'center', gap: 6 },
  achievementsHeading: { alignSelf: 'center', fontWeight: '700' },
  answer: { alignSelf: 'stretch', columnGap: ANSWER_COLUMN_GAP, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  // Takes only the height its content needs, and gives it up (then scrolls) when the card meets
  // its maxHeight, so the icon, title and Next row keep theirs.
  body: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  bodyContent: { alignItems: 'center', gap: CARD_GAP },
  // ConfirmDialog's own card/overlay additions: the card claims its full maxWidth, and the overlay
  // keeps it off the screen edges (SCREEN_GUTTER above).
  card: { width: '100%' },
  overlay: { paddingHorizontal: SCREEN_GUTTER },
  progress: { alignSelf: 'stretch' },
  progressBar: {
    borderRadius: 6,
    height: 6
  },
  progressBarWrapper: {
    height: 6,
    marginTop: 8,
    overflow: 'hidden'
  },
  progressLabel: { textAlign: 'center' },
  title: { fontWeight: 'bold', textAlign: 'center' },
  unlockBadge: { alignItems: 'center', borderRadius: 8, height: 28, justifyContent: 'center', width: 28 },
  unlockRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  unlockTitle: { flexShrink: 1 }
})
