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

  // Deferred a tick via setTimeout rather than called inline from handleGuess — expo-audio's
  // play() is synchronous on the JS side but, on Android, its native module hops to the UI thread
  // and blocks (runBlocking) waiting for it, so calling it inline stalled the very state update
  // that reveals the guessed letter until that native round-trip returned. Pushing it a macrotask
  // out lets React commit that update first (the keyboard responds immediately), so the blip lands
  // a frame later instead of adding native-thread latency to every keypress.
  //
  // seekTo(0) before play() — expo-audio's own replacement for expo-av's old replayAsync(), so a
  // clip retriggered before its previous play finished (or already fully played out) restarts from
  // the top instead of doing nothing (already at end) or resuming mid-clip. Awaited here (unlike a
  // fire-and-forget seek) since it's already off the input path — awaiting removes the race where
  // play() could start before the seek lands and get yanked back to 0 out from under itself.
  const play = useCallback(
    (player: AudioPlayer) => {
      if (!settings.enabled) return
      setTimeout(() => {
        void player.seekTo(0).then(() => player.play())
      }, 0)
    },
    [settings.enabled]
  )

  const playCorrect = useCallback(() => play(correctPlayer), [play, correctPlayer])
  const playWrong = useCallback(() => play(wrongPlayer), [play, wrongPlayer])
  const playWin = useCallback(() => play(winPlayer), [play, winPlayer])
  const playLoss = useCallback(() => play(lossPlayer), [play, lossPlayer])

  return { playCorrect, playWrong, playWin, playLoss }
}
