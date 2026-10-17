import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
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

// The art acting out a round on a loop. Its own component, keyed on the mode by HeroTitle, so picking
// new art in Customize starts the loop over for the new art (the loop reads the mode once).
const HeroArt = ({ mode, paused, size }: HeroArtProps): JSX.Element => {
  const theme = useTheme()
  const { settings } = useThemeSettings()
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])
  const { mistakes, revealKey, cardOpacity, partsOpacity } = useArtDemoLoop(true, paused, mode, true)
  const artStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }))
  return (
    <Animated.View style={[{ height: size, width: size }, artStyle]}>
      <GameVisual key={revealKey} mode={mode} mistakes={mistakes} color={resolveSeedColor(settings.color)} colors={colors} started partsOpacity={partsOpacity} style={styles.art} />
    </Animated.View>
  )
}

export type HeroTitleProps = {
  // True while Home is covered (the loadout, the game, Stats): the art's demo loop stops, so nothing
  // keeps re-rendering behind a screen that's in front of it.
  paused: boolean
}

// Home's hero, the fleet's title-plus-animation in Hangman's own hand: the player's chosen art drawing
// itself in and acting out a round (the same demo loop Customize's carousel plays, in the player's
// palette), over HANGMAN in the board's sketch letters, filled in on its blanks like a solved puzzle.
export const HeroTitle = ({ paused }: HeroTitleProps): JSX.Element => {
  const { mode } = usePuzzleDefaults()
  const { width } = useWindowDimensions()
  const artSize = Math.min(MAX_ART_SIZE, width * 0.6)
  const fontSize = fitSketchWordFontSize(TITLE.length, Math.min(width, 480) - 64, MAX_TITLE_FONT_SIZE)

  return (
    <View style={styles.hero} accessible accessibilityRole='header' accessibilityLabel='Hangman'>
      <HeroArt key={mode.id} mode={mode} paused={paused} size={artSize} />
      <HeroWord paused={paused} fontSize={fontSize} />
    </View>
  )
}

const styles = StyleSheet.create({
  art: { flex: 1, width: '100%' },
  hero: { alignItems: 'center', gap: 24 }
})
