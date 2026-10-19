import MaskedView from '@react-native-masked-view/masked-view'
import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { JSX, memo, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { type AccessibilityActionEvent, FlatList, type NativeScrollEvent, type NativeSyntheticEvent, Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import Animated, { type AnimatedStyle, type SharedValue, useAnimatedStyle } from 'react-native-reanimated'

import { REFLOW_EASING, REFLOW_MS } from '@/constants/loadoutMotion'
import { useArtDemoLoop } from '@/hooks/useArtDemoLoop'
import { useEasedValue } from '@/hooks/useEasedValue'
import { useHorizontalWheelScrollProps } from '@/hooks/useHorizontalWheelScroll'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { useSelectArt } from '@/hooks/useSelectArt'
import { VISIBLE_MODES } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'

// The game's column on the web (gameShell); a phone's own width everywhere else.
const MAX_PAGE_WIDTH = 480
// The page's gutters, which the title row keeps inside.
const GUTTER = 16

// Under the art, one row (Jay, 2026-10-18): Back, then the picked art's name over the pips, then Next.
const NAME_HEIGHT = 24
const PIPS_HEIGHT = 8
const PIPS_GAP = 8
const ROW_GAP = 12
const ROW_HEIGHT = NAME_HEIGHT + PIPS_GAP + PIPS_HEIGHT
export const ART_CAROUSEL_CHROME_HEIGHT = ROW_GAP + ROW_HEIGHT

const ADJUST_ACTIONS = [
  { name: 'increment', label: 'Next art' },
  { name: 'decrement', label: 'Previous art' }
]

type ArtCardProps = {
  mode: GameMode
  index: number
  focused: boolean
  paused: boolean
  width: number
  artHeight: number
  // The art's height easing to artHeight (see ArtCarousel): the settled card's, the only one in sight.
  easedHeight: SharedValue<number>
  color: string
  colors: string[]
  onAdjust: (index: number) => void
}

// One art, drawn straight on the board the way Home's hero is, in the player's colors, and nothing
// else: the row under the list (the picked art's name, the pips, Back and Next) stays put while the art
// swipes. The settled card plays its demo loop (useArtDemoLoop); every other card rests on its fully
// drawn frame. For a screen reader each card is one adjustable element (swiping the list
// isn't reachable there): its name and whether it's the one picked, and Next and Previous (VoiceOver's
// swipe up and down) to pick the art beside it.
const ArtCard = memo(({ mode, index, focused, paused, width, artHeight, easedHeight, color, colors, onAdjust }: ArtCardProps): JSX.Element => {
  const { mistakes, revealKey, cardOpacity, partsOpacity } = useArtDemoLoop(focused, paused, mode)
  // Only the settled card eases to a new height: the rest are out of sight, and redrawing all ten
  // scenes every frame of it would be for nothing.
  const artStyle = useAnimatedStyle(() => ({ height: focused ? easedHeight.value : artHeight, opacity: cardOpacity.value }))
  const handleAction = useCallback((event: AccessibilityActionEvent) => onAdjust(event.nativeEvent.actionName === 'increment' ? index + 1 : index - 1), [onAdjust, index])
  return (
    <View accessible accessibilityRole='adjustable' accessibilityLabel={`${mode.label} art`} accessibilityValue={{ text: `${index + 1} of ${VISIBLE_MODES.length}` }} accessibilityState={{ selected: focused }} accessibilityActions={ADJUST_ACTIONS} onAccessibilityAction={handleAction} testID={`art-card-${mode.id}`} style={[styles.card, { width }]}>
      <Animated.View style={artStyle}>
        {/* key={revealKey}: a fresh mount replays the scene's own one-time reveal (see
            useArtDemoLoop), started from the first frame. */}
        <GameVisual key={revealKey} mode={mode} mistakes={mistakes} color={color} colors={colors} started partsOpacity={partsOpacity} style={styles.art} />
      </Animated.View>
    </View>
  )
})
ArtCard.displayName = 'ArtCard'

export type ArtCarouselProps = {
  // Nothing animates while the page is out of sight or something covers the carousel (the loadout
  // says when: another screen, the Settings sheet, Choose Packs, a confirm, a popover).
  paused: boolean
  // The art's own height on every card, sized by the page so it fits a small phone whole.
  artHeight: number
  // Whether a change of artHeight eases there (with the page's own reflow, constants/loadoutMotion.ts)
  // rather than jumping: the page says when (not while it's out of sight, or with Reduce Motion on).
  animated?: boolean
}

// The loadout's art picker (Jay, 2026-10-18), the old Customize drawer's carousel back on
// the page: one card per art the picker offers (VISIBLE_MODES), a page a swipe, and whichever card it
// settles on is the active player's art, live, through useSelectArt (theirs, and the rounds waiting).
// It starts on their art and follows the art when it changes from elsewhere (another player picked, the
// Settings sheet's ART grid), without fighting a swipe of its own. Under it, Back and Next step it one
// art (a swipe isn't obvious, and a mouse has none), either side of the picked art's name and the pips,
// which say where it is. On the web a mouse wheel scrolls it sideways too (useHorizontalWheelScrollProps).
export const ArtCarousel = memo(({ paused, artHeight, animated = false }: ArtCarouselProps): JSX.Element => {
  const theme = useTheme()
  const { width: windowWidth } = useWindowDimensions()
  // A card is the whole width of the page's column, so a swipe moves exactly one.
  const pageWidth = Platform.OS === 'web' ? Math.min(windowWidth, MAX_PAGE_WIDTH) : windowWidth
  const { settings } = useThemeSettings()
  const color = resolveSeedColor(settings.color)
  // The same triad PuzzleStage builds for the real board, so a card shows the art's full colors.
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])
  const { mode } = usePuzzleDefaults()
  const selectArt = useSelectArt()
  const horizontalWheelScrollProps = useHorizontalWheelScrollProps()
  const listRef = useRef<FlatList<GameMode>>(null)
  // The page gives the art whatever room is left (see LoadoutScreen), so a seat added or removed, or a
  // line more or less in the packs card, changes it: eased in step with the page's own groups, so the
  // art grows or shrinks by what they give up and nothing else moves.
  const easedHeight = useEasedValue(artHeight, animated, REFLOW_MS, REFLOW_EASING)
  const listStyle = useAnimatedStyle(() => ({ height: easedHeight.value }))

  // The picked art's card (a hidden art, from a shared link, shows the first card until one is picked).
  const selectedIndex = Math.max(
    0,
    VISIBLE_MODES.findIndex((item) => item.id === mode.id)
  )

  // The art the list is showing: what it settled on itself, or what it was last moved to. A change of
  // art from anywhere else moves the list to it; one the list settled on itself is already there, and
  // moving it then would stop a fling going past it.
  const shownRef = useRef({ id: mode.id, width: pageWidth })
  useEffect(() => {
    if (shownRef.current.id === mode.id && shownRef.current.width === pageWidth) return
    shownRef.current = { id: mode.id, width: pageWidth }
    listRef.current?.scrollToOffset({ offset: selectedIndex * pageWidth, animated: false })
  }, [mode.id, selectedIndex, pageWidth])

  const commitIndex = useCallback(
    (index: number) => {
      const picked = VISIBLE_MODES[Math.min(Math.max(index, 0), VISIBLE_MODES.length - 1)]
      shownRef.current = { id: picked.id, width: pageWidth }
      if (picked.id !== mode.id) selectArt(picked)
    },
    [pageWidth, mode.id, selectArt]
  )

  // Plain onScroll, not onMomentumScrollEnd or onScrollEndDrag: react-native-web only ever wires the
  // DOM's scroll event through to onScroll (its ScrollViewBase), so neither of those would ever fire on
  // the web. A paging list is only at rest on a page boundary, so a scroll within a point of one IS the
  // settled position; the short wait is only a fallback for a scroll that never lands exactly on one.
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current)
    },
    []
  )
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x
      const nearest = Math.round(offsetX / pageWidth)
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current)
      if (Math.abs(offsetX - nearest * pageWidth) < 2) {
        commitIndex(nearest)
        return
      }
      settleTimeoutRef.current = setTimeout(() => commitIndex(Math.round(offsetX / pageWidth)), 60)
    },
    [commitIndex, pageWidth]
  )

  // A screen reader's Next or Previous: the art beside it, the list moved to show it (it's a change
  // from outside the list, as far as the list is concerned).
  const adjust = useCallback(
    (index: number) => {
      if (index < 0 || index >= VISIBLE_MODES.length) return
      selectArt(VISIBLE_MODES[index])
    },
    [selectArt]
  )

  // Back and Next: the list scrolls to the art beside it, and settling there picks it (handleScroll), as
  // a swipe would; at either end the arrow that would go past it is off.
  const step = useCallback(
    (delta: number) => {
      const index = selectedIndex + delta
      if (index < 0 || index >= VISIBLE_MODES.length) return
      listRef.current?.scrollToOffset({ offset: index * pageWidth, animated })
    },
    [selectedIndex, pageWidth, animated]
  )
  const stepBack = useCallback(() => step(-1), [step])
  const stepNext = useCallback(() => step(1), [step])

  const getItemLayout = useCallback((_: ArrayLike<GameMode> | null | undefined, index: number) => ({ length: pageWidth, offset: pageWidth * index, index }), [pageWidth])
  const keyExtractor = useCallback((item: GameMode) => item.id, [])
  const renderCard = useCallback(({ item, index }: { item: GameMode; index: number }) => <ArtCard mode={item} index={index} focused={index === selectedIndex} paused={paused} width={pageWidth} artHeight={artHeight} easedHeight={easedHeight} color={color} colors={colors} onAdjust={adjust} />, [selectedIndex, paused, pageWidth, artHeight, easedHeight, color, colors, adjust])

  return (
    <View style={styles.carousel}>
      {/* Clipped to the cards' height: the web's horizontal scroll view keeps a scrollbar gutter that
          WebKit and Blink still lay out, hidden or not. scrollEventThrottle 16 gives the settle check
          a scroll event a frame; decelerationRate 'fast' turns a page crisply instead of coasting. */}
      <CarouselEdgeFade heightStyle={listStyle}>
        <FlatList testID='art-carousel' ref={listRef} data={VISIBLE_MODES} renderItem={renderCard} keyExtractor={keyExtractor} horizontal pagingEnabled decelerationRate='fast' showsHorizontalScrollIndicator={false} getItemLayout={getItemLayout} initialScrollIndex={selectedIndex} onScroll={handleScroll} scrollEventThrottle={16} style={styles.fill} {...horizontalWheelScrollProps} />
      </CarouselEdgeFade>
      <View style={styles.row}>
        <IconButton icon='chevron-left' iconColor={theme.colors.onSurface} size={24} hitSlop={4} disabled={selectedIndex === 0} onPress={stepBack} accessibilityLabel='Previous art' />
        {/* The picked art's name, and under it which page: the board's wrong-guess pips' shape, the
            picked one filled, the rest outlined in the page's muted ink, which reads on the chalkboard and
            the whiteboard alike. Out of a screen reader's way, which hears each card's name and place. */}
        <View style={styles.title} accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
          <Text variant='titleMedium' style={[styles.name, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {VISIBLE_MODES[selectedIndex].label}
          </Text>
          <View style={styles.pips}>
            {VISIBLE_MODES.map((item, index) => (
              <View key={item.id} style={[styles.pip, { borderColor: theme.colors.onSurfaceVariant }, index === selectedIndex && { backgroundColor: color, borderColor: color }]} />
            ))}
          </View>
        </View>
        <IconButton icon='chevron-right' iconColor={theme.colors.onSurface} size={24} hitSlop={4} disabled={selectedIndex === VISIBLE_MODES.length - 1} onPress={stepNext} accessibilityLabel='Next art' />
      </View>
    </View>
  )
})
ArtCarousel.displayName = 'ArtCarousel'

// How far in from the left and right edges the carousel fades out: the page's gutter twice, so a card
// sliding in or out fades at the screen's edge instead of being cut there, while the settled art (a
// square in the middle of a wider page) is never touched.
const EDGE_FADE_WIDTH = 2 * GUTTER

// auto-paper's FadingScrollView treatment (Stats and the loadout page fade at their top and bottom,
// Jay 2026-10-18), turned on its side: the same masks, a native gradient band at each side inside the
// MaskedView Theme also hands auto-paper, and a CSS mask on the web, where the masked view doesn't mask.
// Its height is the list's, easing with the art (heightStyle), and the list fills it.
const CarouselEdgeFade = ({ heightStyle, children }: { heightStyle: AnimatedStyle<ViewStyle>; children: ReactNode }): JSX.Element => {
  if (Platform.OS === 'web') return <Animated.View style={[styles.list, heightStyle, WEB_EDGE_FADE]}>{children}</Animated.View>
  return (
    <Animated.View style={[styles.list, heightStyle]}>
      <MaskedView
        style={styles.fill}
        maskElement={
          <View style={styles.mask}>
            <View style={[styles.maskEdge, FADE_IN_FROM_LEFT]} />
            <View style={styles.maskOpaque} />
            <View style={[styles.maskEdge, FADE_OUT_TO_RIGHT]} />
          </View>
        }
      >
        {children}
      </MaskedView>
    </Animated.View>
  )
}

// React Native's native linear gradient (as auto-paper's FadingScrollView uses), cast for the types. A
// mask's alpha is what shows: opaque keeps the content, transparent hides it.
const FADE_IN_FROM_LEFT = { experimental_backgroundImage: 'linear-gradient(to right, transparent, #000)' } as unknown as ViewStyle
const FADE_OUT_TO_RIGHT = { experimental_backgroundImage: 'linear-gradient(to right, #000, transparent)' } as unknown as ViewStyle
// mask-image isn't in React Native's style types, but react-native-web passes it to the DOM as is.
const WEB_EDGE_MASK = `linear-gradient(to right, transparent 0, #000 ${EDGE_FADE_WIDTH}px, #000 calc(100% - ${EDGE_FADE_WIDTH}px), transparent 100%)`
const WEB_EDGE_FADE = { maskImage: WEB_EDGE_MASK, WebkitMaskImage: WEB_EDGE_MASK } as unknown as ViewStyle

const styles = StyleSheet.create({
  art: { flex: 1, width: '100%' },
  card: { paddingHorizontal: GUTTER },
  // Out past the page's gutters, so a card is a whole page wide.
  carousel: { alignSelf: 'stretch', marginHorizontal: -GUTTER },
  fill: { flex: 1 },
  list: { overflow: 'hidden' },
  mask: { flex: 1, flexDirection: 'row' },
  maskEdge: { width: EDGE_FADE_WIDTH },
  maskOpaque: { backgroundColor: '#000', flex: 1 },
  name: { fontWeight: '700', height: NAME_HEIGHT, textAlign: 'center' },
  pip: { borderRadius: PIPS_HEIGHT / 2, borderWidth: 1.5, height: PIPS_HEIGHT, width: PIPS_HEIGHT },
  pips: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: PIPS_GAP },
  // Inside the page's gutters (the carousel itself reaches past them), the arrows at its ends.
  row: { alignItems: 'center', flexDirection: 'row', height: ROW_HEIGHT, justifyContent: 'space-between', marginHorizontal: GUTTER, marginTop: ROW_GAP },
  title: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' }
})
