import { render } from '@testing-library/react-native'

import App from '@/App'

describe('App', () => {
  // render is async in RNTL 14 and only queues its tree for the automatic afterEach unmount once
  // its own promise resolves. Un-awaited, the test ended before that, so the whole app stayed
  // mounted with its real timers still firing after this file's Jest environment was torn down.
  it('renders without crashing', async () => {
    await expect(render(<App />)).resolves.toBeTruthy()
  })
})
