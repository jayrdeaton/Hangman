import { resolveSeedColor, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import { TouchableRipple } from '@rific/feedback-press'
import { JSX, memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { VISIBLE_MODES } from '@/modes/registry'
import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import type { GameMode } from '@/types/gameModes'

import { GameVisual } from './GameVisual'

// Five to a row: the ten visible arts are two full rows. The sheet's content is 279pt wide on a 375pt
// phone (hud's 327pt card less its 24pt padding a side), so a cell is 57pt and its thumbnail 51pt,
// over the 48pt tap target. A 360pt Android phone still gets 48pt thumbnails (264pt of content).
const COLUMNS = 5
// Half the gap between two thumbnails. Each cell is an exact fifth of the row, padded by this, and the
// grid hangs this far past the section's edges, so the thumbnails themselves line up with the rows
// above and below with no measuring (only the cells' invisible padding overhangs).
const CELL_INSET = 3

type ArtThumbnailProps = {
  mode: GameMode
  selected: boolean
  color: string
  colors: string[]
  onSelect: (mode: GameMode) => void
}

// One art, drawn complete (fullyDrawnMistakes) in the player's colors, the selected one framed in
// primary. Static: no demo loop, so the sheet runs no timers (the modes only sketch themselves in once
// as the sheet opens, on the UI thread). Memoized, so a pick re-renders just the old and new picks.
const ArtThumbnail = memo(({ mode, selected, color, colors, onSelect }: ArtThumbnailProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  return (
    <View style={styles.cell}>
      <TouchableRipple onPress={() => onSelect(mode)} accessibilityRole='button' accessibilityLabel={`${mode.label} art`} accessibilityState={{ selected }} style={[styles.thumbnail, { backgroundColor: theme.colors.surface, borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant }]}>
        <GameVisual mode={mode} mistakes={fullyDrawnMistakes(mode)} color={color} colors={colors} style={styles.visual} />
      </TouchableRipple>
    </View>
  )
})
ArtThumbnail.displayName = 'ArtThumbnail'

export type ArtPickerProps = {
  selected: GameMode
  // Called on a tap, with nothing to confirm after it. Keep it stable (useSelectArt's is): every
  // thumbnail is memoized on it.
  onSelect: (mode: GameMode) => void
}

// The Settings sheet's ART section (SettingsDialog): every art the picker offers (VISIBLE_MODES) as a
// thumbnail, then the picked art's name and description. Controlled: the sheet hands it the active
// player's art and useSelectArt's pick, read outside the sheet's Portal (see SettingsDialog). It
// replaced the Customize drawer's carousel (ModePickerDrawer), whose card demo loop had to be paused
// whenever the drawer was closed; the sheet unmounts its rows after its close fade (auto-paper's
// Dialog), so nothing here outlives the sheet either.
export const ArtPicker = ({ selected, onSelect }: ArtPickerProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  const { settings } = useThemeSettings()
  const color = resolveSeedColor(settings.color)
  // The same triad PuzzleStage builds for the real board, so a thumbnail shows the art's full colors.
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])

  return (
    <View style={styles.picker}>
      <View style={styles.grid}>
        {VISIBLE_MODES.map((mode) => (
          <ArtThumbnail key={mode.id} mode={mode} selected={mode.id === selected.id} color={color} colors={colors} onSelect={onSelect} />
        ))}
      </View>
      {/* Two lines kept for the description whichever art is picked (the longest takes two on a
          phone), so a pick doesn't resize the sheet under the player's finger. */}
      <View>
        <Text variant='titleSmall' style={{ color: theme.colors.onSurface }}>
          {selected.label}
        </Text>
        <Text variant='bodySmall' style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
          {selected.description}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cell: { padding: CELL_INSET, width: `${100 / COLUMNS}%` },
  // bodySmall's 16pt line height, twice.
  description: { minHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -CELL_INSET },
  picker: { gap: 12 },
  // The visual is a square scene (every mode draws in a 100x100 viewBox), so the thumbnail is too.
  thumbnail: { aspectRatio: 1, borderRadius: 8, borderWidth: 2, overflow: 'hidden' },
  visual: { flex: 1, width: '100%' }
})
