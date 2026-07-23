import { Provider, themeActions, type ThemeSettings } from '@rific/auto-paper'
import * as SplashScreen from 'expo-splash-screen'
import { ReactNode, useCallback } from 'react'
import { shallowEqual, useDispatch, useSelector } from 'react-redux'

import { RootState } from '@/redux/store'

SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({
  duration: 500,
  fade: true
})

export type ThemeProps = {
  children: ReactNode
}

export const Theme = ({ children }: ThemeProps) => {
  const settings = useSelector((state: RootState) => state.theme, shallowEqual)
  const dispatch = useDispatch()
  const onChange = useCallback((next: ThemeSettings) => dispatch(themeActions.initialize(next)), [dispatch])
  const onReady = useCallback(() => {
    void SplashScreen.hideAsync()
  }, [])

  return (
    <Provider initialValue={settings} onChange={onChange} onReady={onReady}>
      {children}
    </Provider>
  )
}
