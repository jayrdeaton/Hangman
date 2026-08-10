import { hapticActions, HapticPressProvider, type HapticSettings } from '@rific/haptic-press'
import { ReactNode, useCallback } from 'react'
import * as RNPaper from 'react-native-paper'
import { shallowEqual, useDispatch, useSelector } from 'react-redux'

import { RootState } from '@/redux/store'

export type HapticProps = {
  children: ReactNode
}

// Mirrors Theme.tsx's own shape exactly — @rific/haptic-press ships the same redux-slice-plus-
// Provider pattern @rific/auto-paper does (see that package's own hapticReducer/hapticActions),
// so this reuses the identical bridge rather than a bespoke AsyncStorage wrapper: redux-persist
// (already wired up for the theme slice, see @/redux/store) is what actually persists this, this
// component just keeps @rific/haptic-press's own Provider (and therefore useVibration/useHapticSettings
// everywhere else in the app) in sync with it.
export const Haptic = ({ children }: HapticProps) => {
  const settings = useSelector((state: RootState) => state.haptic, shallowEqual)
  const dispatch = useDispatch()
  const onChange = useCallback((next: HapticSettings) => dispatch(hapticActions.initialize(next)), [dispatch])

  return (
    // paper is no longer auto-detected (same Metro/ESM limitation as @rific/auto-paper and
    // @rific/drawer) — without it, every Button/IconButton/Card/etc. this app renders through
    // @rific/haptic-press falls back to a bare, unstyled RN element instead of the real Paper one.
    <HapticPressProvider initialValue={settings} onChange={onChange} paper={RNPaper}>
      {children}
    </HapticPressProvider>
  )
}
