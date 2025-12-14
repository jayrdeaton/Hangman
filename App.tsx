import React, { JSX } from 'react'

import { Main, Providers } from './src/components'

const App = (): JSX.Element => (
  <Providers>
    <Main />
  </Providers>
)

export default App
