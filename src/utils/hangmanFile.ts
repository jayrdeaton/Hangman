import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'

import { exportCustomPack } from './customPacks'
import { exportPuzzleUnlocks } from './unlocks'

// One file format, two payload shapes it can carry (a custom pack, or a progress backup — see
// customPacks.ts's CustomPackExportPayload and unlocks.ts's PuzzleUnlockExportPayload) — sharing
// one extension/MIME type/UTI means one native file-type registration (app.json) covers both,
// rather than needing a second one just to add progress backups to this same mechanism.
export const HANGMAN_FILE_EXTENSION = '.hangman'
// A conventional unregistered vendor MIME type (the `x-` prefix), matched by the Android
// intentFilter in app.json. iOS doesn't check this — Sharing.shareAsync's own `UTI` option and the
// app's registered CFBundleDocumentTypes (also app.json) are what make "Open in Hangman" show up
// there instead.
export const HANGMAN_FILE_MIME_TYPE = 'application/x-hangman'
const HANGMAN_FILE_UTI = 'public.json'

// A blank/symbol-only pack name would otherwise produce an unusable or hidden (leading-dot)
// filename — falls back to a generic one rather than exporting something the OS can't display
// sensibly.
const sanitizeFilename = (label: string): string => {
  const cleaned = label
    .trim()
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .trim()
  return `${cleaned.length > 0 ? cleaned : 'pack'}${HANGMAN_FILE_EXTENSION}`
}

// Writes any payload to a real file and hands it to the OS share sheet (Messages, Mail, AirDrop,
// whatever's installed) on native. expo-sharing doesn't support sharing local files on web (its own
// docs: "You cannot share local files on web by URI") and expo-file-system doesn't support web at
// all — so web falls back to a plain browser download, the closest web equivalent of "export this"
// and the only one that actually works there. Shared by both shareCustomPackFile and
// shareProgressBackupFile below — everything past "here's a string and a filename" is identical
// between them.
const writeAndShareFile = async (payload: string, filename: string, dialogTitle: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = Object.assign(document.createElement('a'), { href: url, download: filename })
    anchor.click()
    URL.revokeObjectURL(url)
    return true
  }

  const file = new File(Paths.cache, filename)
  file.create({ overwrite: true })
  file.write(payload)

  if (!(await Sharing.isAvailableAsync())) return false
  await Sharing.shareAsync(file.uri, { mimeType: HANGMAN_FILE_MIME_TYPE, UTI: HANGMAN_FILE_UTI, dialogTitle })
  return true
}

export const shareCustomPackFile = async (key: string, label: string): Promise<boolean> => {
  const payload = await exportCustomPack(key)
  if (!payload) return false
  return writeAndShareFile(payload, sanitizeFilename(label), `Share "${label}"`)
}

export const shareProgressBackupFile = async (): Promise<boolean> => {
  const payload = await exportPuzzleUnlocks()
  return writeAndShareFile(payload, `hangman-progress-backup${HANGMAN_FILE_EXTENSION}`, 'Share progress backup')
}

// Cross-platform, unlike the share functions above — expo-document-picker supports web too (a
// hidden <input type="file"> under the hood per its own docs), so this needs no Platform branch.
// Returns null on cancel, not just on error, so callers can tell "player backed out" apart from
// "something went wrong". Content-agnostic — the caller decides what kind of file it's expecting
// (a pack, via parseCustomPackImport, or a progress backup, via parseProgressBackup) and validates
// accordingly; this just gets the raw bytes off the device.
export const pickHangmanFile = async (): Promise<string | null> => {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
  if (result.canceled || result.assets.length === 0) return null

  const asset = result.assets[0]
  // .hangman has no registered MIME type for the picker to filter on, so type filtering happens
  // after the fact (parseCustomPackImport/parseProgressBackup's own JSON/shape validation), not here.
  if (Platform.OS === 'web') {
    return asset.file ? asset.file.text() : null
  }
  return new File(asset.uri).text()
}

// Reads a file the OS handed the app directly (an incoming "Open in Hangman" launch) — the same
// underlying read pickHangmanFile's native branch does, just starting from a URI Linking already
// resolved rather than one the player just picked through the system UI.
export const readHangmanFileFromUri = (uri: string): Promise<string> => new File(uri).text()
