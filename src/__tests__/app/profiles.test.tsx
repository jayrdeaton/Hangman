import { profilesActions } from '@tastic/profile'
import { fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'

import ProfilesRoute from '@/app/profiles'
import { Providers } from '@/components/Providers'
import { store } from '@/redux/store'

// /profiles, pushed from the player picker's Manage: the roster screen (ManageProfilesScreen, tested on
// its own), going back through the fleet's safeBack.
describe('the profiles route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    store.dispatch(profilesActions.setAll([{ id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }]))
  })

  it('shows the roster, and goes Home from its arrow when nothing is beneath it', async () => {
    const screen = await render(
      <Providers>
        <ProfilesRoute />
      </Providers>
    )
    expect(screen.getByTestId('profiles-screen')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()

    await fireEvent.press(screen.getByLabelText('Back'))

    // The router mock's canGoBack is false, so safeBack replaces with Home.
    expect(router.replace).toHaveBeenCalledWith('/')
  })
})
