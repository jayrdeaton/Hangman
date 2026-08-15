import { AutoPalettePicker, resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { Button, IconButton, SegmentedButtons, Switch, useHapticSettings } from '@rific/haptic-press'
import { ScrollView, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { DRAWER_MODE_PICKER_Z_INDEX } from '@/constants/drawerStacking'
import { useHorizontalWheelScrollProps } from '@/hooks/useHorizontalWheelScroll'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { useSoundSettings } from '@/hooks/useSoundSettings'
import { VISIBLE_MODES } from '@/modes/registry'
import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// The carousel's own height — a fixed, generous proportion of the window, not an explicit-fit
// computation against whatever's left above the fold. An earlier version measured every other
// section (Display, pip row, Keyboard layout, Feedback) via onLayout and gave the carousel exactly
// what remained, so the whole page never needed to scroll — but every new section added below it
// made that math more fragile, and it eventually overflowed behind the footer (missing the two
// gaps between sections that lived outside any single measured box). This drawer is a normal
// scrolling page now, like every other drawer in the app: the carousel gets a comfortably large,
// fixed size so the artwork never feels scrunched, and the rest of the page (pip row, Keyboard
// layout, Feedback) just scrolls into view below it. Floored at CAROUSEL_MIN_HEIGHT so a short
// window (a landscape phone, a small browser tab) still shows the art at a legible size.
const CAROUSEL_HEIGHT_RATIO = 0.6
const CAROUSEL_MIN_HEIGHT = 400

// Same fixed panel width every other drawer in the app uses (PuzzleDrawer's own Game Menu,
// AchievementsDrawer) — this used to be a full-width page (see this drawer's own doc comment,
// below, for why), but there's no reason its own panel should be the one exception. The carousel's
// per-card width (see getItemLayout/renderCard/handleScroll below) is pinned to this same constant
// rather than the raw window width, so paging still lands exactly one page per swipe inside the
// now-narrower panel instead of overshooting into whatever's left of the screen beside it.
const DRAWER_WIDTH = 380

const CATEGORY_LABEL: Record<GameMode['category'], string> = {
  parts: 'Parts',
  frames: 'Frames',
  quantitative: 'Procedural',
  minimal: 'Minimal'
}

// Time between each successive wrong-guess step during a card's demo cycle — comfortably longer
// than sketchShapes.tsx's own DRAW_MS (380) so a part/instance visibly finishes its own sketch-in or
// fade-in before the next step lands. DEMO_HOLD_MS is how long the fully-built (or fully-depleted)
// extreme holds before the cycle fades back out and restarts.
const DEMO_STEP_MS = 500
const DEMO_HOLD_MS = 1000
// Quick opacity tween for every fade in this cycle — fast enough to read as a beat between two
// drawn states, not a slow cross-dissolve.
const FADE_MS = 200
// How long a freshly (re)mounted scene's own one-time reveal (GallowsWithRope, RobotCore, Candle's
// base-to-flame sketch-on, a whole scattered field of stars/snowflakes) needs to finish before the
// mistake-simulation loop below starts touching `mistakes` again. Sized to comfortably clear the
// slowest of these — Robot's antenna, the last of six staggered removable parts, only finishes
// around 1.9s after its own core scaffold starts (see robot.tsx's own CORE_END_MS/STAGGER_MS) —
// rather than tracking each mode's own exact stagger math here. Too short and a slow-revealing part
// gets yanked away by the loop before a viewer ever sees it drawn (the antenna bug this cycle was
// built to fix); too long just reads as a pause, not a functional problem.
const SCENE_REVEAL_HOLD_MS = 2000

// classic.tsx is the only mode with a permanent scaffold (the gallows) structurally separate from
// its mistake-tracked parts (the stick figure) — see gameModes.ts's own comment on partsOpacity.
// Every other mode's "scene" IS its mistakes-reactive content, so there's nothing to preserve across
// a fade/redraw the way the gallows is here.
const SCAFFOLDED_MODE_ID = 'classic'

// Drives each card's demo cycle while it's focused: fades the resting "fully drawn" preview out,
// (re)mounts the scene so its own one-time reveal plays fresh (bumping `revealKey` forces this — see
// its own usage below), waits for that reveal to finish, then steps `mistakes` from 0 up to
// maxMistakes (holding briefly once fully built/depleted) the same way a real round's wrong guesses
// would, just looped. At the end of each hold: classic.tsx fades `partsOpacity` down to fade out just
// the stick figure, leaving the gallows alone, then loops straight back into the next build (no
// remount, no scene-reveal wait — the gallows never went anywhere). Every other mode instead fades
// the whole card out, remounts for a full fresh redraw, and waits out the reveal again before
// continuing — there's no persistent piece worth preserving there, so a full redraw each cycle is
// simpler and reads just as well ("draw in, animate through, fade out, draw back in, repeat").
const useCardAnimation = (isFocused: boolean, mode: GameMode) => {
  const restMistakes = fullyDrawnMistakes(mode)
  // 'none' (Letters Only) has no mistake-reactive art at all — nothing for this cycle to animate,
  // so it just stays on its static resting frame.
  const animated = mode.behavior !== 'none'
  const isClassic = mode.id === SCAFFOLDED_MODE_ID

  const [mistakes, setMistakes] = useState(restMistakes)
  const [revealKey, setRevealKey] = useState(0)
  const cardOpacity = useSharedValue(1)
  const partsOpacity = useSharedValue(1)

  useEffect(() => {
    if (!animated) return
    if (!isFocused) {
      // Snapped, not faded — this card isn't visible mid-transition to begin with (it's the one
      // losing focus as the carousel settles elsewhere), so there's nothing for a tween to show.
      // No setMistakes call here: the returned `mistakes` below already masks stale state at the
      // source whenever unfocused, so there's nothing for this effect itself to reset.
      cardOpacity.value = 1
      partsOpacity.value = 1
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const runMistakeLoop = () => {
      let step = 0
      const advanceMistakes = () => {
        if (cancelled) return
        if (step > mode.maxMistakes) {
          if (isClassic) {
            partsOpacity.value = withTiming(0, { duration: FADE_MS })
            timeoutId = setTimeout(() => {
              if (cancelled) return
              setMistakes(0)
              partsOpacity.value = 1
              step = 0
              advanceMistakes()
            }, FADE_MS)
          } else {
            cardOpacity.value = withTiming(0, { duration: FADE_MS })
            timeoutId = setTimeout(() => {
              if (cancelled) return
              setMistakes(0)
              setRevealKey((key) => key + 1)
              cardOpacity.value = 1
              step = 0
              timeoutId = setTimeout(advanceMistakes, SCENE_REVEAL_HOLD_MS)
            }, FADE_MS)
          }
          return
        }
        setMistakes(step)
        const isLastStep = step === mode.maxMistakes
        step += 1
        timeoutId = setTimeout(advanceMistakes, isLastStep ? DEMO_HOLD_MS : DEMO_STEP_MS)
      }
      advanceMistakes()
    }

    // Entry: fade the resting preview out, swap to a blank/fresh scene while invisible, then reveal
    // it (a real mount, so every started-gated part replays its own sketch-in) before the loop above
    // starts touching mistakes.
    cardOpacity.value = withTiming(0, { duration: FADE_MS })
    timeoutId = setTimeout(() => {
      if (cancelled) return
      setMistakes(0)
      setRevealKey((key) => key + 1)
      cardOpacity.value = 1
      partsOpacity.value = 1
      timeoutId = setTimeout(runMistakeLoop, SCENE_REVEAL_HOLD_MS)
    }, FADE_MS)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode/isClassic/restMistakes are fixed for a given card instance; only isFocused should retrigger this
  }, [isFocused])

  return { mistakes: animated && isFocused ? mistakes : restMistakes, revealKey, cardOpacity, partsOpacity }
}

type ModePickerCardProps = {
  item: GameMode
  isFocused: boolean
  isSelected: boolean
  width: number
  height: number
  color: string
  colors: string[]
}

// A plain View, not a Pressable — scrolling to a card is what selects it now (see handleScroll
// below), so there's nothing left for tapping the card itself to do. `accessible` collapses the
// whole card into one screen-reader-announced block using accessibilityLabel, same as it would have
// with a button role, just without implying an action that no longer exists.
const ModePickerCard = ({ item, isFocused, isSelected, width, height, color, colors }: ModePickerCardProps) => {
  const theme = useTheme()
  const { mistakes, revealKey, cardOpacity, partsOpacity } = useCardAnimation(isFocused, item)
  const previewAnimatedStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }))

  return (
    <View style={{ width, height }}>
      <View style={[styles.card, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }, isSelected && { borderColor: color, backgroundColor: theme.colors.surface }]} accessible accessibilityLabel={`${item.label} mode, ${CATEGORY_LABEL[item.category]}. ${item.description}`} accessibilityState={{ selected: isSelected }}>
        <Animated.View style={[styles.preview, previewAnimatedStyle]}>
          {/* key={revealKey}: forces a full remount whenever useCardAnimation wants this mode's own
              one-time "construct the scene" reveal (useDrawProgress, sketchShapes.tsx — a permanent
              scaffold like Classic's gallows or Robot's core, or a whole continuous scene for
              Candle/Hourglass) to replay from scratch, rather than the single on-mount-only play an
              earlier version of this file deliberately used. started stays a constant true: a fresh
              mount already IS "just revealed" for anything gated on it, so nothing here needs to
              toggle the prop itself, just force the remount. partsOpacity is classic.tsx's own
              fade-just-the-figure control (see useCardAnimation's own comment); every other mode
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

// Same fixed-width panel every other drawer in the app uses (see DRAWER_WIDTH above), replacing
// the old inline ModeSelector carousel — every mode gets a big, fixed-height card, and the focused
// one plays its reveal animation (a repeating build/clear demo loop for every mode). A normal
// scrolling page, like every other drawer in the app (see CAROUSEL_HEIGHT_RATIO's own comment for
// why this isn't an explicit-fit layout anymore). Color/appearance, keyboard layout,
// and haptics/sound all live here too — this is the ONLY settings surface reached from PuzzleDrawer's
// Game Menu, which is otherwise gameplay-only (packs, difficulty, Random, Pass & play).
// Color/appearance sit in the "Display" block above the carousel, since they directly change how the
// mode art itself looks; keyboard layout and Feedback (haptics/sound) each get their own section
// below the carousel instead, since neither is a "Display" concern, just other rarely-touched
// preferences that happen to live in this drawer too. The carousel's own selected-card frame/name
// and the pips take their color from the seed the Display color swatch picks — which is also
// primary's own source hue (see appearanceButtons' own comment) — so Display's picker buttons use
// secondary instead of primary to avoid echoing the swatches right next to them, Keyboard layout
// uses tertiary, and Feedback circles back to primary once it's far enough down the page not to
// echo the carousel either. Every section reads as a genuinely different accent from its neighbors,
// and all three theme colors show up somewhere on the page.
//
// Memoized: stays mounted (translated off-screen) even while closed — see PuzzleDrawer's own memo
// comment for why an always-mounted, never-visible-right-now subtree still costs a re-render
// without this.
export const ModePickerDrawer = memo(({ visible, onDismiss, selected, onSelect }: ModePickerDrawerProps): JSX.Element => {
  const { height: windowHeight } = useWindowDimensions()
  const theme = useTheme()
  const { settings, set } = useThemeSettings()
  const { layout, setLayout } = useKeyboardLayout()
  const { settings: hapticSettings, set: setHapticSettings } = useHapticSettings()
  const { settings: soundSettings, setEnabled: setSoundEnabled } = useSoundSettings()
  const horizontalWheelScrollProps = useHorizontalWheelScrollProps()
  const listRef = useRef<FlatList<GameMode>>(null)

  const color = resolveSeedColor(settings.color)
  // Same triad PuzzleStage.tsx builds for the real game visual — without this, a selected card's
  // secondary/tertiary elements (see e.g. hourglass.tsx, classic.tsx) would silently fall back to
  // plain `color` instead of showing the actual multi-color look.
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])

  // Built locally instead of using @rific/auto-paper's own AppearancePicker — that component builds
  // its `buttons` array internally with no style-override hook, so there's no way to give its
  // segments the same container/vibrant-fill treatment as every other segmented control in this app
  // (see e.g. PuzzleDrawer's own difficultyOptions). Secondary-tinted, not primary: `color` above
  // (the seed the PalettePicker right next to this picks) IS primary's own source hue — see
  // useComputedTheme.ts's own primaryInput/getTriadicPalette — so the selected card's frame/name,
  // the pips, and this segmented control would all read as the exact same accent if this used
  // primary too, on top of sitting right next to the swatches carrying that color already. Secondary
  // keeps this picker visually its own thing instead of a redundant echo of the one beside it.
  const appearanceButtons = useMemo(
    () =>
      (
        [
          { value: 'system' as const, icon: 'monitor', label: 'System' },
          { value: 'light' as const, icon: 'white-balance-sunny', label: 'Light' },
          { value: 'dark' as const, icon: 'weather-night', label: 'Dark' }
        ] satisfies { value: typeof settings.appearance; icon: string; label: string }[]
      ).map(({ value, icon, label }) => {
        const checked = value === settings.appearance
        return { value, icon, accessibilityLabel: label, checkedColor: theme.colors.onSecondary, uncheckedColor: theme.colors.onSecondaryContainer, style: { backgroundColor: checked ? theme.colors.secondary : theme.colors.secondaryContainer } }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only settings.appearance is actually read at runtime; the `typeof settings.appearance` above is type-only and erased at compile time, not a real dependency on the rest of `settings`
    [settings.appearance, theme.colors]
  )
  // Tertiary-tinted — a third, different role from Display's secondary just above it, so this
  // section reads as its own facet of the page too.
  const keyboardButtons = useMemo(
    () =>
      (
        [
          { value: 'qwerty' as const, label: 'QWERTY' },
          { value: 'abc' as const, label: 'ABC' }
        ] satisfies { value: typeof layout; label: string }[]
      ).map(({ value, label }) => {
        const checked = value === layout
        return { value, label, checkedColor: theme.colors.onTertiary, uncheckedColor: theme.colors.onTertiaryContainer, style: { backgroundColor: checked ? theme.colors.tertiary : theme.colors.tertiaryContainer } }
      }),
    [layout, theme.colors]
  )

  const [focusedIndex, setFocusedIndex] = useState(0)

  // Resets to whichever mode is already selected every time the drawer opens — mirrors PacksScreen/
  // AchievementsDrawer's own "recompute from scratch on every open" convention. Deliberately NOT an
  // effect keyed on `visible`: React's own "adjusting state when a prop changes" pattern (setState
  // directly in the render body, guarded by a prevValue comparison held in state, not a ref — refs
  // can't be read/written during render) applies here instead, since the alternative —
  // setFocusedIndex inside a useEffect — fires a whole extra render/commit pass after paint for
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
    listRef.current?.scrollToOffset({ offset: index * DRAWER_WIDTH, animated: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected.id read once per open, not tracked live while already open
  }, [visible])

  // Deliberately built on plain onScroll, not onMomentumScrollEnd/onScrollEndDrag — react-native-
  // web's ScrollViewBase only ever wires the native `scroll` DOM event through to onScroll;
  // onMomentumScrollEnd/onScrollEndDrag are never invoked on web at all (confirmed by reading
  // node_modules/react-native-web/src/exports/ScrollView/ScrollViewBase.js — those props fall
  // through to a plain View, which does nothing with them), so focusedIndex would silently never
  // update after the very first scroll on that platform.
  //
  // Also where selection itself happens: whichever card the carousel settles on becomes the real
  // selected mode immediately, live — matching how mode/difficulty already work everywhere else in
  // this app (see PuzzleDrawer's own onModeChange comment). There's no separate "confirm" step
  // baked into a tap anymore, since that closed the drawer before the focused card's own reveal
  // animation ever got a chance to play — the footer button and the header's close button both just
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
  // A pagingEnabled carousel is only ever truly at rest on an exact page-width multiple — every
  // scroll event that lands within a pixel of one (the fast path below) already IS the settled
  // position, so there's no reason to wait out a debounce on top of it. That debounce is only a
  // fallback now, for the (normally never-hit) case where a scroll event never happens to land
  // exactly on a boundary.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x
      const nearestIndex = Math.round(offsetX / DRAWER_WIDTH)
      if (scrollSettleTimeoutRef.current) clearTimeout(scrollSettleTimeoutRef.current)
      if (Math.abs(offsetX - nearestIndex * DRAWER_WIDTH) < 2) {
        commitIndex(nearestIndex)
        return
      }
      scrollSettleTimeoutRef.current = setTimeout(() => commitIndex(Math.round(offsetX / DRAWER_WIDTH)), 60)
    },
    [commitIndex]
  )

  const getItemLayout = useCallback((_: ArrayLike<GameMode> | null | undefined, index: number) => ({ length: DRAWER_WIDTH, offset: DRAWER_WIDTH * index, index }), [])
  const keyExtractor = useCallback((item: GameMode) => item.id, [])

  // Known synchronously from useWindowDimensions() alone, unlike the old onLayout-measured
  // approach — the carousel renders immediately on open, no "don't render until measured" gate
  // needed.
  const carouselHeight = Math.max(CAROUSEL_MIN_HEIGHT, Math.round(windowHeight * CAROUSEL_HEIGHT_RATIO))

  const renderCard = useCallback(({ item, index }: { item: GameMode; index: number }) => <ModePickerCard item={item} isFocused={index === focusedIndex} isSelected={item.id === selected.id} width={DRAWER_WIDTH} height={carouselHeight} color={color} colors={colors} />, [focusedIndex, selected.id, carouselHeight, color, colors])

  return (
    <Drawer open={visible} onClose={onDismiss} width={DRAWER_WIDTH} zIndex={DRAWER_MODE_PICKER_Z_INDEX}>
      <View testID='mode-picker-panel' style={styles.panelContent} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {/* footerFixed: the Done button stays permanently pinned (not a hide-on-scroll-up bar,
            @rific/scroll-view's default for a footer — see ScrollViewFooter's own footerStyle) and,
            just as importantly, makes the library reserve real bottom padding for it in the scroll
            content. The default (footerFixed: false, see ScrollViewSettingsContext's own default,
            which this app never overrides anywhere) only pads content clear of the HEADER, not the
            footer — confirmed by inspecting the rendered scroll container's own paddingTop/
            paddingBottom live — which is what let Keyboard layout run under the footer bar in an
            earlier version of this drawer that tried to hand-compute that clearance itself instead
            of just asking the library for it. */}
        <ScrollViewProvider footerFixed>
          <ScrollViewHeader title='Customize' actionSize={40} backAction={<IconButton icon='arrow-left' mode='contained' hitSlop={ICON_ACTION_HIT_SLOP} containerColor={theme.colors.tertiary} iconColor={theme.colors.onTertiary} onPress={onDismiss} accessibilityLabel='Close' />} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View testID='mode-picker-display'>
              <Text variant='titleMedium' style={styles.displayLabel}>
                Display
              </Text>
              <View style={styles.displayRow}>
                {/* AutoPalettePicker (not the plain PalettePicker) since this is exactly the
                    "editing the app's own theme" case it exists for — reads/writes
                    useThemeSettings() itself, both color AND harmony, so there's nothing to wire
                    up here. That harmony half folds a compact, label-less HarmonyPicker row
                    (triadic/split/analogous/square/complementary/double-split) into this same
                    swatch's own dialog, above the color grid — every swatch's Pie preview
                    reshapes live as harmony changes, so there's one place to tune both instead of
                    two separate controls. */}
                <AutoPalettePicker />
                <View style={styles.flex}>
                  <SegmentedButtons value={settings.appearance} onValueChange={(value) => set({ appearance: value as typeof settings.appearance })} buttons={appearanceButtons} />
                </View>
              </View>
            </View>

            {/* overflow: hidden hard-clips the FlatList to exactly carouselHeight — react-native-
                web's own horizontal ScrollView hides its scrollbar via scrollbar-width: none
                (Firefox only; see node_modules/react-native-web/src/exports/ScrollView/
                ScrollViewBase.js), which WebKit/Blink ignores, so without this the reserved-but-
                invisible scrollbar gutter still adds real height beyond what was asked for.
                scrollEventThrottle: onScroll is throttled to at most once per this many ms on native
                (defaults to effectively "rarely" otherwise) — 16ms (~60fps) gives handleScroll's own
                debounce enough ticks to actually detect scrolling has gone quiet, rather than
                settling on a stale offset from a single sparse update. decelerationRate="fast": the
                default "normal" rate is tuned for free-scrolling content that coasts a while after a
                flick — on a pagingEnabled carousel that only ever travels one card width, that same
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

            {/* Also directly under the carousel, not grouped under "Display" above it — color/
                appearance are both about how the mode art itself looks, but keyboard layout is
                unrelated to that, just another rarely-touched preference that happens to live in
                this drawer too. */}
            <View testID='mode-picker-keyboard-section'>
              <Text variant='titleMedium' style={styles.keyboardLabel}>
                Keyboard layout
              </Text>
              <View style={styles.keyboardRow}>
                <SegmentedButtons value={layout} onValueChange={(value) => setLayout(value as typeof layout)} buttons={keyboardButtons} />
              </View>
            </View>

            {/* Folded in from the now-removed SettingsDrawer — haptics and sound are both feedback
                for the same events (guesses, wins, losses), so "Feedback" rather than a title naming
                just one of them, same reasoning that drawer's own title used. Primary-tinted — the
                same role the carousel's own selected-card frame/name/pips get from the seed color
                (see appearanceButtons' own comment on why that hue IS primary), reused here rather
                than left unused: this section sits far enough down the page, and switches look
                different enough from a card frame or a segmented control, that repeating the hue
                doesn't read as an echo of anything nearby the way Display's own picker buttons did.
                Between this, Display's secondary, and Keyboard layout's tertiary, every section on
                this page now uses a genuinely different accent from its neighbors above and below
                it, and all three theme colors show up somewhere. No gear icon anywhere anymore: the
                mode summary row is this drawer's only entry point now, so these two rarely-touched
                toggles just ride along at the bottom of it instead of needing a whole second
                drawer. */}
            <View testID='mode-picker-feedback-section'>
              <Text variant='titleMedium' style={styles.feedbackLabel}>
                Feedback
              </Text>
              <View style={styles.feedbackRow}>
                <View style={styles.flex}>
                  <Text variant='bodyMedium'>Vibrate on tap</Text>
                  <Text variant='bodySmall' style={styles.muted}>
                    Haptic feedback for guesses and buttons
                  </Text>
                </View>
                <Switch value={hapticSettings.vibrate} onValueChange={(vibrate) => setHapticSettings({ vibrate })} color={theme.colors.primary} accessibilityLabel='Vibrate on tap' />
              </View>
              <View style={[styles.feedbackRow, styles.feedbackRowSpacing]}>
                <View style={styles.flex}>
                  <Text variant='bodyMedium'>Sound effects</Text>
                  <Text variant='bodySmall' style={styles.muted}>
                    Play a sound for guesses, wins, and losses
                  </Text>
                </View>
                <Switch value={soundSettings.enabled} onValueChange={setSoundEnabled} color={theme.colors.primary} accessibilityLabel='Sound effects' />
              </View>
            </View>
          </ScrollView>

          {/* Selection already happened live while scrolling (see handleScroll above) — this just
              closes, same as the header's own close button. No mode name on the button: the focused
              card already names itself in giant text right above this, repeating it here would be
              redundant. "Done" rather than "Select" — this drawer confirms color/appearance/keyboard
              layout and feedback too, not just the mode, so a mode-specific verb would undersell
              what's being closed out of. Full width: this is the one and only action in the footer,
              no reason to leave it thumb-width. */}
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
  // No Card behind these anymore — just the segmented control (and, for Display, the palette
  // picker) sitting directly on the drawer's own background, so this only needs the same
  // marginHorizontal/row layout a Card.Content would have given them, not a container of its own.
  displayRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 4,
    marginHorizontal: 16
  },
  // Same label+subtitle-left/Switch-right row shape the old SettingsDrawer used inside its own
  // Card, just without a Card behind it now — matching Display/Keyboard layout's own boxless
  // treatment above.
  feedbackLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 12
  },
  feedbackRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginHorizontal: 16
  },
  feedbackRowSpacing: { marginTop: 16 },
  flex: { flex: 1 },
  // paddingVertical/paddingHorizontal match ScrollViewHeader's own actionMargin — same convention
  // PuzzleDrawer's own footer uses.
  footer: {
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  // ScrollViewFooter's own row style centers children at their natural width by default — this
  // stretches the one and only footer button to fill that row instead.
  footerButton: { width: '100%' },
  info: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  keyboardLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 12
  },
  keyboardRow: { marginHorizontal: 16 },
  label: {
    fontWeight: '700'
  },
  list: { marginTop: 8, overflow: 'hidden' },
  muted: { marginTop: 2, opacity: 0.7 },
  panelContent: {
    flex: 1,
    overflow: 'hidden'
  },
  // Same pip proportions as Game.tsx's own wrong-guess row (borderRadius 6, 1.5 border, 12x12) —
  // same visual language, different meaning (page position, not mistakes remaining).
  pip: { borderRadius: 6, borderWidth: 1.5, height: 12, width: 12 },
  pipRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 12 },
  preview: {
    flex: 1,
    width: '100%'
  },
  previewVisual: { flex: 1, width: '100%' },
  // Matches SettingsDrawer/PuzzleDrawer's own scrollContent convention — a little breathing room
  // below the last section, on top of (not instead of) the real footer clearance ScrollViewProvider's
  // footerFixed reserves automatically.
  scrollContent: { paddingBottom: 12 }
})
