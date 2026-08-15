import { Dialog } from '@rific/auto-paper'
import { Button } from '@rific/haptic-press'
import { JSX, useEffect } from 'react'
import { AccessibilityInfo, StyleSheet, View } from 'react-native'
import { Icon, ProgressBar, Text, useTheme } from 'react-native-paper'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

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
  // Already-resolved titles (e.g. "Flawless Victory"), not raw AchievementId — keeps this a plain
  // presentational component with no dependency on achievements.ts, the same way categoryProgress
  // above arrives pre-resolved rather than as a packKey this dialog would have to look up itself.
  unlockedAchievementTitles?: string[]
  onDismiss: () => void
  // Overrides the continue button's wording. Pass-and-play uses this because continuing there means
  // writing the next word rather than being handed another puzzle. Nothing else about the result
  // changes: whoever is holding the device is "you", so the outcome copy stays as-is.
  continueLabel?: string
}

export const RoundEndDialog = ({ visible, outcome, phrase, categoryProgress, unlockedAchievementTitles, onDismiss, continueLabel }: RoundEndDialogProps): JSX.Element => {
  const theme = useTheme()
  // Not gated on outcome === 'win' -- a pass-and-play LOSS can still cross a "games played"
  // threshold (see achievements.ts's pnp_played_* ladder), and the solo path never populates
  // unlockedAchievementTitles on a loss (recordLoss unlocks nothing), so this stays false there
  // regardless.
  const hasUnlocks = Boolean(unlockedAchievementTitles?.length)

  // Gentle, continuous grow-and-settle rather than a one-shot pulse — the dialog has no fixed
  // lifetime (it stays up until "Next puzzle" is pressed), so a single pulse would read as done and
  // forgotten long before the player actually dismisses it.
  const trophyScale = useSharedValue(1)
  useEffect(() => {
    if (!visible || !hasUnlocks) {
      trophyScale.value = 1
      return
    }
    trophyScale.value = withRepeat(withSequence(withTiming(1.15, { duration: 350 }), withTiming(1, { duration: 350 })), -1, true)
  }, [visible, hasUnlocks, trophyScale])
  const trophyAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: trophyScale.value }] }))

  // @rific/auto-paper's Dialog renders through a custom Portal+BlurView path when the app's
  // (default-on) blur setting is enabled, which — unlike react-native-paper's own Modal — sets no
  // accessibilityViewIsModal/accessibilityLiveRegion props. Without an explicit announcement here,
  // a screen-reader user gets no signal the round ended or which way it went.
  useEffect(() => {
    if (!visible || !outcome) return
    const base = outcome === 'win' ? `You win! The word was ${phrase}.` : `You lost! The word was ${phrase}.`
    const unlockSuffix = hasUnlocks ? ` Achievement${unlockedAchievementTitles!.length > 1 ? 's' : ''} unlocked: ${unlockedAchievementTitles!.join(', ')}.` : ''
    AccessibilityInfo.announceForAccessibility(base + unlockSuffix)
  }, [visible, outcome, phrase, hasUnlocks, unlockedAchievementTitles])

  return (
    <Dialog visible={visible} onDismiss={onDismiss}>
      <Dialog.Content style={styles.content}>
        <Text variant='headlineMedium' style={styles.title}>
          {outcome === 'win' ? 'You win!' : 'You lost!'}
        </Text>
        <Text variant='titleLarge' style={styles.phrase}>
          {phrase}
        </Text>
        {/* Replaces the old achievement-unlock Snackbar (previously fired independently of this
            dialog, timed out on its own 3s clock, and queued one at a time) — now it's just part of
            the win itself, shown for as long as the dialog is, every newly-unlocked achievement at
            once rather than staggered. */}
        {hasUnlocks ? (
          <View style={styles.achievements}>
            <Animated.View style={trophyAnimatedStyle}>
              <Icon source='trophy' size={32} color={theme.colors.tertiary} />
            </Animated.View>
            <Text variant='titleMedium' style={styles.achievementsHeading}>
              Achievement{unlockedAchievementTitles!.length > 1 ? 's' : ''} unlocked
            </Text>
            {unlockedAchievementTitles!.map((title) => (
              <Text key={title} variant='bodyMedium' style={styles.achievementTitle}>
                {title}
              </Text>
            ))}
          </View>
        ) : null}
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
  achievementTitle: { marginTop: 2, opacity: 0.8 },
  achievements: { alignItems: 'center', marginTop: 20 },
  achievementsHeading: { fontWeight: '700', marginTop: 8 },
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
