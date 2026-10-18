import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { Pressable } from '@rific/feedback-press'
import { JSX, useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'

import { useArtDemoLoop } from '@/hooks/useArtDemoLoop'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'
import { fitSketchWordFontSize, SketchWord, sketchWordBlanksDrawnMs } from './SketchWord'

const TITLE = 'HANGMAN'.split('')
const MAX_TITLE_FONT_SIZE = 56
const MAX_ART_SIZE = 240
// The title is solved like a puzzle: its blanks sketch in first, then, after a short beat, each blank
// gives way to its letter left to right, one beat apart, the way a right guess fills a blank on the
// board.
const TITLE_FIRST_LETTER_MS = sketchWordBlanksDrawnMs(TITLE.length) + 150
const TITLE_LETTER_STAGGER_MS = 120

type HeroWordProps = { paused: boolean; fontSize: number }

// One letter at a time, one timer at a time, and none while Home is covered: a reveal cut short by
// the player leaving picks up where it stopped when they come back.
const HeroWord = ({ paused, fontSize }: HeroWordProps): JSX.Element => {
  const theme = useTheme()
  const [revealed, setRevealed] = useState(0)
  useEffect(() => {
    if (paused || revealed >= TITLE.length) return
    const timeout = setTimeout(() => setRevealed((count) => count + 1), revealed === 0 ? TITLE_FIRST_LETTER_MS : TITLE_LETTER_STAGGER_MS)
    return () => clearTimeout(timeout)
  }, [paused, revealed])
  const letters = useMemo(() => TITLE.map((letter, i) => (i < revealed ? letter : '_')), [revealed])
  return <SketchWord letters={letters} fontSize={fontSize} color={theme.colors.onSurface} started />
}

type HeroArtProps = { mode: GameMode; paused: boolean; size: number }

const HERO_DEMO = { startBlank: true, once: true }

// The art acting out a round, once, then holding its fully drawn picture; a press plays the round again,
// just for fun (Jay, 2026-10-18): only the round, so Classic's gallows stay up while the figure is drawn
// back in (useArtDemoLoop's replay). The press feedback is feedback-press's, so it follows the Haptics
// and Sound settings; a screen reader still finds only HeroTitle's one header, since the replay is a
// toy for the eye. Its own component, keyed on the mode by HeroTitle, so new art picked in the Settings
// sheet plays its own round (the loop reads the mode once).
const HeroArt = ({ mode, paused, size }: HeroArtProps): JSX.Element => {
  const theme = useTheme()
  const { settings } = useThemeSettings()
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])
  const { mistakes, revealKey, cardOpacity, partsOpacity, replay } = useArtDemoLoop(true, paused, mode, HERO_DEMO)
  const artStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }))
  return (
    <Pressable testID='hero-art-replay' onPress={replay}>
      <Animated.View style={[{ height: size, width: size }, artStyle]}>
        <GameVisual key={revealKey} mode={mode} mistakes={mistakes} color={resolveSeedColor(settings.color)} colors={colors} started partsOpacity={partsOpacity} style={styles.art} />
      </Animated.View>
    </Pressable>
  )
}

export type HeroTitleProps = {
  // True while Home is covered (the loadout, the game, Stats, the Settings sheet): the art's demo loop
  // and the title's reveal stop, so nothing keeps re-rendering behind whatever is in front of them.
  paused: boolean
}

// Home's hero, the fleet's title-plus-animation in Hangman's own hand: the player's chosen art drawing
// itself in and acting out a round once (useArtDemoLoop, in the player's palette), then holding still,
// over HANGMAN in the board's sketch letters, filled in on its blanks like a solved puzzle. Pressing the
// art plays its round again (see HeroArt).
export const HeroTitle = ({ paused }: HeroTitleProps): JSX.Element => {
  const { mode } = usePuzzleDefaults()
  // The art on show. A pick made while the hero is paused (in the Settings sheet over Home, the usual
  // place) waits until it's uncovered, so the new art draws itself in where the player can see it
  // rather than behind the sheet, and the old art holds its frame until then. Adjusted during render,
  // React's pattern for state that follows a prop, so the swap lands in the same commit as the unpause.
  const [shownMode, setShownMode] = useState(mode)
  if (!paused && shownMode.id !== mode.id) setShownMode(mode)
  const { width } = useWindowDimensions()
  const artSize = Math.min(MAX_ART_SIZE, width * 0.6)
  const fontSize = fitSketchWordFontSize(TITLE.length, Math.min(width, 480) - 64, MAX_TITLE_FONT_SIZE)

  return (
    <View style={styles.hero} accessible accessibilityRole='header' accessibilityLabel='Hangman'>
      <HeroArt key={shownMode.id} mode={shownMode} paused={paused} size={artSize} />
      <HeroWord paused={paused} fontSize={fontSize} />
    </View>
  )
}

const styles = StyleSheet.create({
  art: { flex: 1, width: '100%' },
  hero: { alignItems: 'center', gap: 24 }
})
