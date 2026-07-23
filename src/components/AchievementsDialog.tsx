import { JSX, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Avatar, Card, Chip, ProgressBar, Text, useTheme } from 'react-native-paper'

import { ACHIEVEMENT_DEFINITIONS, type AchievementStats, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats } from '@/utils/achievements'
import { commaString } from '@/utils/commaString'
import { horizontalWheelScrollProps } from '@/utils/horizontalWheelScroll'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap, getUnlockedCountForPack, PuzzleUnlockMap } from '@/utils/unlocks'

import { DialogShell } from './DialogShell'

export type AchievementsDialogProps = {
  visible: boolean
  onDismiss: () => void
  unlockVersion: number
}

export const AchievementsDialog = ({ visible, onDismiss, unlockVersion }: AchievementsDialogProps): JSX.Element => {
  const theme = useTheme()
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [])
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  const [selectedPackKey, setSelectedPackKey] = useState(manifest[0]?.key ?? '')
  const [achievementStats, setAchievementStats] = useState<AchievementStats>(DEFAULT_ACHIEVEMENT_STATS)

  useEffect(() => {
    if (!visible) return
    let mounted = true
    void (async () => {
      const [nextUnlocks, nextAchievements] = await Promise.all([getPuzzleUnlockMap(), getAchievementStats()])
      if (mounted) {
        setUnlockMap(nextUnlocks)
        setAchievementStats(nextAchievements)
      }
    })()
    return () => {
      mounted = false
    }
  }, [visible, unlockVersion])

  const totalAvailable = useMemo(() => manifest.reduce((sum, item) => sum + item.count, 0), [manifest])
  const totalUnlocked = useMemo(() => {
    return manifest.reduce((sum, item) => {
      const count = getUnlockedCountForPack(unlockMap, item.key)
      return sum + Math.min(count, item.count)
    }, 0)
  }, [manifest, unlockMap])

  const selectedPack = useMemo(() => manifest.find((item) => item.key === selectedPackKey), [manifest, selectedPackKey])

  const unlockedPreview = useMemo(() => {
    if (!selectedPack) return []
    const unlockedIds = new Set(unlockMap[selectedPack.key] ?? [])
    if (unlockedIds.size === 0) return []
    const puzzles = getPuzzlesForCategory(selectedPack.key)
    return puzzles.filter((p) => unlockedIds.has(p.id))
  }, [selectedPack, unlockMap])

  const packUnlocked = selectedPack ? getUnlockedCountForPack(unlockMap, selectedPack.key) : 0
  const packProgress = selectedPack && selectedPack.count > 0 ? packUnlocked / selectedPack.count : 0
  const overallProgress = totalAvailable > 0 ? totalUnlocked / totalAvailable : 0

  return (
    <DialogShell visible={visible} onDismiss={onDismiss} title='Achievements'>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        <Card style={styles.card} mode='contained'>
          <Card.Content>
            <Text variant='labelLarge' style={styles.overline}>
              Total progress
            </Text>
            <Text variant='displaySmall' style={styles.bigNumber}>
              {commaString(totalUnlocked)}
              <Text variant='titleMedium' style={styles.muted}>
                {' '}
                / {commaString(totalAvailable)}
              </Text>
            </Text>
            <Text variant='bodySmall' style={styles.muted}>
              puzzles unlocked
            </Text>
            <View style={styles.progressBarWrapper}>
              <ProgressBar progress={overallProgress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
            </View>
          </Card.Content>
        </Card>

        <Text variant='titleMedium' style={styles.sectionLabel}>
          Achievements
        </Text>
        <Text variant='bodySmall' style={styles.muted}>
          {commaString(achievementStats.totalSolved)} solved · streak {achievementStats.currentStreak} (best {achievementStats.bestStreak})
        </Text>
        {ACHIEVEMENT_DEFINITIONS.map((def) => {
          const unlocked = achievementStats.unlockedIds.includes(def.id)
          return (
            <Card key={def.id} style={styles.card} mode='contained'>
              <Card.Content style={styles.achievementRow}>
                <Avatar.Icon size={40} icon={def.icon} style={unlocked ? styles.achievementIconUnlocked : styles.achievementIconLocked} />
                <View style={styles.achievementText}>
                  <Text variant='titleSmall' style={unlocked ? undefined : styles.muted}>
                    {def.title}
                  </Text>
                  <Text variant='bodySmall' style={styles.muted}>
                    {def.description}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          )
        })}

        <Text variant='titleMedium' style={styles.sectionLabel}>
          Browse by pack
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} {...horizontalWheelScrollProps}>
          {manifest.map((item) => {
            const unlocked = getUnlockedCountForPack(unlockMap, item.key)
            const complete = item.count > 0 && unlocked >= item.count
            return (
              <Chip key={item.key} selected={selectedPackKey === item.key} onPress={() => setSelectedPackKey(item.key)} icon={complete ? 'trophy' : undefined}>
                {item.label} {commaString(unlocked)}/{commaString(item.count)}
              </Chip>
            )
          })}
        </ScrollView>

        {selectedPack ? (
          <Card style={styles.card} mode='contained'>
            <Card.Content>
              <Text variant='titleMedium'>{selectedPack.label}</Text>
              <Text variant='bodySmall' style={styles.muted}>
                {commaString(packUnlocked)} of {commaString(selectedPack.count)} unlocked
              </Text>
              <View style={styles.progressBarWrapper}>
                <ProgressBar progress={packProgress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
              </View>

              {unlockedPreview.length === 0 ? (
                <Text variant='bodySmall' style={styles.emptyText}>
                  Win puzzles in this pack to reveal and collect them here.
                </Text>
              ) : (
                <View style={styles.previewList}>
                  {unlockedPreview.map((puzzle) => (
                    <Text key={`${selectedPack.key}-${puzzle.id}`} variant='bodyMedium' style={styles.previewItem}>
                      {puzzle.answer}
                    </Text>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>
        ) : null}
      </ScrollView>
    </DialogShell>
  )
}

const styles = StyleSheet.create({
  achievementIconLocked: { opacity: 0.4 },
  achievementIconUnlocked: {},
  achievementRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  achievementText: { flex: 1, flexShrink: 1 },
  bigNumber: { fontWeight: '800', marginTop: 4 },
  card: { marginBottom: 4 },
  chipRow: {
    columnGap: 8,
    paddingVertical: 4
  },
  emptyText: { marginTop: 12, opacity: 0.7 },
  muted: { opacity: 0.7 },
  overline: { letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' },
  previewItem: { marginBottom: 6 },
  previewList: { marginTop: 12 },
  progressBar: {
    borderRadius: 6,
    height: 8
  },
  progressBarWrapper: {
    height: 8,
    marginTop: 10,
    overflow: 'hidden'
  },
  scroll: { paddingTop: 4 },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  }
})
