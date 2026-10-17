import { AutoPalettePicker } from '@rific/auto-paper'
import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

export type ColorsRowProps = {
  // The page's first row, under the header: the loadouts' 12pt top gap rather than a section's 16.
  first?: boolean
}

// TEMPORARY, until the player picker: the active player's palette, at the top of both loadouts. It
// lived in the Customize drawer beside the art carousel until the art moved to the Settings sheet
// (ArtPicker), and its long-term home is the profile picker's color page, which replaces this row
// (and this file) in a later phase. auto-paper's AutoPalettePicker reads and writes the live theme
// itself, color and harmony, and Theme's PlayerThemeSync files every change as the active player's,
// so there's nothing to wire up here. Compact on purpose: a heading-sized label with the picker's
// swatch beside it, which opens the palette dialog (with Android back closing it first).
export const ColorsRow = ({ first = false }: ColorsRowProps): JSX.Element => (
  <View testID='colors-row' style={[styles.row, first ? styles.firstRow : styles.laterRow]}>
    <Text variant='titleMedium' style={styles.label}>
      Colors
    </Text>
    <AutoPalettePicker />
  </View>
)

const styles = StyleSheet.create({
  // The same top gaps as LoadoutShell's SectionLabel, first or not.
  firstRow: { marginTop: 12 },
  // SectionLabel's weight, so the row reads as one of the page's headings with its control beside it.
  label: { fontWeight: '700' },
  laterRow: { marginTop: 16 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }
})
