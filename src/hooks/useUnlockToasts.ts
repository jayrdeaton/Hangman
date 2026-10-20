import { useToast } from '@rific/toaster'
import { useCallback } from 'react'
import { useStore } from 'react-redux'

import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import type { RootState } from '@/redux/store'
import type { AchievementDefinition } from '@/types/stats'

import { selectProfile } from './useProfiles'

// The line under an unlock toast's title: whose unlock it is for a profile (LightCycles' caption,
// "<Name> unlocked"), and the fleet's plain 'Achievement unlocked' for the guest.
export const unlockCaption = (profileName: string | null): string => (profileName ? `${profileName} unlocked` : 'Achievement unlocked')

// The fleet's achievement toast, one per unlock, for every unlock (Jay, 2026-10-20: the round-end card
// no longer lists them, as in Solitaire): a round's, an abandoned round's and a new custom pack's. The
// achievement's title over the caption, in its tier's color with
// its own icon, from the @rific/toaster <Toaster/> mounted once in Providers.tsx. `profileId` is whose
// unlocks they are (null for the guest), named as the roster has them now.
export const useUnlockToasts = (): ((achievements: AchievementDefinition[], profileId: string | null) => void) => {
  const { success } = useToast()
  const store = useStore<RootState>()
  return useCallback(
    (achievements: AchievementDefinition[], profileId: string | null) => {
      if (achievements.length === 0) return
      const caption = unlockCaption(selectProfile(store.getState(), profileId)?.name ?? null)
      for (const achievement of achievements) success(achievement.title, caption, undefined, { color: ACHIEVEMENT_TIER_COLORS[achievement.tier], icon: achievement.icon })
    },
    [success, store]
  )
}
