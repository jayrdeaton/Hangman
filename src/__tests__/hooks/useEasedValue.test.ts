import { renderHook } from '@testing-library/react-native'
import { withTiming } from 'react-native-reanimated'

import { useEasedValue } from '@/hooks/useEasedValue'

// The app's reanimated mock (src/__mocks__), with withTiming watched. It still hands the target straight
// back, so the value always lands; what's pinned here is when the hook asks for an animation at all
// (the loadout's heights and cross-fade).
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('../../__mocks__/react-native-reanimated')
  return { ...mock, withTiming: jest.fn((value: unknown) => value) }
})

describe('useEasedValue', () => {
  beforeEach(() => {
    jest.mocked(withTiming).mockClear()
  })

  type Props = { target: number; animate: boolean }
  const render = (target: number, animate: boolean) => renderHook(({ target: next, animate: on }: Props) => useEasedValue(next, on, 250), { initialProps: { target, animate } })

  it('starts on its first value, without easing there', async () => {
    const { result } = await render(10, true)

    expect(result.current.value).toBe(10)
    expect(withTiming).not.toHaveBeenCalled()
  })

  it('eases each change after that, over the duration given', async () => {
    const { result, rerender } = await render(10, true)

    await rerender({ target: 20, animate: true })

    expect(withTiming).toHaveBeenCalledWith(20, { duration: 250 })
    expect(result.current.value).toBe(20)
  })

  // The page out of sight, or the system's Reduce Motion on.
  it('lands a change at once while animation is off, and the first change after it comes back on too', async () => {
    const { result, rerender } = await render(10, true)

    await rerender({ target: 30, animate: false })
    expect(result.current.value).toBe(30)
    await rerender({ target: 40, animate: true })
    expect(result.current.value).toBe(40)
    expect(withTiming).not.toHaveBeenCalled()

    await rerender({ target: 50, animate: true })
    expect(withTiming).toHaveBeenCalledWith(50, { duration: 250 })
  })

  it('never eases while animation is off from the start', async () => {
    const { result, rerender } = await render(10, false)

    await rerender({ target: 20, animate: false })

    expect(result.current.value).toBe(20)
    expect(withTiming).not.toHaveBeenCalled()
  })
})
