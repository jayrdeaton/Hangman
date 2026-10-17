import { Button, Card, IconButton } from '@rific/feedback-press'
import { ScrollView } from '@rific/scroll-view'
import { ConfirmDialog } from '@tastic/hud/chrome'
import { router } from 'expo-router'
import { JSX, useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Avatar, Switch, Text, useTheme } from 'react-native-paper'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { roundActions } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import { gameHref } from '@/utils/navigation'
import { getPlayerName, getStandingRows, hasStandings, MAX_PNP_PLAYERS, MIN_PNP_PLAYERS, rankStandingRows } from '@/utils/pnpSession'
import { getPnpRemovalLoss, isRoundPlayable } from '@/utils/roundState'

import { ColorsRow } from './ColorsRow'
import { LoadoutShell, SectionLabel } from './LoadoutShell'
import { PackRow } from './PackRow'
import { PnpPlayerNameDialog } from './PnpPlayerNameDialog'
import { PnpStandingsList } from './PnpStandings'

// The 4pt slop the header's icon buttons use, for 48pt targets on the rows' 40pt buttons.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// What the remove confirm says a player leaving would take with them (see getPnpRemovalLoss).
const removalMessage = ({ standing, word }: { standing: boolean; word: boolean }): string => [standing ? 'Their standing this session goes with them.' : '', word ? 'The word waiting on the board goes too.' : ''].filter(Boolean).join(' ')

// Pass & Play: the colors (for now), the players at the table (renamed with a tap, removed down to
// two, added up to eight), the session's standings once a round has been played, and whether each
// word is kept. Then Continue, for a word left waiting or a session under way, and New Session, which
// clears the standings and keeps the table. The word itself is written on the game screen, over the
// real board. The art is picked in the Settings sheet (the header's cog; see ArtPicker), not here.
export const PnpLoadout = (): JSX.Element => {
  const theme = useTheme()
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { autoSave, setAutoSave } = useAutoSaveCustom()
  const players = useSelector((state: RootState) => state.round.pnp.session.players)
  const standings = useSelector((state: RootState) => state.round.pnp.session.standings)
  // Something to come back to: a session with a round played, a word half typed, a word handed off,
  // or a round mid-guess. A blank prompt with nothing played isn't.
  const canContinue = useSelector((state: RootState) => {
    const { pnp } = state.round
    if (hasStandings(pnp.session)) return true
    if (pnp.phase === 'authoring') return Boolean(pnp.draft?.answer.trim())
    return (pnp.phase === 'handoff' || pnp.phase === 'playing') && isRoundPlayable(pnp)
  })
  const ranked = useMemo(() => rankStandingRows(getStandingRows({ players, standings })), [players, standings])
  const sessionStarted = hasStandings({ standings })

  // The seat whose name dialog is open, and the one whose removal is waiting on its confirm (with what
  // it would take, read as Remove was pressed).
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ id: string; message: string } | null>(null)
  const renaming = players.find((player) => player.id === renamingId) ?? null

  // Both dialogs answer Android back themselves (they register as they open, so they run before the
  // page's own listener); this is the page's fallback, and losing focus closes them either way.
  const closeOverlay = useCallback(() => {
    if (!renamingId && !removing) return false
    setRenamingId(null)
    setRemoving(null)
    return true
  }, [renamingId, removing])
  const closeAllOverlays = useCallback(() => {
    setRenamingId(null)
    setRemoving(null)
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

  return (
    <LoadoutShell
      title='Pass & Play'
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
          <ConfirmDialog visible={removing !== null} icon='account-remove-outline' title={`Remove ${removing ? getPlayerName(players, removing.id) : ''}?`} message={removing?.message ?? ''} confirmLabel='Remove' cancelLabel='Cancel' onConfirm={handleRemoveConfirm} onCancel={handleRemoveCancel} destructive />
        </>
      }
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text variant='bodyLarge' style={[styles.intro, { color: theme.colors.onSurface }]}>
          One player writes a secret word and passes the device to another to guess. Whoever guessed writes the next one.
        </Text>

        <ColorsRow />

        {/* In seat order: who guesses next is picked around the table from here. */}
        <SectionLabel>Players</SectionLabel>
        {players.map((player) => (
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
        ))}
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
  rowAction: { margin: 0 },
  rowActions: { flexDirection: 'row', gap: 4 },
  // The same as SoloLoadout's.
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  secondButton: { marginTop: 8 }
})
