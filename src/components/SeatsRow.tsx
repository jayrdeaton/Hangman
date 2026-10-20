import { defaultColors } from '@rific/auto-paper'
import { IconButton, TouchableRipple } from '@rific/feedback-press'
import { SwipeToDismiss, type SwipeToDismissHandle } from '@rific/gestures'
import { type PopoverHost, WELL_SHADOW } from '@tastic/hud/chrome'
import type { Profile } from '@tastic/profile'
import { JSX, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'
import Animated, { Easing, FadeIn, FadeOut, LayoutAnimationConfig, ZoomIn, ZoomOut } from 'react-native-reanimated'
import Sortable, { type SortableFlexDragEndParams } from 'react-native-sortables'
import { useSelector } from 'react-redux'

import { REFLOW_MS, SEAT_FADE_MS } from '@/constants/loadoutMotion'
import { useGameHaptics } from '@/hooks/useGameHaptics'
import { selectProfile } from '@/hooks/useProfiles'
import { DEFAULT_HARMONY, type PlayerTheme, resolvePlayerTheme } from '@/redux/playerThemeSlice'
import type { RootState } from '@/redux/store'
import { playerKeyFor } from '@/utils/players'
import { getStanding, MIN_PNP_PLAYERS, type PnpPlayer, type PnpStanding, seatPlayer } from '@/utils/pnpSession'

import { useLoadoutMotion, useLoadoutPopoverHost } from './LoadoutShell'
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

// New session's 40pt round button beside the pills takes 4pt of slop each way, for a 48pt target like
// the corners', and the remove glyph on a pill's corner a little more.
const BUTTON_HIT_SLOP = 4
const REMOVE_HIT_SLOP = 10

// How the table changes (Jay, 2026-10-18: a seat appearing or vanishing, and the rest jumping, was
// jarring; constants/loadoutMotion.ts). A seat joining (and New session) grows in from its middle, one
// leaving shrinks away where it was, and react-native-sortables glides every other pill to its new
// place. The remove glyph and a standing's badge fade in and out as they come and go (the glyph moving
// to the seat that takes the focus). Only reanimated's own presets: on the web a custom Keyframe
// entering pins the view where it landed (position absolute) once it ends. None of it while the page is
// out of sight or Reduce Motion is on (useLoadoutMotion), and nothing on the page's first frame
// (LayoutAnimationConfig's skipEntering): only changes move.
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1)
const EASE_IN = Easing.bezier(0.42, 0, 1, 1)
const SEAT_ENTERING = ZoomIn.duration(SEAT_FADE_MS).easing(EASE_OUT)
const SEAT_EXITING = ZoomOut.duration(SEAT_FADE_MS).easing(EASE_IN)
const MARK_ENTERING = FadeIn.duration(SEAT_FADE_MS)
const MARK_EXITING = FadeOut.duration(SEAT_FADE_MS)

// Reordering (Jay, 2026-10-20: "dragging to reorder would be dope"): a seat held this long lifts, and
// follows the finger to a new place among the others, which make room for it. Longer than any tap, so a
// press still focuses a seat or opens its picker; and a finger that moves first never lifts it, so a
// sideways flick still swipes a seat away and a drag up or down still scrolls the page. New session
// keeps its place at the end.
const LIFT_MS = 400
// A press landing this soon after a seat is put down is the drop's own (the web clicks at pointer-up,
// on the pill that was dragged), not a tap.
const DROP_PRESS_GUARD_MS = 400
const NEW_SESSION_KEY = 'new-session'

type SeatProps = {
  seat: PnpPlayer
  // Whether this is the seat the page shows (its player is the active one).
  focused: boolean
  // More than the fewest a table can seat: it can be swiped away, and has the remove glyph while
  // focused. Seat 1 too (Jay, 2026-10-20: a parent's seat, for the children to play on their own); its
  // guest, Single Player's, keeps what they have when it goes (see players.ts' SINGLE_PLAYER_SEAT_ID).
  removable: boolean
  // Whether this seat's remove confirm is open.
  confirming: boolean
  // The seat's standing this session, once a round has been decided (null before).
  standing: PnpStanding | null
  takenIds: readonly string[]
  onFocus: (seatId: string) => void
  onPick: (seatId: string, profile: Profile | null) => void
  onRemove: (seatId: string) => void
  // Whether a press now is a drag's, not a tap (see DROP_PRESS_GUARD_MS). Stable.
  pressBlocked: () => boolean
}

// One seat: the PlayerPicker pill, ringed while it's the seat the page shows (in the theme's primary,
// which is the focused player's own color, since the focused seat is the active player: the ring
// matches their chip; Jay 2026-10-18, it was the fleet's black or white ink), with its standing this
// session in a small badge on the pill's top-right corner and, on the focused seat while the table has
// more than two, a remove glyph on its top-left (the way a home screen's icons show theirs). A press on a seat
// that isn't focused focuses it (its picker is handed a host whose toggle does that, so the press
// keeps the pill's own ripple and feedback); a press on the focused one opens its picker. A seat that
// isn't the active player's is drawn in its player's own colors (a profile's Hangman pick, or their
// profile's color; a guest seat's own), the focused one in the live theme, which is theirs.
//
// While the table has more than two, any seat can be swiped away too, sideways either way or with a
// quick flick (Jay, 2026-10-18), with @rific/gestures' SwipeToDismiss, the toaster's own swipe, so it
// feels like swiping a toast away. It goes by the glyph's rules (a confirm only when a standing or a word
// waiting would go with it); a seat swiped away while its confirm is up waits off the table, and comes
// back if the confirm is cancelled. Only sideways, so a drag up or down still scrolls the page. The
// glyph stays: a screen reader can't swipe.
//
// Held still for a moment, any seat lifts to be dragged into a new place (see LIFT_MS): the whole pill is
// the drag handle.
const Seat = memo(({ seat, focused, removable, confirming, standing, takenIds, onFocus, onPick, onRemove, pressBlocked }: SeatProps): JSX.Element => {
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
  // instead (closing whatever the page had open first). Neither answers a drop's press.
  const seatHost = useMemo((): PopoverHost => {
    if (focused) return { ...host, toggle: (id: string) => !pressBlocked() && host.toggle(id) }
    const focus = () => {
      if (pressBlocked()) return
      host.close()
      onFocus(seat.id)
    }
    return { openId: null, close: host.close, toggle: focus }
  }, [focused, host, onFocus, seat.id, pressBlocked])
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
    <Sortable.Handle style={styles.seat}>
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
    </Sortable.Handle>
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
  // A seat dragged into a new place: every seat's id, in the new order.
  onReorder: (seatIds: string[]) => void
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
export const SeatsRow = memo(({ players, focusedId, standings, showStandings, onFocus, onPick, onRemove, onReorder, removingId = null, onNewSession }: SeatsRowProps): JSX.Element => {
  const theme = useTheme()
  const ink = inkFor(theme.dark)
  const { close: closePopover } = useLoadoutPopoverHost()
  const motion = useLoadoutMotion()
  const { pickUp } = useGameHaptics()
  const canRemove = players.length > MIN_PNP_PLAYERS
  // Every profile seated: none of them can sit in a second seat.
  const takenIds = useMemo(() => players.flatMap((player) => (player.profileId ? [player.profileId] : [])), [players])
  const buttonStyle = useMemo(() => [styles.button, { backgroundColor: theme.colors.surface }], [theme.colors.surface])

  // A seat being dragged, and when the last one was put down: a press then is the drag's (see
  // DROP_PRESS_GUARD_MS).
  const draggingRef = useRef(false)
  const droppedAtRef = useRef(0)
  const pressBlocked = useCallback(() => draggingRef.current || Date.now() - droppedAtRef.current < DROP_PRESS_GUARD_MS, [])
  // Picked up: whatever the page had open closes, as a press on a seat closes it.
  const handleDragStart = useCallback(() => {
    draggingRef.current = true
    closePopover()
    pickUp()
  }, [closePopover, pickUp])
  // The row's items, in order, as the drop hands them back reordered (New session keeps its place).
  const itemKeys = useMemo(() => [...players.map((player) => player.id), ...(onNewSession ? [NEW_SESSION_KEY] : [])], [players, onNewSession])
  const handleDragEnd = useCallback(
    ({ order }: SortableFlexDragEndParams) => {
      draggingRef.current = false
      droppedAtRef.current = Date.now()
      onReorder(order(itemKeys).filter((key) => key !== NEW_SESSION_KEY))
    },
    [itemKeys, onReorder]
  )

  // react-native-sortables lays the pills out itself, centered and wrapping, and glides them as seats
  // come, go and move. Earlier seats draw over later ones (stackingOrder 'desc'), so a seat's picker,
  // dropping down, opens over the seats after it.
  return (
    <LayoutAnimationConfig skipEntering>
      <View style={styles.row}>
        <Sortable.Flex customHandle sortEnabled={players.length > 1} width='fill' alignContent='center' alignItems='center' justifyContent='center' columnGap={10} rowGap={12} dragActivationDelay={LIFT_MS} dropAnimationDuration={REFLOW_MS} activeItemScale={1.08} inactiveItemOpacity={1} autoScrollEnabled={false} stackingOrder='desc' itemEntering={motion ? SEAT_ENTERING : null} itemExiting={motion ? SEAT_EXITING : null} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {players.map((seat) => (
            <View key={seat.id} testID={`seat-slot-${seat.id}`} style={styles.slot}>
              <Seat seat={seat} focused={seat.id === focusedId} removable={canRemove} confirming={seat.id === removingId} standing={showStandings ? getStanding({ standings }, seat.id) : null} takenIds={takenIds} onFocus={onFocus} onPick={onPick} onRemove={onRemove} pressBlocked={pressBlocked} />
            </View>
          ))}
          {onNewSession ? (
            <View key={NEW_SESSION_KEY} testID='new-session-slot'>
              <Sortable.Handle mode='fixed-order'>
                <IconButton icon='restore' iconColor={ink} size={22} onPress={onNewSession} hitSlop={BUTTON_HIT_SLOP} accessibilityLabel='New session' style={buttonStyle} />
              </Sortable.Handle>
            </View>
          ) : null}
        </Sortable.Flex>
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
  // The page's width inside its gutters, for the pills to center and wrap in.
  row: { alignSelf: 'stretch' },
  // Never wider than the row, so a long name shrinks the pill rather than overflowing the gutters.
  seat: { maxWidth: '100%' },
  slot: { maxWidth: '100%' }
})
