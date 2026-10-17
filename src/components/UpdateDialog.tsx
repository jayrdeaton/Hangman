import { useUpdateErrorToast } from '@rific/toaster'
import { UpdateDialog as SharedUpdateDialog } from '@tastic/hud/chrome'
import { JSX } from 'react'

// The app's one background update check (cold launch and every foreground resume). @tastic/hud's
// shared UpdateDialog owns its own useUpdater() instance and shows the fleet's themed Restart/Later
// card instead of useUpdater's default native Alert. The same thin bridge as Snake's and BoxHockey's
// UpdateDialog.tsx, kept as its own file so the onError-to-toast wiring has one place to live, and
// imported from the light '@tastic/hud/chrome' entry, never the main one (see eslint.config.cjs).
//
// Must render inside Providers: useUpdateErrorToast needs the ToastProvider, the card's Portal needs
// the Portal.Host auto-paper's Provider mounts inside Theme, and its Buttons need Haptic's
// FeedbackPressProvider. onError only fires when applying the update fails (useUpdater swallows a
// failed background fetch), hence "Update Failed", in Title Case like the app's other toast titles.
// The Settings sheet's Check for Updates (hud's BaseSettingsDialog) keeps its own
// useUpdater({ autoCheck: false }) for manual checks, which adds no AppState listener, so this stays
// the only automatic check.
export const UpdateDialog = (): JSX.Element => {
  const onError = useUpdateErrorToast('Update Failed')
  return <SharedUpdateDialog onError={onError} />
}
