import { createGate } from '@rific/splash-gate'

// Every async condition the very first screen depends on, named once here so nothing can be
// forgotten silently. See Theme.tsx (theme, fonts), KeyboardLayoutProvider.tsx (keyboardLayout) and
// useProfiles.tsx's ProfilesProvider (profiles: the roster reconciled with the fleet's shared one,
// which also holds every screen back until then) for where each one actually reports in. The player's
// art, difficulty and packs aren't gated: they live in redux (playerSettingsSlice), which has
// rehydrated before anything renders (PersistGate).
// Add a new gate here, and mark it ready from wherever it resolves, any time a future screen picks up
// a new async dependency of its own.
export const { markReady: markSplashReady, useReady: useSplashReady, pendingGates: pendingSplashGates, Gate: SplashGate } = createGate(['theme', 'fonts', 'keyboardLayout', 'profiles'] as const)
