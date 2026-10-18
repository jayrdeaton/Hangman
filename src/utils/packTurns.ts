import { isSamePlayerTheme, resolvePlayerTheme } from '@/redux/playerThemeSlice'
import { selectSoloRound } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'

import { type PlayerKey, playerKeyFor, type PlayerRef } from './players'
import { packTurnRoundKey, pickNextTurn, seatPlayer } from './pnpSession'
import { isRoundPlayable } from './roundState'

// Pass & Play on the packs (Jay, 2026-10-18): with the word source on Packs the table takes turns,
// each turn one player's own solo round, from their own packs, difficulty and art, in their own solo
// slot (each guest seat has its own, utils/players.ts' guestSeatKey). The turn's seat is the round
// slice's pnp.session.turnId; the loadout's Ready plays it (the turn under way, or the next one, the
// fair pick), the game screen's PackTurnRound makes its player the active one and puts their round on
// the board (their waiting one, or a fresh draw: nothing is ever abandoned), the round counts once into
// the session's standings for the seat (roundSlice's recordPackTurn) and into the stats as that
// player's solo round (a guest's on the device's record), and the result card's Next starts the next
// turn.

// Who plays for a seat (pnpSession's seatPlayer: its profile while it's on the roster, or the seat's
// own guest). Undefined for a seat that isn't at the table, or no seat.
export const getSeatPlayer = (state: RootState, seatId: string | null): PlayerRef | undefined => {
  const seat = seatId ? state.round.pnp.session.players.find((player) => player.id === seatId) : undefined
  return seat ? seatPlayer(seat, state.profiles) : undefined
}

// The same player's key: a plain string, so a selector reading it only re-renders when it moves.
export const getSeatPlayerKey = (state: RootState, seatId: string | null): PlayerKey | undefined => {
  const player = getSeatPlayer(state, seatId)
  return player ? playerKeyFor(player.profileId, player.seatId) : undefined
}

// The pack turn's player, and their key (undefined with no turn).
export const getTurnPlayer = (state: RootState): PlayerRef | undefined => getSeatPlayer(state, state.round.pnp.session.turnId)
export const getTurnPlayerKey = (state: RootState): PlayerKey | undefined => getSeatPlayerKey(state, state.round.pnp.session.turnId)

// Whether the colors on screen are a player's own (resolvePlayerTheme), as Theme's PlayerThemeSync
// puts them there a render or two after the player becomes the active one. A guest with no colors kept
// keeps whatever is on screen, so for them they always are (a guest seat is given colors of its own
// before it's ever made the active player, see useProfiles' selectPlayer). The game screen waits for
// this before a turn's board first draws, so nothing is drawn for the player before them.
export const arePlayerColorsShown = (state: RootState, { profileId, seatId }: PlayerRef): boolean => {
  const profileColor = profileId ? (state.profiles.find((profile) => profile.id === profileId)?.color ?? null) : null
  const wanted = resolvePlayerTheme(state.playerTheme[playerKeyFor(profileId, seatId)], profileColor)
  return !wanted || isSamePlayerTheme(wanted, { color: state.theme.color, harmony: state.theme.harmony })
}

// Whether the table's pack turn is still under way: its seat is at the table and the turn hasn't been
// counted, or the round it counted is still unfinished on the board (its last guess lost to a
// relaunch), which is played out, counting nothing again. A turn that's been counted is over, even if
// its player has a new round waiting since (from Single Player): the next turn goes to the fair pick.
export const isPackTurnUnderWay = (state: RootState): boolean => {
  const { session } = state.round.pnp
  const playerKey = getTurnPlayerKey(state)
  if (playerKey === undefined) return false
  if (session.recordedTurnRound === null) return true
  const round = selectSoloRound(state.round, playerKey)
  return isRoundPlayable(round) && packTurnRoundKey(playerKey, round.id) === session.recordedTurnRound
}

// The pack turn Ready plays: the one under way, or the next one (the fair pick).
export type PackTurnPlan = { seatId: string; continues: boolean }

export const getPackTurnPlan = (state: RootState): PackTurnPlan => {
  const { session } = state.round.pnp
  if (session.turnId && isPackTurnUnderWay(state)) return { seatId: session.turnId, continues: true }
  return { seatId: pickNextTurn(session), continues: false }
}
