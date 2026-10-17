import { redirectSystemPath } from '@/app/+native-intent'

// expo-router hands every incoming native URL through redirectSystemPath before it routes it. A
// .hangman file opened from another app (a file: or content: URL) must never reach the router, or it
// would land on the not-found route; IncomingFileImport reads it instead. Everything else, share links
// included, has to reach the router exactly as it came in.
describe('redirectSystemPath', () => {
  it.each([
    ['an iOS file: URL', 'file:///private/var/mobile/Containers/Data/Application/ABC/Documents/Inbox/Animals.hangman'],
    ['a short file: URL', 'file:///x.hangman'],
    ['an upper-case FILE: URL', 'FILE:///x.hangman'],
    ['a mixed-case File: URL', 'File:///x.hangman'],
    ['an Android content: URL', 'content://com.android.providers.downloads.documents/document/msf%3A1000000123'],
    ['an upper-case CONTENT: URL', 'CONTENT://media/external/file/42']
  ])('keeps %s away from the router', (_label, path) => {
    expect(redirectSystemPath({ path, initial: false })).toBeNull()
    // The same whether it launched the app cold or arrived while it was open.
    expect(redirectSystemPath({ path, initial: true })).toBeNull()
  })

  it.each([
    ['a share link', 'hangman://play?phrase=HELLO%20WORLD&hint=A%20greeting&mode=robot'],
    ['a share link with no query', 'hangman://play'],
    ['a plain route path', '/play?phrase=HELLO'],
    ['the root path', '/'],
    ['a game path', '/game?mode=solo'],
    ['a web URL', 'https://hangman.example/play?phrase=HELLO'],
    // Only the scheme counts: a link that merely mentions file: further along is still a link.
    ['a link carrying file: in its query', 'hangman://play?phrase=file:x'],
    ['an empty path', '']
  ])('passes %s through untouched', (_label, path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path)
    expect(redirectSystemPath({ path, initial: true })).toBe(path)
  })

  // It runs inside expo-router's own linking setup, where a throw would break every incoming link.
  // Whatever arrives that it can't read is handed back as it came.
  it('never throws, handing back anything it cannot read untouched', () => {
    const unreadable = {
      toString: () => {
        throw new Error('unreadable')
      }
    } as unknown as string

    expect(() => redirectSystemPath({ path: unreadable, initial: true })).not.toThrow()
    expect(redirectSystemPath({ path: unreadable, initial: true })).toBe(unreadable)
    expect(redirectSystemPath({ path: undefined as unknown as string, initial: true })).toBeUndefined()
  })
})
