import { Button } from '@rific/feedback-press'
import { overlayActionStyles, OverlayBackdrop, OverlayCard, useOverlayCardColors } from '@tastic/hud/chrome'
import { type Profile, ProfileChip } from '@tastic/profile'
import { JSX, useEffect, useMemo } from 'react'
import { AccessibilityInfo, BackHandler, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Icon, Portal, ProgressBar, Text, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fitSketchWordFontSize, SketchWord, sketchWordWidth } from '@/components/SketchWord'
import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import type { UnlockedAchievement } from '@/types/stats'
import { commaString } from '@/utils/commaString'
import type { PnpStandingRow } from '@/utils/pnpSession'

import { PlayerLine } from './PlayerIdentity'
import { PnpStandingsList, STANDINGS_ONE_COLUMN_MAX, STANDINGS_ROW_GAP, STANDINGS_ROW_HEIGHT, standingsLineCount } from './PnpStandings'

export type RoundEndOutcome = 'win' | 'loss'

export type CategoryProgress = {
  label: string
  unlockedCount: number
  totalCount: number
}

// A Pass & Play round's own rows on the card: a written word's (see GameScreen's PnpRound) or a pack
// turn's (its SoloRound, see PackTurnRound). Each player's profile, when they sit as one, puts their
// chip beside their name (see PlayerIdentity).
export type PnpRoundSummary = {
  // The seat that played the round: the written word's guesser, or the pack turn's player.
  playerId: string
  playerName: string
  playerProfile?: Profile | null
  // Whose word it was, for a written word ("Bo solved Ann's word.", and the next line says who writes
  // next). A pack turn's puzzle came from the packs, so it has none ("Alice solved it.", and the next
  // line says who's up next).
  writerName?: string
  // Who's next: the next word's writer (by the session's rule, the guesser), or the next pack turn's
  // player (the fair pick).
  nextName: string
  nextProfile?: Profile | null
  // The session's standings with this round counted, in seat order.
  standings: PnpStandingRow[]
}

// One player's unlocks this round. A profile's go under their name, beside their chip; the guest's
// (owner null, the device's own progress) under the plain "Achievement(s) Unlocked".
export type RoundUnlocks = { owner: Profile | null; achievements: UnlockedAchievement[] }

export type RoundEndDialogProps = {
  visible: boolean
  outcome: RoundEndOutcome | null
  phrase: string
  // Every letter guessed this round, right or wrong. On a loss, the answer's letters missing from
  // here are the ones the player never found, and they draw in red.
  guessedLetters: string[]
  categoryProgress?: CategoryProgress | null
  // What the round just unlocked, each in catalog order, one block per player (see GameScreen's
  // handleSolved and handleLost): a solo round's player (a pack turn's included), or a written word's
  // guesser and, when they're a profile, its writer. A block with nothing in it isn't shown.
  unlocks?: RoundUnlocks[]
  // A Pass & Play round's card: who guessed whose word (or who played the pack turn), the session's
  // standings, and who writes or plays next. Absent, it's the solo card.
  passAndPlay?: PnpRoundSummary | null
  // End Session beside Next (Pass & Play). Absent, Next is the only way on.
  onEndSession?: () => void
  onDismiss: () => void
}

// The card's geometry, from @tastic/hud: OverlayBackdrop here keeps the card 24 from the screen edges
// (the same as ConfirmDialog and Solitaire's banners, plus the safe area top and bottom), and
// overlayStyles.card caps the card at 360 wide with 24 of padding, no border and a 16 gap between its
// rows. What's left inside is the room the answer can use.
const SCREEN_GUTTER = 24
const CARD_MAX_WIDTH = 360
const CARD_PADDING = 24
const CARD_GAP = 16
const BUTTON_HEIGHT = 40
// The card's height outside the scrolling body: padding, the 64pt icon, the title (one headlineLarge
// line, 40), the button row (40) and the three gaps between those four and the body.
const CARD_CHROME_HEIGHT = CARD_PADDING * 2 + 64 + 40 + BUTTON_HEIGHT + CARD_GAP * 3
// Pass & Play's two buttons share the row while both fit at hud's 128 floor with its 12 gap
// (overlayActionStyles), and stack, a second row, on a card narrower than that.
const ACTION_BUTTON_MIN_WIDTH = 128
const ACTION_GAP = 12
// Pass & Play's line above the buttons ("Player 2 writes next", or "Player 2 is up next" after a pack
// turn: one bodyMedium line), with its gap.
const NEXT_WRITER_HEIGHT = 20
// Rough heights of the body's other blocks, only used to leave the answer room for them: the unlock
// block's heading, each unlock row under it (a 28pt badge plus the gap), the progress caption (up
// to two lines) with its bar, Pass & Play's who-guessed line (up to two bodyLarge lines), and the
// standings' heading (with its gap) and rows. If one runs taller, the body scrolls a little rather
// than anything going off-screen.
const UNLOCKS_HEADER_HEIGHT = 30
// The owner's chip beside that heading: one titleMedium line tall, so the heading keeps its height.
const UNLOCKS_OWNER_CHIP_SIZE = 24
const UNLOCK_ROW_HEIGHT = 34
// The chips on Pass & Play's who-guessed line (a bodyLarge line tall) and next-writer line (a bodyMedium
// line), so neither line grows for them.
const RESULT_LINE_CHIP_SIZE = 24
const NEXT_WRITER_CHIP_SIZE = 20
const PROGRESS_HEIGHT = 46
const RESULT_LINE_HEIGHT = 48
const STANDINGS_HEADER_HEIGHT = 30
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
// A Pass & Play round's card (passAndPlay) also says who guessed whose word, above the answer, and
// shows the session's standings under it, the guesser's row in bold; then who writes next, above End
// Session and Next. "You" is still the guesser: the device is in their hands. A player sitting as a
// profile has their chip beside their name on each of those lines, and the unlocks are each player's
// own: the guesser's, then the writer's when the writer is a profile (a guest's progress is the
// device's, which is the guesser's to see). A pack turn's card is the solo card (its player's unlocks
// and pack progress) with the same session pieces: who solved or missed it, the standings with their
// row in bold, and who's up next.
//
// No backdrop dismissal, like every fleet card: a stray tap after the round can't skip to the next
// puzzle. Next (or End Session) is the only way on, and Android's back button counts as Next. The card
// never runs off the screen: it stops at the safe area, and the answer, standings, unlocks and progress
// scroll between the title and the buttons, so Next always stays in reach.
export const RoundEndDialog = ({ visible, outcome, phrase, guessedLetters, categoryProgress, unlocks, passAndPlay, onEndSession, onDismiss }: RoundEndDialogProps): JSX.Element | null => {
  const theme = useTheme()
  const { fg, fgMuted } = useOverlayCardColors()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // Not gated on outcome === 'win': a loss can still unlock something (the first puzzle played, a
  // Pass & Play rounds rung, a day streak). Each block is headed "Alice Unlocked" for a profile (the
  // fleet's "<Name> unlocked", as the toasts say it), else the plain "Achievement(s) Unlocked", and
  // announced as "<heading> unlocked: ...".
  const unlockBlocks = useMemo(() => (unlocks ?? []).filter((block) => block.achievements.length > 0).map((block) => ({ ...block, heading: block.owner ? block.owner.name : `Achievement${block.achievements.length > 1 ? 's' : ''}` })), [unlocks])
  const won = outcome === 'win'

  // The card is a plain overlay rather than a native modal, so nothing tells a screen reader it
  // appeared: this announces the result, the answer and any unlocks.
  // Pass & Play's who-guessed line, shown above the answer and announced with the result, and who's
  // next: a written word's guesser writes the next one, and after a pack turn the fair pick plays.
  const verb = won ? 'solved' : 'missed'
  const resultLine = passAndPlay ? (passAndPlay.writerName !== undefined ? `${passAndPlay.playerName} ${verb} ${passAndPlay.writerName}'s word.` : `${passAndPlay.playerName} ${verb} it.`) : null
  const nextWriterLine = passAndPlay ? `${passAndPlay.nextName} ${passAndPlay.writerName !== undefined ? 'writes next' : 'is up next'}` : null
  useEffect(() => {
    if (!visible || !outcome) return
    const base = `${outcome === 'win' ? 'You won!' : 'You lost!'}${resultLine ? ` ${resultLine}` : ''} The answer was ${phrase}.`
    const unlockSuffix = unlockBlocks.map((block) => ` ${block.heading} unlocked: ${block.achievements.map((achievement) => achievement.title).join(', ')}.`).join('')
    AccessibilityInfo.announceForAccessibility(base + unlockSuffix + (nextWriterLine ? ` ${nextWriterLine}.` : ''))
  }, [visible, outcome, phrase, resultLine, nextWriterLine, unlockBlocks])

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
  const answerWidth = Math.min(CARD_MAX_WIDTH, windowWidth - SCREEN_GUTTER * 2) - CARD_PADDING * 2
  const standingsCount = passAndPlay?.standings.length ?? 0
  // Compact: a table of more than four lays out in two columns (see PnpStandingsList).
  const standingsColumns = standingsCount > STANDINGS_ONE_COLUMN_MAX ? 2 : 1
  const standingsLines = standingsLineCount(standingsCount, standingsColumns)
  // Pass & Play adds the next-writer line and, on a card too narrow for both buttons side by side, a
  // second button row.
  const buttonsStack = Boolean(onEndSession) && answerWidth < ACTION_BUTTON_MIN_WIDTH * 2 + ACTION_GAP
  const chromeHeight = CARD_CHROME_HEIGHT + (nextWriterLine ? NEXT_WRITER_HEIGHT + CARD_GAP : 0) + (buttonsStack ? ACTION_GAP + BUTTON_HEIGHT : 0)
  const resultLineHeight = resultLine ? RESULT_LINE_HEIGHT + CARD_GAP : 0
  const standingsHeight = standingsLines > 0 ? CARD_GAP + STANDINGS_HEADER_HEIGHT + standingsLines * STANDINGS_ROW_HEIGHT + (standingsLines - 1) * STANDINGS_ROW_GAP : 0
  const unlocksHeight = unlockBlocks.reduce((height, block) => height + CARD_GAP + UNLOCKS_HEADER_HEIGHT + UNLOCK_ROW_HEIGHT * block.achievements.length, 0)
  const otherBodyHeight = resultLineHeight + standingsHeight + unlocksHeight + (showProgress ? CARD_GAP + PROGRESS_HEIGHT : 0)
  const answerFontSize = fitAnswerFontSize(
    words.map((word) => word.length),
    answerWidth,
    cardMaxHeight - chromeHeight - otherBodyHeight
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
            {resultLine ? (
              <PlayerLine profile={passAndPlay?.playerProfile} size={RESULT_LINE_CHIP_SIZE}>
                <Text variant='bodyLarge' style={[styles.resultLine, { color: fg }]}>
                  {resultLine}
                </Text>
              </PlayerLine>
            ) : null}
            <View accessible accessibilityLabel={`The answer was ${phrase}`} style={[styles.answer, { rowGap: answerFontSize * ANSWER_ROW_GAP_RATIO }]}>
              {answerWords.map(({ letters, letterDelaysMs, letterColors }, i) => (
                <SketchWord key={i} letters={letters} fontSize={answerFontSize} color={fg} letterColors={letterColors} letterDelaysMs={letterDelaysMs} />
              ))}
            </View>
            {/* Every player's words solved so far this session, this round included, in seat order:
                one column, or two for a table of more than four. */}
            {passAndPlay && standingsCount > 0 ? (
              <View style={styles.standings}>
                <Text variant='titleMedium' style={[styles.blockHeading, { color: fg }]}>
                  Standings
                </Text>
                <PnpStandingsList rows={passAndPlay.standings} columns={standingsColumns} color={fg} mutedColor={fgMuted} highlightId={passAndPlay.playerId} />
              </View>
            ) : null}
            {/* Every newly unlocked achievement at once, for as long as the card is up: the fleet's
                tier-colored badge (the achievement's own icon, black on its bronze, silver or gold,
                as on the Stats & Achievements screen) beside its title. A left-aligned list, centered as a
                block. */}
            {unlockBlocks.map((block, index) => (
              <View key={block.owner?.id ?? `guest-${index}`} style={styles.achievements}>
                <View style={styles.unlocksHeading}>
                  {block.owner ? <ProfileChip profile={block.owner} size={UNLOCKS_OWNER_CHIP_SIZE} /> : null}
                  <Text variant='titleMedium' style={[styles.blockHeading, styles.unlocksHeadingText, { color: fg }]}>
                    {block.heading} Unlocked
                  </Text>
                </View>
                {block.achievements.map((achievement) => (
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
            ))}
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
          {nextWriterLine ? (
            <PlayerLine profile={passAndPlay?.nextProfile} size={NEXT_WRITER_CHIP_SIZE}>
              <Text variant='bodyMedium' style={[styles.nextWriter, { color: fgMuted }]}>
                {nextWriterLine}
              </Text>
            </PlayerLine>
          ) : null}
          {/* Solo: one button that already knows where to draw the next puzzle from (see
              GameStartPayload.packScope and GameScreen's handleRoundEnd: still inside the pack the
              player was browsing if they were browsing one, otherwise back to their whole
              selection). No separate "stay in this pack" action needed since it's not really a
              choice, just what continuing already means given how this round started. Pass & Play:
              End Session (outlined, the confirms' secondary place) beside Next, for the next word or
              pack turn. */}
          <View style={overlayActionStyles.actions}>
            {onEndSession ? (
              <Button mode='outlined' onPress={onEndSession} style={overlayActionStyles.actionButton}>
                End Session
              </Button>
            ) : null}
            <Button mode='contained' onPress={onDismiss} style={onEndSession ? overlayActionStyles.actionButton : overlayActionStyles.actionButtonSingle} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
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
  answer: { alignSelf: 'stretch', columnGap: ANSWER_COLUMN_GAP, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  // The unlock and standings blocks' headings.
  blockHeading: { alignSelf: 'center', fontWeight: '700' },
  // Takes only the height its content needs, and gives it up (then scrolls) when the card meets
  // its maxHeight, so the icon, title and Next row keep theirs.
  body: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  bodyContent: { alignItems: 'center', gap: CARD_GAP },
  // ConfirmDialog's own card/overlay additions: the card claims its full maxWidth, and the overlay
  // keeps it off the screen edges (SCREEN_GUTTER above).
  card: { width: '100%' },
  nextWriter: { textAlign: 'center' },
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
  resultLine: { textAlign: 'center' },
  // The heading over the full-width list, with the unlock block's 6 between them.
  standings: { alignSelf: 'stretch', gap: 6 },
  title: { fontWeight: 'bold', textAlign: 'center' },
  unlockBadge: { alignItems: 'center', borderRadius: 8, height: 28, justifyContent: 'center', width: 28 },
  unlockRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  unlockTitle: { flexShrink: 1 },
  // The owner's chip and the heading, centered together over the list.
  unlocksHeading: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 8 },
  unlocksHeadingText: { flexShrink: 1 }
})
