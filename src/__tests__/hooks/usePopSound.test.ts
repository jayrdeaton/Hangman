import { act, renderHook } from '@testing-library/react-native'
import { createAudioPlayer } from 'expo-audio'

import { usePopSound } from '@/hooks/usePopSound'
import { useSoundSettings } from '@/hooks/useSoundSettings'

jest.mock('@/hooks/useSoundSettings', () => ({ useSoundSettings: jest.fn() }))

const mockUseSoundSettings = jest.mocked(useSoundSettings)
// @rific/feedback-press/audio's useAudioPool builds its pool with createAudioPlayer (a plain
// factory), not the useAudioPlayer hook.
const mockCreateAudioPlayer = jest.mocked(createAudioPlayer)

// Same setTimeout(0)-plus-promise deferral as useClickSound.ts — see that test file's own
// comment on why a single awaited async act() (not a bare act() followed by a separate await) is
// what's actually needed to avoid corrupting the next test's own render in this file.
const popAndFlush = async (playPop: () => void, times = 1) => {
  await act(async () => {
    for (let i = 0; i < times; i++) playPop()
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

describe('usePopSound', () => {
  beforeEach(() => {
    mockCreateAudioPlayer.mockClear()
    mockUseSoundSettings.mockReturnValue({ settings: { enabled: true }, setEnabled: jest.fn() })
  })

  it('round-robins across its player pool for successive pops', async () => {
    const { result } = await renderHook(() => usePopSound())
    await flushPoolCreation()
    const players = mockCreateAudioPlayer.mock.results.map((r) => r.value)
    // useAudioPool now allocates exactly poolSize players (createAudioPlayer is a plain factory,
    // not a hook, so it's not bound to a fixed hook-call count) — usePopSound passes
    // poolSize: 4, so exactly 4 get created, all of which actively rotate.
    expect(players).toHaveLength(4)

    await popAndFlush(result.current.playPop, 5)

    expect(players[0].play).toHaveBeenCalledTimes(2)
    expect(players[1].play).toHaveBeenCalledTimes(1)
    expect(players[2].play).toHaveBeenCalledTimes(1)
    expect(players[3].play).toHaveBeenCalledTimes(1)
  })

  it('no-ops when sound is disabled', async () => {
    mockUseSoundSettings.mockReturnValue({ settings: { enabled: false }, setEnabled: jest.fn() })
    const { result } = await renderHook(() => usePopSound())
    await flushPoolCreation()
    const players = mockCreateAudioPlayer.mock.results.map((r) => r.value)
    expect(players).toHaveLength(4)

    await popAndFlush(result.current.playPop)

    expect(players.every((player) => player.play.mock.calls.length === 0)).toBe(true)
  })
})
