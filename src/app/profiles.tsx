import { JSX } from 'react'
import { Portal } from 'react-native-paper'

import { ManageProfilesScreen } from '@/components/ManageProfilesScreen'
import { safeBack } from '@/utils/navigation'

// /profiles, from the player picker's Manage. Its own Portal host keeps the delete confirm with this
// screen.
const ProfilesRoute = (): JSX.Element => (
  <Portal.Host>
    <ManageProfilesScreen onBack={safeBack} />
  </Portal.Host>
)

export default ProfilesRoute
