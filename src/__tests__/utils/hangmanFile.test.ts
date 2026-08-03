/**
 * @jest-environment jsdom
 */
// jsdom, not the default jest-expo/RN environment — the web-platform tests below need a real
// `document` (creating an anchor, clicking it) to exercise shareCustomPackFile's browser-download
// fallback, which plain react-native's test environment doesn't provide at all.
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  const mocked = Object.create(RN)
  Object.defineProperty(mocked, 'Platform', { configurable: true, enumerable: true, value: { OS: 'ios' } })
  return mocked
})

const setPlatform = (os: string) => {
  const RN = require('react-native')
  RN.Platform.OS = os
}

// A minimal in-memory stand-in for expo-file-system's File class — write() stores by uri, text()
// reads it back, matching the real class closely enough to exercise shareCustomPackFile's native
// write-then-share path and the native read paths in pickHangmanFile/readHangmanFileFromUri.
const mockFileStore = new Map<string, string>()

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/')
    }
    create() {}
    write(content: string) {
      mockFileStore.set(this.uri, content)
    }
    text() {
      return Promise.resolve(mockFileStore.get(this.uri) ?? '')
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'mock-cache' } } }
})

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn()
}))

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn()
}))

jest.mock('@/utils/customPacks', () => ({
  exportCustomPack: jest.fn()
}))

jest.mock('@/utils/unlocks', () => ({
  exportPuzzleUnlocks: jest.fn()
}))

// A full property-descriptor replacement, not a value assignment — Expo's own web polyfill layer
// installs `URL` as a lazy getter (node_modules/expo/src/winter/installGlobal.ts) that, the moment
// it's READ at all (even just to save the previous value), constructs a real polyfilled URL
// implementation pulling in a TextEncoder this test environment doesn't provide. defineProperty
// replaces the descriptor outright without ever invoking that getter.
const stubGlobalURL = (createObjectURL: () => string, revokeObjectURL: () => void) => {
  Object.defineProperty(global, 'URL', { configurable: true, value: { createObjectURL, revokeObjectURL } })
}

describe('hangmanFile', () => {
  beforeEach(() => {
    jest.resetModules()
    mockFileStore.clear()
    setPlatform('ios')
  })

  // Guarantees document.createElement spies are undone even if an assertion above them throws —
  // an unrestored spy from a failed test otherwise cascades into every test after it.
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('shareCustomPackFile', () => {
    it('returns false without touching the filesystem or share sheet when the pack no longer exists', async () => {
      const { exportCustomPack } = require('@/utils/customPacks')
      exportCustomPack.mockResolvedValue(null)
      const Sharing = require('expo-sharing')
      const { shareCustomPackFile } = require('@/utils/hangmanFile')

      const result = await shareCustomPackFile('custom:missing', 'Missing Pack')

      expect(result).toBe(false)
      expect(Sharing.shareAsync).not.toHaveBeenCalled()
    })

    it('web: downloads a .hangman file via a Blob/anchor click rather than using expo-sharing', async () => {
      setPlatform('web')
      const { exportCustomPack } = require('@/utils/customPacks')
      exportCustomPack.mockResolvedValue('{"pack":"payload"}')
      const Sharing = require('expo-sharing')

      const clickSpy = jest.fn()
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'a') el.click = clickSpy
        return el
      })
      const createObjectURL = jest.fn().mockReturnValue('blob:mock-url')
      const revokeObjectURL = jest.fn()
      stubGlobalURL(createObjectURL, revokeObjectURL)

      const { shareCustomPackFile } = require('@/utils/hangmanFile')
      const result = await shareCustomPackFile('custom:abc', 'My Trip!')

      expect(result).toBe(true)
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      // Punctuation stripped, extension appended — same rule a real OS filesystem would otherwise
      // reject or mangle characters for.
      const anchor = createElementSpy.mock.results.find((r) => r.value.tagName === 'A')?.value
      expect(anchor.download).toBe('My Trip.hangman')
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
      expect(Sharing.shareAsync).not.toHaveBeenCalled()
    })

    it('native: writes the exported payload to a cache file and hands it to Sharing.shareAsync', async () => {
      const { exportCustomPack } = require('@/utils/customPacks')
      exportCustomPack.mockResolvedValue('{"pack":"payload"}')
      const Sharing = require('expo-sharing')
      Sharing.isAvailableAsync.mockResolvedValue(true)
      Sharing.shareAsync.mockResolvedValue(undefined)

      const { shareCustomPackFile } = require('@/utils/hangmanFile')
      const result = await shareCustomPackFile('custom:abc', 'My Trip')

      expect(result).toBe(true)
      expect(mockFileStore.get('mock-cache/My Trip.hangman')).toBe('{"pack":"payload"}')
      expect(Sharing.shareAsync).toHaveBeenCalledWith('mock-cache/My Trip.hangman', expect.objectContaining({ mimeType: 'application/x-hangman', dialogTitle: 'Share "My Trip"' }))
    })

    it('native: returns false without sharing when the share sheet is unavailable on this device', async () => {
      const { exportCustomPack } = require('@/utils/customPacks')
      exportCustomPack.mockResolvedValue('{"pack":"payload"}')
      const Sharing = require('expo-sharing')
      Sharing.isAvailableAsync.mockResolvedValue(false)

      const { shareCustomPackFile } = require('@/utils/hangmanFile')
      const result = await shareCustomPackFile('custom:abc', 'My Trip')

      expect(result).toBe(false)
      expect(Sharing.shareAsync).not.toHaveBeenCalled()
    })

    it('falls back to a generic filename for a pack name with no keepable characters', async () => {
      setPlatform('web')
      const { exportCustomPack } = require('@/utils/customPacks')
      exportCustomPack.mockResolvedValue('{}')
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'a') el.click = jest.fn()
        return el
      })
      stubGlobalURL(
        () => 'blob:mock-url',
        () => {}
      )

      const { shareCustomPackFile } = require('@/utils/hangmanFile')
      await shareCustomPackFile('custom:abc', '!!!')

      const anchor = createElementSpy.mock.results.find((r) => r.value.tagName === 'A')?.value
      expect(anchor.download).toBe('pack.hangman')
    })
  })

  describe('shareProgressBackupFile', () => {
    it('web: downloads a .hangman file with a fixed filename via a Blob/anchor click', async () => {
      setPlatform('web')
      const { exportPuzzleUnlocks } = require('@/utils/unlocks')
      exportPuzzleUnlocks.mockResolvedValue('{"unlocks":{}}')

      const clickSpy = jest.fn()
      const originalCreateElement = document.createElement.bind(document)
      const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'a') el.click = clickSpy
        return el
      })
      stubGlobalURL(
        () => 'blob:mock-url',
        () => {}
      )

      const { shareProgressBackupFile } = require('@/utils/hangmanFile')
      const result = await shareProgressBackupFile()

      expect(result).toBe(true)
      const anchor = createElementSpy.mock.results.find((r) => r.value.tagName === 'A')?.value
      expect(anchor.download).toBe('hangman-progress-backup.hangman')
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('native: writes the exported payload to a cache file and hands it to Sharing.shareAsync', async () => {
      const { exportPuzzleUnlocks } = require('@/utils/unlocks')
      exportPuzzleUnlocks.mockResolvedValue('{"unlocks":{}}')
      const Sharing = require('expo-sharing')
      Sharing.isAvailableAsync.mockResolvedValue(true)
      Sharing.shareAsync.mockResolvedValue(undefined)

      const { shareProgressBackupFile } = require('@/utils/hangmanFile')
      const result = await shareProgressBackupFile()

      expect(result).toBe(true)
      expect(mockFileStore.get('mock-cache/hangman-progress-backup.hangman')).toBe('{"unlocks":{}}')
      expect(Sharing.shareAsync).toHaveBeenCalledWith('mock-cache/hangman-progress-backup.hangman', expect.objectContaining({ mimeType: 'application/x-hangman', dialogTitle: 'Share progress backup' }))
    })

    it('native: returns false without sharing when the share sheet is unavailable on this device', async () => {
      const { exportPuzzleUnlocks } = require('@/utils/unlocks')
      exportPuzzleUnlocks.mockResolvedValue('{"unlocks":{}}')
      const Sharing = require('expo-sharing')
      Sharing.isAvailableAsync.mockResolvedValue(false)

      const { shareProgressBackupFile } = require('@/utils/hangmanFile')
      const result = await shareProgressBackupFile()

      expect(result).toBe(false)
      expect(Sharing.shareAsync).not.toHaveBeenCalled()
    })
  })

  describe('pickHangmanFile', () => {
    it('returns null when the player cancels the picker', async () => {
      const DocumentPicker = require('expo-document-picker')
      DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null })

      const { pickHangmanFile } = require('@/utils/hangmanFile')
      const result = await pickHangmanFile()

      expect(result).toBeNull()
    })

    it('native: reads the picked file via its uri', async () => {
      const DocumentPicker = require('expo-document-picker')
      DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'mock-cache/picked.hangman', name: 'picked.hangman' }] })
      mockFileStore.set('mock-cache/picked.hangman', '{"pack":"picked"}')

      const { pickHangmanFile } = require('@/utils/hangmanFile')
      const result = await pickHangmanFile()

      expect(result).toBe('{"pack":"picked"}')
    })

    it('web: reads the picked file via its File object, not a uri', async () => {
      setPlatform('web')
      const DocumentPicker = require('expo-document-picker')
      const webFile = { text: jest.fn().mockResolvedValue('{"pack":"web-picked"}') }
      DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:whatever', name: 'picked.hangman', file: webFile }] })

      const { pickHangmanFile } = require('@/utils/hangmanFile')
      const result = await pickHangmanFile()

      expect(result).toBe('{"pack":"web-picked"}')
    })

    it('web: returns null if the picked asset carries no File object', async () => {
      setPlatform('web')
      const DocumentPicker = require('expo-document-picker')
      DocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'blob:whatever', name: 'picked.hangman' }] })

      const { pickHangmanFile } = require('@/utils/hangmanFile')
      const result = await pickHangmanFile()

      expect(result).toBeNull()
    })
  })

  describe('readHangmanFileFromUri', () => {
    it('reads whatever content is at the given uri', async () => {
      mockFileStore.set('mock-cache/incoming.hangman', '{"pack":"incoming"}')

      const { readHangmanFileFromUri } = require('@/utils/hangmanFile')
      const result = await readHangmanFileFromUri('mock-cache/incoming.hangman')

      expect(result).toBe('{"pack":"incoming"}')
    })
  })
})
