import { type AudioPlayer, useAudioPlayer } from 'expo-audio'
import { useCallback } from 'react'

import { useSoundSettings } from './useSoundSettings'

// Relative, not the @/ alias — these are static require() calls Metro's asset plugin has to
// resolve at bundle time, and every other local-asset require in this codebase (app icons,
// splash images, referenced from app.json/eas.json rather than source) sticks to plain relative
// paths for exactly that reason, so this follows the same safe convention rather than assuming
// alias-based requires are equally reliable there.
const CORRECT_SOUND = require('../../assets/sounds/correct.wav')
const WRONG_SOUND = require('../../assets/sounds/wrong.wav')
const WIN_SOUND = require('../../assets/sounds/win.wav')
const LOSS_SOUND = require('../../assets/sounds/loss.wav')

// One useAudioPlayer per clip, not a single player whose source gets replaced per call — these can
// fire back-to-back (a fast player mashing letters) and each needs to be able to restart or overlap
// independently rather than cutting the previous clip off to load a new source.
export const useSoundEffects = () => {
  const { settings } = useSoundSettings()
  const correctPlayer = useAudioPlayer(CORRECT_SOUND)
  const wrongPlayer = useAudioPlayer(WRONG_SOUND)
  const winPlayer = useAudioPlayer(WIN_SOUND)
  const lossPlayer = useAudioPlayer(LOSS_SOUND)

  // seekTo(0) before play() — expo-audio's own replacement for expo-av's old replayAsync(), so a
  // clip retriggered before its previous play finished (or already fully played out) restarts from
  // the top instead of doing nothing (already at end) or resuming mid-clip.
  const play = useCallback(
    (player: AudioPlayer) => {
      if (!settings.enabled) return
      void player.seekTo(0)
      player.play()
    },
    [settings.enabled]
  )

  const playCorrect = useCallback(() => play(correctPlayer), [play, correctPlayer])
  const playWrong = useCallback(() => play(wrongPlayer), [play, wrongPlayer])
  const playWin = useCallback(() => play(winPlayer), [play, winPlayer])
  const playLoss = useCallback(() => play(lossPlayer), [play, lossPlayer])

  return { playCorrect, playWrong, playWin, playLoss }
}
