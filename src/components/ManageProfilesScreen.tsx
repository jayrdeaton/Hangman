import { defaultColors } from '@rific/auto-paper'
import { ProfilesScreen } from '@tastic/profile'
import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'

import { useProfiles, useProfilesActions } from '@/hooks/useProfiles'
import { gameShell } from '@/utils/webLayout'

export type ManageProfilesScreenProps = {
  onBack: () => void
}

// A new profile's first color: auto-paper's first swatch, the red Hangman itself starts on.
const DEFAULT_PROFILE_COLOR = defaultColors[0].value

// The fleet's roster screen (@tastic/profile's ProfilesScreen, the one Solitaire and the other games
// route to): the /profiles route, pushed from the player picker's Manage. Create, rename, recolor,
// retag and delete, editing inline; the roster is the fleet's shared one (see ProfilesProvider), so a
// change here shows in every game. A delete also forgets everything Hangman kept for the profile
// (usePlayerData's forgetPlayer, inside deleteProfile). A new color for a profile lapses its Hangman
// colors (see playerThemeSlice), so it shows here at once.
//
// Transparent over the app's one board (see BoardBackground), like every screen; its text keeps
// ProfilesScreen's own default, the fleet's black or white. On the web it keeps the game's 480pt
// column. ProfilesScreen flushes an edit in progress before calling onBack, which matters on the web,
// where a left screen stays mounted.
export const ManageProfilesScreen = ({ onBack }: ManageProfilesScreenProps): JSX.Element => {
  const profiles = useProfiles()
  const { createProfile, updateProfile, deleteProfile } = useProfilesActions()
  return (
    <View testID='profiles-screen' style={styles.screen} onAccessibilityEscape={onBack}>
      <View style={[styles.column, gameShell]}>
        <ProfilesScreen profiles={profiles} defaultColor={DEFAULT_PROFILE_COLOR} onCreate={createProfile} onSave={updateProfile} onDelete={deleteProfile} onBack={onBack} bg='transparent' />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  screen: { flex: 1 }
})
