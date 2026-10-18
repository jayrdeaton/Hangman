import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { profilesActions } from '@tastic/profile'

import type { PuzzleSourceMode } from '@/types/gameSession'
import { isProfileId, type PlayerKey, playerKeyFor } from '@/utils/players'
import { createDefaultPnpSession, createPlayer, getStanding, guestName, MAX_PNP_PLAYERS, MIN_PNP_PLAYERS, normalizePlayerName, numberGuests, packTurnRoundKey, pickFairGuesser, pickNextTurn, type PnpSession, seatAfterRemoved, type SeatedProfile, type WordSource } from '@/utils/pnpSession'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

export type { SeatedProfile } from '@/utils/pnpSession'

// Two things share these two names: Home's two doors into the loadout (Single Player, one player; Pass
// & Play, two to eight at the table), and the game screen's two games (see src/app/game.tsx), a
// player's own round from the packs ('solo') and a table writing words for each other ('pnp'). Each
// game keeps its own round, so a written word never touches the solo rounds left waiting. A door
// usually plays its own game, but not always: the Pass & Play table on the packs takes turns playing
// solo rounds, each player their own (a pack turn, see utils/packTurns.ts), the solo game played from
// the Pass & Play door, and navigation.ts's gameHref says which door a game goes back to.
export type PlayMode = 'solo' | 'pnp'

// Pass and play is a three-beat loop: a word is written, handed off, then guessed. Who is playing, and
// how they've done this session, is the round's session (utils/pnpSession.ts).
export type PnpPhase = 'authoring' | 'handoff' | 'playing'

// A GameStartPayload with its art saved by id: GameMode carries a React component, so it can't be
// persisted itself. Resolved back with findMode (see utils/roundState.ts).
export type SavedPuzzle = {
  phrase: string
  modeId: string
  sourceMode: PuzzleSourceMode
  hint?: string
  packKey?: string
  packLabel?: string
  puzzleId?: string
  difficultyTier?: PuzzleDifficultyTier
  packScope?: 'single' | 'selection'
}

export type SavedRound = {
  // Bumped for every new round. Game is keyed on it, so a new round always remounts it: two puzzles
  // in a row can normalize to the same phrase, and keying on the phrase would carry one round's
  // guesses, outcome and celebration into the next.
  id: number
  puzzle: SavedPuzzle | null
  guessedLetters: string[]
  hintRevealed: boolean
}

// `draft` is the word and hint being typed while composing, kept so leaving the prompt (or the app)
// doesn't throw them away. Only present while there's something typed.
export type PnpDraft = { answer: string; hint: string }
// `session` is the table playing it: the players, their standings, where the words come from, who
// writes and guesses this word, whose pack turn it is, and the seat the loadout shows.
export type PnpRound = SavedRound & { phase: PnpPhase | null; draft?: PnpDraft; session: PnpSession }

export type RoundState = {
  // Each player's waiting solo round, by player key (utils/players.ts): switching players switches the
  // board too. A player who has never had a solo round has no entry (selectSoloRound reads one as an
  // empty round).
  solo: Record<PlayerKey, SavedRound>
  // The one Pass & Play round on the device, with the session playing it.
  pnp: PnpRound
  // The game screen that was open when the app last went away, and the door it was played from. Read
  // once at a cold launch to skip Home and go straight back into that game (see useActiveGame), the
  // way Solitaire resumes.
  activeMode: PlayMode | null
  activeDoor: PlayMode | null
}

export type RoundProgress = { guessedLetters: string[]; hintRevealed: boolean }

type PlayerPayload<T> = PayloadAction<{ playerKey: PlayerKey } & T>

const emptyRound = (id: number): SavedRound => ({ id, puzzle: null, guessedLetters: [], hintRevealed: false })

// What a player with no solo round saved reads: one constant, so a selector reading it doesn't hand
// its component a new object every time.
const NO_SOLO_ROUND: SavedRound = Object.freeze(emptyRound(0)) as SavedRound

export const selectSoloRound = (round: RoundState, playerKey: PlayerKey): SavedRound => round.solo[playerKey] ?? NO_SOLO_ROUND

export const initialRoundState: RoundState = {
  solo: {},
  pnp: { ...emptyRound(0), phase: null, session: createDefaultPnpSession() },
  activeMode: null,
  activeDoor: null
}

// A player's next round id. Ids only have to differ within one player's slot: the game screen keys its
// board on the player as well (see GameScreen's SavedBoard).
const nextSoloId = (state: RoundState, playerKey: PlayerKey): number => (state.solo[playerKey]?.id ?? 0) + 1

// Whether the Pass & Play round on the board was decided and counted: its guesser writes next.
const isResultIn = (pnp: PnpRound): boolean => pnp.session.recordedRoundId === pnp.id

// Whether the next word's guesser can still be picked: nothing handed off or in play yet.
const isPickOpen = (pnp: PnpRound): boolean => pnp.phase === null || pnp.phase === 'authoring'

// A blank prompt for the next word, under the next id (whatever was on screen before, the round just
// finished, its outcome and celebration, shouldn't carry into the composing screen), for the fair pick.
const openPrompt = (pnp: PnpRound): void => {
  pnp.id += 1
  pnp.puzzle = null
  pnp.guessedLetters = []
  pnp.hintRevealed = false
  pnp.phase = 'authoring'
  delete pnp.draft
  pnp.session.guesserId = pickFairGuesser(pnp.session, pnp.session.writerId)
}

// A session's standings cleared, the first seat writing next, and no pack turn played yet (so the next
// one starts the rotation over from the first seat).
const clearStandings = (session: PnpSession): void => {
  session.standings = {}
  session.recordedRoundId = null
  session.writerId = session.players[0].id
  session.turnId = null
  session.recordedTurnRound = null
}

// The roster's names copied onto the seats holding its profiles (a profile on no seat, or a seat whose
// profile isn't on it, changes nothing). A name that normalizes to nothing keeps the copy it had.
const syncSeatNames = (session: PnpSession, profiles: SeatedProfile[]): void => {
  for (const player of session.players) {
    const profile = player.profileId ? profiles.find((item) => item.id === player.profileId) : undefined
    const name = profile ? normalizePlayerName(profile.name) : ''
    if (name && name !== player.name) player.name = name
  }
}

const roundSlice = createSlice({
  name: 'round',
  initialState: initialRoundState,
  reducers: {
    startSolo: (state, action: PlayerPayload<{ puzzle: SavedPuzzle }>) => {
      const { playerKey, puzzle } = action.payload
      state.solo[playerKey] = { ...emptyRound(nextSoloId(state, playerKey)), puzzle }
    },
    clearSolo: (state, action: PayloadAction<PlayerKey>) => {
      state.solo[action.payload] = emptyRound(nextSoloId(state, action.payload))
    },
    saveSoloProgress: (state, action: PlayerPayload<RoundProgress>) => {
      const slot = state.solo[action.payload.playerKey]
      if (!slot) return
      slot.guessedLetters = action.payload.guessedLetters
      slot.hintRevealed = action.payload.hintRevealed
    },
    // A forgotten profile's waiting round, or a guest seat's once the seat has left the table (see
    // usePlayerData's forgetPlayer and forgetGuestSeat).
    removeSolo: (state, action: PayloadAction<PlayerKey>) => {
      delete state.solo[action.payload]
    },
    // A forgotten profile's Pass & Play seats stay at the table as guests, named for their seats, so the
    // session's standings, writer and guesser carry on unchanged; each seat's own guest plays there now,
    // with whatever that guest had kept from before the profile sat down.
    clearPnpProfile: (state, action: PayloadAction<string>) => {
      const { players } = state.pnp.session
      for (const player of players) if (player.profileId === action.payload) player.profileId = null
      numberGuests(players)
    },
    // Who sits in a seat: a profile (one seat each, so a profile already seated elsewhere changes
    // nothing; the loadout's picker won't offer one), or null to hand the seat back to a guest, named
    // for the seat (Player 2 for the second).
    //
    // The seat's standing, and its turn as writer or guesser, stay with the seat whoever sits there (the
    // loadout asks first when there's a standing to hand over). Stats already recorded stay with whoever
    // played those rounds; the seat's next round counts toward whoever sits there then. The seat's own
    // guest's art, colors and the rest are kept while a profile sits there, so handing the seat back to
    // a guest brings them back.
    setPnpSeatProfile: (state, action: PayloadAction<{ id: string; profile: SeatedProfile | null }>) => {
      const { players } = state.pnp.session
      const { id, profile } = action.payload
      const index = players.findIndex((item) => item.id === id)
      const player = players[index]
      if (!player || (player.profileId ?? null) === (profile?.id ?? null)) return
      if (profile) {
        const name = normalizePlayerName(profile.name)
        if (!isProfileId(profile.id) || !name || players.some((other) => other.profileId === profile.id)) return
        player.profileId = profile.id
        player.name = name
      } else {
        player.profileId = null
        player.name = guestName(index)
      }
    },
    // The seat the loadout shows, whose player is the active player there (see LoadoutScreen).
    focusPnpSeat: (state, action: PayloadAction<string>) => {
      const { session } = state.pnp
      if (session.players.some((player) => player.id === action.payload)) session.focusedId = action.payload
    },
    // Where the table's words come from: the packs, or the players write them.
    setPnpSource: (state, action: PayloadAction<WordSource>) => {
      state.pnp.session.source = action.payload
    },
    // A fresh, blank board for the next word. When the round on the board was decided (its result is
    // in the standings), whoever guessed it writes this one: the session moves around the table here, at
    // the next prompt, rather than the moment the round ended, so a round resumed mid-guess after a
    // relaunch still has its own writer and guesser.
    startPnpAuthoring: (state) => {
      const { pnp } = state
      if (isResultIn(pnp)) pnp.session.writerId = pnp.session.guesserId
      openPrompt(pnp)
    },
    // No id bump: Game has been mounted (and locked) since composing began, already drawing this
    // exact word live, so finalizing it remounts nothing and there's nothing left to flicker.
    setPnpDraft: (state, action: PayloadAction<PnpDraft>) => {
      if (action.payload.answer || action.payload.hint) state.pnp.draft = action.payload
      else delete state.pnp.draft
    },
    // The writer's own pick of who the word is for (the prompt's For row), in place of the fair pick.
    // Only while the word is still being written, and never the writer.
    setPnpGuesser: (state, action: PayloadAction<string>) => {
      const { pnp } = state
      if (!isPickOpen(pnp) || action.payload === pnp.session.writerId || !pnp.session.players.some((player) => player.id === action.payload)) return
      pnp.session.guesserId = action.payload
    },
    // The guesser is whoever is picked by now (setPnpGuesser, or the fair pick).
    setPnpWord: (state, action: PayloadAction<SavedPuzzle>) => {
      delete state.pnp.draft
      state.pnp.puzzle = action.payload
      state.pnp.guessedLetters = []
      state.pnp.hintRevealed = false
      state.pnp.phase = 'handoff'
    },
    startPnpPlaying: (state) => {
      state.pnp.phase = 'playing'
    },
    savePnpProgress: (state, action: PayloadAction<RoundProgress>) => {
      state.pnp.guessedLetters = action.payload.guessedLetters
      state.pnp.hintRevealed = action.payload.hintRevealed
    },
    // The round on the board just ended: one more word for its guesser, and one more solved on a win.
    // Counted once per round id, so its end being reported again (the round resumed after a relaunch
    // that came between the count and the last guess being saved) counts nothing.
    recordPnpResult: (state, action: PayloadAction<{ roundId: number; result: 'win' | 'loss' }>) => {
      const { pnp } = state
      const { roundId, result } = action.payload
      if (roundId !== pnp.id || pnp.phase !== 'playing' || !pnp.puzzle || isResultIn(pnp)) return
      const { guesserId } = pnp.session
      const { played, wins } = getStanding(pnp.session, guesserId)
      pnp.session.standings[guesserId] = { played: played + 1, wins: result === 'win' ? wins + 1 : wins }
      pnp.session.recordedRoundId = roundId
    },
    // The next pack turn (the table on the packs, see utils/packTurns.ts): the fair pick around the
    // table after the last turn's seat (pickNextTurn), its round still to be counted. Whose solo round it
    // plays is the game screen's to put on the board (their waiting one, or a fresh draw).
    startPackTurn: (state) => {
      const { session } = state.pnp
      session.turnId = pickNextTurn(session)
      session.recordedTurnRound = null
    },
    // The pack turn's round just ended: one more word for the turn's seat, and one more solved on a win.
    // Counted once per turn, so its end being reported again (the round resumed after a relaunch that
    // came between the count and the last guess being saved) counts nothing. The round is kept by its
    // player's key as well as its id, since solo round ids only differ within one player's slot: one
    // player's round 3 is never mistaken for another's.
    recordPackTurn: (state, action: PlayerPayload<{ roundId: number; result: 'win' | 'loss' }>) => {
      const { session } = state.pnp
      const { playerKey, roundId, result } = action.payload
      const slot = state.solo[playerKey]
      const { turnId } = session
      if (!turnId || !session.players.some((player) => player.id === turnId) || session.recordedTurnRound !== null || !slot?.puzzle || slot.id !== roundId) return
      const { played, wins } = getStanding(session, turnId)
      session.standings[turnId] = { played: played + 1, wins: result === 'win' ? wins + 1 : wins }
      session.recordedTurnRound = packTurnRoundKey(playerKey, roundId)
    },
    // A new session (the loadout's New session, and its Ready with nothing under way): the same table
    // with the standings cleared, the first seat writing a fresh word.
    startPnpSession: (state) => {
      clearStandings(state.pnp.session)
      openPrompt(state.pnp)
    },
    // End Session, once its standings card is closed, from a written word's card or a pack turn's: the
    // standings cleared and nothing in play (a written word left waiting goes too, as with New session),
    // the same table kept for next time. The finished round stays drawn (no new id, the board keeps its
    // word) while the game screen leaves, and the next visit starts a prompt for the first seat, or the
    // first seat's pack turn.
    endPnpSession: (state) => {
      const { pnp } = state
      clearStandings(pnp.session)
      pnp.session.guesserId = pickFairGuesser(pnp.session, pnp.session.writerId)
      pnp.phase = null
      delete pnp.draft
    },
    // A new guest seat at the end of the table, up to MAX_PNP_PLAYERS. With the next word not written
    // yet, the fair pick is made again, since the newcomer has guessed nothing.
    addPnpPlayer: (state) => {
      const { session } = state.pnp
      if (session.players.length >= MAX_PNP_PLAYERS) return
      session.players.push(createPlayer(session.players))
      if (isPickOpen(state.pnp)) session.guesserId = pickFairGuesser(session, session.writerId)
    },
    // A seat leaves, down to MIN_PNP_PLAYERS, and their standing with them; the guests after it move up
    // a seat, and a number (their own art and colors go with them: they're kept by seat id, not number).
    // What the seat's own guest kept is forgotten with the seat, by usePlayerData's forgetGuestSeat. If they were writing the next word, the seat after theirs writes it instead,
    // and if the loadout was showing them, it shows the seat that took their place (the one before, for
    // the last seat). A word waiting on the board with them as its writer or guesser can't go on, so
    // it's replaced by a blank prompt; one that has nothing to do with them stays. Their pack turn, under
    // way or just played, ends with them (its round stays in their own solo slot, nothing lost), and the
    // next goes to the fair pick, ties from the first seat.
    removePnpPlayer: (state, action: PayloadAction<string>) => {
      const { pnp } = state
      const { session } = pnp
      const index = session.players.findIndex((player) => player.id === action.payload)
      if (index < 0 || session.players.length <= MIN_PNP_PLAYERS) return
      const removedId = action.payload
      const resultIn = isResultIn(pnp)
      // Once the round on the board is decided, its guesser is the one writing next (startPnpAuthoring).
      const nextWriterId = resultIn ? session.guesserId : session.writerId
      const inWaitingWord = !resultIn && pnp.phase !== null && (session.writerId === removedId || (pnp.phase !== 'authoring' && session.guesserId === removedId))
      session.players.splice(index, 1)
      numberGuests(session.players)
      delete session.standings[removedId]
      session.writerId = nextWriterId === removedId ? seatAfterRemoved(session.players, index) : nextWriterId
      if (session.focusedId === removedId) session.focusedId = session.players[Math.min(index, session.players.length - 1)].id
      if (session.turnId === removedId) {
        session.turnId = null
        session.recordedTurnRound = null
      }
      // The move around the table the decided round was waiting for is made here, with the new table.
      if (resultIn) session.recordedRoundId = null
      if (inWaitingWord) openPrompt(pnp)
      else if (resultIn || isPickOpen(pnp)) session.guesserId = pickFairGuesser(session, session.writerId)
    },
    // The art is purely cosmetic, so a player's new pick applies to their own waiting solo round, and to
    // the Pass & Play word waiting for them to guess (from the hand-off on the board is the guesser's), as
    // well as to future ones.
    setRoundArt: (state, action: PlayerPayload<{ modeId: string }>) => {
      const { playerKey, modeId } = action.payload
      const solo = state.solo[playerKey]
      if (solo?.puzzle) solo.puzzle.modeId = modeId
      const { pnp } = state
      const guesser = pnp.session.players.find((player) => player.id === pnp.session.guesserId)
      if (pnp.puzzle && guesser && playerKeyFor(guesser.profileId, guesser.id) === playerKey) pnp.puzzle.modeId = modeId
    },
    // The game screen open now (null for none), and the door it was played from: the game's own unless
    // it's said.
    setActiveMode: {
      reducer: (state, action: PayloadAction<{ mode: PlayMode | null; door: PlayMode | null }>) => {
        state.activeMode = action.payload.mode
        state.activeDoor = action.payload.mode ? action.payload.door : null
      },
      prepare: (mode: PlayMode | null, door?: PlayMode) => ({ payload: { mode, door: door ?? mode } })
    },
    reset: () => initialRoundState
  },
  // The seats keep their profiles' names in step with the roster (syncSeatNames), however it changes:
  // a rename on the Profiles screen, or a roster brought in from another game (ProfilesProvider's
  // setAll). Nothing changes, and nothing is saved again, when no seated profile's name moved.
  extraReducers: (builder) => {
    builder
      .addMatcher(profilesActions.setAll.match, (state, action) => syncSeatNames(state.pnp.session, action.payload))
      .addMatcher(profilesActions.update.match, (state, action) => {
        const { id, patch } = action.payload
        if (patch.name !== undefined) syncSeatNames(state.pnp.session, [{ id, name: patch.name }])
      })
  }
})

export const roundActions = roundSlice.actions
export default roundSlice.reducer
