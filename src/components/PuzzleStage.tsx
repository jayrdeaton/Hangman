import { useThemeSettings } from '@rific/auto-paper'
import { JSX, useMemo, useState } from 'react'
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'

// Base sizes for the word display (also referenced by the shrink-to-fit calculation below).
const WORD_FONT_SIZE = 30
const WORD_FONT_SIZE_LARGE = 56
const MIN_WORD_FONT_SIZE = 16
// Fraction of fontSize a monospace glyph cell (Menlo / Android monospace) occupies. Approximate,
// so the fitted size leaves a little slack rather than exactly grazing the measured width.
const MONOSPACE_CHAR_WIDTH_RATIO = 0.62
// Breathing room kept either side of the longest word, so a word that does need shrinking stops
// short of the screen edges instead of running right up against them. Applied as real padding on
// the word row and subtracted back out of the measurement below, since onLayout reports the
// padded (border-box) width.
const WORD_ROW_PADDING_HORIZONTAL = 12
// Space reserved below the word row itself (wordRow/wordRowLarge's own marginBottom) — the word
// row's own onLayout height doesn't include its OWN margin (a view's margin is space around its
// box, not part of it), so this is added back in wherever that measured height is used to budget
// space for something else, or the artwork would end up sized as if this margin didn't exist.
const WORD_ROW_MARGIN_BOTTOM = 12

export type PuzzleStageProps = {
  mode: GameMode
  phrase: string
  guessedLetters: string[]
  wrongGuesses: number
  // The round's real, frozen mistake ceiling (see Game.tsx) — distinct from mode.maxMistakes,
  // which is only the CURRENTLY selected mode's own stage count and can differ from it after a
  // live art-style swap mid-round (see modes/stars.tsx).
  maxWrong: number
  pipsLabel: string
}

// The artwork-plus-word-blanks region of a round: everything between the difficulty/hint pills
// and the wrong-guess pips. Isolated from Game.tsx because sizing it correctly needs its own,
// fairly involved layout math (see visualHeight/fittedWordFontSize below) that has nothing to do
// with the win/loss state machine driving the rest of the round.
export const PuzzleStage = ({ mode, phrase, guessedLetters, wrongGuesses, maxWrong, pipsLabel }: PuzzleStageProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const theme = useTheme()
  const color = settings.color
  const tertiaryColor = theme.colors.tertiary

  const guessWords = useMemo(() => {
    // Each word renders as its own flex item, letters joined by non-breaking spaces so a
    // word can never split across lines — a mid-word wrap is indistinguishable from a real
    // word boundary and reads as disingenuous. Wrapping happens between word items via
    // flexWrap, and the row's own gap supplies the visual separation, so no leftover
    // whitespace clings to the edge of a wrapped line and throws off centering.
    return phrase.split(' ').map((word) =>
      word
        .split('')
        .map((ch) => (guessedLetters.includes(ch) ? ch : '_'))
        .join(' ')
    )
  }, [phrase, guessedLetters])

  const hasVisual = mode.hasVisual !== false
  // Every mode's Visual (see src/modes/*.tsx) independently clamps its own `mistakes` prop against
  // its OWN stage count, sized 1:1 to that mode's own maxMistakes (e.g. classic.tsx's 6 parts,
  // stars.tsx's 8 stars) — it has no way to know the round's real ceiling is the frozen `maxWrong`
  // above, which can be LARGER when the round started under a mode with a bigger maxMistakes (again,
  // only modes/stars.tsx differs). Handing a newly-selected mode the raw wrongGuesses could then
  // render that mode's own fully-"lost" stage — indistinguishable from an actual loss — while the
  // round is still mechanically alive and the keyboard still enabled. Capped one stage short of the
  // CURRENT mode's own maximum unless the round has truly ended, so a live art-style swap can never
  // make an in-progress round look already lost.
  //
  // Keyed on wrongGuesses reaching maxWrong, NOT on Game.tsx's `outcome === 'loss'` — outcome is
  // deliberately set 450ms late (see Game.tsx's handleGuess/lossTimeoutRef) so the final stage has
  // time to draw before the loss dialog interrupts, and gating the cap on outcome would undo
  // exactly that: the fatal guess would render one stage short until the delayed setOutcome caught
  // up, snapping to full 450ms later instead of instantly. wrongGuesses/maxWrong are both already
  // reactive props updated in the very same batch as the fatal guess, so this uncaps in the correct
  // render with no such delay, while still capping correctly for a mode swapped in mid-round
  // (wrongGuesses can only reach maxWrong via an actual loss — Game.tsx ignores every guess once
  // the round is over, so this can never spuriously go true on a win).
  const visualMistakes = wrongGuesses >= maxWrong ? Math.min(wrongGuesses, mode.maxMistakes) : Math.min(wrongGuesses, Math.max(0, mode.maxMistakes - 1))

  // Measured rather than Dimensions-derived (module-scope window width is 0 on web - see the
  // same pattern in ModeSelector). {0,0} means "not measured yet"; the base size is used until then.
  //
  // This measures the space the word row is ALLOWED, which is why the row stretches to its parent's
  // full width (see wordRow/wordRowLarge's alignSelf below) rather than centering at its own
  // intrinsic content width. A content-width measurement here would feed the fitted size back into
  // its own input: MONOSPACE_CHAR_WIDTH_RATIO deliberately overstates a real monospace advance
  // (~0.6023em for Menlo) to leave slack, so each pass would measure the row it just sized, compute
  // ~3% smaller, re-measure narrower, and ratchet every word — however short — down to
  // MIN_WORD_FONT_SIZE over a handful of layout passes.
  //
  // Height is measured too (not just width, despite the fitting logic below only needing width) —
  // see visualHeight's own comment for why: a multi-word phrase can wrap into several lines, and
  // nothing about that depends on how much height the artwork ends up claiming (wordRow's WIDTH is
  // fixed by its own alignSelf:'stretch', independent of visualArea's height), so this converges to
  // the row's true rendered height regardless of what visualHeight below does with it.
  const [wordRowSize, setWordRowSize] = useState({ width: 0, height: 0 })
  const handleWordRowLayout = (e: LayoutChangeEvent) => setWordRowSize(e.nativeEvent.layout)

  // The artwork's viewBox is a fixed square (see e.g. classic.tsx's `viewBox='0 0 100 100'`), so
  // handing it an uncapped box just leaves the SVG's own default "meet" scaling centering a
  // width-limited square inside a much taller box — dead space above and below, not a bigger
  // drawing. The fix is to cap the box at its own width, giving it a square — but two *equal*
  // flex:1 siblings (this box and wordArea) split available space proportionally, 50/50, and only
  // reallocate to the other sibling once a share would *exceed* its cap. On an ordinary phone the
  // even split (roughly a quarter of the screen height each) never gets close to the width-sized
  // cap, so that reallocation never triggers and the artwork sits well under the size it's allowed
  // — the same dead-space bug in a smaller dose. So this measures the *combined* region the two
  // share (artAndWordArea below) once, up front, and gives the artwork an explicit
  // min(width, combined height) instead — greedy up to its square cap.
  //
  // But greedy still has to leave room for whatever the word row actually needs: a multi-word
  // phrase wraps onto as many lines as it takes (see guessWords above), and that line count isn't
  // bounded — a long phrase on a device where the combined area isn't much taller than it is wide
  // (a big keyboard, a small screen) could need more height than an even split, or even the
  // artwork's whole square cap, would leave it. Without subtracting the word row's own measured
  // height here, the artwork happily claims up to its full square regardless, and the word text —
  // which nothing clips — visibly overflows wordArea's flex-constrained box into the pips/keyboard
  // below it. wordArea, the only remaining flexible sibling, absorbs whatever's left after that.
  const [combinedAreaSize, setCombinedAreaSize] = useState({ width: 0, height: 0 })
  const handleCombinedAreaLayout = (e: LayoutChangeEvent) => setCombinedAreaSize(e.nativeEvent.layout)
  const visualHeight = combinedAreaSize.width && combinedAreaSize.height ? Math.max(0, Math.min(combinedAreaSize.width, combinedAreaSize.height - (wordRowSize.height ? wordRowSize.height + WORD_ROW_MARGIN_BOTTOM : 0))) : undefined

  const fittedWordFontSize = useMemo(() => {
    const baseFontSize = hasVisual ? WORD_FONT_SIZE : WORD_FONT_SIZE_LARGE
    const availableWidth = wordRowSize.width - WORD_ROW_PADDING_HORIZONTAL * 2
    if (availableWidth <= 0) return baseFontSize
    // Letters render as N glyphs joined by N-1 non-breaking-space glyphs (see guessWords above),
    // so a word of N letters occupies 2N-1 monospace cells on its line. Only the longest word
    // matters: words are separate flex items that wrap onto their own lines rather than splitting.
    const longestWordLength = Math.max(...phrase.split(' ').map((word) => word.length))
    const renderedCells = longestWordLength * 2 - 1
    const maxFittingSize = Math.floor(availableWidth / (renderedCells * MONOSPACE_CHAR_WIDTH_RATIO))
    return Math.max(MIN_WORD_FONT_SIZE, Math.min(baseFontSize, maxFittingSize))
  }, [wordRowSize.width, hasVisual, phrase])

  return (
    // measured as a whole (see visualHeight above) so the artwork can claim its square greedily,
    // up to this region's own width, and wordArea can unambiguously take whatever's left.
    <View testID='art-and-word-area' style={styles.artAndWordArea} onLayout={handleCombinedAreaLayout}>
      <View testID='visual-area' style={[styles.visualArea, visualHeight ? { height: visualHeight } : styles.visualAreaFallback]}>
        {hasVisual ? (
          <GameVisual mode={mode} mistakes={visualMistakes} color={color} style={styles.visual} />
        ) : (
          // No artwork to carry the "how many guesses left" tension in this mode, so the pips
          // take over the artwork's own slot (and its size) instead of trailing after the word
          // as a row of barely-there dots.
          <View style={styles.pipClusterWrap} accessibilityLabel={pipsLabel}>
            <View style={styles.pipClusterRow}>
              {Array.from({ length: maxWrong }, (_, i) => (
                <View key={i} style={[styles.pipLarge, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
              ))}
            </View>
          </View>
        )}
      </View>
      {/* flex:1, the artwork's sibling above — whatever height the (now capped) artwork box
          can't use flows here instead, and this centers the word row within it rather than
          leaving it packed against the keyboard the way it would be at its own intrinsic size. */}
      <View style={styles.wordArea}>
        <View style={hasVisual ? styles.wordRow : styles.wordRowLarge} accessible accessibilityLabel='Secret word display' onLayout={handleWordRowLayout}>
          {guessWords.map((word, i) => (
            <Text key={i} style={[hasVisual ? styles.text : styles.textLarge, { fontSize: fittedWordFontSize }]}>
              {word}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  artAndWordArea: { flex: 1, width: '100%' },
  pipClusterRow: { columnGap: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 24, rowGap: 18 },
  pipClusterWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', width: '100%' },
  pipLarge: { borderRadius: 16, borderWidth: 3, height: 32, width: 32 },
  text: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: WORD_FONT_SIZE, textAlign: 'center' },
  textLarge: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: WORD_FONT_SIZE_LARGE, textAlign: 'center' },
  visual: { flex: 1, width: '100%' },
  visualArea: { width: '100%' },
  // Only used for the one frame before combinedAreaSize's first measurement lands — without it
  // the box would render at 0 height (no explicit height yet, no flex to grow into) and visibly
  // pop into place a moment later instead of just being there from the start.
  visualAreaFallback: { flex: 1 },
  wordArea: { alignItems: 'center', flex: 1, justifyContent: 'center', width: '100%' },
  // alignSelf overrides wordArea's alignItems: 'center' so the row spans the full width it's
  // allowed instead of hugging its own letters — what makes onLayout above an available-width
  // measurement rather than a self-referential one. justifyContent keeps the letters centered
  // within that full-width row, so this is invisible on screen.
  wordRow: { alignSelf: 'stretch', columnGap: 34, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: WORD_ROW_MARGIN_BOTTOM, paddingHorizontal: WORD_ROW_PADDING_HORIZONTAL, rowGap: 4 },
  wordRowLarge: { alignSelf: 'stretch', columnGap: 60, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: WORD_ROW_MARGIN_BOTTOM, paddingHorizontal: WORD_ROW_PADDING_HORIZONTAL, rowGap: 8 }
})
