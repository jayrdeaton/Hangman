import { createProfileRecord, type Profile, type ProfileEditPatch, profilesActions, resolveInitialProfiles, useSharedProfilesSync } from '@tastic/profile'
import { createContext, type JSX, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { activePlayerActions } from '@/redux/activePlayerSlice'
import type { AppDispatch, RootState } from '@/redux/store'
import { SplashGate } from '@/utils/splashGate'

import { usePlayerData } from './usePlayerData'

// The App Group every @tastic game declares in app.json's ios.entitlements (Solitaire, BoxHockey,
// LightCycles, ...), and on the web the localStorage key prefix the games on games.infinitetoken.com
// share: a profile made in any of them shows up here, and one made here shows up there.
export const SHARED_PROFILES_GROUP_ID = 'group.com.infinitetoken.tastic'

export type ProfilesActions = {
  createProfile: (patch: ProfileEditPatch) => Profile
  updateProfile: (id: string, patch: ProfileEditPatch) => void
  // Removes the profile from the roster, every game's on the shared one, and forgets everything
  // Hangman kept for it (usePlayerData's forgetPlayer). Confirm before calling it.
  deleteProfile: (id: string) => void
  // Who plays now: a profile's id; or null and a Pass & Play guest seat's id for that seat's guest, or
  // null alone for Single Player's guest. Everything kept per player follows.
  selectPlayer: (profileId: string | null, seatId?: string | null) => void
}

const ProfilesActionsContext = createContext<ProfilesActions | null>(null)

// The roster, read straight from the store (the `profiles` slice), so a reader re-renders only when
// it changes.
export const useProfiles = (): Profile[] => useSelector((state: RootState) => state.profiles)

export const selectProfile = (state: RootState, profileId: string | null): Profile | null => (profileId ? (state.profiles.find((profile) => profile.id === profileId) ?? null) : null)

// The active player's profile, or null for a guest.
export const useActiveProfile = (): Profile | null => useSelector((state: RootState) => selectProfile(state, state.activePlayer.profileId))

// Keeps the device's roster (the `profiles` slice) in step with the fleet's shared one, Solitaire's
// ProfilesProvider: reconciled once at launch (resolveInitialProfiles: the shared roster wins once
// there is one, and this device's seeds it when there isn't), mirrored out after every change here,
// and picked up again when another game changes it (useSharedProfilesSync: on returning to the
// foreground, and on the web the moment another tab saves). A profile that's gone from the roster that
// comes in, the active player's or a Pass & Play seat's included, is forgotten (usePlayerData's
// forgetPlayer: Single Player's guest takes over), so nothing is left pointing at a profile that no
// longer exists. At launch it also clears the unlocked puzzles of any Pass & Play guest seat no longer
// at the table (usePlayerData's clearLeftGuestSeats).
//
// Inside PersistGate (the local roster has rehydrated) and inside GameStatsProvider and CatalogProvider
// (forgetting a player clears their stats and unlocked puzzles). Holds every screen back, with the
// splash up, until the launch reconcile is in, so nothing renders a player that's about to be
// forgotten. Only the stable actions go through context; the roster is read from the store.
export const ProfilesProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const dispatch = useDispatch<AppDispatch>()
  const store = useStore<RootState>()
  const { forgetPlayer, colorGuestSeats, clearLeftGuestSeats } = usePlayerData()
  const [loaded, setLoaded] = useState(false)

  // Takes a roster from outside (the launch reconcile, another game's change): only a real change is
  // dispatched (a remote read is always a fresh array, and an unconditional setAll would re-render
  // every reader on every return to the foreground), then everyone Hangman holds by profile id whom it
  // no longer has is forgotten: the profiles this device had, the active player and every Pass & Play
  // seat.
  const applyRoster = useCallback(
    (roster: Profile[]) => {
      const state = store.getState()
      const previous = state.profiles
      if (JSON.stringify(roster) !== JSON.stringify(previous)) dispatch(profilesActions.setAll(roster))
      const kept = new Set(roster.map((profile) => profile.id))
      const held = new Set([...previous.map((profile) => profile.id), state.activePlayer.profileId, ...state.round.pnp.session.players.map((player) => player.profileId)])
      for (const profileId of held) if (profileId && !kept.has(profileId)) void forgetPlayer(profileId)
    },
    [store, dispatch, forgetPlayer]
  )

  // Once per mount, against the rehydrated local roster: the empty dependency list is deliberate (the
  // dispatches inside would otherwise run it again). A read that fails resolves to the local roster
  // (see resolveInitialProfiles), so this always lets the screens through.
  useEffect(() => {
    let cancelled = false
    const finish = () => {
      if (!cancelled) setLoaded(true)
    }
    void clearLeftGuestSeats()
    resolveInitialProfiles(SHARED_PROFILES_GROUP_ID, store.getState().profiles).then((resolved) => {
      if (cancelled) return
      applyRoster(resolved)
      finish()
    }, finish)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, see above
  }, [])

  const { syncToShared } = useSharedProfilesSync({ groupId: SHARED_PROFILES_GROUP_ID, onRemoteChange: applyRoster })

  // Each change lands in the store first, then the store's roster is mirrored out, so the callbacks
  // never close over a roster and stay stable.
  const createProfile = useCallback(
    (patch: ProfileEditPatch) => {
      const record = createProfileRecord(patch)
      dispatch(profilesActions.add(record))
      syncToShared(store.getState().profiles)
      return record
    },
    [dispatch, store, syncToShared]
  )
  // A new color for the profile lapses its Hangman colors (see playerThemeSlice's resolvePlayerTheme),
  // so nothing else is needed here.
  const updateProfile = useCallback(
    (id: string, patch: ProfileEditPatch) => {
      dispatch(profilesActions.update({ id, patch }))
      syncToShared(store.getState().profiles)
    },
    [dispatch, store, syncToShared]
  )
  const deleteProfile = useCallback(
    (id: string) => {
      dispatch(profilesActions.remove(id))
      syncToShared(store.getState().profiles)
      void forgetPlayer(id)
    },
    [dispatch, store, syncToShared, forgetPlayer]
  )
  // A guest seat is given colors of its own before it first plays (utils/guestSeats.ts), so Theme's
  // PlayerThemeSync never files the colors already on screen as theirs.
  const selectPlayer = useCallback(
    (profileId: string | null, seatId: string | null = null) => {
      if (!profileId && seatId) colorGuestSeats()
      dispatch(activePlayerActions.setActivePlayer(profileId, seatId))
    },
    [dispatch, colorGuestSeats]
  )

  const actions = useMemo(() => ({ createProfile, updateProfile, deleteProfile, selectPlayer }), [createProfile, updateProfile, deleteProfile, selectPlayer])

  return (
    <ProfilesActionsContext.Provider value={actions}>
      <SplashGate gate='profiles' ready={loaded}>
        {children}
      </SplashGate>
    </ProfilesActionsContext.Provider>
  )
}

export const useProfilesActions = (): ProfilesActions => {
  const context = useContext(ProfilesActionsContext)
  if (!context) throw new Error('useProfilesActions must be used within a ProfilesProvider')
  return context
}
