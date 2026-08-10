import { Pressable } from '@rific/haptic-press'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, LayoutChangeEvent, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { useHorizontalWheelScrollProps } from '@/hooks/useHorizontalWheelScroll'
import { VISIBLE_MODES } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'

const CARD_MARGIN = 8
const PREVIEW_HEIGHT = 130

const CATEGORY_LABEL: Record<GameMode['category'], string> = {
  parts: 'Parts',
  frames: 'Frames',
  quantitative: 'Procedural',
  minimal: 'Minimal'
}

type PreviewProps = {
  mode: GameMode
  color: string
}

// No measure-then-mount dance — GameMode['Visual'] no longer takes width/height (see its own doc
// comment for why), so there's nothing to wait on. styles.preview below already has a fixed
// height and 100% width, so Visual's own <Svg> (defaulting to 100%/100%, no width/height passed —
// see react-native-svg's own Svg.tsx) fills it immediately on first render, same as GameVisual.tsx.
const ModePreview = ({ mode, color }: PreviewProps) => {
  const previewMistakes = Math.floor(mode.maxMistakes / 2)
  const { Visual } = mode

  return (
    <View style={styles.preview}>
      <Visual mistakes={previewMistakes} color={color} />
    </View>
  )
}

type Props = {
  selected: GameMode
  color: string
  onSelect: (mode: GameMode) => void
}

// Memoized — this renders inside PuzzleDrawer, which re-renders on every local state change (a
// difficulty pick, Choose Packs opening, etc). Without memoizing (and keeping `selected`/`onSelect`
// referentially stable from the caller), the whole mode carousel re-rendered for changes that have
// nothing to do with it.
export const ModeSelector = React.memo(({ selected, color, onSelect }: Props) => {
  const theme = useTheme()
  const listRef = useRef<FlatList<GameMode>>(null)
  const horizontalWheelScrollProps = useHorizontalWheelScrollProps()
  // Measured, not Dimensions-derived: module-scope window width is 0 on web. This carousel only
  // ever renders inside the fixed-width puzzle drawer, so a one-card-plus-peek ratio (matching the
  // native app) is always the right fit — there's no wide desktop container to account for here.
  const [containerWidth, setContainerWidth] = useState(0)
  const cardWidth = Math.round(containerWidth * 0.68)
  const snapInterval = cardWidth + CARD_MARGIN * 2
  const sidePadding = (containerWidth - cardWidth) / 2 - CARD_MARGIN

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width)
  }, [])

  // True once this effect has centered a card at least once — false only for the very first run
  // (see below).
  const hasCenteredOnceRef = useRef(false)

  // Scrolls the carousel to whichever mode is already selected — without this, reopening the
  // drawer (or landing on a shared puzzle that specifies a non-default mode) always left the
  // carousel at its first card with nothing visibly highlighted, even though a mode WAS selected.
  // Instant (animated: false) only the FIRST time this runs, i.e. the drawer just opened/mounted —
  // an animated scroll on open would read as unwanted motion for something that should just
  // already be positioned correctly. Every later run — the player actually tapping a different,
  // off-center "peek" card — animates instead: that card sliding smoothly into place is real,
  // trustworthy feedback that the tap landed. An instant, un-animated jump right as a finger lifts
  // is very likely what was making a tap on a peek card need pressing twice — the list relocating
  // out from under the finger mid-release reads to the OS as an interrupted gesture, not a
  // completed tap, so the first tap silently did nothing visible and the second (now already
  // centered, not moving) tap is the one that visibly "worked."
  useEffect(() => {
    if (containerWidth === 0) return
    const index = VISIBLE_MODES.findIndex((m) => m.id === selected.id)
    if (index < 0) return
    listRef.current?.scrollToOffset({ offset: index * snapInterval, animated: hasCenteredOnceRef.current })
    hasCenteredOnceRef.current = true
  }, [containerWidth, selected.id, snapInterval])

  const renderCard = useCallback(
    ({ item }: { item: GameMode }) => {
      const isSelected = item.id === selected.id

      return (
        <Pressable style={[styles.card, { width: cardWidth }, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }, isSelected && { borderColor: color, backgroundColor: theme.colors.surface }]} onPress={() => onSelect(item)} accessibilityRole='button' accessibilityLabel={`${item.label} mode, ${CATEGORY_LABEL[item.category]}. ${item.description}`} accessibilityState={{ selected: isSelected }}>
          <ModePreview mode={item} color={isSelected ? color : theme.colors.onSurfaceVariant} />
          <View style={styles.info}>
            <Text variant='titleSmall' style={[styles.label, { color: isSelected ? color : theme.colors.onSurface }]}>
              {item.label}
            </Text>
            <View style={styles.badges}>
              <View style={[styles.badge, { backgroundColor: theme.colors.secondaryContainer }]}>
                <Text variant='labelSmall' style={{ color: theme.colors.onSecondaryContainer }}>
                  {CATEGORY_LABEL[item.category]}
                </Text>
              </View>
            </View>
            <Text variant='bodySmall' numberOfLines={2} style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
              {item.description}
            </Text>
          </View>
        </Pressable>
      )
    },
    [selected.id, color, theme, onSelect, cardWidth]
  )

  return (
    <View testID='mode-selector-container' style={styles.container} onLayout={handleContainerLayout}>
      {/* initialNumToRender covers the full list — with this few lightweight cards, windowing buys
          nothing but risks scrollToOffset (above) targeting a card that hasn't measured yet. */}
      {/* disableIntervalMomentum: without it, a fast fling carries enough leftover momentum to sail
          past several cards before the snap logic catches it, so a tap meant to select a card
          often lands while the list is still coasting — the touch gets claimed as "stop the
          scroll" instead of reaching the card's onPress, and the list needing a second (sometimes
          a third) tap to actually register a selection. Capping momentum at one snap interval per
          gesture means the list is at rest again almost immediately after a finger lifts, so the
          very next tap reliably lands on a stationary card. */}
      {containerWidth > 0 && <FlatList ref={listRef} data={VISIBLE_MODES} renderItem={renderCard} keyExtractor={(item) => item.id} horizontal showsHorizontalScrollIndicator={false} snapToInterval={snapInterval} disableIntervalMomentum decelerationRate='normal' initialNumToRender={VISIBLE_MODES.length} style={styles.list} contentContainerStyle={{ paddingHorizontal: sidePadding }} {...horizontalWheelScrollProps} />}
    </View>
  )
})

ModeSelector.displayName = 'ModeSelector'

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
    borderRadius: 12,
    borderWidth: 2,
    marginHorizontal: CARD_MARGIN,
    overflow: 'hidden'
  },
  // Without this, the carousel's peek cards (see cardWidth/sidePadding above) paint past the
  // drawer panel's own edge on web instead of clipping there — every ancestor up to the drawer
  // clips correctly, but this container had no style at all, so it defaulted to overflow: visible.
  container: {
    overflow: 'hidden',
    width: '100%'
  },
  description: {
    lineHeight: 16
  },
  info: {
    paddingBottom: 10,
    paddingHorizontal: 10,
    paddingTop: 6
  },
  label: {
    fontWeight: '700'
  },
  // Defensive: ScrollView/FlatList default to flexGrow: 1, which would stretch this carousel to
  // fill any leftover space in a flex-growing ancestor.
  list: {
    flexGrow: 0,
    flexShrink: 0
  },
  preview: {
    height: PREVIEW_HEIGHT,
    width: '100%'
  }
})
