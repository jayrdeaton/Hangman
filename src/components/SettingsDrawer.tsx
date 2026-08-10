import { AppearancePicker, PalettePicker, useThemeSettings } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { SegmentedButtons, Switch, useHapticSettings, useVibration } from '@rific/haptic-press'
import { ScrollView, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { DRAWER_SETTINGS_Z_INDEX } from '@/constants/drawerStacking'
import { useKeyboardLayout } from '@/hooks/useKeyboardLayout'
import { resolveSeedColor } from '@/utils/resolveSeedColor'

const DRAWER_WIDTH = 380
// Opacity folded into the color itself — boxShadow (unlike the deprecated shadow* props it
// replaces) has no separate opacity field.
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)'

export type SettingsDrawerProps = {
  visible: boolean
  onDismiss: () => void
}

// Split out of the Game Menu (PuzzleDrawer) — that drawer is about getting a game going as fast as
// possible (packs, difficulty, Random, Pass & play), so appearance/keyboard/haptics, which get
// touched rarely once set, moved here instead of sitting permanently at the top of it. Reached via
// the gear icon in PuzzleDrawer's own header, left-anchored to match it (same Game Menu lineage as
// PackPuzzlesDrawer/PacksScreen — see PuzzleDrawer's own header comment) rather than
// AchievementsDrawer's right-anchored convention, since this opens from within PuzzleDrawer, not
// from Main's top-level app bar.
// Memoized: stays mounted (translated off-screen) even while closed — see PuzzleDrawer's own
// memo comment for why an always-mounted, never-visible-right-now subtree still costs a
// re-render without this whenever an unrelated ancestor state change bubbles through it.
export const SettingsDrawer = memo(({ visible, onDismiss }: SettingsDrawerProps): JSX.Element => {
  const { settings, set } = useThemeSettings()
  const { layout, setLayout } = useKeyboardLayout()
  const { settings: hapticSettings, set: setHapticSettings } = useHapticSettings()
  const { selection } = useVibration()

  return (
    <Drawer open={visible} onClose={onDismiss} width={DRAWER_WIDTH} zIndex={DRAWER_SETTINGS_Z_INDEX}>
      <View testID='settings-drawer-panel' style={styles.panelContent} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        <ScrollViewProvider>
          <ScrollViewHeader
            title='Settings'
            backAction={() => {
              selection()
              onDismiss()
            }}
            backActionAccessibilityLabel='Close'
          />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <Text variant='titleMedium' style={styles.topSectionLabel}>
              Appearance
            </Text>
            <View style={styles.row}>
              <PalettePicker value={resolveSeedColor(settings.color)} onChange={(color) => set({ color })} />
              <View style={styles.flex}>
                <AppearancePicker value={settings.appearance} onChange={(appearance) => set({ appearance })} showLabels={false} />
              </View>
            </View>

            <Text variant='titleMedium' style={styles.sectionLabel}>
              Keyboard layout
            </Text>
            <SegmentedButtons
              value={layout}
              onValueChange={(value) => setLayout(value as typeof layout)}
              buttons={[
                { value: 'qwerty', label: 'QWERTY' },
                { value: 'abc', label: 'ABC' }
              ]}
            />

            {/* Sound effects don't exist yet (PLAN.md's own idea for adding them, separate from
                this) — a toggle for playback that doesn't exist yet would be dead UI, so only
                haptics gets a real switch here for now. */}
            <Text variant='titleMedium' style={styles.sectionLabel}>
              Haptics
            </Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text variant='bodyMedium'>Vibrate on tap</Text>
                <Text variant='bodySmall' style={styles.muted}>
                  Haptic feedback for guesses and buttons
                </Text>
              </View>
              <Switch value={hapticSettings.vibrate} onValueChange={(vibrate) => setHapticSettings({ vibrate })} accessibilityLabel='Vibrate on tap' />
            </View>
          </ScrollView>
        </ScrollViewProvider>
      </View>
    </Drawer>
  )
})
SettingsDrawer.displayName = 'SettingsDrawer'

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { marginTop: 2, opacity: 0.7 },
  panelContent: {
    boxShadow: [{ offsetX: 2, offsetY: 0, blurRadius: 8, color: SHADOW_COLOR }],
    elevation: 8,
    flex: 1,
    overflow: 'hidden'
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: 16
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 20
  },
  topSectionLabel: {
    fontWeight: '700',
    marginBottom: 8
  }
})
