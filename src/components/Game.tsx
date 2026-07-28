import { useThemeSettings } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/haptic-press'
import * as haptics from 'expo-haptics'
import { JSX, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native'
import { Icon, Portal, Text, useTheme } from 'react-native-paper'

import { type CelebrationEffect, DEFAULT_CELEBRATION } from '@/effects/registry'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import { GameVisual } from './GameVisual'
import { Keyboard } from './Keyboard'
import { type CategoryProgress, RoundEndDialog } from './RoundEndDialog'

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

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
}

const DIFFICULTY_COLORS: Record<PuzzleDifficultyTier, string> = {
  easy: '#2E7D32',
  medium: '#B8860B',
  hard: '#B00020'
}

// Some pack labels are generated as "<Group> <Specific>" (e.g. "Theme Superheroes", "Geography
// National Parks") — run together inside the hint pill they read like a garbled sentence, so the
// group word gets split into its own "|" segment, matching every other join in that pill.
const GROUP_LABEL_PREFIXES = ['Theme', 'Geography']

const formatCatalogLabel = (label: string): string => {
  const prefix = GROUP_LABEL_PREFIXES.find((p) => label.startsWith(`${p} `))
  return prefix ? `${prefix} | ${label.slice(prefix.length + 1)}` : label
}

export type SolveDetails = { wrongGuesses: number; hintRevealed: boolean }

export type GameProps = {
  onStop: () => void
  onSolved?: (details: SolveDetails) => void
  onLost?: () => void
  phrase: string
  mode?: GameMode
  hint?: string
  packLabel?: string
  difficultyTier?: PuzzleDifficultyTier
  celebration?: CelebrationEffect
  categoryProgress?: CategoryProgress | null
  onAnotherInCategory?: () => void
}

export const Game = ({ onStop, onSolved, onLost, phrase, mode = DEFAULT_MODE, hint, packLabel, difficultyTier, celebration = DEFAULT_CELEBRATION, categoryProgress, onAnotherInCategory }: GameProps): JSX.Element => {
  const { settings } = useThemeSettings()
  const { layout } = useKeyboardLayout()
  const theme = useTheme()
  const color = settings.color
  const tertiaryColor = theme.colors.tertiary
  // The hint pill is FILLED with tertiary and draws its icon/text in onTertiary, rather than
  // tinting them tertiary against the surface the way the pips below do. tertiary is derived from
  // whatever accent the player picked (see Theme.tsx / @rific/auto-paper), and at the pale end of
  // that range — yellows especially — tertiary-on-surface text washes out to nearly unreadable.
  // onTertiary is the one color the palette guarantees is legible against tertiary, in both the
  // light and dark variants, so pairing them keeps the label readable for every accent choice.
  const onTertiaryColor = theme.colors.onTertiary
  const [guessedLetters, setGuessedLetters] = useState<string[]>([])
  const [wrongGuesses, setWrongGuesses] = useState(0)
  const [hintRevealed, setHintRevealed] = useState(false)
  const [outcome, setOutcome] = useState<'win' | 'loss' | null>(null)
  // Bumped every time the celebration effect finishes a cycle, which remounts CelebrationView
  // (keyed on this value below) to start a fresh cycle — keeping the effect running for as long
  // as outcome stays 'win', i.e. for as long as the win dialog is open.
  const [celebrationCycle, setCelebrationCycle] = useState(0)
  // Captured once, not read live from `mode` — `mode` itself updates immediately when the player
  // picks a new art style mid-round (see PuzzleDrawer's onModeChange), which should only change how
  // the round is drawn, never its mechanics. Almost every mode shares the same 6-mistake limit, but
  // Stars doesn't (see modes/stars.tsx), so without this freeze, switching to or from it mid-round
  // would shift how many wrong guesses the player has left partway through.
  const [maxWrong] = useState(() => mode.maxMistakes)
  // Set synchronously the instant the round is decided (win, or the wrong-guess threshold is
  // crossed) — a ref rather than state so it takes effect immediately, before React commits a
  // re-render. Guards handleGuess against a stray guess during the win celebration, and against a
  // fast guess landing in the gap between crossing the loss threshold and the delayed
  // setOutcome('loss') below, either of which could otherwise flip a decided round's outcome.
  const roundOverRef = useRef(false)
  const lossTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (lossTimeoutRef.current) clearTimeout(lossTimeoutRef.current)
    },
    []
  )

  const handleGuess = (letter: string) => {
    if (roundOverRef.current) return
    const L = letter.toUpperCase()
    if (guessedLetters.includes(L)) return
    const next = [...guessedLetters, L]
    setGuessedLetters(next)
    if (!phrase.includes(L)) {
      const w = wrongGuesses + 1
      setWrongGuesses(w)
      void haptics.selectionAsync()
      if (w >= maxWrong) {
        roundOverRef.current = true
        onLost?.()
        lossTimeoutRef.current = setTimeout(() => setOutcome('loss'), 450)
      }
    } else {
      void haptics.impactAsync()
      const allRevealed = phrase.split('').every((c) => c === ' ' || next.includes(c))
      if (allRevealed) {
        roundOverRef.current = true
        onSolved?.({ wrongGuesses, hintRevealed })
        setOutcome('win')
      }
    }
  }

  // Physical keyboard guessing on web — deliberately no dep array so the listener always closes
  // over the current guess state.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase()
      if (key.length === 1 && key >= 'A' && key <= 'Z') handleGuess(key)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

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
        .join('\u00A0')
    )
  }, [phrase, guessedLetters])

  const CelebrationView = celebration.Component

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
  // Keyed on wrongGuesses reaching maxWrong, NOT on `outcome === 'loss'` — outcome is deliberately
  // set 450ms late (see handleGuess's lossTimeoutRef below) so the final stage has time to draw
  // before the loss dialog interrupts, and gating the cap on outcome would undo exactly that: the
  // fatal guess would render one stage short until the delayed setOutcome caught up, snapping to
  // full 450ms later instead of instantly. wrongGuesses/maxWrong are both already reactive state
  // updated in the very same batch as the fatal guess, so this uncaps in the correct render with no
  // such delay, while still capping correctly for a mode swapped in mid-round (wrongGuesses can only
  // reach maxWrong via an actual loss — handleGuess ignores every guess once roundOverRef is set, so
  // this can never spuriously go true on a win).
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
  const pipsLabel = `Wrong guesses: ${wrongGuesses} of ${maxWrong}`

  // Difficulty sits in its own pill, always visible when known — unlike the hint, glancing at it
  // isn't "getting help", so it doesn't route through hintRevealed (which onSolved reports for the
  // no-hints achievement; see achievements.ts). The pack it was drawn from and the derived
  // category/artist/year hint share a second pill next to it, revealed together by "Show hint".
  const hintSegments = [packLabel ? formatCatalogLabel(packLabel) : undefined, hint].filter((segment): segment is string => Boolean(segment))
  const hasHintContent = hintSegments.length > 0
  const hasInfoRow = Boolean(difficultyTier) || hasHintContent
  const hintAccessibilityLabel = hintSegments.join('. ')

  return (
    <View style={styles.root}>
      <View style={styles.gameContainer}>
        {hasInfoRow ? (
          <View style={styles.hintSlot}>
            <View style={styles.infoRow}>
              {difficultyTier ? (
                <View style={[styles.pill, { borderColor: DIFFICULTY_COLORS[difficultyTier] }]} accessibilityLabel={`Difficulty: ${DIFFICULTY_LABELS[difficultyTier]}`}>
                  <Text style={[styles.pillTextStrong, { color: DIFFICULTY_COLORS[difficultyTier] }]}>{DIFFICULTY_LABELS[difficultyTier]}</Text>
                </View>
              ) : null}
              {hasHintContent ? (
                // One persistent TouchableRipple across both states (not a View/TouchableRipple
                // swap keyed on hintRevealed) — swapping component type on press unmounts the
                // touchable mid-gesture, tearing down the native view its ripple/underlay
                // animation is running on before it has time to play. Keeping the same element
                // and only changing its content/disabled state lets that animation finish
                // naturally. TouchableRipple itself (not Button) imposes no padding/min-height of
                // its own, so it still matches the difficulty pill's geometry exactly. The
                // @rific/haptic-press wrapper (not react-native-paper's own) fires the app's
                // haptic-setting-aware selection tap on top of that for free.
                <TouchableRipple onPress={() => setHintRevealed(true)} disabled={hintRevealed} accessibilityRole='button' accessibilityLabel={hintRevealed ? hintAccessibilityLabel : 'Show hint'} hitSlop={8} style={[styles.pill, { backgroundColor: tertiaryColor, borderColor: tertiaryColor }]}>
                  <View style={styles.hintPill}>
                    <Icon source={hintRevealed ? 'lightbulb-on' : 'lightbulb-outline'} size={15} color={onTertiaryColor} />
                    <Text style={[styles.pillText, { color: onTertiaryColor }]} numberOfLines={2}>
                      {hintRevealed ? hintSegments.join('  |  ') : 'Show hint'}
                    </Text>
                  </View>
                </TouchableRipple>
              ) : null}
            </View>
          </View>
        ) : null}
        {/* The one flex:1 region shared by the artwork and the word blanks — measured as a whole
            (see visualHeight above) so the artwork can claim its square greedily, up to this
            region's own width, and wordArea can unambiguously take whatever's left. */}
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
        {/* Anchored to the keyboard (not the artwork, and not wherever wordArea's variable centering
            happens to land it) — the pips are a "guesses remaining" readout, most useful right where
            your eyes already are while choosing the next letter, rather than a step removed near
            the art that's already telling the same story its own way. */}
        {hasVisual ? (
          <View style={styles.pipRow} accessibilityLabel={pipsLabel}>
            {Array.from({ length: maxWrong }, (_, i) => (
              <View key={i} style={[styles.pip, { borderColor: tertiaryColor }, i < wrongGuesses ? { backgroundColor: tertiaryColor } : null]} />
            ))}
          </View>
        ) : null}
        <Keyboard guessedLetters={guessedLetters} disabled={outcome !== null} layout={layout} onGuess={handleGuess} />
      </View>
      {outcome === 'win' ? (
        // Portal escapes this component's own box (which sits below the app header and inside
        // safe-area padding) to render at the app root instead — the same mechanism
        // RoundEndDialog's Dialog uses for its full-screen backdrop — so the celebration covers
        // the entire screen (header, keyboard, everything) rather than just Game's local area.
        <Portal>
          <CelebrationView key={celebrationCycle} colors={[theme.colors.primary, theme.colors.secondary, theme.colors.tertiary]} dark={theme.dark} onComplete={() => setCelebrationCycle((c) => c + 1)} />
        </Portal>
      ) : null}
      <RoundEndDialog visible={outcome !== null} outcome={outcome} phrase={phrase} categoryProgress={categoryProgress} onDismiss={onStop} onAnotherInCategory={onAnotherInCategory} />
    </View>
  )
}

const styles = StyleSheet.create({
  artAndWordArea: { flex: 1, width: '100%' },
  gameContainer: { alignItems: 'center', flex: 1 },
  hintPill: { alignItems: 'center', columnGap: 6, flexDirection: 'row' },
  hintSlot: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', marginBottom: 4, marginTop: 4, minHeight: 38, paddingHorizontal: 24 },
  infoRow: { alignItems: 'center', columnGap: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 6 },
  pill: { borderRadius: 14, borderWidth: 1.5, maxWidth: '100%', overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 5 },
  pillText: { fontSize: 13, textAlign: 'center' },
  pillTextStrong: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipClusterRow: { columnGap: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 24, rowGap: 18 },
  pipClusterWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', width: '100%' },
  pipLarge: { borderRadius: 16, borderWidth: 3, height: 32, width: 32 },
  pipRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 },
  root: { flex: 1 },
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
