import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native'
import * as Linking from 'expo-linking'
import { useEffect } from 'react'
import { BackHandler, Platform } from 'react-native'

import { IncomingFileImport } from '@/components/IncomingFileImport'
import { Providers } from '@/components/Providers'
import { type CatalogVersions, useCatalogVersions } from '@/hooks/useCatalog'
import { usePackSelection } from '@/hooks/usePackSelection'
import { activePlayerActions } from '@/redux/activePlayerSlice'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import { store } from '@/redux/store'
import { alert } from '@/utils/alert'
import { buildCustomPuzzle, getCustomPacks, importCustomPack, loadCustomPacksCache } from '@/utils/customPacks'
import { readHangmanFileFromUri } from '@/utils/hangmanFile'
import { GUEST_PLAYER_KEY } from '@/utils/players'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { mergePuzzleUnlocks } from '@/utils/unlocks'

// The shared expo-linking mock has no parse, and never delivers a URL. Here the test picks the URL the
// OS hands the app, and parse only needs the scheme: file: and content: are files, anything else is a
// share link for the router.
jest.mock('expo-linking', () => ({
  useLinkingURL: jest.fn(() => null),
  clearInitialURL: jest.fn(),
  parse: jest.fn((url: string) => ({ scheme: url.slice(0, url.indexOf(':')) }))
}))

// Reading the file is expo-file-system's job (see hangmanFile.test), so the tests hand over its text.
jest.mock('@/utils/hangmanFile', () => ({
  readHangmanFileFromUri: jest.fn()
}))
jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined)
}))

// Still the real imports (the pack really lands in the custom-pack cache), only watched, so a test can
// see whether one ran and make one fail.
jest.mock('@/utils/customPacks', () => {
  const actual = jest.requireActual('@/utils/customPacks')
  return { ...actual, importCustomPack: jest.fn(actual.importCustomPack) }
})
jest.mock('@/utils/unlocks', () => {
  const actual = jest.requireActual('@/utils/unlocks')
  return { ...actual, mergePuzzleUnlocks: jest.fn(actual.mergePuzzleUnlocks) }
})

const mockUseLinkingURL = jest.mocked(Linking.useLinkingURL)
const mockClearInitialURL = jest.mocked(Linking.clearInitialURL)
const mockReadHangmanFileFromUri = jest.mocked(readHangmanFileFromUri)
const mockAlert = jest.mocked(alert)
const mockImportCustomPack = jest.mocked(importCustomPack)
const mockMergePuzzleUnlocks = jest.mocked(mergePuzzleUnlocks)

// What iOS hands the app for a file opened from Messages, Mail or Files, and Android's equivalent.
const FILE_URL = 'file:///private/var/mobile/Containers/Data/Application/ABC/Documents/Inbox/My%20Words.hangman'
const CONTENT_URL = 'content://com.android.providers.downloads.documents/document/42'

// A pack file as shareCustomPackFile writes it (customPacks' CustomPackExportPayload).
const PACK_KEY = 'custom:shared-pack'
const packFile = (answers: string[], label = 'My Words') =>
  JSON.stringify({
    version: 1,
    exportedAt: '2026-10-01T00:00:00.000Z',
    pack: { key: PACK_KEY, label, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', puzzles: answers.map((answer) => buildCustomPuzzle(PACK_KEY, label, { answer })) }
  })
const PACK_FILE = packFile(['CAT', 'DOG', 'BIRD'])

// A progress backup as shareProgressBackupFile writes it (unlocks' PuzzleUnlockExportPayload).
const MANIFEST = getPuzzleManifest().filter((item) => item.count > 0)
const backupFile = (unlocks: Record<string, string[]>) => JSON.stringify({ version: 1, exportedAt: '2026-10-01T00:00:00.000Z', unlocks })
const BACKUP_FILE = backupFile({ [MANIFEST[0].key]: ['one', 'two'], [MANIFEST[1].key]: ['three'] })

// The selection every new install starts on (PackSelectionProvider's every pack, for a player who never
// chose): the built-in packs, before any import.
const ALL_PACK_KEYS = MANIFEST.map((item) => item.key)

// What the import changes outside the card: the pack selection and the catalog counters, read
// through the same hooks every screen uses.
let probe: { selectedPackKeys: string[]; versions: CatalogVersions } = { selectedPackKeys: [], versions: { unlockVersion: 0, packsVersion: 0 } }
const StateProbe = () => {
  const { selectedPackKeys } = usePackSelection()
  const versions = useCatalogVersions()
  useEffect(() => {
    probe = { selectedPackKeys, versions }
  }, [selectedPackKeys, versions])
  return null
}

// Mounted as the root layout mounts it: once, inside Providers, beside whatever screen is showing. A
// new element every time, so a rerender really renders it again.
const tree = () => (
  <Providers>
    <StateProbe />
    <IncomingFileImport />
  </Providers>
)

// Rendered with the file already delivered, then left until the custom-pack cache's mount-time load
// has landed (packsVersion 1), as it has long before a player can tap Import.
const renderImport = async (url: string | null, file?: string) => {
  mockUseLinkingURL.mockReturnValue(url)
  if (file !== undefined) mockReadHangmanFileFromUri.mockResolvedValue(file)
  const screen = await render(tree())
  await waitFor(() => expect(probe.versions.packsVersion).toBe(1))
  return screen
}

type Screen = Awaited<ReturnType<typeof renderImport>>

// Nothing imported (yet, or at all): no import ran, no toast, the selection and counters as they were.
const expectNothingImported = (screen: Screen) => {
  expect(mockImportCustomPack).not.toHaveBeenCalled()
  expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
  expect(screen.queryByText('Pack Imported')).toBeNull()
  expect(screen.queryByText('Progress Imported')).toBeNull()
  expect(probe.selectedPackKeys).toEqual(ALL_PACK_KEYS)
  expect(probe.versions).toEqual({ unlockVersion: 0, packsVersion: 1 })
  expect(getCustomPacks()).toEqual([])
}

describe('IncomingFileImport', () => {
  const originalOS = Platform.OS

  beforeEach(async () => {
    jest.clearAllMocks()
    mockUseLinkingURL.mockReset().mockReturnValue(null)
    mockReadHangmanFileFromUri.mockReset()
    // Back to the stub storage's empty custom-pack list, so a pack imported by one test is gone in the next.
    await loadCustomPacksCache()
    probe = { selectedPackKeys: [], versions: { unlockVersion: 0, packsVersion: 0 } }
    store.dispatch(activePlayerActions.setActivePlayer(null))
    store.dispatch(playerSettingsActions.reset())
  })

  afterEach(async () => {
    // Unmount now, while any Platform stub is still installed.
    await cleanup()
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS })
  })

  describe('preview', () => {
    it('reads a pack file and asks before importing it, naming the pack and counting its words', async () => {
      const screen = await renderImport(FILE_URL, PACK_FILE)

      expect(await screen.findByText('Import "My Words"?')).toBeTruthy()
      expect(screen.getByText('Adds 3 words as a new pack you can play.')).toBeTruthy()
      expect(screen.getByText('Import')).toBeTruthy()
      expect(screen.getByText('Cancel')).toBeTruthy()
      expect(mockReadHangmanFileFromUri).toHaveBeenCalledWith(FILE_URL)
      // Preview only: nothing is saved until the player says so.
      expectNothingImported(screen)
    })

    it('reads a progress backup and asks before merging it, counting its unlocked puzzles', async () => {
      const screen = await renderImport(FILE_URL, BACKUP_FILE)

      expect(await screen.findByText('Import Progress Backup?')).toBeTruthy()
      expect(screen.getByText('Merges 3 unlocked puzzles into your existing progress.')).toBeTruthy()
      expectNothingImported(screen)
    })

    it('counts one word, or one unlocked puzzle, in the singular', async () => {
      const screen = await renderImport(FILE_URL, packFile(['CAT']))
      expect(await screen.findByText('Adds 1 word as a new pack you can play.')).toBeTruthy()
      await cleanup()

      const backup = await renderImport(FILE_URL, backupFile({ [MANIFEST[0].key]: ['one'] }))
      expect(await backup.findByText('Merges 1 unlocked puzzle into your existing progress.')).toBeTruthy()
    })

    // Android's file managers and share targets hand over a content: URL rather than a file: one.
    it('reads a content: URL the same way', async () => {
      const screen = await renderImport(CONTENT_URL, PACK_FILE)

      expect(await screen.findByText('Import "My Words"?')).toBeTruthy()
      expect(mockReadHangmanFileFromUri).toHaveBeenCalledWith(CONTENT_URL)
    })
  })

  describe('Import', () => {
    it('saves the pack, adds it to the selection, refreshes the custom packs and toasts', async () => {
      const screen = await renderImport(FILE_URL, PACK_FILE)
      await screen.findByText('Import "My Words"?')

      await fireEvent.press(screen.getByText('Import'))

      expect(await screen.findByText('Pack Imported')).toBeTruthy()
      expect(screen.getByText('"My Words" is in your packs')).toBeTruthy()
      expect(mockImportCustomPack).toHaveBeenCalledWith(PACK_FILE)
      expect(getCustomPacks()).toEqual([expect.objectContaining({ key: PACK_KEY, label: 'My Words', puzzles: expect.arrayContaining([expect.objectContaining({ answer: 'CAT' })]) })])
      // Added to whatever was selected, so its words come up in random draws straight away.
      expect(probe.selectedPackKeys).toEqual([...ALL_PACK_KEYS, PACK_KEY])
      // Every pack list re-reads the custom packs; the unlocks didn't change.
      expect(probe.versions).toEqual({ unlockVersion: 0, packsVersion: 2 })
      expect(mockMergePuzzleUnlocks).not.toHaveBeenCalled()
      expect(screen.queryByText('Import "My Words"?')).toBeNull()
    })

    // Re-importing an updated export of a pack the player already has lands on the same key.
    it("doesn't add a pack already in the selection a second time", async () => {
      const stored = [MANIFEST[0].key, PACK_KEY]
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: GUEST_PLAYER_KEY, packKeys: stored }))
      const screen = await renderImport(FILE_URL, PACK_FILE)
      await waitFor(() => expect(probe.selectedPackKeys).toEqual(stored))
      await screen.findByText('Import "My Words"?')

      await fireEvent.press(screen.getByText('Import'))

      expect(await screen.findByText('Pack Imported')).toBeTruthy()
      expect(probe.selectedPackKeys).toEqual(stored)
      expect(probe.versions.packsVersion).toBe(2)
    })

    it('merges a progress backup, refreshes the unlocks and toasts', async () => {
      const screen = await renderImport(FILE_URL, BACKUP_FILE)
      await screen.findByText('Import Progress Backup?')

      await fireEvent.press(screen.getByText('Import'))

      expect(await screen.findByText('Progress Imported')).toBeTruthy()
      expect(screen.getByText('3 unlocked puzzles merged')).toBeTruthy()
      expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith(GUEST_PLAYER_KEY, BACKUP_FILE)
      // Every screen counting unlocks re-reads them; the packs and the selection didn't change.
      expect(probe.versions).toEqual({ unlockVersion: 1, packsVersion: 1 })
      expect(probe.selectedPackKeys).toEqual(ALL_PACK_KEYS)
      expect(mockImportCustomPack).not.toHaveBeenCalled()
      expect(screen.queryByText('Import Progress Backup?')).toBeNull()
    })

    // Everything belongs to a player (2026-10-17): a backup lands in the active player's unlocked
    // puzzles, and a pack in their selection.
    it("merges a progress backup into the active player's unlocked puzzles, and a pack into their selection", async () => {
      store.dispatch(activePlayerActions.setActivePlayer('profile-a'))
      store.dispatch(playerSettingsActions.setPackKeys({ playerKey: 'profile-a', packKeys: [MANIFEST[0].key] }))
      const backup = await renderImport(FILE_URL, BACKUP_FILE)
      await backup.findByText('Import Progress Backup?')
      await fireEvent.press(backup.getByText('Import'))
      expect(await backup.findByText('Progress Imported')).toBeTruthy()
      expect(mockMergePuzzleUnlocks).toHaveBeenCalledWith('profile-a', BACKUP_FILE)
      await cleanup()

      const pack = await renderImport(FILE_URL, PACK_FILE)
      await pack.findByText('Import "My Words"?')
      await fireEvent.press(pack.getByText('Import'))
      expect(await pack.findByText('Pack Imported')).toBeTruthy()
      expect(store.getState().playerSettings['profile-a']?.packKeys).toEqual([MANIFEST[0].key, PACK_KEY])
      expect(store.getState().playerSettings[GUEST_PLAYER_KEY]).toBeUndefined()
    })

    // Only the import this file runs is made to fail: clearAllMocks leaves a queued once-value in place,
    // so a rejection queued on the other one would fail the next test that imports that kind of file.
    it.each([
      ['pack', PACK_FILE, 'Import "My Words"?', 'Could not import that Hangman pack file.', () => mockImportCustomPack.mockRejectedValueOnce(new Error('disk full'))],
      ['progress backup', BACKUP_FILE, 'Import Progress Backup?', 'Could not import that Hangman progress backup file.', () => mockMergePuzzleUnlocks.mockRejectedValueOnce(new Error('disk full'))]
    ])('alerts Invalid File and closes the card when the %s fails to import', async (_kind, file, title, message, failImport) => {
      failImport()
      const screen = await renderImport(FILE_URL, file)
      await screen.findByText(title)

      await fireEvent.press(screen.getByText('Import'))

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid File', message))
      expect(screen.queryByText(title)).toBeNull()
      expect(screen.queryByText('Pack Imported')).toBeNull()
      expect(screen.queryByText('Progress Imported')).toBeNull()
      expect(probe.selectedPackKeys).toEqual(ALL_PACK_KEYS)
      expect(probe.versions).toEqual({ unlockVersion: 0, packsVersion: 1 })
    })
  })

  describe('Cancel', () => {
    it.each([
      ['pack', PACK_FILE, 'Import "My Words"?'],
      ['progress backup', BACKUP_FILE, 'Import Progress Backup?']
    ])('closes the card and imports nothing from a %s', async (_kind, file, title) => {
      const screen = await renderImport(FILE_URL, file)
      await screen.findByText(title)

      await fireEvent.press(screen.getByText('Cancel'))

      expect(screen.queryByText(title)).toBeNull()
      expectNothingImported(screen)
    })

    it('closes the card on Android back too', async () => {
      const addEventListener = jest.spyOn(BackHandler, 'addEventListener')
      const screen = await renderImport(FILE_URL, PACK_FILE)
      await screen.findByText('Import "My Words"?')

      // The card's own listener, added when it opened, so the newest one registered.
      const listeners = addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress')
      const handler = listeners[listeners.length - 1][1] as () => boolean
      let handled = false
      await act(async () => {
        handled = handler()
      })

      expect(handled).toBe(true)
      expect(screen.queryByText('Import "My Words"?')).toBeNull()
      expectNothingImported(screen)
      addEventListener.mockRestore()
    })

    // The same URL stays put after it's handled, so the card mustn't come back on the next render.
    it('reads each file once, and a new one when another arrives', async () => {
      const screen = await renderImport(FILE_URL, PACK_FILE)
      await screen.findByText('Import "My Words"?')
      await fireEvent.press(screen.getByText('Cancel'))

      await screen.rerender(tree())
      expect(screen.queryByText('Import "My Words"?')).toBeNull()
      expect(mockReadHangmanFileFromUri).toHaveBeenCalledTimes(1)

      const nextUrl = FILE_URL.replace('My%20Words', 'Backup')
      mockUseLinkingURL.mockReturnValue(nextUrl)
      mockReadHangmanFileFromUri.mockResolvedValue(BACKUP_FILE)
      await screen.rerender(tree())

      expect(await screen.findByText('Import Progress Backup?')).toBeTruthy()
      expect(mockReadHangmanFileFromUri).toHaveBeenCalledTimes(2)
      expect(mockReadHangmanFileFromUri).toHaveBeenLastCalledWith(nextUrl)
    })
  })

  describe('bad files', () => {
    it("alerts Invalid File when the file can't be read", async () => {
      mockReadHangmanFileFromUri.mockRejectedValue(new Error('no such file'))
      const screen = await renderImport(FILE_URL)

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid File', 'Could not read that as a Hangman pack or progress backup file.'))
      expect(screen.queryByText('Import')).toBeNull()
      expectNothingImported(screen)
    })

    it.each([
      ['not JSON at all', 'hello'],
      ['JSON that is neither a pack nor a backup', JSON.stringify({ hello: 'world' })]
    ])('alerts Invalid File for a file that is %s', async (_kind, file) => {
      const screen = await renderImport(FILE_URL, file)

      await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Invalid File', 'Could not read that as a Hangman pack or progress backup file.'))
      expect(screen.queryByText('Import')).toBeNull()
      expectNothingImported(screen)
    })

    it('says nothing about a read that finishes after it unmounts', async () => {
      let fail!: (error: Error) => void
      mockReadHangmanFileFromUri.mockImplementation(() => new Promise<string>((_resolve, reject) => (fail = reject)))
      const screen = await renderImport(FILE_URL)

      await screen.unmount()
      await act(async () => fail(new Error('no such file')))

      expect(mockAlert).not.toHaveBeenCalled()
    })
  })

  describe('ignores', () => {
    // Share links (hangman://play?...) and web links belong to the router (see +native-intent).
    it.each([
      ['a share link', 'hangman://play?phrase=HELLO&mode=classic'],
      ['a web link', 'https://hangman.example/play?phrase=HELLO'],
      ['no link at all', null]
    ])('%s', async (_kind, url) => {
      const screen = await renderImport(url, PACK_FILE)

      expect(mockReadHangmanFileFromUri).not.toHaveBeenCalled()
      expect(screen.queryByText('Import "My Words"?')).toBeNull()
      expect(mockAlert).not.toHaveBeenCalled()
    })

    // There's no "open this file in an app" on the web, and expo-file-system can't read one there.
    it('every file on the web', async () => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
      const screen = await renderImport(FILE_URL, PACK_FILE)

      expect(mockReadHangmanFileFromUri).not.toHaveBeenCalled()
      expect(screen.queryByText('Import "My Words"?')).toBeNull()
    })
  })

  // Native keeps the URL that opened the app until it's cleared, and it outlives a JS reload (the
  // update card's Restart), so whatever arrived has to be cleared or it's handled all over again.
  describe('the URL that opened the app', () => {
    it.each([
      ['a file: URL', FILE_URL],
      ['a content: URL', CONTENT_URL],
      // Not this component's to handle, but still the URL that opened the app.
      ['a share link', 'hangman://play?phrase=HELLO&mode=classic'],
      ['a web link', 'https://hangman.example/play?phrase=HELLO']
    ])('is cleared on native for %s', async (_kind, url) => {
      const screen = await renderImport(url, PACK_FILE)
      // A file goes on to its card; let the read land before the test ends.
      if (url === FILE_URL || url === CONTENT_URL) await screen.findByText('Import "My Words"?')

      expect(mockClearInitialURL).toHaveBeenCalledTimes(1)
    })

    // Cleared before the file is even read, so a reload mid-read can't bring the same file back.
    it('is cleared before a file is read', async () => {
      const screen = await renderImport(FILE_URL, PACK_FILE)
      await screen.findByText('Import "My Words"?')

      expect(mockClearInitialURL.mock.invocationCallOrder[0]).toBeLessThan(mockReadHangmanFileFromUri.mock.invocationCallOrder[0])
    })

    it('is cleared once per URL, and again when another arrives', async () => {
      const screen = await renderImport(FILE_URL, PACK_FILE)
      await screen.findByText('Import "My Words"?')
      await fireEvent.press(screen.getByText('Cancel'))

      await screen.rerender(tree())
      expect(mockClearInitialURL).toHaveBeenCalledTimes(1)

      mockUseLinkingURL.mockReturnValue('hangman://play?phrase=HELLO&mode=classic')
      await screen.rerender(tree())
      expect(mockClearInitialURL).toHaveBeenCalledTimes(2)
    })

    it('is left alone with no URL at all', async () => {
      await renderImport(null, PACK_FILE)

      expect(mockClearInitialURL).not.toHaveBeenCalled()
    })

    // The web has no initial URL singleton to clear: the page's own address is the link.
    it.each([
      ['a file: URL', FILE_URL],
      ['a share link', 'hangman://play?phrase=HELLO&mode=classic']
    ])('is never cleared on the web, even for %s', async (_kind, url) => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
      await renderImport(url, PACK_FILE)

      expect(mockClearInitialURL).not.toHaveBeenCalled()
    })
  })
})
