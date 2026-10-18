import { defaultColors } from '@rific/auto-paper'
import { IconButton, TouchableRipple } from '@rific/feedback-press'
import { type PopoverHost, WELL_SHADOW } from '@tastic/hud/chrome'
import type { Profile } from '@tastic/profile'
import { JSX, memo, useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'
import { useSelector } from 'react-redux'

import { selectProfile } from '@/hooks/useProfiles'
import { DEFAULT_HARMONY, type PlayerTheme, resolvePlayerTheme } from '@/redux/playerThemeSlice'
import type { RootState } from '@/redux/store'
import { playerKeyFor } from '@/utils/players'
import { getStanding, MAX_PNP_PLAYERS, MIN_PNP_PLAYERS, type PnpPlayer, type PnpStanding, seatPlayer } from '@/utils/pnpSession'

import { useLoadoutPopoverHost } from './LoadoutShell'
import { PlayerPicker } from './PlayerPicker'

// Every seat's picker opens as `${seatPickerIdPrefix(id)}-profile` (@tastic/profile's ProfilePicker).
const SEAT_PICKER_PREFIX = 'loadout-seat-'
const seatPickerIdPrefix = (seatId: string): string => `${SEAT_PICKER_PREFIX}${seatId}`

// Whether one of the seats' pickers is the popover open on the page.
export const isSeatPickerOpen = (openId: string | null): boolean => openId?.startsWith(SEAT_PICKER_PREFIX) ?? false

// The colors a seat that isn't the active player's is drawn in when nothing is kept for its player
// yet: auto-paper's first swatch, the app's own starting red. Only for a moment: the page gives every
// guest seat colors of its own as it's shown (utils/guestSeats.ts).
const FALLBACK_SEAT_COLORS: PlayerTheme = { color: defaultColors[0].value, harmony: DEFAULT_HARMONY }

// The fleet's black or white, as the pickers draw their name and chevron.
const inkFor = (dark: boolean) => (dark ? '#FFFFFF' : '#000000')

// The 40pt round buttons beside the pills take 4pt of slop each way, for 48pt targets like the
// corners', and the remove glyph on a pill's corner a little more.
const BUTTON_HIT_SLOP = 4
const REMOVE_HIT_SLOP = 10

type SeatProps = {
  seat: PnpPlayer
  // Whether this is the seat the page shows (its player is the active one).
  focused: boolean
  // More than the fewest a table can seat: the focused seat can be removed.
  removable: boolean
  // The seat's standing this session, once a round has been decided (null before).
  standing: PnpStanding | null
  takenIds: readonly string[]
  onFocus: (seatId: string) => void
  onPick: (seatId: string, profile: Profile | null) => void
  onRemove: (seatId: string) => void
}

// One seat: the PlayerPicker pill, ringed while it's the seat the page shows, with its standing this
// session in a small badge on the pill's top-right corner and, on the focused seat while the table has
// more than two, a remove glyph on its top-left (the way a home screen's icons show theirs). A press on a seat
// that isn't focused focuses it (its picker is handed a host whose toggle does that, so the press
// keeps the pill's own ripple and feedback); a press on the focused one opens its picker. A seat that
// isn't the active player's is drawn in its player's own colors (a profile's Hangman pick, or their
// profile's color; a guest seat's own), the focused one in the live theme, which is theirs.
const Seat = memo(({ seat, focused, removable, standing, takenIds, onFocus, onPick, onRemove }: SeatProps): JSX.Element => {
  const theme = useTheme()
  const host = useLoadoutPopoverHost()
  const ink = inkFor(theme.dark)
  const profile = useSelector((state: RootState) => selectProfile(state, seat.profileId))
  // The seat's player's colors: its profile's while the roster has it, else the seat's own guest's.
  const entry = useSelector((state: RootState) => {
    const { profileId, seatId } = seatPlayer(seat, state.profiles)
    return state.playerTheme[playerKeyFor(profileId, seatId)]
  })
  const colors = useMemo(() => (focused ? undefined : (resolvePlayerTheme(entry, profile?.color ?? null) ?? FALLBACK_SEAT_COLORS)), [focused, entry, profile])
  const idPrefix = seatPickerIdPrefix(seat.id)
  const open = host.openId === `${idPrefix}-profile`
  // The page's host for the focused seat; for any other, one that never opens and focuses the seat
  // instead (closing whatever the page had open first).
  const seatHost = useMemo((): PopoverHost => {
    if (focused) return host
    const focus = () => {
      host.close()
      onFocus(seat.id)
    }
    return { openId: null, close: host.close, toggle: focus }
  }, [focused, host, onFocus, seat.id])
  const handleSelect = useCallback((picked: Profile | null) => onPick(seat.id, picked), [onPick, seat.id])
  const handleRemove = useCallback(() => onRemove(seat.id), [onRemove, seat.id])
  const name = profile?.name ?? seat.name
  return (
    <View testID={`seat-${seat.id}`} style={[styles.seat, open && styles.seatOpen]}>
      <View style={[styles.ring, focused && { borderColor: ink }]}>
        <PlayerPicker host={seatHost} idPrefix={idPrefix} selectedId={profile?.id ?? null} takenIds={takenIds} guestLabel={seat.name} onSelect={handleSelect} colors={colors} />
      </View>
      {standing ? (
        <View pointerEvents='none' style={[styles.badge, { backgroundColor: ink }]}>
          <Text variant='labelSmall' accessibilityLabel={`${name}: ${standing.wins} of ${standing.played} solved`} style={[styles.badgeText, { color: inkFor(!theme.dark) }]}>
            {`${standing.wins}/${standing.played}`}
          </Text>
        </View>
      ) : null}
      {focused && removable ? (
        <TouchableRipple onPress={handleRemove} borderless hitSlop={REMOVE_HIT_SLOP} accessibilityRole='button' accessibilityLabel={`Remove ${name}`} style={[styles.remove, { backgroundColor: theme.colors.surface }]}>
          <Icon source='close' size={14} color={ink} />
        </TouchableRipple>
      ) : null}
    </View>
  )
})
Seat.displayName = 'Seat'

export type SeatsRowProps = {
  // In seat order.
  players: PnpPlayer[]
  focusedId: string
  standings: Record<string, PnpStanding>
  // Whether a round has been decided this session: then every seat shows its standing.
  showStandings: boolean
  onFocus: (seatId: string) => void
  onPick: (seatId: string, profile: Profile | null) => void
  onAdd: () => void
  onRemove: (seatId: string) => void
  // There while there's a session to clear (standings, or a word waiting): New session, at the row's
  // end.
  onNewSession?: () => void
}

// The Pass & Play table, first on the page (Jay, 2026-10-18): everything under it is the focused seat's
// player's (their art, difficulty and packs), so focusing another seat changes the whole page. The
// seats are centered and wrap, in seat order, with an Add player button after them (up to eight) and,
// while there's a session under way, New session. The page lifts it over its press away catcher while
// one of the seats' pickers is open (see LoadoutScreen's PageGroup).
export const SeatsRow = memo(({ players, focusedId, standings, showStandings, onFocus, onPick, onAdd, onRemove, onNewSession }: SeatsRowProps): JSX.Element => {
  const theme = useTheme()
  const ink = inkFor(theme.dark)
  const removable = players.length > MIN_PNP_PLAYERS
  // Every profile seated: none of them can sit in a second seat.
  const takenIds = useMemo(() => players.flatMap((player) => (player.profileId ? [player.profileId] : [])), [players])
  const buttonStyle = useMemo(() => [styles.button, { backgroundColor: theme.colors.surface }], [theme.colors.surface])
  return (
    <View style={styles.row}>
      {players.map((seat) => (
        <Seat key={seat.id} seat={seat} focused={seat.id === focusedId} removable={removable} standing={showStandings ? getStanding({ standings }, seat.id) : null} takenIds={takenIds} onFocus={onFocus} onPick={onPick} onRemove={onRemove} />
      ))}
      {players.length < MAX_PNP_PLAYERS ? <IconButton icon='account-plus' iconColor={ink} size={22} onPress={onAdd} hitSlop={BUTTON_HIT_SLOP} accessibilityLabel='Add player' style={buttonStyle} /> : null}
      {onNewSession ? <IconButton icon='restore' iconColor={ink} size={22} onPress={onNewSession} hitSlop={BUTTON_HIT_SLOP} accessibilityLabel='New session' style={buttonStyle} /> : null}
    </View>
  )
})
SeatsRow.displayName = 'SeatsRow'

const styles = StyleSheet.create({
  // A standing's "2/3", on the pill's top-right corner.
  badge: { borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 5, position: 'absolute', right: -4, top: -6 },
  badgeText: { fontWeight: '700', textAlign: 'center' },
  // Round, the pills' height, on the board's surface and raised the same way. Paper's 6pt margin off,
  // so the row's own gap spaces them.
  button: { boxShadow: WELL_SHADOW, height: 44, margin: 0, width: 44 },
  remove: { alignItems: 'center', borderRadius: 11, boxShadow: WELL_SHADOW, height: 22, justifyContent: 'center', left: -6, position: 'absolute', top: -6, width: 22 },
  // The ring's room around every seat's pill, drawn only on the focused one.
  ring: { borderColor: 'transparent', borderRadius: 999, borderWidth: 2, padding: 2 },
  // Centered and wrapping, inside the page's gutters.
  row: { alignItems: 'center', alignSelf: 'stretch', columnGap: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 12 },
  // Never wider than the row, so a long name shrinks the pill rather than overflowing the gutters.
  seat: { maxWidth: '100%' },
  // Over the seats after it, while its popover is open.
  seatOpen: { zIndex: 1 }
})
