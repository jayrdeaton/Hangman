import { FeedbackPressProvider, hapticActions, type HapticSettings, soundActions, type SoundConfig, type SoundSettings } from '@rific/feedback-press'
import { ReactNode, useCallback, useMemo } from 'react'
import * as RNPaper from 'react-native-paper'
import { shallowEqual, useDispatch, useSelector } from 'react-redux'

import { useClickSound } from '@/hooks/useClickSound'
import { RootState } from '@/redux/store'

export type HapticProps = {
  children: ReactNode
}

// Mirrors Theme.tsx's own shape exactly — @rific/feedback-press ships the same redux-slice-plus-
// Provider pattern @rific/auto-paper does (see that package's own hapticReducer/hapticActions),
// so this reuses the identical bridge rather than a bespoke AsyncStorage wrapper: redux-persist
// (already wired up for the theme slice, see @/redux/store) is what actually persists this, this
// component just keeps @rific/feedback-press's own Provider (and therefore useVibration/useHapticSettings
// everywhere else in the app) in sync with it. Sound settings are wired the same way now too — see
// @/redux/store's `sound` slice — replacing this app's old bespoke SoundSettingsProvider/
// useSoundSettings Context (which persisted a single 'soundEnabled' AsyncStorage key directly).
export const Haptic = ({ children }: HapticProps) => {
  const settings = useSelector((state: RootState) => state.haptic, shallowEqual)
  const soundSettings = useSelector((state: RootState) => state.sound, shallowEqual)
  const dispatch = useDispatch()
  const onChange = useCallback((next: HapticSettings) => dispatch(hapticActions.initialize(next)), [dispatch])
  const onSoundChange = useCallback((next: SoundSettings) => dispatch(soundActions.initialize(next)), [dispatch])
  const { playClick } = useClickSound()
  // Memoized so an unrelated Haptic re-render doesn't hand FeedbackPressProvider's `sound` prop a
  // new object identity every time — only changes when playClick's own identity changes (i.e. when
  // settings.enabled toggles). notification (long-press) intentionally left unwired: the only
  // long-press action in the app today (PackRow's deselect, via PuzzleDrawer.tsx) already reads as
  // a deliberate, distinct gesture, and scope here is the generic press click, not every event this
  // package can fire.
  const sound = useMemo<SoundConfig>(() => ({ selection: playClick }), [playClick])

  return (
    // paper is no longer auto-detected (same Metro/ESM limitation as @rific/auto-paper and
    // @rific/drawer) — without it, every Button/IconButton/Card/etc. this app renders through
    // @rific/feedback-press falls back to a bare, unstyled RN element instead of the real Paper one.
    <FeedbackPressProvider initialValue={settings} onChange={onChange} soundInitialValue={soundSettings} onSoundChange={onSoundChange} paper={RNPaper} sound={sound}>
      {children}
    </FeedbackPressProvider>
  )
}
