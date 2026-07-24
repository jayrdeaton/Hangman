import { JSX, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { ProgressBar, Text, useTheme } from 'react-native-paper'

import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

import { DialogShell } from './DialogShell'

export type PackDetailDialogProps = {
  visible: boolean
  onDismiss: () => void
  packKey: string | null
}

export const PackDetailDialog = ({ visible, onDismiss, packKey }: PackDetailDialogProps): JSX.Element => {
  const theme = useTheme()
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  // Keeps showing the last-open pack's content while the dialog fades out, instead of the label
  // and list going blank the instant the caller clears packKey to dismiss. Updated during render
  // (not an effect) per React's "adjusting state when a prop changes" pattern.
  const [resolvedKey, setResolvedKey] = useState<string | null>(packKey)
  if (packKey && packKey !== resolvedKey) setResolvedKey(packKey)

  useEffect(() => {
    if (!visible || !resolvedKey) return
    let mounted = true
    void (async () => {
      const unlockMap = await getPuzzleUnlockMap()
      if (mounted) setUnlockedIds(new Set(unlockMap[resolvedKey] ?? []))
    })()
    return () => {
      mounted = false
    }
  }, [visible, resolvedKey])

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === resolvedKey), [resolvedKey])

  const unlockedPreview = useMemo(() => {
    if (!pack || unlockedIds.size === 0) return []
    return getPuzzlesForCategory(pack.key).filter((puzzle) => unlockedIds.has(puzzle.id))
  }, [pack, unlockedIds])

  const unlockedCount = unlockedIds.size
  const progress = pack && pack.count > 0 ? unlockedCount / pack.count : 0

  return (
    <DialogShell visible={visible} onDismiss={onDismiss} title={pack?.label ?? ''}>
      {pack ? (
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
      ) : null}
    </DialogShell>
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
