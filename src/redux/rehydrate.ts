import type { UnknownAction } from '@reduxjs/toolkit'
import { REHYDRATE } from 'redux-persist'

// redux-persist's REHYDRATE for the root blob (store.ts's persistConfig, key 'root'), carrying every
// whitelisted slice's stored state by slice name. The round slice rehydrates under its own key, with
// its own sanitizer (its migrate), so that one is left alone here.
export type RootRehydrateAction = UnknownAction & { type: typeof REHYDRATE; key: 'root'; payload?: Record<string, unknown> }

// For the per-player slices' extraReducers: each sanitizes its own stored entry on this and returns a
// fresh object, which redux-persist's default reconciler (autoMergeLevel1) then keeps over the raw
// stored value, because the slice changed it. That is how a corrupt or older stored shape falls back to
// defaults instead of reaching a screen.
export const isRootRehydrate = (action: UnknownAction): action is RootRehydrateAction => action.type === REHYDRATE && (action as { key?: unknown }).key === 'root'
