import { FeedbackPressProvider } from '@rific/feedback-press'
import { ToastProvider, useToast } from '@rific/toaster'
import { useUpdater, type UseUpdaterOptions } from '@rific/updater'
import { act, fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { Text } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { PaperProvider } from 'react-native-paper'

import { UpdateDialog } from '@/components/UpdateDialog'

// The real hook never checks under Jest (__DEV__ is true), so it's stubbed to a recorder: the options
// UpdateDialog hands it, onConfirm and onError included, are in its latest call. The same technique as
// @tastic/hud's own UpdateDialog.test.tsx.
jest.mock('@rific/updater', () => ({
  useUpdater: jest.fn(() => ({ check: jest.fn(), checking: false, updateReady: false }))
}))

const manifest = { createdAt: '2026-10-15T12:00:00.000Z' }

const latestOptions = (): UseUpdaterOptions => {
  const { calls } = jest.mocked(useUpdater).mock
  return calls[calls.length - 1]?.[0] ?? {}
}

// Prints every toast raised so far, so the onError test can read what the player would see.
const ToastProbe = () => {
  const { toasts } = useToast()
  return <Text>{toasts.map((toast) => `${toast.title}: ${toast.caption}`).join('\n')}</Text>
}

// The app's nesting (see Providers.tsx): FeedbackPressProvider wraps PaperProvider so the portaled
// card's Buttons still see it, and ToastProvider sits above UpdateDialog for useUpdateErrorToast.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <FeedbackPressProvider paper={RNPaper}>
    <PaperProvider>
      <ToastProvider>
        {children}
        <ToastProbe />
      </ToastProvider>
    </PaperProvider>
  </FeedbackPressProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

// Wrapped in an object: returning the bare promise from this async helper would make awaiting the
// helper wait for a button press that never comes.
const findUpdate = async (): Promise<{ confirmed: Promise<boolean> }> => {
  const { onConfirm } = latestOptions()
  if (!onConfirm) throw new Error('UpdateDialog passed useUpdater no onConfirm')
  let confirmed!: Promise<boolean>
  await act(async () => {
    confirmed = onConfirm(manifest)
  })
  return { confirmed }
}

describe('UpdateDialog', () => {
  it('owns an auto-checking updater that confirms through its own card and reports errors', async () => {
    await render(<UpdateDialog />)

    expect(latestOptions()).toEqual(expect.objectContaining({ onConfirm: expect.any(Function), onError: expect.any(Function) }))
    expect(latestOptions().autoCheck).not.toBe(false)
  })

  it('shows nothing until an update is found', async () => {
    const { queryByText } = await render(<UpdateDialog />)

    expect(queryByText('Update Available')).toBeNull()
  })

  it('shows the Restart/Later card when an update is found, and Restart confirms it', async () => {
    const { getByText, queryByText } = await render(<UpdateDialog />)
    const { confirmed } = await findUpdate()
    expect(getByText('Update Available')).toBeTruthy()
    expect(getByText('Later')).toBeTruthy()

    await fireEvent.press(getByText('Restart'))

    await expect(confirmed).resolves.toBe(true)
    expect(queryByText('Update Available')).toBeNull()
  })

  it('declines the update and closes the card on Later', async () => {
    const { getByText, queryByText } = await render(<UpdateDialog />)
    const { confirmed } = await findUpdate()

    await fireEvent.press(getByText('Later'))

    await expect(confirmed).resolves.toBe(false)
    expect(queryByText('Update Available')).toBeNull()
  })

  it('turns an update error into an error toast with a Title Case title', async () => {
    const { getByText } = await render(<UpdateDialog />)
    const { onError } = latestOptions()

    await act(async () => {
      onError?.('Network request failed')
    })

    expect(getByText('Update Failed: Network request failed')).toBeTruthy()
  })
})
