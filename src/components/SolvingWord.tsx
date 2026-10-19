import { JSX, useEffect, useMemo, useState } from 'react'

import { SketchWord, sketchWordBlanksDrawnMs } from './SketchWord'

// After the last blank has drawn in, a short beat before the first letter, then one letter a beat.
const FIRST_LETTER_BEAT_MS = 150
const LETTER_STAGGER_MS = 120

export type SolvingWordProps = {
  // The word, in capitals.
  word: string
  fontSize: number
  color: string
  // Holds the reveal where it is (Home covered); it picks up where it stopped when unpaused.
  paused?: boolean
}

// A word solved like a puzzle on the board (SketchWord, the board's own sketch letters): its blanks
// sketch in first, then, after a short beat, each blank gives way to its letter, left to right, one
// beat apart, the way a right guess fills a blank. The one reveal for Home's hero title and the Letters
// Only art's preview (Jay, 2026-10-18: one shared component, so they can't drift apart). One letter at
// a time, one timer at a time, and none once the word is whole.
export const SolvingWord = ({ word, fontSize, color, paused = false }: SolvingWordProps): JSX.Element => {
  const target = useMemo(() => word.split(''), [word])
  const [revealed, setRevealed] = useState(0)
  useEffect(() => {
    if (paused || revealed >= target.length) return
    const timeout = setTimeout(() => setRevealed((count) => count + 1), revealed === 0 ? sketchWordBlanksDrawnMs(target.length) + FIRST_LETTER_BEAT_MS : LETTER_STAGGER_MS)
    return () => clearTimeout(timeout)
  }, [paused, revealed, target.length])
  const letters = useMemo(() => target.map((letter, i) => (i < revealed ? letter : '_')), [target, revealed])
  return <SketchWord letters={letters} fontSize={fontSize} color={color} started />
}
