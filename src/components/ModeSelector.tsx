import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { ALL_MODES } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import { horizontalWheelScrollProps } from '@/utils/horizontalWheelScroll'

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

const ModePreview = ({ mode, color }: PreviewProps) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const previewMistakes = Math.floor(mode.maxMistakes / 2)
  const { Visual } = mode

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }, [])

  return (
    <View style={styles.preview} onLayout={handleLayout}>
      {size.width > 0 && <Visual mistakes={previewMistakes} color={color} width={size.width} height={size.height} />}
    </View>
  )
}

type Props = {
  selected: GameMode
  color: string
  onSelect: (mode: GameMode) => void
}

// Memoized — this renders inside PuzzleDrawer, which re-renders on every keystroke typed into the
// custom-phrase/hint fields. Without memoizing (and keeping `selected`/`onSelect` referentially
// stable from the caller), the whole mode carousel re-rendered on every keystroke for no reason.
export const ModeSelector = React.memo(({ selected, color, onSelect }: Props) => {
  const theme = useTheme()
  const listRef = useRef<FlatList<GameMode>>(null)
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

  // Scrolls the carousel to whichever mode is already selected — without this, reopening the
  // drawer (or landing on a shared puzzle that specifies a non-default mode) always left the
  // carousel at its first card with nothing visibly highlighted, even though a mode WAS selected.
  useEffect(() => {
    if (containerWidth === 0) return
    const index = ALL_MODES.findIndex((m) => m.id === selected.id)
    if (index < 0) return
    listRef.current?.scrollToOffset({ offset: index * snapInterval, animated: false })
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
    <View testID='mode-selector-container' onLayout={handleContainerLayout}>
      {/* initialNumToRender covers the full list — with only 16 lightweight cards, windowing buys
          nothing but risks scrollToOffset (above) targeting a card that hasn't measured yet. */}
      {containerWidth > 0 && <FlatList ref={listRef} data={ALL_MODES} renderItem={renderCard} keyExtractor={(item) => item.id} horizontal showsHorizontalScrollIndicator={false} snapToInterval={snapInterval} decelerationRate='fast' initialNumToRender={ALL_MODES.length} style={styles.list} contentContainerStyle={{ paddingHorizontal: sidePadding }} {...horizontalWheelScrollProps} />}
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
