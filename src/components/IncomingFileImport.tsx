import { useToast } from '@rific/toaster'
import { ConfirmDialog } from '@tastic/hud/chrome'
import * as Linking from 'expo-linking'
import { JSX, useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useCatalogActions } from '@/hooks/useCatalog'
import { usePackSelection } from '@/hooks/usePackSelection'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { importCustomPack, parseCustomPackImport } from '@/utils/customPacks'
import { readHangmanFileFromUri } from '@/utils/hangmanFile'
import { getTotalUnlockedCount, mergePuzzleUnlocks, parseProgressBackup } from '@/utils/unlocks'

type FilePreview = { kind: 'pack'; raw: string; label: string; wordCount: number } | { kind: 'progress'; raw: string; unlockCount: number }

// A pack or progress backup shared as a real .hangman file (see hangmanFile.ts), opened through the
// OS "Open in Hangman" flow (Messages, Mail, Files, AirDrop). It arrives as a file: or content: URL,
// which +native-intent.tsx keeps away from the router, so it's read here instead, over whichever
// screen is showing. Preview-only until confirmed: parsing reads the label and word count (or the
// unlock count) without saving anything, so a stray or malicious file can't change anything.
//
// Mounted once, in the root layout, inside Providers: the card's Portal needs the root Portal host.
export const IncomingFileImport = (): JSX.Element => {
  const incomingUrl = Linking.useLinkingURL()
  const { selectedPackKeys, setSelectedPackKeys } = usePackSelection()
  // A progress backup is merged into the active player's unlocked puzzles, and an imported pack joins
  // their pack selection.
  const { key: playerKey } = useActivePlayer()
  const { refreshUnlocks, refreshCustomPacks } = useCatalogActions()
  const { success } = useToast()
  const [preview, setPreview] = useState<FilePreview | null>(null)

  useEffect(() => {
    // Native-only: there's no OS-level "open this file in an app" on the web for Linking to deliver,
    // and expo-file-system (needed to read the file: or content: URI) doesn't support the web at all.
    if (!incomingUrl || Platform.OS === 'web') return
    // Native keeps the last URL that opened the app in a singleton that only this resets, and it
    // outlives a JS reload (the update card's Restart): without this, a share link or file that
    // launched the app would be handled all over again after one. By now the router has read it.
    Linking.clearInitialURL()
    const { scheme } = Linking.parse(incomingUrl)
    if (scheme !== 'file' && scheme !== 'content') return

    let mounted = true
    void readHangmanFileFromUri(incomingUrl)
      .then((raw) => {
        if (!mounted) return
        // The two .hangman payload shapes are told apart by content (a `pack` key vs an `unlocks`
        // key), not by filename, since both share the extension. parseProgressBackup is strict about
        // `unlocks`, so it never mistakes a pack for a backup; falling through to
        // parseCustomPackImport on failure reuses each parser's own validation.
        try {
          const unlocks = parseProgressBackup(raw)
          setPreview({ kind: 'progress', raw, unlockCount: getTotalUnlockedCount(unlocks) })
          return
        } catch {
          // Not a progress backup - fall through and try it as a pack instead.
        }
        const { label, entries } = parseCustomPackImport(raw)
        setPreview({ kind: 'pack', raw, label, wordCount: entries.length })
      })
      .catch(() => {
        if (mounted) void alert('Invalid File', 'Could not read that as a Hangman pack or progress backup file.')
      })
    return () => {
      mounted = false
    }
  }, [incomingUrl])

  // Only reachable from the card's own Import button: by the time this runs, the player has agreed.
  // A toast confirms it, without taking the player away from whatever they were doing.
  const handleConfirm = useCallback(async () => {
    if (!preview) return
    try {
      if (preview.kind === 'progress') {
        await mergePuzzleUnlocks(playerKey, preview.raw)
        refreshUnlocks()
        success('Progress Imported', `${commaString(preview.unlockCount)} unlocked puzzle${preview.unlockCount === 1 ? '' : 's'} merged`)
      } else {
        const pack = await importCustomPack(preview.raw)
        if (!selectedPackKeys.includes(pack.key)) setSelectedPackKeys([...selectedPackKeys, pack.key])
        refreshCustomPacks()
        success('Pack Imported', `"${pack.label}" is in your packs`)
      }
    } catch {
      void alert('Invalid File', preview.kind === 'progress' ? 'Could not import that Hangman progress backup file.' : 'Could not import that Hangman pack file.')
    } finally {
      setPreview(null)
    }
  }, [preview, playerKey, selectedPackKeys, setSelectedPackKeys, refreshCustomPacks, refreshUnlocks, success])

  const title = preview ? (preview.kind === 'progress' ? 'Import Progress Backup?' : `Import "${preview.label}"?`) : ''
  const message = preview ? (preview.kind === 'progress' ? `Merges ${commaString(preview.unlockCount)} unlocked puzzle${preview.unlockCount === 1 ? '' : 's'} into your existing progress.` : `Adds ${commaString(preview.wordCount)} word${preview.wordCount === 1 ? '' : 's'} as a new pack you can play.`) : ''

  return <ConfirmDialog visible={preview !== null} title={title} message={message} icon='file-import-outline' confirmLabel='Import' cancelLabel='Cancel' onConfirm={() => void handleConfirm()} onCancel={() => setPreview(null)} />
}
