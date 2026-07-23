import { render } from '@testing-library/react-native'
import React from 'react'

import App from '@/App'

describe('App', () => {
  it('renders without crashing', () => {
    expect(() => render(<App />)).not.toThrow()
  })
})
