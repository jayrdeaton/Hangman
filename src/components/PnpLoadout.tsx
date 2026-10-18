import { Button, Card, IconButton } from '@rific/feedback-press'
import { ScrollView } from '@rific/scroll-view'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { type Profile, ProfileChip, ProfilePicker } from '@tastic/profile'
import { router } from 'expo-router'
import { JSX, useCallback, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Avatar, Switch, Text, useTheme } from 'react-native-paper'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { useProfiles } from '@/hooks/useProfiles'
import { roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import { gameHref } from '@/utils/navigation'
import { getSeatIdentity, getStanding, getStandingRows, guestNameForSeat, hasStandings, MAX_PNP_PLAYERS, MIN_PNP_PLAYERS, type PnpPlayer, rankStandingRows } from '@/utils/pnpSession'
import { getPnpRemovalLoss, isRoundPlayable } from '@/utils/roundState'

import { LoadoutPressAway, LoadoutShell, SectionLabel, useLoadoutPopoverHost } from './LoadoutShell'
import { PackRow } from './PackRow'
import { PnpPlayerNameDialog } from './PnpPlayerNameDialog'
import { PnpStandingsList } from './PnpStandings'

// The 4pt slop the header's icon buttons use, for 48pt targets on the rows' 40pt buttons.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// A seat's picker opens as `${seatPickerIdPrefix(id)}-profile` (@tastic/profile's ProfilePicker).
const seatPickerIdPrefix = (seatId: string): string => `pnp-seat-${seatId}`

// What the remove confirm says a player leaving would take with them (see getPnpRemovalLoss).
const removalMessage = ({ standing, word }: { standing: boolean; word: boolean }): string => [standing ? 'Their standing this session goes with them.' : '', word ? 'The word waiting on the board goes too.' : ''].filter(Boolean).join(' ')

type SeatRowProps = {
  seat: PnpPlayer
  profiles: Profile[]
  // Every profile seated at the table: none of them can sit in a second seat.
  seatedIds: string[]
  canRemove: boolean
  onPick: (seatId: string, profile: Profile | null) => void
  onRename: (seatId: string) => void
  onRemove: (seatId: string) => void
}

const handleManage = () => router.push('/profiles')

// One seat, once there's a profile on the roster to seat: its chip (the guest's plain account badge
// for a guest), then who sits there as @tastic/profile's ProfilePicker, the seat's name as its trigger
// (Guest, every profile, Manage), then rename (a guest only: a profile goes by its own name) and
// remove. Every control is its own button for a screen reader, so the row is a plain card rather than
// a pressable PackRow, whose one accessible element would hide the picker and its popover. Lifted over
// the page's press away catcher while its popover is open, so the popover's rows take their own taps.
const SeatRow = ({ seat, profiles, seatedIds, canRemove, onPick, onRename, onRemove }: SeatRowProps): JSX.Element => {
  const theme = useTheme()
  const host = useLoadoutPopoverHost()
  const idPrefix = seatPickerIdPrefix(seat.id)
  const open = host.openId === `${idPrefix}-profile`
  const { name, profile } = getSeatIdentity([seat], seat.id, profiles)
  // The fleet's ink, as on the Stats screen's picker: the trigger, the menu's border and caret.
  const ink = theme.dark ? '#FFFFFF' : '#000000'
  return (
    <Card mode='contained' testID={`pnp-seat-${seat.id}`} style={[styles.seat, open && styles.seatOpen]}>
      <Card.Content style={styles.seatContent}>
        {profile ? <ProfileChip profile={profile} size={40} /> : <Avatar.Icon size={40} icon='account' color={theme.colors.onSecondary} style={{ backgroundColor: theme.colors.secondary }} />}
        <View style={styles.seatPicker}>
          <ProfilePicker idPrefix={idPrefix} host={host} profiles={profiles} selectedId={profile?.id ?? null} takenIds={seatedIds} color={ink} dark={theme.dark} guestLabel={seat.name} nullLabel='Guest' onSelect={(picked) => onPick(seat.id, picked)} onManage={handleManage} />
        </View>
        <View style={styles.rowActions}>
          {profile ? null : <IconButton icon='pencil-outline' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurfaceVariant} onPress={() => onRename(seat.id)} accessibilityLabel={`Rename ${name}`} style={styles.rowAction} />}
          {canRemove ? <IconButton icon='close' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurfaceVariant} onPress={() => onRemove(seat.id)} accessibilityLabel={`Remove ${name}`} style={styles.rowAction} /> : null}
        </View>
      </Card.Content>
    </Card>
  )
}

// The page's press away catcher for an open seat picker (LoadoutShell's popover host), first in the
// scrolling content and reaching past the window's bottom, under the lifted seat (see SeatRow). Its
// own component because it reads the shell's host, which only what renders inside the shell can.
const SeatsPressAway = (): JSX.Element => {
  const { height } = useWindowDimensions()
  return <LoadoutPressAway style={[styles.pressAway, { bottom: -height }]} />
}

// Who a seat's switch would hand its standing to, for the confirm.
type PendingSwitch = { id: string; profile: Profile | null; title: string; message: string }

// Pass & Play: the players at the table (renamed with a tap, removed down to two, added up to eight),
// the session's standings once a round has been played, and whether each word is kept. Then Continue,
// for a word left waiting or a session under way, and New Session, which clears the standings and
// keeps the table. The word itself is written on the game screen, over the real board. The board is in
// the active player's colors (picked on the Single Player loadout), and the art is picked in the
// Settings sheet (the header's cog; see ArtPicker), not here.
//
// With a profile on the roster, each seat picks who sits there (SeatRow): a guest or a profile, each
// profile in one seat at most. A seat's standing belongs to the seat, so switching who sits in one that
// has played this session asks first, saying who takes its standing over.
export const PnpLoadout = (): JSX.Element => {
  const theme = useTheme()
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { autoSave, setAutoSave } = useAutoSaveCustom()
  const players = useSelector((state: RootState) => state.round.pnp.session.players)
  const standings = useSelector((state: RootState) => state.round.pnp.session.standings)
  const profiles = useProfiles()
  const seatedIds = useMemo(() => players.flatMap((player) => (player.profileId ? [player.profileId] : [])), [players])
  // Something to come back to: a session with a round played, a word half typed, a word handed off,
  // or a round mid-guess. A blank prompt with nothing played isn't.
  const canContinue = useSelector((state: RootState) => {
    const { pnp } = state.round
    if (hasStandings(pnp.session)) return true
    if (pnp.phase === 'authoring') return Boolean(pnp.draft?.answer.trim())
    return (pnp.phase === 'handoff' || pnp.phase === 'playing') && isRoundPlayable(pnp)
  })
  const ranked = useMemo(() => rankStandingRows(getStandingRows({ players, standings }, profiles)), [players, standings, profiles])
  const sessionStarted = hasStandings({ standings })

  // The seat whose name dialog is open, the one whose removal is waiting on its confirm (with what it
  // would take, read as Remove was pressed), and the one whose switch is.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ id: string; message: string } | null>(null)
  const [switching, setSwitching] = useState<PendingSwitch | null>(null)
  const renaming = players.find((player) => player.id === renamingId && !player.profileId) ?? null

  // The dialogs answer Android back themselves (they register as they open, so they run before the
  // page's own listener); this is the page's fallback, and losing focus closes them either way.
  const closeOverlay = useCallback(() => {
    if (!renamingId && !removing && !switching) return false
    setRenamingId(null)
    setRemoving(null)
    setSwitching(null)
    return true
  }, [renamingId, removing, switching])
  const closeAllOverlays = useCallback(() => {
    setRenamingId(null)
    setRemoving(null)
    setSwitching(null)
  }, [])

  const handleRenameSave = useCallback(
    (name: string) => {
      if (renamingId) dispatch(roundActions.renamePnpPlayer({ id: renamingId, name }))
      setRenamingId(null)
    },
    [dispatch, renamingId]
  )
  const handleRenameCancel = useCallback(() => setRenamingId(null), [])
  const handleAddPlayer = useCallback(() => dispatch(roundActions.addPnpPlayer()), [dispatch])
  // Straight away when nothing goes with the player; a confirm first when their standing or a word
  // waiting for them would.
  const handleRemove = useCallback(
    (playerId: string) => {
      const loss = getPnpRemovalLoss(store.getState().round.pnp, playerId)
      if (loss.standing || loss.word) setRemoving({ id: playerId, message: removalMessage(loss) })
      else dispatch(roundActions.removePnpPlayer(playerId))
    },
    [store, dispatch]
  )
  const handleRemoveConfirm = useCallback(() => {
    if (removing) dispatch(roundActions.removePnpPlayer(removing.id))
    setRemoving(null)
  }, [dispatch, removing])
  const handleRemoveCancel = useCallback(() => setRemoving(null), [])

  const seatProfile = useCallback((seatId: string, profile: Profile | null) => dispatch(roundActions.setPnpSeatProfile({ id: seatId, profile: profile ? { id: profile.id, name: profile.name } : null })), [dispatch])
  // A seat's picker: straight away when the seat hasn't played this session, and after a confirm when
  // it has, since its standing stays with the seat and goes on under whoever sits there now. Picking
  // who's already there changes nothing.
  const handlePick = useCallback(
    (seatId: string, profile: Profile | null) => {
      const { session } = store.getState().round.pnp
      const seat = session.players.find((player) => player.id === seatId)
      if (!seat || (seat.profileId ?? null) === (profile?.id ?? null)) return
      const { played, wins } = getStanding(session, seatId)
      if (played === 0) {
        seatProfile(seatId, profile)
        return
      }
      const nextName = profile?.name ?? guestNameForSeat(session.players, seatId)
      setSwitching({ id: seatId, profile, title: `Switch to ${nextName}?`, message: `${nextName} takes over ${getSeatIdentity(session.players, seatId, store.getState().profiles).name}'s standing this session: ${wins} of ${played} solved.` })
    },
    [store, seatProfile]
  )
  const handleSwitchConfirm = useCallback(() => {
    if (switching) seatProfile(switching.id, switching.profile)
    setSwitching(null)
  }, [seatProfile, switching])
  const handleSwitchCancel = useCallback(() => setSwitching(null), [])

  const goToGame = useCallback(() => router.push(gameHref('pnp')), [])
  // A new session: the same table, the standings cleared, a blank prompt for the first seat. Leaving a
  // word behind costs nothing: Pass & Play keeps no record of how a session ends, only of rounds
  // actually finished.
  const handleNewSession = useCallback(() => {
    dispatch(roundActions.startPnpSession())
    goToGame()
  }, [dispatch, goToGame])

  const canRemove = players.length > MIN_PNP_PLAYERS
  const avatarStyle = { backgroundColor: theme.colors.secondary }
  // The seats' pickers, once there's anyone on the roster to seat (or still a profile seated).
  const seatPickers = profiles.length > 0 || seatedIds.length > 0

  return (
    <LoadoutShell
      closeOverlay={closeOverlay}
      closeAllOverlays={closeAllOverlays}
      footer={
        <>
          {canContinue ? (
            <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='play' onPress={goToGame}>
              Continue
            </Button>
          ) : null}
          <Button mode={canContinue ? 'outlined' : 'contained'} buttonColor={canContinue ? undefined : theme.colors.secondary} textColor={canContinue ? undefined : theme.colors.onSecondary} icon='account-group' onPress={handleNewSession} style={canContinue ? styles.secondButton : undefined}>
            New Session
          </Button>
        </>
      }
      overlays={
        <>
          {renaming ? <PnpPlayerNameDialog key={renaming.id} player={renaming} players={players} onSave={handleRenameSave} onCancel={handleRenameCancel} /> : null}
          <ConfirmDialog visible={removing !== null} icon='account-remove-outline' title={`Remove ${removing ? getSeatIdentity(players, removing.id, profiles).name : ''}?`} message={removing?.message ?? ''} confirmLabel='Remove' cancelLabel='Cancel' onConfirm={handleRemoveConfirm} onCancel={handleRemoveCancel} destructive />
          <ConfirmDialog visible={switching !== null} icon='account-switch-outline' title={switching?.title ?? ''} message={switching?.message ?? ''} confirmLabel='Switch' cancelLabel='Cancel' onConfirm={handleSwitchConfirm} onCancel={handleSwitchCancel} />
        </>
      }
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {seatPickers ? <SeatsPressAway /> : null}
        <Text variant='bodyLarge' style={[styles.intro, { color: theme.colors.onSurface }]}>
          One player writes a secret word and passes the device to another to guess. Whoever guessed writes the next one.
        </Text>

        {/* In seat order: who guesses next is picked around the table from here. Each seat picks who
            sits there once there's a profile to seat; until then, every seat is a guest's plain row. */}
        <SectionLabel>Players</SectionLabel>
        {players.map((player) =>
          seatPickers ? (
            <SeatRow key={player.id} seat={player} profiles={profiles} seatedIds={seatedIds} canRemove={canRemove} onPick={handlePick} onRename={setRenamingId} onRemove={handleRemove} />
          ) : (
            <PackRow
              key={player.id}
              label={player.name}
              leading={<Avatar.Icon size={40} icon='account' color={theme.colors.onSecondary} style={avatarStyle} />}
              trailing={
                <View style={styles.rowActions}>
                  <IconButton icon='pencil-outline' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurfaceVariant} onPress={() => setRenamingId(player.id)} accessibilityLabel={`Rename ${player.name}`} style={styles.rowAction} />
                  {canRemove ? <IconButton icon='close' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurfaceVariant} onPress={() => handleRemove(player.id)} accessibilityLabel={`Remove ${player.name}`} style={styles.rowAction} /> : null}
                </View>
              }
              onPress={() => setRenamingId(player.id)}
              actions={[{ name: 'rename', label: `Rename ${player.name}`, onPress: () => setRenamingId(player.id) }, ...(canRemove ? [{ name: 'remove', label: `Remove ${player.name}`, onPress: () => handleRemove(player.id) }] : [])]}
            />
          )
        )}
        {players.length < MAX_PNP_PLAYERS ? <PackRow label='Add Player' subtitle={`Up to ${MAX_PNP_PLAYERS} players`} leading={<Avatar.Icon size={40} icon='account-plus' color={theme.colors.onSecondary} style={avatarStyle} />} onPress={handleAddPlayer} /> : null}

        {/* The session so far, ranked the way its winner is picked (see getSessionResult). */}
        {sessionStarted ? (
          <>
            <SectionLabel>Standings</SectionLabel>
            <Card mode='contained' testID='pnp-standings'>
              <Card.Content>
                <PnpStandingsList rows={ranked} color={theme.colors.onSurface} mutedColor={theme.colors.onSurfaceVariant} showRate />
              </Card.Content>
            </Card>
          </>
        ) : null}

        <SectionLabel>Words</SectionLabel>
        <PackRow label='Keep Each Word' subtitle='Saves every word to your Pass & Play pack' leading={<Avatar.Icon size={40} icon='content-save-outline' color={theme.colors.onSecondary} style={avatarStyle} />} trailing={<Switch value={autoSave} onValueChange={setAutoSave} accessibilityLabel='Keep each word' />} onPress={() => setAutoSave(!autoSave)} />
      </ScrollView>
    </LoadoutShell>
  )
}

const styles = StyleSheet.create({
  intro: { marginTop: 12, opacity: 0.85 },
  // Out to the screen edges past the content's 16pt gutters (its bottom is set from the window height),
  // over every row but an open seat's.
  pressAway: { left: -16, right: -16, top: 0, zIndex: 1 },
  rowAction: { margin: 0 },
  rowActions: { flexDirection: 'row', gap: 4 },
  // The same as SoloLoadout's.
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  // PackRow's card, the same 4 apart.
  seat: { marginBottom: 4 },
  seatContent: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  // Above the press away catcher, and the seats after it, while its popover is open.
  seatOpen: { zIndex: 2 },
  seatPicker: { flex: 1 },
  secondButton: { marginTop: 8 }
})
