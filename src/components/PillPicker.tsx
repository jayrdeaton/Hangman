import { type PopoverHost, WELL_SHADOW } from '@tastic/hud/chrome'
import { OptionPicker, type OptionPickerOption } from '@tastic/profile'
import { JSX, memo, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useTheme } from 'react-native-paper'

import { type DifficultyOptionColors, useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import type { DifficultyFilter } from '@/redux/playerSettingsSlice'

export type PillPickerOption<T extends string> = { value: T; label: string; icon: string }

export type PillPickerProps<T extends string> = {
  // The popover id this pill toggles on `host`.
  id: string
  host: PopoverHost
  options: PillPickerOption<T>[]
  // Each option's colors: its row's icon (vibrant), and once picked the chip, the menu's border and
  // picked row (vibrant) and the pill itself (container).
  colors: Record<T, Pick<DifficultyOptionColors, 'vibrant' | 'container'>>
  value: T
  onChange: (value: T) => void
}

// One of the app's picker pills: @tastic/profile's OptionPicker (the fleet's CPU difficulty control in
// hud's PlayerSetupPanel), the same pill and popover as the players' pickers. The pill is raised off the
// board like PlayerPicker's and filled with the picked option's muted container color, the fleet's black
// or white label and chevron reading on it; its chip, the menu's border and the picked row take the
// option's vibrant color, and every other row's icon its own option's (@tastic/profile 0.16.1+). The
// loadout's Difficulty, and a pack's page's filters (Jay, 2026-10-19: one dropdown look for the app).
// The caller hosts the popover and its press away catcher.
export const PillPicker = <T extends string>({ id, host, options, colors, value, onChange }: PillPickerProps<T>): JSX.Element => {
  const theme = useTheme()
  const rows = useMemo((): OptionPickerOption<T>[] => options.map((option) => ({ ...option, color: colors[option.value].vibrant })), [options, colors])
  const icon = options.find((option) => option.value === value)?.icon ?? options[0].icon
  const container = colors[value].container
  const pillStyle = useMemo(() => [styles.pill, { backgroundColor: container }], [container])
  return <OptionPicker id={id} host={host} options={rows} value={value} onChange={onChange} color={colors[value].vibrant} dark={theme.dark} icon={icon} triggerStyle={pillStyle} />
}

// Signal bars for the tiers, an open set for Any (every tier).
export const DIFFICULTY_TIERS: PillPickerOption<DifficultyFilter>[] = [
  { value: 'any', label: 'Any', icon: 'all-inclusive' },
  { value: 'easy', label: 'Easy', icon: 'signal-cellular-1' },
  { value: 'medium', label: 'Medium', icon: 'signal-cellular-2' },
  { value: 'hard', label: 'Hard', icon: 'signal-cellular-3' }
]

// Difficulty as a picker pill, in the colors the board's difficulty badge uses (Any is the theme's
// primary). A pill rather than a segmented control, which cut "Medium" short on small phones; the
// difficulty is a saved pick, so the extra tap costs little.
export const DifficultyPicker = memo(({ id, host, value, onChange }: { id: string; host: PopoverHost; value: DifficultyFilter; onChange: (value: DifficultyFilter) => void }): JSX.Element => {
  const colors = useDifficultyOptionColors()
  return <PillPicker id={id} host={host} options={DIFFICULTY_TIERS} colors={colors} value={value} onChange={onChange} />
})
DifficultyPicker.displayName = 'DifficultyPicker'

const styles = StyleSheet.create({
  // Rounded at both ends, like PlayerPicker's, and raised off the board the same way.
  pill: { borderRadius: 999, boxShadow: WELL_SHADOW }
})
