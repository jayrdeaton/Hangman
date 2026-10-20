import { useHapticSettings } from '@rific/feedback-press'
import * as haptics from 'expo-haptics'
import { useCallback } from 'react'

// Every game-feedback haptic (guesses, the win, firework bursts) goes through here, so the player's
// Vibrate setting is checked the same way useSoundEffects.ts checks Sound effects before each clip.
// Each one keeps the exact expo-haptics style the game has always used, rather than going through
// @rific/feedback-press's useVibration(): on Android that hook falls back to a fixed-length
// Vibration.vibrate() buzz (200ms for its medium) instead of a haptic tick.
export const useGameHaptics = () => {
  const { settings } = useHapticSettings()

  // Error, not a lighter impact: a wrong guess should feel distinctly different from a correct
  // one, not just a softer version of the same tick.
  const wrongGuess = useCallback(() => {
    if (!settings.vibrate) return
    void haptics.notificationAsync(haptics.NotificationFeedbackType.Error)
  }, [settings.vibrate])

  const correctGuess = useCallback(() => {
    if (!settings.vibrate) return
    void haptics.impactAsync()
  }, [settings.vibrate])

  // A more celebratory pulse than a correct letter, fired by the same guess that starts the
  // fireworks.
  const win = useCallback(() => {
    if (!settings.vibrate) return
    void haptics.notificationAsync(haptics.NotificationFeedbackType.Success)
  }, [settings.vibrate])

  // One light tap per firework burst, deliberately lighter than any guess.
  const burst = useCallback(() => {
    if (!settings.vibrate) return
    void haptics.impactAsync(haptics.ImpactFeedbackStyle.Light)
  }, [settings.vibrate])

  // A seat picked up on the Pass & Play page to be dragged into a new place, the way a home screen's
  // icon lifts.
  const pickUp = useCallback(() => {
    if (!settings.vibrate) return
    void haptics.impactAsync(haptics.ImpactFeedbackStyle.Medium)
  }, [settings.vibrate])

  return { wrongGuess, correctGuess, win, burst, pickUp }
}
