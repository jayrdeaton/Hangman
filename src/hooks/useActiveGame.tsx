import { createContext, JSX, ReactNode, useContext, useMemo, useRef } from 'react'
import { useStore } from 'react-redux'

import { type PlayMode, roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'

// Solitaire's resume, for Hangman's two game screens. The persisted round slice remembers which game
// screen was open (activeMode); a cold launch reads it ONCE, here, and Home redirects straight into
// that game instead of showing itself (see src/app/index.tsx).
//
// One-shot on purpose: a live check in Home would bounce the player back into the game every time
// they went Home. And any game screen marking itself active (or being left) first cancels the pending
// resume, so a share link opened cold, followed by a trip Home, can't land in a stale game.
//
// The context value is built once and never changes, and reads/writes go straight to the store, so
// nothing re-renders when the active screen changes.
// A game to go back into, and the door whose loadout it goes back to (see gameHref).
export type ResumeTarget = { mode: PlayMode; door: PlayMode }

export type ActiveGame = {
  // The game to resume at launch, the first time it's asked; null every time after.
  consumeResume: () => ResumeTarget | null
  // The door is the game's own unless it's said.
  markActive: (mode: PlayMode, door?: PlayMode) => void
  clearActive: () => void
  // Drops the pending resume without touching the saved mode: a share link opened cold is where the
  // player meant to go, so Home afterward is Home, not the game the app was last closed on.
  cancelResume: () => void
}

const ActiveGameContext = createContext<ActiveGame>({ consumeResume: () => null, markActive: () => {}, clearActive: () => {}, cancelResume: () => {} })

// Must render inside PersistGate, so the slice has been rehydrated by the time this reads it.
export const ActiveGameProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const store = useStore<RootState>()
  // undefined until first read; read lazily (not at mount) so the value is the rehydrated one.
  const pendingRef = useRef<ResumeTarget | null | undefined>(undefined)

  const value = useMemo<ActiveGame>(
    () => ({
      consumeResume: () => {
        if (pendingRef.current === undefined) {
          const { activeMode, activeDoor } = store.getState().round
          pendingRef.current = activeMode ? { mode: activeMode, door: activeDoor ?? activeMode } : null
        }
        const target = pendingRef.current
        pendingRef.current = null
        return target
      },
      markActive: (mode, door = mode) => {
        pendingRef.current = null
        const { activeMode, activeDoor } = store.getState().round
        if (activeMode !== mode || activeDoor !== door) store.dispatch(roundActions.setActiveMode(mode, door))
      },
      clearActive: () => {
        pendingRef.current = null
        if (store.getState().round.activeMode !== null) store.dispatch(roundActions.setActiveMode(null))
      },
      cancelResume: () => {
        pendingRef.current = null
      }
    }),
    [store]
  )

  return <ActiveGameContext.Provider value={value}>{children}</ActiveGameContext.Provider>
}

export const useActiveGame = (): ActiveGame => useContext(ActiveGameContext)
