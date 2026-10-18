import AsyncStorage from '@react-native-async-storage/async-storage'
import { configureStore } from '@reduxjs/toolkit'
import type { Profile } from '@tastic/profile'
import { act, render } from '@testing-library/react-native'
import { useEffect } from 'react'
import { AppState, Text } from 'react-native'
import { Provider as ReduxProvider } from 'react-redux'
import { combineReducers } from 'redux'

import { CatalogProvider } from '@/hooks/useCatalog'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { type ProfilesActions, ProfilesProvider, SHARED_PROFILES_GROUP_ID, useProfilesActions } from '@/hooks/useProfiles'
import { DEFAULT_MODE } from '@/modes/registry'
import achievements, { achievementsActions } from '@/redux/achievementsSlice'
import activePlayer, { activePlayerActions } from '@/redux/activePlayerSlice'
import playerSettings, { playerSettingsActions } from '@/redux/playerSettingsSlice'
import playerTheme, { playerThemeActions } from '@/redux/playerThemeSlice'
import profiles from '@/redux/profilesSlice'
import round, { initialRoundState, roundActions, type RoundState } from '@/redux/roundSlice'
import { createDefaultProfileStats, createDefaultStats } from '@/utils/statsValidation'

// The fleet's shared roster, faked the way @tastic/profile's own tests fake it, here at its native
// end: the App Group module (`TasticProfile`) the package looks up through expo-modules-core, as an
// in-memory store. Everything above it is the package's real code: resolveInitialProfiles,
// useSharedProfilesSync and the shared store's reads and writes. Reads can be made to fail, as an
// unreadable App Group would.
type FakeAppGroup = { data: Map<string, string>; failReads: boolean; getSharedJSON: jest.Mock; setSharedJSON: jest.Mock }
jest.mock('expo-modules-core', () => {
  const actual = jest.requireActual('expo-modules-core')
  const appGroup: FakeAppGroup = {
    data: new Map<string, string>(),
    failReads: false,
    getSharedJSON: jest.fn(async (groupId: string, key: string): Promise<string | null> => {
      if (appGroup.failReads) throw new Error('unreadable')
      return appGroup.data.get(`${groupId}:${key}`) ?? null
    }),
    setSharedJSON: jest.fn(async (groupId: string, key: string, value: string): Promise<void> => {
      appGroup.data.set(`${groupId}:${key}`, value)
    })
  }
  return { ...actual, mockAppGroup: appGroup, requireOptionalNativeModule: (name: string) => (name === 'TasticProfile' ? appGroup : actual.requireOptionalNativeModule(name)) }
})
const { mockAppGroup: appGroup } = jest.requireMock('expo-modules-core') as { mockAppGroup: FakeAppGroup }

const SHARED_KEY = `${SHARED_PROFILES_GROUP_ID}:sharedProfiles`
const shareRoster = (roster: Profile[]) => appGroup.data.set(SHARED_KEY, JSON.stringify(roster))
const sharedRoster = (): Profile[] => JSON.parse(appGroup.data.get(SHARED_KEY) ?? '[]')

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }
const BOB: Profile = { id: 'profile-b', name: 'Bob', color: '#4caf50', tag: 'B', createdAt: 2, updatedAt: 2 }

// The slices ProfilesProvider and forgetting a player touch, with the store a launch would rehydrate:
// `roster` is this device's own copy of the roster, and `seatedId` holds the Pass & Play table's second
// seat, the way the coming seat picker will (there's no action for it yet).
const makeStore = ({ roster = [], seatedId = null }: { roster?: Profile[]; seatedId?: string | null } = {}) => {
  const { session } = initialRoundState.pnp
  const players = session.players.map((player, index) => (index === 1 ? { ...player, profileId: seatedId } : player))
  const roundState: RoundState = { ...initialRoundState, pnp: { ...initialRoundState.pnp, session: { ...session, players } } }
  return configureStore({ reducer: combineReducers({ achievements, activePlayer, playerSettings, playerTheme, profiles, round }), preloadedState: { profiles: roster, round: roundState } })
}
type TestStore = ReturnType<typeof makeStore>

// Everything Hangman keeps for Alice: her picks and colors, a waiting solo round, and a stats bucket
// with an achievement in it.
const seedAlice = (store: TestStore) => {
  store.dispatch(playerSettingsActions.setDifficulty({ playerKey: ALICE.id, difficulty: 'hard' }))
  store.dispatch(playerThemeActions.setPlayerTheme({ playerKey: ALICE.id, theme: { color: '#2196f3', harmony: 'triadic', profileColor: ALICE.color } }))
  store.dispatch(roundActions.startSolo({ playerKey: ALICE.id, puzzle: { phrase: 'CAT', modeId: DEFAULT_MODE.id, sourceMode: 'random' } }))
  store.dispatch(achievementsActions.update({ stats: { ...createDefaultStats(), profiles: { [ALICE.id]: createDefaultProfileStats() } }, unlocked: { [`${ALICE.id}:first_game_played`]: 1 } }))
}

// What's left of Alice in Hangman.
const aliceLeft = (store: TestStore) => {
  const state = store.getState()
  return {
    settings: state.playerSettings[ALICE.id],
    theme: state.playerTheme[ALICE.id],
    round: state.round.solo[ALICE.id],
    stats: state.achievements.stats.profiles[ALICE.id],
    unlocked: Object.keys(state.achievements.unlocked).filter((id) => id.startsWith(`${ALICE.id}:`))
  }
}
const ALICE_FORGOTTEN = { settings: undefined, theme: undefined, round: undefined, stats: undefined, unlocked: [] }
const seatProfiles = (store: TestStore) => store.getState().round.pnp.session.players.map((player) => player.profileId)

let actions: ProfilesActions | null = null
const Probe = () => {
  const value = useProfilesActions()
  useEffect(() => {
    actions = value
  }, [value])
  return <Text>ready</Text>
}

// ProfilesProvider where Providers.tsx has it: inside the catalog counters and GameStatsProvider,
// which forgetting a player clears the unlocked puzzles and stats through.
const renderProvider = (store: TestStore) =>
  render(
    <ReduxProvider store={store}>
      <CatalogProvider>
        <GameStatsProvider>
          <ProfilesProvider>
            <Probe />
          </ProfilesProvider>
        </GameStatsProvider>
      </CatalogProvider>
    </ReduxProvider>
  )

// The app coming back to the foreground, where the package reads the shared roster again.
const returnToForeground = async () => {
  const handlers = jest
    .mocked(AppState.addEventListener)
    .mock.calls.filter(([event]) => event === 'change')
    .map(([, handler]) => handler as (state: string) => void)
  await act(async () => {
    handlers.forEach((handler) => handler('active'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('ProfilesProvider', () => {
  let removeItem: jest.SpyInstance
  beforeEach(() => {
    jest.clearAllMocks()
    appGroup.data.clear()
    appGroup.failReads = false
    actions = null
    removeItem = jest.spyOn(AsyncStorage, 'removeItem')
  })
  afterEach(() => removeItem.mockRestore())

  describe('at launch', () => {
    it('holds every screen back until the roster is reconciled with the shared one', async () => {
      let resolveRead: (json: string | null) => void = () => {}
      appGroup.getSharedJSON.mockImplementationOnce(() => new Promise((resolve) => (resolveRead = resolve)))
      const screen = await renderProvider(makeStore())
      expect(screen.queryByText('ready')).toBeNull()

      await act(async () => resolveRead(null))

      expect(screen.getByText('ready')).toBeTruthy()
    })

    it("takes the shared roster over this device's copy once there is one", async () => {
      const store = makeStore({ roster: [ALICE] })
      shareRoster([ALICE, BOB])
      await renderProvider(store)

      expect(store.getState().profiles).toEqual([ALICE, BOB])
    })

    it("seeds an empty shared roster from this device's copy", async () => {
      const store = makeStore({ roster: [ALICE] })
      await renderProvider(store)

      expect(store.getState().profiles).toEqual([ALICE])
      expect(sharedRoster()).toEqual([ALICE])
    })

    // Deleted in another game: Hangman lets go of everything it kept for them.
    it('forgets a profile the shared roster no longer has: the guest plays, their seat stays as a guest, and nothing of theirs is left', async () => {
      const store = makeStore({ roster: [ALICE, BOB], seatedId: ALICE.id })
      seedAlice(store)
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      shareRoster([BOB])
      await renderProvider(store)

      expect(store.getState().profiles).toEqual([BOB])
      expect(store.getState().activePlayer.profileId).toBeNull()
      expect(aliceLeft(store)).toEqual(ALICE_FORGOTTEN)
      expect(removeItem).toHaveBeenCalledWith(`puzzle_unlocks_v1:${ALICE.id}`)
      expect(seatProfiles(store)).toEqual([null, null])
      expect(store.getState().round.pnp.session.players.map((player) => player.name)).toEqual(['Player 1', 'Player 2'])
    })

    it('forgets an active player or a seat holding a profile no roster has, and leaves everyone else alone', async () => {
      const store = makeStore({ roster: [BOB], seatedId: ALICE.id })
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      store.dispatch(playerSettingsActions.setDifficulty({ playerKey: BOB.id, difficulty: 'easy' }))
      shareRoster([BOB])
      await renderProvider(store)

      expect(store.getState().activePlayer.profileId).toBeNull()
      expect(seatProfiles(store)).toEqual([null, null])
      expect(store.getState().playerSettings[BOB.id]?.difficulty).toBe('easy')
    })

    // A failed read is not an empty roster: taking it as one would delete every profile from every game.
    it("keeps this device's roster, forgets nothing and writes nothing when the shared one can't be read", async () => {
      const store = makeStore({ roster: [ALICE] })
      seedAlice(store)
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      appGroup.failReads = true
      await renderProvider(store)

      expect(store.getState().profiles).toEqual([ALICE])
      expect(store.getState().activePlayer.profileId).toBe(ALICE.id)
      expect(aliceLeft(store).settings).toEqual({ modeId: DEFAULT_MODE.id, difficulty: 'hard', packKeys: null })
      expect(appGroup.setSharedJSON).not.toHaveBeenCalled()
    })
  })

  describe('changes here', () => {
    it("adds, renames and recolors a profile, mirroring the roster out to every game's", async () => {
      const store = makeStore()
      await renderProvider(store)

      let created: Profile | null = null
      await act(async () => {
        created = actions!.createProfile({ name: 'Cat', color: '#ff9800', tag: 'C' })
      })
      expect(store.getState().profiles).toEqual([created])
      expect(sharedRoster()).toEqual([created])

      await act(async () => actions!.updateProfile(created!.id, { name: 'Kit', color: '#009688', tag: 'K' }))
      expect(store.getState().profiles[0]).toMatchObject({ id: created!.id, name: 'Kit', color: '#009688', tag: 'K' })
      expect(sharedRoster()[0]).toMatchObject({ name: 'Kit', color: '#009688', tag: 'K' })
    })

    it('deletes a profile everywhere and forgets everything Hangman kept for them', async () => {
      const store = makeStore({ roster: [ALICE, BOB], seatedId: ALICE.id })
      shareRoster([ALICE, BOB])
      seedAlice(store)
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      await renderProvider(store)

      await act(async () => actions!.deleteProfile(ALICE.id))

      expect(store.getState().profiles).toEqual([BOB])
      expect(sharedRoster()).toEqual([BOB])
      expect(store.getState().activePlayer.profileId).toBeNull()
      expect(aliceLeft(store)).toEqual(ALICE_FORGOTTEN)
      expect(removeItem).toHaveBeenCalledWith(`puzzle_unlocks_v1:${ALICE.id}`)
      expect(seatProfiles(store)).toEqual([null, null])
    })

    it('picks who plays', async () => {
      const store = makeStore({ roster: [ALICE] })
      await renderProvider(store)

      await act(async () => actions!.selectPlayer(ALICE.id))
      expect(store.getState().activePlayer.profileId).toBe(ALICE.id)
      await act(async () => actions!.selectPlayer(null))
      expect(store.getState().activePlayer.profileId).toBeNull()
    })
  })

  describe("another game's changes", () => {
    it('picks up the shared roster on returning to the foreground, forgetting a profile deleted there', async () => {
      const store = makeStore({ roster: [ALICE, BOB] })
      shareRoster([ALICE, BOB])
      seedAlice(store)
      store.dispatch(activePlayerActions.setActivePlayer(ALICE.id))
      await renderProvider(store)
      expect(store.getState().activePlayer.profileId).toBe(ALICE.id)

      shareRoster([{ ...BOB, name: 'Bobby' }])
      await returnToForeground()

      expect(store.getState().profiles).toEqual([{ ...BOB, name: 'Bobby' }])
      expect(store.getState().activePlayer.profileId).toBeNull()
      expect(aliceLeft(store)).toEqual(ALICE_FORGOTTEN)
    })

    it('leaves the roster as it is when nothing changed, and when the read fails', async () => {
      const store = makeStore({ roster: [ALICE] })
      shareRoster([ALICE])
      await renderProvider(store)
      const before = store.getState().profiles

      await returnToForeground()
      expect(store.getState().profiles).toBe(before)

      appGroup.failReads = true
      await returnToForeground()
      expect(store.getState().profiles).toBe(before)
      expect(store.getState().profiles).toEqual([ALICE])
    })
  })
})
