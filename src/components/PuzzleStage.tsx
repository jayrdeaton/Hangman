import { useThemeSettings } from '@rific/auto-paper'
import { JSX, useEffect, useMemo, useState } from 'react'
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import type { GameMode } from '@/types/gameModes'
import { resolveSeedColor } from '@/utils/resolveSeedColor'

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
  // The wrong guesses, in the order they happened — same array Game.tsx derives once and also
  // uses for pipsLabel below, so this component doesn't need phrase/guessedLetters to re-derive
  // its own copy of the same filter.
  wrongLetters: string[]
  // The round's real, frozen mistake ceiling (see Game.tsx) — distinct from mode.maxMistakes,
  // which is only the CURRENTLY selected mode's own stage count and can differ from it after a
  // live art-style swap mid-round (see modes/stars.tsx).
  maxWrong: number
  pipsLabel: string
  // Fired whenever this region's own "fully measured, nothing left to jump" readiness changes —
  // see stageReady's own comment. This component no longer fades itself in: Game.tsx combines this
  // with Keyboard's own readiness signal to hold the WHOLE game screen hidden until everything on
  // it is already at its final size, then reveals all of it as one already-correct unit.
  onReadyChange?: (ready: boolean) => void
  // Game.tsx's own gameReady, passed back down once both this component and Keyboard have reported
  // readiness and the screen's own curtain has started fading in — see GameVisual/gameModes.ts's
  // own `started` comment for why a mode's artwork needs this rather than just animating on mount.
  started?: boolean
}

// The artwork-plus-word-blanks region of a round: everything between the difficulty/hint pills
// and the wrong-guess pips. Isolated from Game.tsx because sizing it correctly needs its own,
// fairly involved layout math (see visualHeight/fittedWordFontSize below) that has nothing to do
// with the win/loss state machine driving the rest of the round.
export const PuzzleStage = ({ mode, phrase, guessedLetters, wrongGuesses, wrongLetters, maxWrong, pipsLabel, onReadyChange, started }: PuzzleStageProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const theme = useTheme()
  const color = resolveSeedColor(settings.color)
  const tertiaryColor = theme.colors.tertiary
  // Same triad Game.tsx's own win-celebration fireworks already randomizes particle colors over
  // (see Game.tsx's CelebrationView) — reused here so a mode that wants per-instance color variety
  // (balloons, stars) draws from the same palette rather than inventing a second one.
  const themeColors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])

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
  // stars.tsx's 6 stars) — it has no way to know the round's real ceiling is the frozen `maxWrong`
  // above, which could be LARGER if the round started under a mode with a bigger maxMistakes (every
  // built-in mode shares the same 6-mistake baseline today, but a future or custom mode might not).
  // Handing a newly-selected mode the raw wrongGuesses could then
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
  const wordRowMeasured = wordRowSize.width > 0 && wordRowSize.height > 0

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
  const combinedAreaMeasured = combinedAreaSize.width > 0 && combinedAreaSize.height > 0
  const visualHeight = combinedAreaMeasured ? Math.max(0, Math.min(combinedAreaSize.width, combinedAreaSize.height - (wordRowSize.height ? wordRowSize.height + WORD_ROW_MARGIN_BOTTOM : 0))) : undefined

  // True only once BOTH halves of this region have reported a real measurement: this box's own
  // (combinedAreaSize, which visualHeight above is derived from) and the word row's own
  // (wordRowMeasured, which visualHeight's own subtraction AND fittedWordFontSize below both
  // depend on). Gating on combinedAreaSize alone — an earlier version of this fix — still let the
  // word row render, unfaded, at whatever position artAndWordArea's own measurement alone implied,
  // then visibly reposition once the word row's own onLayout landed a moment later and reflowed
  // wordArea's leftover space out from under it. That's the actual "gaps fill the void, then snap
  // into position" bug: the artwork was never the only thing racing its own measurement, the word
  // row was too.
  //
  // Reported to the parent (see onReadyChange's own comment) rather than fading itself in here:
  // this region wasn't the only thing on the game screen with its own "wrong size, then a moment
  // later the real one" problem — Keyboard.tsx had an independent, unrelated one for its own key
  // widths. Fading each in on its own schedule would still leave two separately-timed pops instead
  // of one. Game.tsx combines both signals and reveals the whole screen together.
  const stageReady = combinedAreaMeasured && wordRowMeasured
  useEffect(() => {
    onReadyChange?.(stageReady)
    // onReadyChange is Game.tsx's own setState, whose identity is already stable — see
    // Keyboard.tsx's identical comment on its own onReadyChange effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageReady])

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
    // Not hidden here (see onReadyChange's own comment — Game.tsx handles the whole screen's
    // reveal). Measuring this doesn't require it to be visible first (onLayout fires from the
    // native layout pass whether or not an ancestor's opacity is 0), so reporting readiness up
    // doesn't cost anything even while a parent-level curtain is covering it. Measured as a whole
    // (see visualHeight above) so the artwork can claim its square greedily, up to this region's
    // own width, and wordArea can unambiguously take whatever's left.
    <View testID='art-and-word-area' style={styles.artAndWordArea} onLayout={handleCombinedAreaLayout}>
      {/* visualHeight !== undefined, not a truthy check — visualHeight can legitimately be 0 (a
          long, multi-line phrase can leave the artwork no room at all once the word row's own
          height is subtracted, see visualHeight above), and a bare truthy check would wrongly
          treat that real, final "give it nothing" measurement as "not measured yet" and fall back
          to flex:1 instead — the one case that actually needs height:0. */}
      <View testID='visual-area' style={[styles.visualArea, visualHeight !== undefined ? { height: visualHeight } : styles.visualAreaFallback]}>
        {hasVisual ? (
          // Mounts unconditionally — GameVisual itself doesn't measure anything of its own (see its
          // own comment — GameMode['Visual'] dropped width/height entirely, every mode's <Svg> just
          // fills whatever box it's given), so mounting it early against visualArea's own
          // not-yet-final fallback size costs nothing visible: the whole game screen, this region
          // included, stays behind Game.tsx's own curtain until stageReady above anyway.
          <GameVisual mode={mode} mistakes={visualMistakes} color={color} colors={themeColors} started={started} style={styles.visualFill} />
        ) : (
          // No artwork to carry the "how many guesses left" tension in this mode, so the pips
          // take over the artwork's own slot (and its size) instead of trailing after the word
          // as a row of barely-there dots. This is also the one place a filled pip shows the
          // actual letter it was for, not just a plain dot — there's room to spare here (32px,
          // the whole artwork slot) that the small pip row under the keyboard in every other mode
          // doesn't have, see Game.tsx's own pipRow comment for why that one stays letter-less.
          <View style={styles.pipClusterWrap} accessibilityLabel={pipsLabel}>
            <View style={styles.pipClusterRow}>
              {Array.from({ length: maxWrong }, (_, i) => {
                const filled = i < wrongGuesses
                return (
                  <View key={i} testID={`pip-${i}`} style={[styles.pipLarge, { borderColor: tertiaryColor }, filled ? { backgroundColor: tertiaryColor } : null]}>
                    {filled && wrongLetters[i] ? (
                      <Text variant='labelLarge' style={[styles.pipLetter, { color: theme.colors.onTertiary }]}>
                        {wrongLetters[i]}
                      </Text>
                    ) : null}
                  </View>
                )
              })}
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
  pipLarge: { alignItems: 'center', borderRadius: 16, borderWidth: 3, height: 32, justifyContent: 'center', width: 32 },
  // fontSize set explicitly rather than relying on labelLarge's own default (14) — 32px is tight
  // for a glyph plus the pip's own 3px border on each side, and this reads clearly at that size
  // without the pip needing to grow.
  pipLetter: { fontSize: 13, fontWeight: '700' },
  text: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: WORD_FONT_SIZE, textAlign: 'center' },
  textLarge: { fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo', fontSize: WORD_FONT_SIZE_LARGE, textAlign: 'center' },
  visualArea: { width: '100%' },
  // Only used before combinedAreaSize's first measurement lands — without it the box would render
  // at 0 height (no explicit height yet, no flex to grow into). Nothing in here is actually visible
  // during this window regardless (see stageFadeStyle/stageReady above), so this is purely about
  // giving Yoga a real box to lay GameVisual and the word row's sibling out against while they
  // measure themselves, not about looking right on its own.
  visualAreaFallback: { flex: 1 },
  visualFill: { flex: 1, width: '100%' },
  wordArea: { alignItems: 'center', flex: 1, justifyContent: 'center', width: '100%' },
  // alignSelf overrides wordArea's alignItems: 'center' so the row spans the full width it's
  // allowed instead of hugging its own letters — what makes onLayout above an available-width
  // measurement rather than a self-referential one. justifyContent keeps the letters centered
  // within that full-width row, so this is invisible on screen.
  wordRow: { alignSelf: 'stretch', columnGap: 34, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: WORD_ROW_MARGIN_BOTTOM, paddingHorizontal: WORD_ROW_PADDING_HORIZONTAL, rowGap: 4 },
  wordRowLarge: { alignSelf: 'stretch', columnGap: 60, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: WORD_ROW_MARGIN_BOTTOM, paddingHorizontal: WORD_ROW_PADDING_HORIZONTAL, rowGap: 8 }
})
