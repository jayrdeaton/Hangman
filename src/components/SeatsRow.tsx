import { defaultColors } from '@rific/auto-paper'
import { IconButton, TouchableRipple } from '@rific/feedback-press'
import { SwipeToDismiss, type SwipeToDismissHandle } from '@rific/gestures'
import { type PopoverHost, WELL_SHADOW } from '@tastic/hud/chrome'
import type { Profile } from '@tastic/profile'
import { JSX, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'
import Animated, { Easing, FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated'
import { useSelector } from 'react-redux'

import { REFLOW_EASING, REFLOW_MS, SEAT_FADE_MS } from '@/constants/loadoutMotion'
import { selectProfile } from '@/hooks/useProfiles'
import { DEFAULT_HARMONY, type PlayerTheme, resolvePlayerTheme } from '@/redux/playerThemeSlice'
import type { RootState } from '@/redux/store'
import { playerKeyFor, SINGLE_PLAYER_SEAT_ID } from '@/utils/players'
import { getStanding, MIN_PNP_PLAYERS, type PnpPlayer, type PnpStanding, seatPlayer } from '@/utils/pnpSession'

import { useLoadoutMotion, useLoadoutPopoverHost } from './LoadoutShell'
import { PlayerPicker } from './PlayerPicker'

// Every seat's picker opens as `${seatPickerIdPrefix(id)}-profile` (@tastic/profile's ProfilePicker).
const SEAT_PICKER_PREFIX = 'loadout-seat-'
const seatPickerIdPrefix = (seatId: string): string => `${SEAT_PICKER_PREFIX}${seatId}`
const seatPickerId = (seatId: string): string => `${seatPickerIdPrefix(seatId)}-profile`

// Whether one of the seats' pickers is the popover open on the page.
export const isSeatPickerOpen = (openId: string | null): boolean => openId?.startsWith(SEAT_PICKER_PREFIX) ?? false

// The colors a seat that isn't the active player's is drawn in when nothing is kept for its player
// yet: auto-paper's first swatch, the app's own starting red. Only for a moment: the page gives every
// guest seat colors of its own as it's shown (utils/guestSeats.ts).
const FALLBACK_SEAT_COLORS: PlayerTheme = { color: defaultColors[0].value, harmony: DEFAULT_HARMONY }

// The fleet's black or white, as the pickers draw their name and chevron.
const inkFor = (dark: boolean) => (dark ? '#FFFFFF' : '#000000')

// New session's 40pt round button beside the pills takes 4pt of slop each way, for a 48pt target like
// the corners', and the remove glyph on a pill's corner a little more.
const BUTTON_HIT_SLOP = 4
const REMOVE_HIT_SLOP = 10

// How the table changes (Jay, 2026-10-18: a seat appearing or vanishing, and the rest jumping, was
// jarring; constants/loadoutMotion.ts). A seat joining grows in from its middle, one leaving shrinks
// away where it was, and every other pill, and New session after them, glides to its new place on the
// page's reflow clock, so a row more or less eases in step with the page around it (LoadoutScreen's
// PageGroup and the art). The remove glyph, a standing's badge and New session fade in and out as they
// come and go (the glyph moving to the seat that takes the focus). Only reanimated's own presets: on the web a custom Keyframe entering
// pins the view where it landed (position absolute) once it ends. None of it while the page is out of
// sight or Reduce Motion is on (useLoadoutMotion), and nothing on the page's first frame
// (LayoutAnimationConfig's skipEntering): only changes move.
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1)
const EASE_IN = Easing.bezier(0.42, 0, 1, 1)
const SEAT_ENTERING = ZoomIn.duration(SEAT_FADE_MS).easing(EASE_OUT)
const SEAT_EXITING = ZoomOut.duration(SEAT_FADE_MS).easing(EASE_IN)
const REFLOW = LinearTransition.duration(REFLOW_MS).easing(REFLOW_EASING)
const MARK_ENTERING = FadeIn.duration(SEAT_FADE_MS)
const MARK_EXITING = FadeOut.duration(SEAT_FADE_MS)

// The layout animations for one of the row's slots (a seat's, New session's), or none.
type SlotMotion = { entering?: typeof SEAT_ENTERING | typeof MARK_ENTERING; exiting?: typeof SEAT_EXITING | typeof MARK_EXITING; layout?: typeof REFLOW }
const SEAT_MOTION: SlotMotion = { entering: SEAT_ENTERING, exiting: SEAT_EXITING, layout: REFLOW }
const BUTTON_MOTION: SlotMotion = { entering: MARK_ENTERING, exiting: MARK_EXITING, layout: REFLOW }
const NO_MOTION: SlotMotion = {}

type SeatProps = {
  seat: PnpPlayer
  // Whether this is the seat the page shows (its player is the active one).
  focused: boolean
  // More than the fewest a table can seat, and not seat 1 (whose guest is Single Player's, so it never
  // leaves, see players.ts' SINGLE_PLAYER_SEAT_ID): it can be swiped away, and has the remove glyph
  // while focused.
  removable: boolean
  // Whether this seat's remove confirm is open.
  confirming: boolean
  // The seat's standing this session, once a round has been decided (null before).
  standing: PnpStanding | null
  takenIds: readonly string[]
  onFocus: (seatId: string) => void
  onPick: (seatId: string, profile: Profile | null) => void
  onRemove: (seatId: string) => void
}

// One seat: the PlayerPicker pill, ringed while it's the seat the page shows (in the theme's primary,
// which is the focused player's own color, since the focused seat is the active player: the ring
// matches their chip; Jay 2026-10-18, it was the fleet's black or white ink), with its standing this
// session in a small badge on the pill's top-right corner and, on the focused seat (but the first) while
// the table has more than two, a remove glyph on its top-left (the way a home screen's icons show theirs). A press on a seat
// that isn't focused focuses it (its picker is handed a host whose toggle does that, so the press
// keeps the pill's own ripple and feedback); a press on the focused one opens its picker. A seat that
// isn't the active player's is drawn in its player's own colors (a profile's Hangman pick, or their
// profile's color; a guest seat's own), the focused one in the live theme, which is theirs.
//
// While the table has more than two, any seat but the first can be swiped away too, sideways either way or with a
// quick flick (Jay, 2026-10-18), with @rific/gestures' SwipeToDismiss, the toaster's own swipe, so it
// feels like swiping a toast away. It goes by the glyph's rules (a confirm only when a standing or a word
// waiting would go with it); a seat swiped away while its confirm is up waits off the table, and comes
// back if the confirm is cancelled. Only sideways, so a drag up or down still scrolls the page. The
// glyph stays: a screen reader can't swipe.
const Seat = memo(({ seat, focused, removable, confirming, standing, takenIds, onFocus, onPick, onRemove }: SeatProps): JSX.Element => {
  const theme = useTheme()
  const host = useLoadoutPopoverHost()
  const motion = useLoadoutMotion()
  const ink = inkFor(theme.dark)
  const profile = useSelector((state: RootState) => selectProfile(state, seat.profileId))
  // The seat's player's colors: its profile's while the roster has it, else the seat's own guest's.
  const entry = useSelector((state: RootState) => {
    const { profileId, seatId } = seatPlayer(seat, state.profiles)
    return state.playerTheme[playerKeyFor(profileId, seatId)]
  })
  const colors = useMemo(() => (focused ? undefined : (resolvePlayerTheme(entry, profile?.color ?? null) ?? FALLBACK_SEAT_COLORS)), [focused, entry, profile])
  const idPrefix = seatPickerIdPrefix(seat.id)
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
  const swipeRef = useRef<SwipeToDismissHandle>(null)
  // Swiped away: whatever the page had open closes, as a press on a seat closes it.
  const handleSwipedAway = useCallback(() => {
    host.close()
    onRemove(seat.id)
  }, [host, onRemove, seat.id])
  // Still at the table once its confirm closes (Cancel), so a seat swiped away comes back. Removed, it
  // unmounts in the same commit and runs no effect.
  const wasConfirming = useRef(confirming)
  useEffect(() => {
    if (wasConfirming.current && !confirming) swipeRef.current?.restore()
    wasConfirming.current = confirming
  }, [confirming])
  const name = profile?.name ?? seat.name
  const markEntering = motion ? MARK_ENTERING : undefined
  const markExiting = motion ? MARK_EXITING : undefined
  return (
    <SwipeToDismiss ref={swipeRef} onDismiss={removable ? handleSwipedAway : undefined} testID={`seat-${seat.id}`} style={styles.seat}>
      <View style={[styles.ring, focused && { borderColor: theme.colors.primary }]}>
        <PlayerPicker host={seatHost} idPrefix={idPrefix} selectedId={profile?.id ?? null} takenIds={takenIds} guestLabel={seat.name} onSelect={handleSelect} colors={colors} />
      </View>
      {standing ? (
        <Animated.View entering={markEntering} exiting={markExiting} pointerEvents='none' style={[styles.badge, { backgroundColor: ink }]}>
          <Text variant='labelSmall' accessibilityLabel={`${name}: ${standing.wins} of ${standing.played} solved`} style={[styles.badgeText, { color: inkFor(!theme.dark) }]}>
            {`${standing.wins}/${standing.played}`}
          </Text>
        </Animated.View>
      ) : null}
      {focused && removable ? (
        <Animated.View entering={markEntering} exiting={markExiting} style={styles.remove}>
          <TouchableRipple onPress={handleRemove} borderless hitSlop={REMOVE_HIT_SLOP} accessibilityRole='button' accessibilityLabel={`Remove ${name}`} style={[styles.removeButton, { backgroundColor: theme.colors.surface }]}>
            <Icon source='close' size={14} color={ink} />
          </TouchableRipple>
        </Animated.View>
      ) : null}
    </SwipeToDismiss>
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
  onRemove: (seatId: string) => void
  // The seat whose remove confirm is open, if any: one swiped away comes back if it's cancelled.
  removingId?: string | null
  // There while there's a session to clear (standings, or a word waiting): New session, at the row's
  // end.
  onNewSession?: () => void
}

// The Pass & Play table, first on the page (Jay, 2026-10-18): everything under it is the focused seat's
// player's (their art, difficulty and packs), so focusing another seat changes the whole page. The
// seats are centered and wrap, in seat order, with New session after them while there's a session under
// way. Add player isn't here: it's in the corners' strip, between Home and the cog (see LoadoutScreen's
// AddPlayerButton), where it never moves as seats come and go. The page lifts the row over its press
// away catcher while one of the seats' pickers is open (see LoadoutScreen's PageGroup).
export const SeatsRow = memo(({ players, focusedId, standings, showStandings, onFocus, onPick, onRemove, removingId = null, onNewSession }: SeatsRowProps): JSX.Element => {
  const theme = useTheme()
  const ink = inkFor(theme.dark)
  const { openId } = useLoadoutPopoverHost()
  const motion = useLoadoutMotion()
  const canRemove = players.length > MIN_PNP_PLAYERS
  // Every profile seated: none of them can sit in a second seat.
  const takenIds = useMemo(() => players.flatMap((player) => (player.profileId ? [player.profileId] : [])), [players])
  const buttonStyle = useMemo(() => [styles.button, { backgroundColor: theme.colors.surface }], [theme.colors.surface])
  // Each slot is the row's own animated view, rendered here rather than inside the memoized Seat: on the
  // web a layout transition only runs for a view that re-renders with the change, and every slot does
  // whenever the row does. The seat whose picker is open sits over the seats after it.
  return (
    <LayoutAnimationConfig skipEntering>
      <View style={styles.row}>
        {players.map((seat) => (
          <Animated.View key={seat.id} testID={`seat-slot-${seat.id}`} {...(motion ? SEAT_MOTION : NO_MOTION)} style={[styles.slot, openId === seatPickerId(seat.id) && styles.slotOpen]}>
            <Seat seat={seat} focused={seat.id === focusedId} removable={canRemove && seat.id !== SINGLE_PLAYER_SEAT_ID} confirming={seat.id === removingId} standing={showStandings ? getStanding({ standings }, seat.id) : null} takenIds={takenIds} onFocus={onFocus} onPick={onPick} onRemove={onRemove} />
          </Animated.View>
        ))}
        {onNewSession ? (
          <Animated.View key='new-session' testID='new-session-slot' {...(motion ? BUTTON_MOTION : NO_MOTION)}>
            <IconButton icon='restore' iconColor={ink} size={22} onPress={onNewSession} hitSlop={BUTTON_HIT_SLOP} accessibilityLabel='New session' style={buttonStyle} />
          </Animated.View>
        ) : null}
      </View>
    </LayoutAnimationConfig>
  )
})
SeatsRow.displayName = 'SeatsRow'

const styles = StyleSheet.create({
  // A standing's "2/3", on the pill's top-right corner.
  badge: { borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 5, position: 'absolute', right: -4, top: -6 },
  badgeText: { fontWeight: '700', textAlign: 'center' },
  // Round, the pills' height, on the board's surface and raised the same way. Paper's 6pt margin off,
  // so the row's own gap spaces it.
  button: { boxShadow: WELL_SHADOW, height: 44, margin: 0, width: 44 },
  // The remove glyph, on the pill's top-left corner.
  remove: { left: -6, position: 'absolute', top: -6 },
  removeButton: { alignItems: 'center', borderRadius: 11, boxShadow: WELL_SHADOW, height: 22, justifyContent: 'center', width: 22 },
  // The ring's room around every seat's pill, drawn only on the focused one.
  ring: { borderColor: 'transparent', borderRadius: 999, borderWidth: 2, padding: 2 },
  // Centered and wrapping, inside the page's gutters.
  row: { alignItems: 'center', alignSelf: 'stretch', columnGap: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 12 },
  // Never wider than the row, so a long name shrinks the pill rather than overflowing the gutters.
  seat: { maxWidth: '100%' },
  slot: { maxWidth: '100%' },
  // Over the seats after it, while its popover is open.
  slotOpen: { zIndex: 1 }
})
