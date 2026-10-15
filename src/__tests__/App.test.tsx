import { useUpdater } from '@rific/updater'
import { render } from '@testing-library/react-native'

import App from '@/App'

// Spied, not stubbed: the real hook still runs (it never checks under Jest, where __DEV__ is true), so
// the app renders for real. The spy only records the options each instance passes.
jest.mock('@rific/updater', () => {
  const actual = jest.requireActual('@rific/updater')
  return { ...actual, useUpdater: jest.fn(actual.useUpdater) }
})

describe('App', () => {
  // render is async in RNTL 14 and only queues its tree for the automatic afterEach unmount once
  // its own promise resolves. Un-awaited, the test ended before that, so the whole app stayed
  // mounted with its real timers still firing after this file's Jest environment was torn down.
  it('renders without crashing', async () => {
    await expect(render(<App />)).resolves.toBeTruthy()
  })

  // App used to call useUpdater() bare, which confirms an update through the native Alert (a no-op on
  // web). Every instance that checks on its own must now be UpdateDialog's, which confirms through the
  // themed card. PuzzleDrawer's manual-only instance passes autoCheck: false and is skipped.
  it('confirms every automatic update check through the themed UpdateDialog', async () => {
    await render(<App />)

    const autoChecking = jest
      .mocked(useUpdater)
      .mock.calls.map(([options]) => options)
      .filter((options) => options?.autoCheck !== false)
    expect(autoChecking.length).toBeGreaterThan(0)
    autoChecking.forEach((options) => expect(options?.onConfirm).toEqual(expect.any(Function)))
  })
})
