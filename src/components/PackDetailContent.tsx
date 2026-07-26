import { JSX, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ProgressBar, Text, useTheme } from 'react-native-paper'

import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

export type PackDetailContentProps = {
  packKey: string | null
}

// Takes an already-resolved key and renders unconditionally — no notion of "closing." A caller
// that fades this out over time (PackDetailDialog, wrapping it in a Dialog) is responsible for
// holding the last non-null key steady during that animation itself; a caller that just unmounts
// this on navigation (PacksScreen's detail step) never needs to.
export const PackDetailContent = ({ packKey }: PackDetailContentProps): JSX.Element => {
  const theme = useTheme()
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!packKey) return
    let mounted = true
    void (async () => {
      const unlockMap = await getPuzzleUnlockMap()
      if (mounted) setUnlockedIds(new Set(unlockMap[packKey] ?? []))
    })()
    return () => {
      mounted = false
    }
  }, [packKey])

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])

  const unlockedPreview = useMemo(() => {
    if (!pack || unlockedIds.size === 0) return []
    return getPuzzlesForCategory(pack.key).filter((puzzle) => unlockedIds.has(puzzle.id))
  }, [pack, unlockedIds])

  const unlockedCount = unlockedIds.size
  const progress = pack && pack.count > 0 ? unlockedCount / pack.count : 0

  if (!pack) return <View />

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
      <Text variant='bodySmall' style={styles.muted}>
        {commaString(unlockedCount)} of {commaString(pack.count)} unlocked
      </Text>
      <View style={styles.progressBarWrapper}>
        <ProgressBar progress={progress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
      </View>

      {unlockedPreview.length === 0 ? (
        <Text variant='bodySmall' style={styles.emptyText}>
          Win puzzles in this pack to reveal and collect them here.
        </Text>
      ) : (
        <View style={styles.previewList}>
          {unlockedPreview.map((puzzle) => (
            <Text key={puzzle.id} variant='bodyMedium' style={styles.previewItem}>
              {puzzle.answer}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  emptyText: { marginTop: 12, opacity: 0.7 },
  muted: { opacity: 0.7 },
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
  scroll: { paddingTop: 4 }
})
