import { renderHook } from '@testing-library/react-native'

import { DRAWER_MAX_WIDTH, useDrawerWidth } from '@/hooks/useDrawerWidth'

// require(), not `import * as RN`: Babel's ESM-interop namespace copy isn't the same object
// useDrawerWidth.ts's own `import { useWindowDimensions } from 'react-native'` reads from, so
// spying on that copy wouldn't be observed. require() returns the actual shared module object.

const ReactNative = require('react-native')

const withWindowWidth = (width: number) => jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 780, scale: 2, fontScale: 1 })

describe('useDrawerWidth', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([320, 360, 375])('fills a %ipx window exactly, so the panel never runs past the screen edge', async (width) => {
    withWindowWidth(width)
    const { result } = await renderHook(() => useDrawerWidth())

    expect(result.current).toBe(width)
  })

  it.each([DRAWER_MAX_WIDTH, 390, 430, 1024])('stays at DRAWER_MAX_WIDTH on a %ipx window', async (width) => {
    withWindowWidth(width)
    const { result } = await renderHook(() => useDrawerWidth())

    expect(result.current).toBe(DRAWER_MAX_WIDTH)
  })

  // @rific/drawer's own guard: a 0 width means not measured yet (web, before hydration), and
  // collapsing the panel to 0 there would make it visibly slide shut once the real width arrives.
  it('stays at DRAWER_MAX_WIDTH while the window is still unmeasured (0)', async () => {
    withWindowWidth(0)
    const { result } = await renderHook(() => useDrawerWidth())

    expect(result.current).toBe(DRAWER_MAX_WIDTH)
  })

  it('follows the window when it changes size', async () => {
    const spy = withWindowWidth(430)
    const { result, rerender } = await renderHook(() => useDrawerWidth())
    expect(result.current).toBe(DRAWER_MAX_WIDTH)

    spy.mockReturnValue({ width: 360, height: 780, scale: 2, fontScale: 1 })
    await rerender({})

    expect(result.current).toBe(360)
  })
})
