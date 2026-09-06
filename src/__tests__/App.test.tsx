import { render } from '@testing-library/react-native'

import App from '@/App'

describe('App', () => {
  it('renders without crashing', () => {
    expect(() => render(<App />)).not.toThrow()
  })
})
