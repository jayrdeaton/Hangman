import { Dialog } from '@rific/auto-paper'
import { Button } from '@rific/haptic-press'
import { JSX, useEffect } from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import { ProgressBar, Text, useTheme } from 'react-native-paper'

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
  // Overrides the continue button's wording. Pass-and-play uses this because continuing there means
  // writing the next word rather than being handed another puzzle. Nothing else about the result
  // changes: whoever is holding the device is "you", so the outcome copy stays as-is.
  continueLabel?: string
}

export const RoundEndDialog = ({ visible, outcome, phrase, categoryProgress, onDismiss, continueLabel }: RoundEndDialogProps): JSX.Element => {
  const theme = useTheme()

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
        {/* One button that already knows where to draw the next puzzle from — see
            GameStartPayload.packScope and Main's handleRoundEnd: still inside the pack the player
            was browsing if they were browsing one, otherwise back to their whole selection. No
            separate "stay in this pack" action needed since it's not really a choice, just what
            continuing already means given how this round started. */}
        <Button mode='contained' onPress={onDismiss} style={styles.button} contentStyle={styles.buttonContent}>
          {continueLabel ?? 'Next puzzle'}
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
