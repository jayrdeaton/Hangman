import { useAutoPaperTheme } from '@rific/auto-paper'
import { JSX, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

export type SettingsSectionProps = {
  label: string
  children: ReactNode
}

// One app-specific group inside the fleet Settings sheet (SettingsDialog.tsx). The same uppercase,
// letter-spaced label BaseSettingsDialog's own APPEARANCE heading uses, so Hangman's rows read as part
// of that sheet rather than something bolted on. A copy of Solitaire's SettingsSection.
export const SettingsSection = ({ label, children }: SettingsSectionProps): JSX.Element => {
  const { colors } = useAutoPaperTheme()
  return (
    <View style={styles.section}>
      <Text variant='labelMedium' style={[styles.label, { color: colors.onSurfaceVariant }]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { letterSpacing: 2 },
  section: { gap: 12 }
})
