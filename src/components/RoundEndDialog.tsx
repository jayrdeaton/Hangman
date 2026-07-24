import { Dialog } from '@rific/auto-paper'
import { JSX, useEffect } from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import { Button, ProgressBar, Text, useTheme } from 'react-native-paper'

import { commaString } from '@/utils/commaString'

export type RoundEndOutcome = 'win' | 'loss'

export type CategoryProgress = {
  label: string
  unlockedCount: number
  totalCount: number
}

export type RoundEndDialogProps = {
  visible: boolean
  outcome: RoundEndOutcome | null
  phrase: string
  categoryProgress?: CategoryProgress | null
  onDismiss: () => void
  onAnotherInCategory?: () => void
}

export const RoundEndDialog = ({ visible, outcome, phrase, categoryProgress, onDismiss, onAnotherInCategory }: RoundEndDialogProps): JSX.Element => {
  const theme = useTheme()
  const showAnother = outcome === 'win' && Boolean(categoryProgress) && Boolean(onAnotherInCategory)

  // @rific/auto-paper's Dialog renders through a custom Portal+BlurView path when the app's
  // (default-on) blur setting is enabled, which — unlike react-native-paper's own Modal — sets no
  // accessibilityViewIsModal/accessibilityLiveRegion props. Without an explicit announcement here,
  // a screen-reader user gets no signal the round ended or which way it went.
  useEffect(() => {
    if (!visible || !outcome) return
    AccessibilityInfo.announceForAccessibility(outcome === 'win' ? `You win! The word was ${phrase}.` : `You lost! The word was ${phrase}.`)
  }, [visible, outcome, phrase])

  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Content style={styles.content}>
        <Text variant='headlineMedium' style={styles.title}>
          {outcome === 'win' ? 'You win!' : 'You lost!'}
        </Text>
        <Text variant='titleLarge' style={styles.phrase}>
          {phrase}
        </Text>
        {outcome === 'win' && categoryProgress && categoryProgress.totalCount > 0 ? (
          <View style={styles.progress}>
            <Text variant='bodySmall' style={styles.progressLabel}>
              {commaString(categoryProgress.unlockedCount)} of {commaString(categoryProgress.totalCount)} unlocked in {categoryProgress.label}
            </Text>
            <View style={styles.progressBarWrapper}>
              <ProgressBar progress={categoryProgress.unlockedCount / categoryProgress.totalCount} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
            </View>
          </View>
        ) : null}
        {showAnother ? (
          // Top/primary spot and label kept to one word — pack labels ("Theme Holidays
          // Celebrations") can run long enough to wrap inside the button's fixed-height content
          // box and get clipped, and the category is already named in the progress line above.
          // accessibilityLabel spells the action out in full for screen-reader users navigating
          // without that visual context.
          <Button mode='contained' onPress={onAnotherInCategory} accessibilityLabel='Another puzzle in this category' style={styles.button} contentStyle={styles.buttonContent}>
            Another
          </Button>
        ) : null}
        <Button mode={showAnother ? 'outlined' : 'contained'} onPress={onDismiss} style={styles.button} contentStyle={styles.buttonContent}>
          Next puzzle
        </Button>
      </Dialog.Content>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  button: { marginTop: 20 },
  buttonContent: { height: 48 },
  content: { alignItems: 'center', paddingVertical: 24 },
  phrase: { marginTop: 8, textAlign: 'center' },
  progress: { alignSelf: 'stretch', marginTop: 20 },
  progressBar: {
    borderRadius: 6,
    height: 6
  },
  progressBarWrapper: {
    height: 6,
    marginTop: 8,
    overflow: 'hidden'
  },
  progressLabel: { opacity: 0.7, textAlign: 'center' },
  title: { fontWeight: '800' }
})
