import { render } from '@testing-library/react-native'
import * as haptics from 'expo-haptics'

import { FireworksCelebration } from '@/effects/FireworksCelebration'

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' }
}))

// @tastic/animations' own Fireworks owns the burst-spawning/timing logic now — this file only
// needs it to report a burst so FireworksCelebration's wiring (sound + haptic) can be observed.
jest.mock('@tastic/animations/fireworks', () => ({
  Fireworks: (props: { onBurst?: () => void }) => {
    props.onBurst?.()
    return null
  }
}))

const mockPlayPop = jest.fn()
jest.mock('@/hooks/usePopSound', () => ({ usePopSound: () => ({ playPop: mockPlayPop }) }))

const mockImpactAsync = jest.mocked(haptics.impactAsync)

const COLORS = ['#ff0000', '#00ff00', '#0000ff']

describe('FireworksCelebration', () => {
  beforeEach(() => {
    mockImpactAsync.mockClear()
    mockPlayPop.mockClear()
  })

  it('gives a light haptic pop when the wrapped Fireworks reports a burst, not the heavier style a correct-letter guess or the win itself uses', async () => {
    await render(<FireworksCelebration colors={COLORS} onComplete={jest.fn()} />)

    expect(mockImpactAsync).toHaveBeenCalledWith(haptics.ImpactFeedbackStyle.Light)
  })

  it('plays a pop sound when the wrapped Fireworks reports a burst', async () => {
    await render(<FireworksCelebration colors={COLORS} onComplete={jest.fn()} />)

    expect(mockPlayPop).toHaveBeenCalledTimes(1)
  })
})
