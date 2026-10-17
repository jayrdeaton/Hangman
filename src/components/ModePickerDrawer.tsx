import { AutoPalettePicker, resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/feedback-press'
import { ScrollView, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'

import { DRAWER_MODE_PICKER_Z_INDEX } from '@/constants/drawerStacking'
import { useArtDemoLoop } from '@/hooks/useArtDemoLoop'
import { useDrawerWidth } from '@/hooks/useDrawerWidth'
import { useHorizontalWheelScrollProps } from '@/hooks/useHorizontalWheelScroll'
import { VISIBLE_MODES } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// The carousel's own height - a fixed, generous proportion of the window, not an explicit-fit
// computation against whatever's left above the fold. An earlier version measured every other
// section (Display, pip row, Keyboard layout, Feedback; the last two have since moved to the Settings
// sheet) via onLayout and gave the carousel exactly
// what remained, so the whole page never needed to scroll - but every new section added below it
// made that math more fragile, and it eventually overflowed behind the footer (missing the two
// gaps between sections that lived outside any single measured box). This drawer is a normal
// scrolling page now, like every other drawer in the app: the carousel gets a comfortably large,
// fixed size so the artwork never feels scrunched, and whatever sits below it (today just the pip
// row) scrolls into view. Floored at CAROUSEL_MIN_HEIGHT so a short
// window (a landscape phone, a small browser tab) still shows the art at a legible size.
const CAROUSEL_HEIGHT_RATIO = 0.6
const CAROUSEL_MIN_HEIGHT = 400

const CATEGORY_LABEL: Record<GameMode['category'], string> = {
  parts: 'Parts',
  frames: 'Frames',
  quantitative: 'Procedural',
  minimal: 'Minimal'
}

type ModePickerCardProps = {
  item: GameMode
  isFocused: boolean
  paused: boolean
  isSelected: boolean
  width: number
  height: number
  color: string
  colors: string[]
}

// A plain View, not a Pressable - scrolling to a card is what selects it now (see handleScroll
// below), so there's nothing left for tapping the card itself to do. `accessible` collapses the
// whole card into one screen-reader-announced block using accessibilityLabel, same as it would have
// with a button role, just without implying an action that no longer exists.
const ModePickerCard = ({ item, isFocused, paused, isSelected, width, height, color, colors }: ModePickerCardProps) => {
  const theme = useTheme()
  const { mistakes, revealKey, cardOpacity, partsOpacity } = useArtDemoLoop(isFocused, paused, item)
  const previewAnimatedStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }))

  return (
    <View style={{ width, height }}>
      <View style={[styles.card, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }, isSelected && { borderColor: color, backgroundColor: theme.colors.surface }]} accessible accessibilityLabel={`${item.label} mode, ${CATEGORY_LABEL[item.category]}. ${item.description}`} accessibilityState={{ selected: isSelected }}>
        <Animated.View style={[styles.preview, previewAnimatedStyle]}>
          {/* key={revealKey}: forces a full remount whenever useArtDemoLoop wants this mode's own
              one-time "construct the scene" reveal (useDrawProgress, sketchShapes.tsx - a permanent
              scaffold like Classic's gallows or Robot's core, or a whole continuous scene for
              Candle/Hourglass) to replay from scratch, rather than the single on-mount-only play an
              earlier version of this file deliberately used. started stays a constant true: a fresh
              mount already IS "just revealed" for anything gated on it, so nothing here needs to
              toggle the prop itself, just force the remount. partsOpacity is classic.tsx's own
              fade-just-the-figure control (see useArtDemoLoop's own comment); every other mode
              ignores the prop entirely. */}
          <GameVisual key={revealKey} mode={item} mistakes={mistakes} color={isSelected ? color : theme.colors.onSurfaceVariant} colors={isSelected ? colors : undefined} started partsOpacity={partsOpacity} style={styles.previewVisual} />
        </Animated.View>
        <View style={styles.info}>
          <Text variant='titleLarge' style={[styles.label, { color: isSelected ? color : theme.colors.onSurface }]}>
            {item.label}
          </Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: theme.colors.secondaryContainer }]}>
              <Text variant='labelSmall' style={{ color: theme.colors.onSecondaryContainer }}>
                {CATEGORY_LABEL[item.category]}
              </Text>
            </View>
          </View>
          <Text variant='bodyMedium' style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
            {item.description}
          </Text>
        </View>
      </View>
    </View>
  )
}

export type ModePickerDrawerProps = {
  visible: boolean
  onDismiss: () => void
  selected: GameMode
  onSelect: (mode: GameMode) => void
}

// Same panel width every other fixed-width drawer in the app uses (see useDrawerWidth), replacing
// the old inline ModeSelector carousel. Every mode gets a big, fixed-height card, and the focused
// one plays its reveal animation (a repeating build/clear demo loop for every mode). A normal
// scrolling page, like every other drawer in the app (see CAROUSEL_HEIGHT_RATIO's own comment for
// why this isn't an explicit-fit layout anymore). Only the art-specific controls live here: the
// "Color" palette picker above the carousel (it recolors the art itself) and the carousel. Appearance,
// keyboard layout, sound and haptics moved to the fleet's Settings sheet (SettingsDialog.tsx, the cog
// in the top-right corner), the same place every other @tastic game keeps them. The carousel's own
// selected-card frame/name and the pips take their color from the seed this palette picker picks.
//
// Memoized: stays mounted (translated off-screen) even while closed, and an always-mounted,
// never-visible-right-now subtree still costs a re-render without this whenever an unrelated
// ancestor state change bubbles through it.
export const ModePickerDrawer = memo(({ visible, onDismiss, selected, onSelect }: ModePickerDrawerProps): JSX.Element => {
  const { height: windowHeight } = useWindowDimensions()
  // Also the carousel's page width (see getItemLayout/renderCard/handleScroll below), not the raw
  // window width, so paging lands exactly one card per swipe inside the panel instead of
  // overshooting into whatever's left of the screen beside it.
  const drawerWidth = useDrawerWidth()
  const theme = useTheme()
  const { settings } = useThemeSettings()
  const horizontalWheelScrollProps = useHorizontalWheelScrollProps()
  const listRef = useRef<FlatList<GameMode>>(null)

  const color = resolveSeedColor(settings.color)
  // Same triad PuzzleStage.tsx builds for the real game visual - without this, a selected card's
  // secondary/tertiary elements (see e.g. hourglass.tsx, classic.tsx) would silently fall back to
  // plain `color` instead of showing the actual multi-color look.
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])

  const [focusedIndex, setFocusedIndex] = useState(0)

  // Resets to whichever mode is already selected every time the drawer opens - mirrors PacksScreen/
  // PackProgressDrawer's own "recompute from scratch on every open" convention. Deliberately NOT an
  // effect keyed on `visible`: React's own "adjusting state when a prop changes" pattern (setState
  // directly in the render body, guarded by a prevValue comparison held in state, not a ref - refs
  // can't be read/written during render) applies here instead, since the alternative -
  // setFocusedIndex inside a useEffect - fires a whole extra render/commit pass after paint for
  // something that's simple to resolve synchronously during this one. Only the imperative
  // scrollToOffset call below still needs an effect: that's a ref call, not state.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) {
      const index = Math.max(
        0,
        VISIBLE_MODES.findIndex((m) => m.id === selected.id)
      )
      setFocusedIndex(index)
    }
  }

  useEffect(() => {
    if (!visible) return
    const index = Math.max(
      0,
      VISIBLE_MODES.findIndex((m) => m.id === selected.id)
    )
    listRef.current?.scrollToOffset({ offset: index * drawerWidth, animated: false })
    // Also re-runs if drawerWidth changes while open (a foldable folding or unfolding, a browser
    // window resized across DRAWER_MAX_WIDTH): the list keeps its old pixel offset, which no longer
    // sits on a page boundary at the new width. selected.id is safe to read there, since the
    // settled card is always the selected mode (see commitIndex below).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected.id read once per open (or width change), not tracked live while already open
  }, [visible, drawerWidth])

  // Deliberately built on plain onScroll, not onMomentumScrollEnd/onScrollEndDrag - react-native-
  // web's ScrollViewBase only ever wires the native `scroll` DOM event through to onScroll;
  // onMomentumScrollEnd/onScrollEndDrag are never invoked on web at all (confirmed by reading
  // node_modules/react-native-web/src/exports/ScrollView/ScrollViewBase.js - those props fall
  // through to a plain View, which does nothing with them), so focusedIndex would silently never
  // update after the very first scroll on that platform.
  //
  // Also where selection itself happens: whichever card the carousel settles on becomes the real
  // selected mode immediately, live - matching how mode/difficulty already work everywhere else in
  // this app (see LoadoutScreen's handleSelectMode). There's no separate "confirm" step
  // baked into a tap anymore, since that closed the drawer before the focused card's own reveal
  // animation ever got a chance to play - the footer button and the header's close button both just
  // dismiss now, neither one committing or reverting anything the scroll position hasn't already.
  const scrollSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (scrollSettleTimeoutRef.current) clearTimeout(scrollSettleTimeoutRef.current)
    },
    []
  )
  const commitIndex = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), VISIBLE_MODES.length - 1)
      setFocusedIndex(clamped)
      onSelect(VISIBLE_MODES[clamped])
    },
    [onSelect]
  )
  // A pagingEnabled carousel is only ever truly at rest on an exact page-width multiple - every
  // scroll event that lands within a pixel of one (the fast path below) already IS the settled
  // position, so there's no reason to wait out a debounce on top of it. That debounce is only a
  // fallback now, for the (normally never-hit) case where a scroll event never happens to land
  // exactly on a boundary.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x
      const nearestIndex = Math.round(offsetX / drawerWidth)
      if (scrollSettleTimeoutRef.current) clearTimeout(scrollSettleTimeoutRef.current)
      if (Math.abs(offsetX - nearestIndex * drawerWidth) < 2) {
        commitIndex(nearestIndex)
        return
      }
      scrollSettleTimeoutRef.current = setTimeout(() => commitIndex(Math.round(offsetX / drawerWidth)), 60)
    },
    [commitIndex, drawerWidth]
  )

  const getItemLayout = useCallback((_: ArrayLike<GameMode> | null | undefined, index: number) => ({ length: drawerWidth, offset: drawerWidth * index, index }), [drawerWidth])
  const keyExtractor = useCallback((item: GameMode) => item.id, [])

  // Known synchronously from useWindowDimensions() alone, unlike the old onLayout-measured
  // approach - the carousel renders immediately on open, no "don't render until measured" gate
  // needed.
  const carouselHeight = Math.max(CAROUSEL_MIN_HEIGHT, Math.round(windowHeight * CAROUSEL_HEIGHT_RATIO))

  const renderCard = useCallback(({ item, index }: { item: GameMode; index: number }) => <ModePickerCard item={item} isFocused={index === focusedIndex} paused={!visible} isSelected={item.id === selected.id} width={drawerWidth} height={carouselHeight} color={color} colors={colors} />, [focusedIndex, visible, selected.id, drawerWidth, carouselHeight, color, colors])

  return (
    <Drawer open={visible} onClose={onDismiss} width={drawerWidth} zIndex={DRAWER_MODE_PICKER_Z_INDEX}>
      <View testID='mode-picker-panel' style={styles.panelContent} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {/* footerFixed: the Done button stays permanently pinned (not a hide-on-scroll-up bar,
            @rific/scroll-view's default for a footer - see ScrollViewFooter's own footerStyle) and,
            just as importantly, makes the library reserve real bottom padding for it in the scroll
            content. The default (footerFixed: false, see ScrollViewSettingsContext's own default,
            which this app never overrides anywhere) only pads content clear of the HEADER, not the
            footer - confirmed by inspecting the rendered scroll container's own paddingTop/
            paddingBottom live - which is what let Keyboard layout run under the footer bar in an
            earlier version of this drawer that tried to hand-compute that clearance itself instead
            of just asking the library for it. */}
        <ScrollViewProvider footerFixed>
          <ScrollViewHeader title='Customize' actionSize={40} backAction={<IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={onDismiss} accessibilityLabel='Close' />} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View testID='mode-picker-display'>
              <Text variant='titleMedium' style={styles.displayLabel}>
                Color
              </Text>
              <View style={styles.displayRow}>
                {/* AutoPalettePicker (not the plain PalettePicker) since this is exactly the
                    "editing the app's own theme" case it exists for - reads/writes
                    useThemeSettings() itself, both color AND harmony, so there's nothing to wire
                    up here. That harmony half folds a compact, label-less HarmonyPicker row
                    (triadic/split/analogous/square/complementary/double-split) into this same
                    swatch's own dialog, above the color grid - every swatch's Pie preview
                    reshapes live as harmony changes, so there's one place to tune both instead of
                    two separate controls. */}
                <AutoPalettePicker />
              </View>
            </View>

            {/* overflow: hidden hard-clips the FlatList to exactly carouselHeight - react-native-
                web's own horizontal ScrollView hides its scrollbar via scrollbar-width: none
                (Firefox only; see node_modules/react-native-web/src/exports/ScrollView/
                ScrollViewBase.js), which WebKit/Blink ignores, so without this the reserved-but-
                invisible scrollbar gutter still adds real height beyond what was asked for.
                scrollEventThrottle: onScroll is throttled to at most once per this many ms on native
                (defaults to effectively "rarely" otherwise) - 16ms (~60fps) gives handleScroll's own
                debounce enough ticks to actually detect scrolling has gone quiet, rather than
                settling on a stale offset from a single sparse update. decelerationRate="fast": the
                default "normal" rate is tuned for free-scrolling content that coasts a while after a
                flick - on a pagingEnabled carousel that only ever travels one card width, that same
                slow decay just reads as sluggish drag-to-settle instead of a crisp page turn. */}
            <View style={[styles.list, { height: carouselHeight }]}>
              <FlatList testID='mode-picker-carousel' ref={listRef} data={VISIBLE_MODES} renderItem={renderCard} keyExtractor={keyExtractor} horizontal pagingEnabled decelerationRate='fast' showsHorizontalScrollIndicator={false} getItemLayout={getItemLayout} onScroll={handleScroll} scrollEventThrottle={16} style={{ height: carouselHeight }} {...horizontalWheelScrollProps} />
            </View>

            {/* Directly under the carousel it indicates, not above it. Same "row of small circles"
                convention Game.tsx's own wrong-guess pips use (borderColor outline, filled
                backgroundColor when active), reused here to mean "which page" instead of "how many
                mistakes." The full-width paged carousel has no peeking edge of its own (unlike the
                old ModeSelector's intentional 0.68-width peek cards) to hint that swiping reveals
                more modes, so this is the whole affordance for that. */}
            <View testID='mode-picker-pip-row' style={styles.pipRow} accessibilityLabel={`Mode ${focusedIndex + 1} of ${VISIBLE_MODES.length}`}>
              {VISIBLE_MODES.map((mode, index) => (
                <View key={mode.id} style={[styles.pip, { borderColor: theme.colors.outline }, index === focusedIndex && { backgroundColor: color, borderColor: color }]} />
              ))}
            </View>
          </ScrollView>

          {/* Selection already happened live while scrolling (see handleScroll above), so this just
              closes, same as the header's own close button. No mode name on the button: the focused
              card already names itself in giant text right above this. "Done" rather than "Select",
              since this drawer also confirms the color, not just the mode. Full width: this is the one
              and only action in the footer, no reason to leave it thumb-width. */}
          <ScrollViewFooter style={styles.footer}>
            <Button mode='contained' icon='check' onPress={onDismiss} style={styles.footerButton}>
              Done
            </Button>
          </ScrollViewFooter>
        </ScrollViewProvider>
      </View>
    </Drawer>
  )
})
ModePickerDrawer.displayName = 'ModePickerDrawer'

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
    marginTop: 4
  },
  card: {
    borderRadius: 16,
    borderWidth: 2,
    flex: 1,
    marginHorizontal: 16,
    overflow: 'hidden'
  },
  description: {
    lineHeight: 20
  },
  displayLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 12
  },
  // No Card behind the palette picker: it sits directly on the drawer's own background, so this only
  // needs the same marginHorizontal/row layout a Card.Content would have given it.
  displayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 4,
    marginHorizontal: 16
  },
  // paddingVertical/paddingHorizontal match ScrollViewHeader's own actionMargin - same convention
  // the loadouts' own footers use.
  footer: {
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  // ScrollViewFooter's own row style centers children at their natural width by default - this
  // stretches the one and only footer button to fill that row instead.
  footerButton: { width: '100%' },
  info: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  label: {
    fontWeight: '700'
  },
  list: { marginTop: 8, overflow: 'hidden' },
  panelContent: {
    flex: 1,
    overflow: 'hidden'
  },
  // Same pip proportions as Game.tsx's own wrong-guess row (borderRadius 6, 1.5 border, 12x12) -
  // same visual language, different meaning (page position, not mistakes remaining).
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 12 },
  preview: {
    flex: 1,
    width: '100%'
  },
  previewVisual: { flex: 1, width: '100%' },
  // Matches the loadouts' and other drawers' own scrollContent convention - a little breathing room
  // below the last section, on top of (not instead of) the real footer clearance ScrollViewProvider's
  // footerFixed reserves automatically.
  scrollContent: { paddingBottom: 12 }
})
