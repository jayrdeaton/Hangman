import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

// The back arrow's corner: ScrollViewHeader's 4pt action margin plus the 40pt action (every drawer here
// passes actionSize={40}), and an 8pt gap past it.
const ACTION_CLEARANCE = 52

// A pack's name as a drawer header's title (ScrollViewHeader's centerContent), for the pack views
// (PackPuzzlesDrawer, PackProgressDrawer's drill-in). ScrollViewHeader's own title spans the whole bar,
// which is fine for a fixed title like "Choose Packs", but a pack's name can be a custom pack's, up to 60
// characters, and would run under the back arrow. This is the same type, cut short clear of both corners.
export const PackHeaderTitle = ({ label }: { label: string }): JSX.Element => {
  const theme = useTheme()
  return (
    <View style={styles.container} pointerEvents='none'>
      <Text numberOfLines={1} accessibilityRole='header' style={[styles.title, { color: theme.colors.onSurface }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', paddingHorizontal: ACTION_CLEARANCE },
  // ScrollViewHeader's own title type.
  title: { fontSize: 20, fontWeight: '400', textAlign: 'center' }
})
