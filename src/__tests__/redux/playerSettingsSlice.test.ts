import { REHYDRATE } from 'redux-persist'

import { DEFAULT_MODE } from '@/modes/registry'
import reducer, { DEFAULT_PLAYER_SETTINGS, playerSettingsActions, type PlayerSettingsState, sanitizePlayerSettings } from '@/redux/playerSettingsSlice'
import { GUEST_PLAYER_KEY } from '@/utils/players'

type Action = Parameters<typeof reducer>[1]
const OTHER = 'profile-a'
const run = (actions: Action[], state: PlayerSettingsState = {}): PlayerSettingsState => actions.reduce<PlayerSettingsState>((next, action) => reducer(next, action), state)

describe('playerSettingsSlice', () => {
  it('starts with nobody having picked anything', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({})
  })

  it('defaults to the default art, any difficulty and every pack', () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({ modeId: DEFAULT_MODE.id, difficulty: 'any', packKeys: null })
  })

  it("files each pick under its player, starting from the defaults, and leaves everyone else's alone", () => {
    const next = run([playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: 'robot' }), playerSettingsActions.setDifficulty({ playerKey: OTHER, difficulty: 'hard' }), playerSettingsActions.setPackKeys({ playerKey: OTHER, packKeys: ['animals'] })])

    expect(next).toEqual({
      [GUEST_PLAYER_KEY]: { ...DEFAULT_PLAYER_SETTINGS, modeId: 'robot' },
      [OTHER]: { ...DEFAULT_PLAYER_SETTINGS, difficulty: 'hard', packKeys: ['animals'] }
    })
  })

  it('switches a selection back to every pack', () => {
    const next = run([playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: ['animals'] }), playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: null })])

    expect(next[GUEST_PLAYER_KEY].packKeys).toBeNull()
  })

  // The same state object back, so the persisted root blob isn't rewritten for nothing.
  it('is a no-op for a pick that changes nothing', () => {
    const before = run([playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'easy' })])

    expect(reducer(before, playerSettingsActions.setDifficulty({ playerKey: GUEST_PLAYER_KEY, difficulty: 'easy' }))).toBe(before)
  })

  it("removes one player's picks, and resets everyone's", () => {
    const before = run([playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: 'robot' }), playerSettingsActions.setMode({ playerKey: OTHER, modeId: 'candle' })])

    expect(reducer(before, playerSettingsActions.removePlayer(OTHER))).toEqual({ [GUEST_PLAYER_KEY]: before[GUEST_PLAYER_KEY] })
    expect(reducer(before, playerSettingsActions.reset())).toEqual({})
  })
})

describe('sanitizePlayerSettings', () => {
  it('passes valid entries through', () => {
    const state = { [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'medium', packKeys: ['animals', 'custom:abc'] }, [OTHER]: { modeId: 'classic', difficulty: 'any', packKeys: null } }

    expect(sanitizePlayerSettings(state)).toEqual(state)
  })

  it.each([
    ['an empty art id', { modeId: '' }, { modeId: DEFAULT_PLAYER_SETTINGS.modeId }],
    ['an art id that is not a string', { modeId: 3 }, { modeId: DEFAULT_PLAYER_SETTINGS.modeId }],
    ['an unknown difficulty', { difficulty: 'impossible' }, { difficulty: 'any' }],
    ['packs that are not a list of keys', { packKeys: ['animals', 7] }, { packKeys: null }],
    ['packs that are not a list at all', { packKeys: 'animals' }, { packKeys: null }]
  ])('puts the default back for %s, keeping the rest', (_label, broken, fixed) => {
    const entry = { modeId: 'robot', difficulty: 'hard', packKeys: ['animals'] }

    expect(sanitizePlayerSettings({ [GUEST_PLAYER_KEY]: { ...entry, ...broken } })).toEqual({ [GUEST_PLAYER_KEY]: { ...entry, ...fixed } })
  })

  it('drops an entry that is not an object, or sits under a key no player could have', () => {
    const entry = { modeId: 'robot', difficulty: 'hard', packKeys: null }

    expect(sanitizePlayerSettings({ [GUEST_PLAYER_KEY]: 'robot', 'profile:a': entry, '': entry, [OTHER]: entry })).toEqual({ [OTHER]: entry })
  })

  it.each([
    ['nothing stored', undefined],
    ['a list', [{ modeId: 'robot' }]],
    ['a string', 'robot']
  ])('starts fresh for %s', (_label, value) => {
    expect(sanitizePlayerSettings(value)).toEqual({})
  })

  it('runs on the root rehydrate, and not on the round one', () => {
    const stored = { [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'impossible', packKeys: null } }

    expect(reducer({}, { type: REHYDRATE, key: 'root', payload: { playerSettings: stored } })).toEqual({ [GUEST_PLAYER_KEY]: { modeId: 'robot', difficulty: 'any', packKeys: null } })
    const before = run([playerSettingsActions.setMode({ playerKey: GUEST_PLAYER_KEY, modeId: 'candle' })])
    expect(reducer(before, { type: REHYDRATE, key: 'round', payload: {} })).toBe(before)
  })
})
