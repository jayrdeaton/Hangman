import { render } from '@testing-library/react-native'

import NotFound from '@/app/+not-found'

// The shared expo-router mock renders a Redirect as its href (testID 'redirect'), so where it sends
// the player can be read straight off the screen.
describe('the not-found route', () => {
  it('sends any unknown path Home instead of showing an unmatched page', async () => {
    const { getAllByTestId } = await render(<NotFound />)

    const redirects = getAllByTestId('redirect')
    expect(redirects).toHaveLength(1)
    expect(redirects[0]).toHaveTextContent('/', { exact: true })
  })
})
