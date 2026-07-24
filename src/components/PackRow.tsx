import { JSX, ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { Card, ProgressBar, Text, useTheme } from 'react-native-paper'

export type PackRowProps = {
  label: string
  subtitle: string
  progress?: number
  onPress?: () => void
  leading?: ReactNode
  trailing?: ReactNode
}

export const PackRow = ({ label, subtitle, progress, onPress, leading, trailing }: PackRowProps): JSX.Element => {
  const theme = useTheme()

  return (
    <Card style={styles.card} mode='contained' onPress={onPress}>
      <Card.Content style={styles.row}>
        {leading}
        <View style={styles.text}>
          <Text variant='titleSmall'>{label}</Text>
          <Text variant='bodySmall' style={styles.muted}>
            {subtitle}
          </Text>
          {progress === undefined ? null : (
            <View style={styles.progressBarWrapper}>
              <ProgressBar progress={progress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
            </View>
          )}
        </View>
        {trailing}
      </Card.Content>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { marginBottom: 4 },
  muted: { opacity: 0.7 },
  progressBar: {
    borderRadius: 6,
    height: 6
  },
  progressBarWrapper: {
    height: 6,
    marginTop: 8,
    overflow: 'hidden'
  },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  text: { flex: 1, flexShrink: 1 }
})
