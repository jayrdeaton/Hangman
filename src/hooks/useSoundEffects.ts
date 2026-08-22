import { useAudioPool } from '@rific/feedback-press/audio'
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

// One useAudioPool(...) per clip, not a single pool whose source gets replaced per call — these
// can fire back-to-back (a fast player mashing letters) and each needs its own pool to restart or
// overlap independently rather than racing a single shared player. No poolSize override: the
// default already covers the fast-typing case this comment describes — a pool of 1 would collapse
// back to a single shared player racing itself, the exact bug useAudioPool exists to prevent. The
// setTimeout/seekTo(0) deferral this hook used to hand-roll now lives inside
// @rific/feedback-press/audio's useAudioPool.
export const useSoundEffects = () => {
  const { settings } = useSoundSettings()
  const playCorrectRaw = useAudioPool(CORRECT_SOUND)
  const playWrongRaw = useAudioPool(WRONG_SOUND)
  const playWinRaw = useAudioPool(WIN_SOUND)
  const playLossRaw = useAudioPool(LOSS_SOUND)

  const playCorrect = useCallback(() => {
    if (!settings.enabled) return
    playCorrectRaw()
  }, [settings.enabled, playCorrectRaw])

  const playWrong = useCallback(() => {
    if (!settings.enabled) return
    playWrongRaw()
  }, [settings.enabled, playWrongRaw])

  const playWin = useCallback(() => {
    if (!settings.enabled) return
    playWinRaw()
  }, [settings.enabled, playWinRaw])

  const playLoss = useCallback(() => {
    if (!settings.enabled) return
    playLossRaw()
  }, [settings.enabled, playLossRaw])

  return { playCorrect, playWrong, playWin, playLoss }
}
