import { renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'

import { recordPageWheelActivity, useHorizontalWheelScrollProps } from '@/hooks/useHorizontalWheelScroll'

// Mutating the real Platform.OS (rather than jest.resetModules() + a fresh require per test) —
// this hook needs React and @testing-library/react-native's own React copy to stay the SAME
// instance renderHook is using; resetting modules mid-file pulls in a second React copy and every
// hook call inside it throws "Cannot read properties of null (reading 'useRef')".
const setPlatform = (os: string) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os })
}

const makeEvent = (deltaX: number, deltaY: number) => ({
  currentTarget: { scrollLeft: 100 },
  deltaX,
  deltaY,
  preventDefault: jest.fn()
})

describe('useHorizontalWheelScrollProps', () => {
  afterEach(() => {
    setPlatform('ios')
  })

  it('native (ios): returns an empty object with no onWheel/onMouseEnter/onMouseLeave keys', async () => {
    setPlatform('ios')
    const { result } = await renderHook(() => useHorizontalWheelScrollProps())

    expect(result.current).toEqual({})
  })

  it('native (android): returns an empty object with no onWheel/onMouseEnter/onMouseLeave keys', async () => {
    setPlatform('android')
    const { result } = await renderHook(() => useHorizontalWheelScrollProps())

    expect(result.current).toEqual({})
  })

  describe('web', () => {
    beforeEach(() => {
      setPlatform('web')
    })

    it('exposes onWheel/onMouseEnter/onMouseLeave functions', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      expect(typeof result.current.onWheel).toBe('function')
      expect(typeof result.current.onMouseEnter).toBe('function')
      expect(typeof result.current.onMouseLeave).toBe('function')
    })

    it("does nothing on a mostly-vertical wheel event before the cursor has genuinely entered — a page-scroll wheel event landing here before any hover shouldn't be mistaken for deliberate use", async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      const event = makeEvent(2, 50)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('redirects a mostly-vertical wheel event into scrollLeft once genuinely hovering (mouseenter with no recent page-wheel activity)', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      result.current.onMouseEnter!()
      const event = makeEvent(2, 50)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(150)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    })

    it('negative deltaY (scroll up) still redirects scrollLeft when mostly vertical and armed', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      result.current.onMouseEnter!()
      const event = makeEvent(1, -40)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(60)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    })

    it('mostly-horizontal wheel event (deltaX dominant) leaves scrollLeft unchanged even while armed', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      result.current.onMouseEnter!()
      const event = makeEvent(50, 2)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('exactly diagonal wheel event (deltaX equal to deltaY) leaves scrollLeft unchanged even while armed', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      result.current.onMouseEnter!()
      const event = makeEvent(10, 10)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('disarms on mouseleave — a wheel event after leaving does nothing until the cursor genuinely re-enters', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      result.current.onMouseEnter!()
      result.current.onMouseLeave!()
      const event = makeEvent(2, 50)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    // These two run last — recordPageWheelActivity mutates hook-module-level state that would
    // otherwise leak into the "armed by default" tests above (there's no real browser wheel
    // listener in this environment to reset it through, see the hook's own doc comment on why
    // recordPageWheelActivity is exported directly for tests).
    it('does not arm on mouseenter while the page itself just had wheel activity — the carousel scrolling into a stationary cursor during page scroll must not be mistaken for deliberate hover', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      recordPageWheelActivity()
      result.current.onMouseEnter!()
      const event = makeEvent(2, 50)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('arms normally once the page has been quiet for a bit before the cursor enters', async () => {
      const { result } = await renderHook(() => useHorizontalWheelScrollProps())

      recordPageWheelActivity()
      await new Promise((resolve) => setTimeout(resolve, 200))
      result.current.onMouseEnter!()
      const event = makeEvent(2, 50)
      result.current.onWheel!(event)

      expect(event.currentTarget.scrollLeft).toBe(150)
      expect(event.preventDefault).toHaveBeenCalledTimes(1)
    })
  })
})
