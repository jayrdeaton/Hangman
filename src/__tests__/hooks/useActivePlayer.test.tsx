import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { store } from '@/redux/store'
import { GUEST_PLAYER_KEY, guestSeatKey } from '@/utils/players'

const wrapper = ({ children }: { children: ReactNode }) => <ReduxProvider store={store}>{children}</ReduxProvider>

describe('useActivePlayer', () => {
  beforeEach(() => {
    store.dispatch(activePlayerActions.setActivePlayer(null))
  })

  it('is the guest until a profile is picked', async () => {
    const { result } = await renderHook(() => useActivePlayer(), { wrapper })

    expect(result.current).toEqual({ profileId: null, seatId: null, key: GUEST_PLAYER_KEY })
  })

  it('follows the active profile, keyed by its id', async () => {
    const { result } = await renderHook(() => useActivePlayer(), { wrapper })

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
    })

    expect(result.current).toEqual({ profileId: 'profile-a', seatId: null, key: 'profile-a' })
  })

  // Each Pass & Play guest seat is a player of its own, never Single Player's guest.
  it("follows a guest seat's own guest, keyed by the seat's id", async () => {
    const { result } = await renderHook(() => useActivePlayer(), { wrapper })

    await act(async () => {
      store.dispatch(activePlayerActions.setActivePlayer(null, 'p2'))
    })

    expect(result.current).toEqual({ profileId: null, seatId: 'p2', key: guestSeatKey('p2') })
    expect(result.current.key).toBe('guest-p2')
  })

  // Readers pass it to memoized children and effects, so it only changes with the player.
  it('hands back the same object until the player changes', async () => {
    const { result, rerender } = await renderHook(() => useActivePlayer(), { wrapper })
    const before = result.current

    await rerender({})
    expect(result.current).toBe(before)
  })
})
