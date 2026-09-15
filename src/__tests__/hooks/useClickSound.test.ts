import { useSoundSettings } from '@rific/feedback-press'
import { act, renderHook } from '@testing-library/react-native'
import { createAudioPlayer } from 'expo-audio'

import { useClickSound } from '@/hooks/useClickSound'

jest.mock('@rific/feedback-press', () => ({ ...jest.requireActual('@rific/feedback-press'), useSoundSettings: jest.fn() }))

const mockUseSoundSettings = jest.mocked(useSoundSettings)
// @rific/feedback-press/audio's useAudioPool builds its pool with createAudioPlayer (a plain
// factory), not the useAudioPlayer hook.
const mockCreateAudioPlayer = jest.mocked(createAudioPlayer)

// The setTimeout(0) deferral (see useClickSound.ts's own comment) means play()/seekTo() land a
// macrotask after playClick() returns, and seekTo() itself resolves a microtask later still — a
// single awaited async act() covering both the call and the wait is what's actually needed here:
// splitting them into a bare act() followed by a separate await leaves React's act-tracking in a
// state that silently breaks the NEXT test's own render in this file.
const clickAndFlush = async (playClick: () => void) => {
  await act(async () => {
    playClick()
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

// useAudioPool now defers actually building the pool behind its own setTimeout(0) inside a mount
// effect (see useAudioPool.ts's "Pool creation is pushed one tick out" comment) — renderHook only
// flushes synchronous effect work, so a real macrotask has to elapse before createAudioPlayer has
// been called at all, let alone before any test can read its mock call history off of it.
const flushPoolCreation = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe('useClickSound', () => {
  beforeEach(() => {
    mockCreateAudioPlayer.mockClear()
  })

  it('plays when sound is enabled', async () => {
    mockUseSoundSettings.mockReturnValue({ settings: { enabled: true }, set: jest.fn() })
    const { result } = await renderHook(() => useClickSound())
    await flushPoolCreation()
    const player = mockCreateAudioPlayer.mock.results[0].value

    await clickAndFlush(result.current.playClick)

    expect(player.seekTo).toHaveBeenCalledWith(0)
    expect(player.play).toHaveBeenCalledTimes(1)
  })

  it('no-ops when sound is disabled', async () => {
    mockUseSoundSettings.mockReturnValue({ settings: { enabled: false }, set: jest.fn() })
    const { result } = await renderHook(() => useClickSound())
    await flushPoolCreation()
    const player = mockCreateAudioPlayer.mock.results[0].value

    await clickAndFlush(result.current.playClick)

    expect(player.play).not.toHaveBeenCalled()
  })
})
