import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import type { AppDispatch, RootState } from '../store'
import { setAppearance, setColor } from '../store'

export const useTheme = () => {
  const { appearance, color } = useSelector((s: RootState) => s.theme)
  const dispatch = useDispatch<AppDispatch>()

  const setSelectedAppearance = useCallback((v: 'system' | 'light' | 'dark') => dispatch(setAppearance(v)), [dispatch])
  const setSelectedColor = useCallback((v: string) => dispatch(setColor(v)), [dispatch])

  return { appearance, setAppearance: setSelectedAppearance, color, setColor: setSelectedColor }
}
