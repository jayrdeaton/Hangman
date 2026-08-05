import { Drawer } from '@rific/drawer'
import { Button, Checkbox, IconButton, useVibration } from '@rific/haptic-press'
import { ScrollView, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text } from 'react-native-paper'

import { DRAWER_PACKS_SCREEN_Z_INDEX } from '@/constants/drawerStacking'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { type CustomPack, deleteCustomPack, importCustomPack, isCustomPackKey } from '@/utils/customPacks'
import { pickHangmanFile, shareCustomPackFile } from '@/utils/hangmanFile'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap, getUnlockedCountForPack, PuzzleUnlockMap } from '@/utils/unlocks'

import { PackEditorDrawer } from './PackEditorDrawer'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'

export type PacksScreenProps = {
  visible: boolean
  onDismiss: () => void
  selectedKeys: string[]
  onChangeSelectedKeys: (keys: string[]) => void
  packsVersion: number
  onPacksChanged: () => void
}

export const PacksScreen = ({ visible, onDismiss, selectedKeys, onChangeSelectedKeys, packsVersion, onPacksChanged }: PacksScreenProps): JSX.Element => {
  const { width: windowWidth } = useWindowDimensions()
  const { selection } = useVibration()

  // packsVersion isn't read inside the memo — it's a change counter bumped whenever a custom pack
  // is created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const customPacks = useMemo(() => manifest.filter((item) => isCustomPackKey(item.key)), [manifest])
  const builtInPacks = useMemo(() => manifest.filter((item) => !isCustomPackKey(item.key)), [manifest])
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  // A built-in pack's own read-only puzzle list (PackPuzzlesDrawer, mode/difficulty/onConfirm all
  // omitted) and the create/edit form (PackEditorDrawer) each stack on top of this screen as their
  // own animated Drawer — same as PackPuzzlesDrawer already stacks on top of PuzzleDrawer — rather
  // than swapping in as an unanimated step within this same panel. detailKey/editingKey are
  // deliberately separate from their own drawer's visible flag (detailVisible/editorVisible) —
  // dismissing only flips visible, never the key — so the content survives the close-translate
  // animation instead of blanking out mid-slide (see PackPuzzlesDrawer/PackEditorDrawer's own doc
  // comments on why, and PuzzleDrawer's identical playPackKey/playDrawerVisible split). Both
  // visible flags reset together below whenever this screen reopens; the keys themselves are left
  // alone since they're always overwritten before either drawer next opens anyway.
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const anyOverlayVisible = detailVisible || editorVisible

  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})

  // Always reopens on the list, with neither overlay open — otherwise a screen left mid-edit or
  // mid-detail on last close would silently resume there next time.
  /* eslint-disable react-hooks/set-state-in-effect -- resets local UI state on an external prop transition, not derived from other state */
  useEffect(() => {
    if (visible) {
      setDetailVisible(false)
      setEditorVisible(false)
    }
  }, [visible])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Re-fetched each time this screen opens, not subscribed to live — good enough for a summary
  // count sitting in a list row, and matches the one-shot fetch every other pack-progress display
  // in this app already does (PackPuzzleList, AchievementsDrawer).
  useEffect(() => {
    if (!visible) return
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (mounted) setUnlockMap(map)
    })
    return () => {
      mounted = false
    }
  }, [visible])

  const toggle = (key: string) => {
    const next = new Set(selectedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChangeSelectedKeys(Array.from(next))
  }

  const selectKey = (key: string) => {
    if (selectedSet.has(key)) return
    onChangeSelectedKeys([...selectedKeys, key])
  }

  const handleSaved = (pack: CustomPack) => {
    selectKey(pack.key)
    onPacksChanged()
    setEditorVisible(false)
  }

  // No confirm() here — PackEditorDrawer's own ConfirmDialog gates the call to this, so by the time
  // it runs the player has already agreed. Unconditional and side-effecting only.
  const handleDelete = async (key: string) => {
    await deleteCustomPack(key)
    if (selectedSet.has(key)) onChangeSelectedKeys(selectedKeys.filter((k) => k !== key))
    onPacksChanged()
  }

  const handleShare = async (key: string, label: string) => {
    try {
      const shared = await shareCustomPackFile(key, label)
      if (!shared) void alert("Couldn't share", 'Sharing is not available on this device.')
    } catch {
      void alert("Couldn't share", 'Something went wrong sharing this pack. Please try again.')
    }
  }

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box — see hangmanFile.ts's own doc comments for why: the old clipboard-and-paste
  // round trip also depended on alert() to tell the player it worked, which isn't reliable on web.
  const handleImportFile = async () => {
    const raw = await pickHangmanFile()
    if (!raw) return

    try {
      const pack = await importCustomPack(raw)
      selectKey(pack.key)
      onPacksChanged()
      void alert('Pack imported', `Added "${pack.label}" (${commaString(pack.puzzles.length)} puzzles) to your packs.`)
    } catch (_error) {
      void alert('Invalid pack', 'Could not read that as a Hangman pack file.')
    }
  }

  return (
    <>
      {/* open is gated on !anyOverlayVisible too, the same way PuzzleDrawer gates itself against
          PacksScreen/PackPuzzlesDrawer stacked on top of IT — see PuzzleDrawer's own comment on
          this same pattern for why (blurred headers now make "still open, just covered" read as a
          layering glitch instead of a clean navigation transition). PackPuzzlesDrawer/
          PackEditorDrawer translate in over this panel's own content, which stays mounted
          underneath either way (Drawer never unmounts on close, just translates) —
          accessibilityElementsHidden below (unchanged) is what keeps this panel's title/close
          button/rows from staying reachable by screen readers and keyboard focus while invisible. */}
      <Drawer open={visible && !anyOverlayVisible} onClose={onDismiss} width={windowWidth} zIndex={DRAWER_PACKS_SCREEN_Z_INDEX}>
        <View testID='packs-screen-panel' style={styles.panel} accessibilityViewIsModal={visible && !anyOverlayVisible} accessibilityElementsHidden={!visible || anyOverlayVisible} importantForAccessibility={visible && !anyOverlayVisible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible && !anyOverlayVisible ? onDismiss : undefined}>
          <ScrollViewProvider>
            {/* Close sits on the LEADING (left) side — this screen is reached from the Game Menu's
                hamburger icon (top-left of the game screen), same left-anchored lineage as
                PuzzleDrawer/PackPuzzlesDrawer, so closing it lands back under the same thumb that
                opened the chain. 'Close', not the Appbar.BackAction default of 'Back' — see
                PuzzleDrawer's own ScrollViewHeader comment for why. */}
            <ScrollViewHeader
              title='Choose packs'
              backAction={() => {
                selection()
                onDismiss()
              }}
              backActionAccessibilityLabel='Close'
            />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled'>
              <View style={styles.sectionHeaderRow}>
                <Text variant='titleSmall' style={styles.sectionHeader}>
                  My packs
                </Text>
                <View style={styles.sectionActions}>
                  <Button
                    compact
                    icon='plus'
                    onPress={() => {
                      setEditingKey(null)
                      setEditorVisible(true)
                    }}
                  >
                    Create
                  </Button>
                  <Button compact icon='import' onPress={() => void handleImportFile()}>
                    Import
                  </Button>
                </View>
              </View>

              {customPacks.length === 0 ? (
                <Text variant='bodySmall' style={styles.emptyText}>
                  No custom packs yet.
                </Text>
              ) : (
                customPacks.map((item) => {
                  const unlocked = getUnlockedCountForPack(unlockMap, item.key)
                  const progress = item.count > 0 ? unlocked / item.count : 0
                  return (
                    <PackRow
                      key={item.key}
                      label={item.label}
                      group={item.group}
                      subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`}
                      progress={progress}
                      onPress={() => toggle(item.key)}
                      leading={<Checkbox status={selectedSet.has(item.key) ? 'checked' : 'unchecked'} onPress={() => toggle(item.key)} />}
                      // Share and Delete both live in the editor header now (Edit -> pack name ->
                      // Share/Delete) — this row used to be 3 icons deep with no real gap between
                      // them. Edit is the one thing this row itself needs: everything else about
                      // managing a specific pack happens once you're actually in it.
                      trailing={
                        <IconButton
                          icon='pencil-outline'
                          size={20}
                          onPress={() => {
                            setEditingKey(item.key)
                            setEditorVisible(true)
                          }}
                          accessibilityLabel={`Edit ${item.label}`}
                        />
                      }
                    />
                  )
                })
              )}

              <Text variant='titleSmall' style={styles.sectionHeader}>
                Built-in packs
              </Text>
              {builtInPacks.map((item) => {
                const unlocked = getUnlockedCountForPack(unlockMap, item.key)
                const progress = item.count > 0 ? unlocked / item.count : 0
                return (
                  <PackRow
                    key={item.key}
                    label={item.label}
                    group={item.group}
                    subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`}
                    progress={progress}
                    onPress={() => toggle(item.key)}
                    leading={<Checkbox status={selectedSet.has(item.key) ? 'checked' : 'unchecked'} onPress={() => toggle(item.key)} />}
                    trailing={
                      <IconButton
                        icon='information-outline'
                        size={20}
                        onPress={() => {
                          setDetailKey(item.key)
                          setDetailVisible(true)
                        }}
                        accessibilityLabel={`View ${item.label} contents`}
                      />
                    }
                  />
                )
              })}
            </ScrollView>

            {/* Not part of the scrollable content — matches PuzzleDrawer's own quick-start list,
                and keeps Select all/Clear reachable without scrolling back up past however many
                custom and built-in packs are in between. */}
            <ScrollViewFooter style={styles.listFooter}>
              <Text variant='bodySmall' style={styles.muted}>
                {commaString(selectedSet.size)} of {commaString(manifest.length)} selected
              </Text>
              <View style={styles.quickActions}>
                <Button compact onPress={() => onChangeSelectedKeys(manifest.map((item) => item.key))}>
                  Select all
                </Button>
                <Button compact onPress={() => onChangeSelectedKeys([])}>
                  Clear
                </Button>
              </View>
            </ScrollViewFooter>
          </ScrollViewProvider>
        </View>
      </Drawer>

      <PackPuzzlesDrawer visible={detailVisible} packKey={detailKey} onDismiss={() => setDetailVisible(false)} />
      <PackEditorDrawer visible={editorVisible} editingKey={editingKey} onDismiss={() => setEditorVisible(false)} onSaved={handleSaved} onDelete={handleDelete} onShare={handleShare} />
    </>
  )
}

const styles = StyleSheet.create({
  emptyText: { marginBottom: 12, opacity: 0.7 },
  // Matches PuzzleDrawer's own footer padding — scrolls away with the rest of the chrome while
  // actively scrolling and snaps back once it settles, rather than staying permanently pinned.
  listFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  muted: { opacity: 0.7 },
  panel: { flex: 1 },
  quickActions: { flexDirection: 'row' },
  scrollContent: { paddingBottom: 24, paddingHorizontal: 16 },
  sectionActions: { flexDirection: 'row' },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 12
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  }
})
