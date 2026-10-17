import { JSX } from 'react'
import { Portal } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { StatsScreen } from '@/components/StatsScreen'
import { safeBack } from '@/utils/navigation'

// /achievements, from Home's trophy. Its own Portal host keeps the Reset confirm with this screen.
const AchievementsRoute = (): JSX.Element => {
  const insets = useSafeAreaInsets()
  return (
    <Portal.Host>
      <StatsScreen onBack={safeBack} insets={insets} />
    </Portal.Host>
  )
}

export default AchievementsRoute
