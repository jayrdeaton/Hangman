import { render } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'

import PlayRoute from '@/app/play'
import { robotMode } from '@/modes/registry'

// /play keys its screen on the link itself: a second link opened while PlayScreen is still asking
// about the first (its Abandon card, say) reuses the route with new params, and has to get a fresh
// screen rather than the first link's. PlayScreen stands in here as a component that counts its own
// mounts and unmounts, so that's read straight off the counts; what it does with a link is
// PlayScreen's own suite. The params come from the shared expo-router mock's useLocalSearchParams.
const mockMounts = jest.fn()
const mockUnmounts = jest.fn()
jest.mock('@/components/PlayScreen', () => {
  const { useEffect } = require('react')
  return {
    PlayScreen: () => {
      useEffect(() => {
        mockMounts()
        return () => mockUnmounts()
      }, [])
      return null
    }
  }
})

const mockParams = jest.mocked(useLocalSearchParams)
const LINK = { phrase: 'Hello, World', hint: 'A friendly greeting', mode: robotMode.id }

// A new params object every time, as the router hands over on every render.
const renderLink = (params: Record<string, string>) => {
  mockParams.mockReturnValue({ ...params })
  return render(<PlayRoute />)
}

type Screen = Awaited<ReturnType<typeof renderLink>>

const openLink = async (screen: Screen, params: Record<string, string>) => {
  mockParams.mockReturnValue({ ...params })
  await screen.rerender(<PlayRoute />)
}

describe('the play route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('mounts one PlayScreen for a link', async () => {
    await renderLink(LINK)

    expect(mockMounts).toHaveBeenCalledTimes(1)
    expect(mockUnmounts).not.toHaveBeenCalled()
  })

  // The route re-renders whenever the router does; the same link must not start its request over.
  it('keeps the same PlayScreen when it re-renders with the same link', async () => {
    const screen = await renderLink(LINK)

    await openLink(screen, LINK)
    await openLink(screen, LINK)

    expect(mockMounts).toHaveBeenCalledTimes(1)
    expect(mockUnmounts).not.toHaveBeenCalled()
  })

  const { hint: _hint, ...LINK_WITHOUT_HINT } = LINK
  it.each([
    ['another phrase', { ...LINK, phrase: 'Goodbye' }],
    ['another hint', { ...LINK, hint: 'A farewell' }],
    ['other art', { ...LINK, mode: 'classic' }],
    ['the same phrase with no hint', LINK_WITHOUT_HINT]
  ])('swaps in a fresh PlayScreen for a link with %s', async (_kind, next) => {
    const screen = await renderLink(LINK)

    await openLink(screen, next)

    expect(mockMounts).toHaveBeenCalledTimes(2)
    expect(mockUnmounts).toHaveBeenCalledTimes(1)
  })

  // Every link is its own request, even one the player already opened before another.
  it('swaps in a fresh PlayScreen when the first link comes back after another', async () => {
    const screen = await renderLink(LINK)

    await openLink(screen, { ...LINK, phrase: 'Goodbye' })
    await openLink(screen, LINK)

    expect(mockMounts).toHaveBeenCalledTimes(3)
    expect(mockUnmounts).toHaveBeenCalledTimes(2)
  })
})
