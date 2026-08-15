import { Drawer } from '@rific/drawer'
import { Button, Checkbox, IconButton } from '@rific/haptic-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { DRAWER_PACKS_SCREEN_Z_INDEX } from '@/constants/drawerStacking'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { type CustomPack, deleteCustomPack, importCustomPack, isCustomPackKey } from '@/utils/customPacks'
import { pickHangmanFile, shareCustomPackFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap, getUnlockedCountForPack, PuzzleUnlockMap } from '@/utils/unlocks'

import { PackEditorDrawer } from './PackEditorDrawer'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this screen's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }
// Same fixed panel width every other drawer in the app uses (PuzzleDrawer's own Game Menu,
// AchievementsDrawer) — this used to be a full-width page, but there's no reason its own panel
// should be the one exception.
const DRAWER_WIDTH = 380

export type PacksScreenProps = {
  visible: boolean
  onDismiss: () => void
  selectedKeys: string[]
  onChangeSelectedKeys: (keys: string[]) => void
  packsVersion: number
  onPacksChanged: () => void
}

// Memoized: stays mounted (translated off-screen) even while closed, and its own children
// (PackPuzzlesDrawer/PackEditorDrawer, each with their own always-mounted content) are heavy
// enough that re-rendering this whole tree on every unrelated ancestor state change is
// noticeable — see PuzzleDrawer's own memo comment for the full reasoning.
export const PacksScreen = memo(({ visible, onDismiss, selectedKeys, onChangeSelectedKeys, packsVersion, onPacksChanged }: PacksScreenProps): JSX.Element => {
  const theme = useTheme()

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
  useEffect(() => {
    if (visible) {
      setDetailVisible(false)
      setEditorVisible(false)
    }
  }, [visible])

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

  // useCallback (unlike before): now a dependency of renderBuiltInPackRow/listHeader below, both
  // of which the FlatList rows/header rely on staying referentially stable.
  const toggle = useCallback(
    (key: string) => {
      const next = new Set(selectedSet)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      onChangeSelectedKeys(Array.from(next))
    },
    [selectedSet, onChangeSelectedKeys]
  )

  const selectKey = useCallback(
    (key: string) => {
      if (selectedSet.has(key)) return
      onChangeSelectedKeys([...selectedKeys, key])
    },
    [selectedSet, selectedKeys, onChangeSelectedKeys]
  )

  // Wrapped in useCallback (unlike toggle/selectKey's other callers above, which stay inline
  // since they're only ever handed to a plain Button/PackRow) — these three specifically become
  // PackEditorDrawer's own onSaved/onDelete/onShare props, and that drawer is memoized (see its
  // own file), so a fresh function identity here on every render would silently defeat that.
  const handleSaved = useCallback(
    (pack: CustomPack) => {
      selectKey(pack.key)
      onPacksChanged()
      setEditorVisible(false)
    },
    [selectKey, onPacksChanged]
  )

  // No confirm() here — PackEditorDrawer's own ConfirmDialog gates the call to this, so by the time
  // it runs the player has already agreed. Unconditional and side-effecting only.
  const handleDelete = useCallback(
    async (key: string) => {
      await deleteCustomPack(key)
      if (selectedSet.has(key)) onChangeSelectedKeys(selectedKeys.filter((k) => k !== key))
      onPacksChanged()
    },
    [selectedSet, selectedKeys, onChangeSelectedKeys, onPacksChanged]
  )

  const handleShare = useCallback(async (key: string, label: string) => {
    try {
      const shared = await shareCustomPackFile(key, label)
      if (!shared) void alert("Couldn't share", 'Sharing is not available on this device.')
    } catch {
      void alert("Couldn't share", 'Something went wrong sharing this pack. Please try again.')
    }
  }, [])

  const handleCloseDetail = useCallback(() => setDetailVisible(false), [])
  const handleCloseEditor = useCallback(() => setEditorVisible(false), [])

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box — see hangmanFile.ts's own doc comments for why: the old clipboard-and-paste
  // round trip also depended on alert() to tell the player it worked, which isn't reliable on web.
  // useCallback (unlike before): this is now a listHeader dependency (see below), so a fresh
  // identity every render would recompute that memo for nothing.
  const handleImportFile = useCallback(async () => {
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
  }, [selectKey, onPacksChanged])

  // The built-in manifest is 48 packs (50 total minus whatever's custom) — real enough on-device
  // render cost that the old plain .map() inside a ScrollView was the actual cause of "opening
  // Choose packs feels slow": every row mounted at once instead of just the ones on screen.
  // Custom packs stay a plain .map() in listHeader below (typically a handful, not worth
  // virtualizing) — only the built-in list becomes the FlatList's own `data`.
  const renderBuiltInPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const progress = item.count > 0 ? unlocked / item.count : 0
      return (
        <PackRow
          label={item.label}
          group={item.group}
          isPack
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
    },
    [unlockMap, selectedSet, toggle]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // "My packs" (a handful of custom entries, cheap to always render) through the "Built-in packs"
  // label, as the FlatList's own scrolling header rather than a sibling before it — same
  // ListHeaderComponent approach as PuzzleDrawer's own pack list (see its own comment on this).
  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.sectionHeaderRow}>
          <Text variant='titleSmall' style={styles.sectionHeaderInRow}>
            My packs
          </Text>
          <View style={styles.sectionActions}>
            <Button
              mode='contained'
              buttonColor={theme.colors.primary}
              textColor={theme.colors.onPrimary}
              icon='plus'
              onPress={() => {
                setEditingKey(null)
                setEditorVisible(true)
              }}
            >
              Create
            </Button>
            <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='import' onPress={() => void handleImportFile()}>
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
                isPack
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
      </>
    ),
    [customPacks, unlockMap, selectedSet, handleImportFile, toggle]
  )

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
      <Drawer open={visible && !anyOverlayVisible} onClose={onDismiss} width={DRAWER_WIDTH} zIndex={DRAWER_PACKS_SCREEN_Z_INDEX}>
        <View testID='packs-screen-panel' style={styles.panel} accessibilityViewIsModal={visible && !anyOverlayVisible} accessibilityElementsHidden={!visible || anyOverlayVisible} importantForAccessibility={visible && !anyOverlayVisible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible && !anyOverlayVisible ? onDismiss : undefined}>
          <ScrollViewProvider footerFixed>
            {/* Close sits on the LEADING (left) side — this screen is reached from the Game Menu's
                hamburger icon (top-left of the game screen), same left-anchored lineage as
                PuzzleDrawer/PackPuzzlesDrawer, so closing it lands back under the same thumb that
                opened the chain. 'Close', not the Appbar.BackAction default of 'Back' — see
                PuzzleDrawer's own ScrollViewHeader comment for why. Custom IconButton, not the
                default callback-driven Appbar.BackAction — filled tertiary, matching every other
                back/close action in the app; IconButton already fires the app's own haptic
                convention on press itself, so this needs no manual selection() call the way the
                callback form used to. */}
            <ScrollViewHeader title='Choose packs' actionSize={40} backAction={<IconButton icon='arrow-left' mode='contained' hitSlop={ICON_ACTION_HIT_SLOP} containerColor={theme.colors.tertiary} iconColor={theme.colors.onTertiary} onPress={onDismiss} accessibilityLabel='Close' />} />

            {/* "My packs" through the "Built-in packs" label live in listHeader (see its own
                declaration above) — everything above the built-in pack list scrolls away with it
                exactly as it did back when this was all one plain ScrollView; only the built-in
                list itself needed to become a real FlatList. */}
            <FlatList
              data={builtInPacks}
              keyExtractor={packRowKeyExtractor}
              renderItem={renderBuiltInPackRow}
              ListHeaderComponent={listHeader}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps='handled'
              // Solid vibrant fill, not the chip's own default muted surface tint — matches every
              // other accent on this screen now instead of being the one control still washed out.
              chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
            />

            {/* Select all/Clear sit in their own row above Done, not part of the scrollable content
                — same "reachable without scrolling back up" reasoning the old single-row footer
                had. The count that used to live in its own label text next to them now lives in
                Done's own label instead — Done is already the one line every eye lands on before
                closing this screen, so the count reads there rather than needing a second, separate
                bit of text just above it. */}
            <ScrollViewFooter style={styles.footer}>
              <View style={styles.quickActions}>
                <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='select-off' onPress={() => onChangeSelectedKeys([])} style={styles.quickActionButton}>
                  Clear
                </Button>
                <Button mode='contained' buttonColor={theme.colors.tertiary} textColor={theme.colors.onTertiary} icon='select-all' onPress={() => onChangeSelectedKeys(manifest.map((item) => item.key))} style={styles.quickActionButton}>
                  Select all
                </Button>
              </View>
              <Button mode='contained' icon='check' onPress={onDismiss} style={styles.footerButton}>
                Done ({commaString(selectedSet.size)} of {commaString(manifest.length)})
              </Button>
            </ScrollViewFooter>
          </ScrollViewProvider>
        </View>
      </Drawer>

      <PackPuzzlesDrawer visible={detailVisible} packKey={detailKey} onDismiss={handleCloseDetail} />
      <PackEditorDrawer visible={editorVisible} editingKey={editingKey} onDismiss={handleCloseEditor} onSaved={handleSaved} onDelete={handleDelete} onShare={handleShare} />
    </>
  )
})
PacksScreen.displayName = 'PacksScreen'

const styles = StyleSheet.create({
  emptyText: { marginBottom: 12, opacity: 0.7 },
  // Matches ModePickerDrawer's own footer/footerButton exactly — same plain dismiss-button footer.
  // alignItems/flexDirection override ScrollViewFooter's own row+center defaults — the quick
  // actions row and Done stack vertically here, same convention PuzzleDrawer's own footer uses for
  // Random/Pass & play.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  footerButton: { marginTop: 8, width: '100%' },
  muted: { opacity: 0.7 },
  panel: { flex: 1 },
  // Select all/Clear split the row evenly (flex: 1 each via quickActionButton) rather than sitting
  // at their own natural width — reads as one cohesive block with the full-width Done button below,
  // instead of two oddly-sized pills floating above it.
  quickActionButton: { flex: 1 },
  quickActions: { flexDirection: 'row', gap: 8 },
  // paddingBottom matches sectionHeaderRow's own marginTop above exactly — the scrollable
  // content's last row sits the same distance from what follows it (the footer) as the first
  // row sits from the header.
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  sectionActions: { flexDirection: 'row', gap: 8 },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 12
  },
  // Same bold treatment as sectionHeader, but no marginTop of its own — this Text sits inside
  // sectionHeaderRow (a flex row alongside Create/Import), which now carries that same 12px as a
  // margin on the ROW itself instead, so both the label and its buttons move down together rather
  // than only the text shifting inside the row.
  sectionHeaderInRow: { fontWeight: '700' },
  // marginTop matches every other drawer's own top-of-content breathing room (see PuzzleDrawer's
  // modeSelectorBleed/AchievementsDrawer's firstCard/SettingsDrawer's topSectionLabel) — this row
  // used to sit flush against the header with no gap at all.
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  }
})
