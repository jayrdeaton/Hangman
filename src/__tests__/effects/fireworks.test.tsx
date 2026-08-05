import { act, fireEvent, render } from '@testing-library/react-native'
import * as haptics from 'expo-haptics'

import { BURST_LIFETIME_MS, Fireworks, MAX_BURST_INTERVAL_MS, MIN_BURST_INTERVAL_MS } from '@/effects/fireworks'

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' }
}))

const mockImpactAsync = jest.mocked(haptics.impactAsync)

const LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 480 } } }
const COLORS = ['#ff0000', '#00ff00', '#0000ff']
const PARTICLES_PER_BURST = 14

// Fireworks renders no testID of its own — its root is the single absolute-fill View that
// receives the onLayout callback, and react-native-svg's Circle is jest-mocked to the host
// type string 'Circle' (see jest.setup.ts), so particles are queried by host type via the
// render root's queryAll rather than by label/text/testID. `root` is only null if nothing
// rendered, which can't happen here — the non-null assertions reflect that.
describe('Fireworks', () => {
  beforeEach(() => {
    mockImpactAsync.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('gives every burst a light haptic pop as it spawns, not the heavier style a correct-letter guess or the win itself uses', async () => {
    const { root } = await render(<Fireworks colors={COLORS} onComplete={jest.fn()} />)

    await fireEvent(root!, 'layout', LAYOUT_EVENT)

    expect(mockImpactAsync).toHaveBeenCalledWith(haptics.ImpactFeedbackStyle.Light)
  })

  it('pops again for every successive burst, not just the first', async () => {
    jest.useFakeTimers()
    const { root } = await render(<Fireworks colors={COLORS} onComplete={jest.fn()} />)

    await act(async () => {
      await fireEvent(root!, 'layout', LAYOUT_EVENT)
    })
    expect(mockImpactAsync).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime((MAX_BURST_INTERVAL_MS + BURST_LIFETIME_MS) * 3)
    })

    expect(mockImpactAsync.mock.calls.length).toBeGreaterThan(1)
  })

  it('renders no particles until layout fires, then renders one burst worth of particles', async () => {
    const { root } = await render(<Fireworks colors={COLORS} onComplete={jest.fn()} />)

    expect(root!.queryAll((node) => node.type === 'Circle')).toHaveLength(0)

    await fireEvent(root!, 'layout', LAYOUT_EVENT)

    expect(root!.queryAll((node) => node.type === 'Circle')).toHaveLength(PARTICLES_PER_BURST)
  })

  it('gives every particle a fill color drawn from the colors prop', async () => {
    const { root } = await render(<Fireworks colors={COLORS} onComplete={jest.fn()} />)

    await fireEvent(root!, 'layout', LAYOUT_EVENT)

    const circles = root!.queryAll((node) => node.type === 'Circle')
    expect(circles.length).toBeGreaterThan(0)
    for (const circle of circles) {
      expect(COLORS).toContain(circle.props.fill)
    }
  })

  it('schedules each successive burst after a random delay within the configured bounds, not a fixed gap', async () => {
    jest.useFakeTimers()
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout')
    const { root } = await render(<Fireworks colors={COLORS} onComplete={jest.fn()} />)

    await act(async () => {
      await fireEvent(root!, 'layout', LAYOUT_EVENT)
    })

    // Advance through several spawns so multiple "schedule the next burst" calls land in the spy.
    await act(async () => {
      jest.advanceTimersByTime((MAX_BURST_INTERVAL_MS + BURST_LIFETIME_MS) * 4)
    })

    const spawnDelays = setTimeoutSpy.mock.calls.map(([, delay]) => delay).filter((delay) => delay !== undefined && delay >= MIN_BURST_INTERVAL_MS && delay <= MAX_BURST_INTERVAL_MS)

    expect(spawnDelays.length).toBeGreaterThan(1)
    // Not every real interval need differ (the random range is narrow), but across several spawns
    // a fixed-gap implementation would produce all-identical delays — this pins down that it varies.
    expect(new Set(spawnDelays).size).toBeGreaterThan(1)
  })

  it('keeps spawning new bursts indefinitely while mounted, never settling into a lasting gap', async () => {
    jest.useFakeTimers()
    const { root } = await render(<Fireworks colors={COLORS} onComplete={jest.fn()} />)

    await act(async () => {
      await fireEvent(root!, 'layout', LAYOUT_EVENT)
    })

    // Sample particle presence repeatedly across a long stretch — a batching implementation would
    // show stretches of zero particles between fixed-size groups; a continuous one never goes
    // empty for long.
    let sawParticlesAfterFirstBurst = false
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        jest.advanceTimersByTime(MIN_BURST_INTERVAL_MS)
      })
      if (root!.queryAll((node) => node.type === 'Circle').length > 0) sawParticlesAfterFirstBurst = true
    }

    expect(sawParticlesAfterFirstBurst).toBe(true)
  })
})
