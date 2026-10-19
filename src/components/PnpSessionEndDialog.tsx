import { Button } from '@rific/feedback-press'
import { DialogHeader, overlayActionStyles, OverlayBackdrop, OverlayCard, useOverlayCardColors } from '@tastic/hud/chrome'
import { ProfileChip } from '@tastic/profile'
import { JSX, useEffect, useMemo, useRef } from 'react'
import { AccessibilityInfo, BackHandler, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Portal, Text, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { formatWinRate, getSessionResult, joinNames, type PnpSessionResult, type PnpStandingRow, rankStandingRows } from '@/utils/pnpSession'

import { PnpStandingsList } from './PnpStandings'
import { ReadableAccent } from './ReadableAccent'

export type PnpSessionEndDialogProps = {
  visible: boolean
  // The session's standings, in seat order: the card ranks them itself.
  standings: PnpStandingRow[]
  // Done: the game screen ends the session and leaves for the loadout.
  onDone: () => void
  // Keep Playing, or Android back: nothing ends, and the round's own card comes back. This card is
  // End Session's confirm, so backing out of it cancels, like every fleet confirm.
  onKeepPlaying: () => void
}

// The same 24 from the screen edges as every fleet card, plus the safe area top and bottom.
const SCREEN_GUTTER = 24
// The winner's chip (or the tied players'), under the header.
const CROWNED_CHIP_SIZE = 40

const ICONS: Record<PnpSessionResult['kind'], string> = { winner: 'trophy', tie: 'handshake-outline', none: 'flag-checkered' }

const titleFor = (result: PnpSessionResult): string => (result.kind === 'winner' ? `${result.winner.name} Wins!` : result.kind === 'tie' ? "It's a Tie!" : 'Session Over')

const summaryFor = (result: PnpSessionResult, standings: PnpStandingRow[]): string => {
  if (result.kind === 'winner') return `${result.winner.wins} of ${result.winner.played} solved, the best rate at ${formatWinRate(result.winner)}.`
  if (result.kind === 'tie') return `${joinNames(result.tied.map((row) => row.name))} tied at ${formatWinRate(result.tied[0])}.`
  return standings.some((row) => row.played > 0) ? 'Nobody solved a word.' : 'Nobody guessed a word.'
}

// End Session's card: the fleet's result card (@tastic/hud's OverlayBackdrop and OverlayCard, like
// RoundEndDialog) with the session's winner (the best win rate among the players who guessed at least
// once), a tie (equal best rates) or no winner (nobody solved a word), every player's standing ranked,
// then Keep Playing and Done. A winner sitting as a profile has their chip under the header (each tied
// profile, for a tie), and the standings carry every profile's chip. Nothing about it is saved: the game screen ends the session only on
// Done, and a relaunch with this card up comes back to the session as it was, the next word to write.
//
// No backdrop dismissal, like every fleet card; Android's back button is Keep Playing, so a stray back
// never wipes the standings. Past the room the screen has, the standings scroll between the header and
// the buttons.
const PnpSessionEndCard = ({ visible, standings, onDone, onKeepPlaying }: PnpSessionEndDialogProps): JSX.Element | null => {
  const theme = useTheme()
  const { fg, fgMuted } = useOverlayCardColors()
  const { height: windowHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const ranked = useMemo(() => rankStandingRows(standings), [standings])
  const result = useMemo(() => getSessionResult(standings), [standings])
  const summary = summaryFor(result, standings)
  const crowned = result.kind === 'winner' ? [result.winner] : result.kind === 'tie' ? result.tied : []
  const crownedProfiles = crowned.flatMap((row) => (row.profile ? [row.profile] : []))

  // A plain overlay, not a native modal, so nothing tells a screen reader it appeared.
  useEffect(() => {
    if (!visible) return
    AccessibilityInfo.announceForAccessibility(`${titleFor(result)} ${summary}`)
  }, [visible, result, summary])

  // Added once per opening, onKeepPlaying read through a ref (hud's ConfirmDialog idiom): re-adding it
  // would move it to the top of the stack, ahead of anything opened above it since.
  const onKeepPlayingRef = useRef(onKeepPlaying)
  useEffect(() => {
    onKeepPlayingRef.current = onKeepPlaying
  })
  useEffect(() => {
    if (!visible) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onKeepPlayingRef.current()
      return true
    })
    return () => subscription.remove()
  }, [visible])

  if (!visible) return null

  return (
    <Portal>
      <OverlayBackdrop style={[styles.overlay, { paddingBottom: insets.bottom + SCREEN_GUTTER, paddingTop: insets.top + SCREEN_GUTTER }]}>
        <OverlayCard accessibilityViewIsModal style={[styles.card, { maxHeight: windowHeight - insets.top - insets.bottom - SCREEN_GUTTER * 2 }]}>
          <DialogHeader icon={ICONS[result.kind]} title={titleFor(result)} color={result.kind === 'winner' ? theme.colors.primary : fg} />
          {crownedProfiles.length > 0 ? (
            <View testID='session-crowned' style={styles.crowned}>
              {crownedProfiles.map((profile) => (
                <ProfileChip key={profile.id} profile={profile} size={CROWNED_CHIP_SIZE} />
              ))}
            </View>
          ) : null}
          <Text variant='bodyLarge' style={[styles.summary, { color: fg }]}>
            {summary}
          </Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} alwaysBounceVertical={false}>
            <PnpStandingsList rows={ranked} color={fg} mutedColor={fgMuted} highlightId={result.kind === 'winner' ? result.winner.id : undefined} showRate />
          </ScrollView>
          <View style={overlayActionStyles.actions}>
            <Button mode='outlined' onPress={onKeepPlaying} style={overlayActionStyles.actionButton}>
              Keep Playing
            </Button>
            <Button mode='contained' onPress={onDone} style={overlayActionStyles.actionButton} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
              Done
            </Button>
          </View>
        </OverlayCard>
      </OverlayBackdrop>
    </Portal>
  )
}

const styles = StyleSheet.create({
  // Takes only the height the list needs, and gives it up (then scrolls) when the card meets its
  // maxHeight, so the header and Done keep theirs.
  body: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  bodyContent: { alignSelf: 'stretch' },
  card: { width: '100%' },
  crowned: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  overlay: { paddingHorizontal: SCREEN_GUTTER },
  summary: { textAlign: 'center' }
})

// The card in a shade of the player's color that reads on it (ReadableAccent).
export const PnpSessionEndDialog = (props: PnpSessionEndDialogProps): JSX.Element => (
  <ReadableAccent>
    <PnpSessionEndCard {...props} />
  </ReadableAccent>
)
