import { Drawer } from '@rific/drawer'
import { Button, Checkbox, IconButton } from '@rific/feedback-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { DRAWER_PACKS_SCREEN_Z_INDEX } from '@/constants/drawerStacking'
import { useDrawerWidth } from '@/hooks/useDrawerWidth'
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

export type PacksScreenProps = {
  visible: boolean
  onDismiss: () => void
  selectedKeys: string[]
  onChangeSelectedKeys: (keys: string[]) => void
  packsVersion: number
  onPacksChanged: () => void
  ref?: Ref<PacksScreenHandle>
}

// For the Single Player loadout's Android back: this screen's own pack browser and editor stack above
// it, and only this screen knows whether one is open.
export type PacksScreenHandle = {
  // Closes the editor or the pack browser, whichever is open. Returns whether it closed one.
  closeTopOverlay: () => boolean
}

// Memoized: stays mounted (translated off-screen) even while closed, and its own children
// (PackPuzzlesDrawer/PackEditorDrawer, each with their own always-mounted content) are heavy
// enough that re-rendering this whole tree on every unrelated ancestor state change is
// noticeable. Callers must keep every prop referentially stable (useCallback/useMemo) or this memo
// does nothing.
export const PacksScreen = memo(({ visible, onDismiss, selectedKeys, onChangeSelectedKeys, packsVersion, onPacksChanged, ref }: PacksScreenProps): JSX.Element => {
  const theme = useTheme()
  // Same panel width every other fixed-width drawer in the app uses (PackProgressDrawer, the
  // pack browser and editor). This used to be a full-width page, but there's no reason its own panel
  // should be the one exception.
  const drawerWidth = useDrawerWidth()

  // packsVersion isn't read inside the memo - it's a change counter bumped whenever a custom pack
  // is created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const customPacks = useMemo(() => manifest.filter((item) => isCustomPackKey(item.key)), [manifest])
  const builtInPacks = useMemo(() => manifest.filter((item) => !isCustomPackKey(item.key)), [manifest])
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  // A built-in pack's own read-only puzzle list (PackPuzzlesDrawer, mode/difficulty/onConfirm all
  // omitted) and the create/edit form (PackEditorDrawer) each stack on top of this screen as their
  // own animated Drawer - same as PackPuzzlesDrawer already stacks on top of the loadout - rather
  // than swapping in as an unanimated step within this same panel. detailKey/editingKey are
  // deliberately separate from their own drawer's visible flag (detailVisible/editorVisible) -
  // dismissing only flips visible, never the key - so the content survives the close-translate
  // animation instead of blanking out mid-slide (see PackPuzzlesDrawer/PackEditorDrawer's own doc
  // comments on why, and the loadout's identical playPackKey/playDrawerVisible split). Both
  // visible flags reset together below whenever this screen reopens; the keys themselves are left
  // alone since they're always overwritten before either drawer next opens anyway.
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const anyOverlayVisible = detailVisible || editorVisible

  useImperativeHandle(
    ref,
    () => ({
      closeTopOverlay: () => {
        if (editorVisible) setEditorVisible(false)
        else if (detailVisible) setDetailVisible(false)
        else return false
        return true
      }
    }),
    [editorVisible, detailVisible]
  )

  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})

  // Always reopens on the list, with neither overlay open - otherwise a screen left mid-edit or
  // mid-detail on last close would silently resume there next time. Closing this screen closes them
  // too: the loadout closes it on its own when the page loses focus, and an editor left open above a
  // closed list would come back over the page with nothing under it.
  useEffect(() => {
    setDetailVisible(false)
    setEditorVisible(false)
  }, [visible])

  // Re-fetched each time this screen opens, not subscribed to live - good enough for a summary
  // count sitting in a list row, and matches the one-shot fetch every other pack-progress display
  // in this app already does (PackPuzzleList, PackProgressDrawer).
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
  // since they're only ever handed to a plain Button/PackRow) - these three specifically become
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

  // No confirm() here - PackEditorDrawer's own ConfirmDialog gates the call to this, so by the time
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
      if (!shared) void alert("Couldn't Share", 'Sharing is not available on this device.')
    } catch {
      void alert("Couldn't Share", 'Something went wrong sharing this pack. Please try again.')
    }
  }, [])

  const handleCloseDetail = useCallback(() => setDetailVisible(false), [])
  const handleCloseEditor = useCallback(() => setEditorVisible(false), [])

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box - see hangmanFile.ts's own doc comments for why: the old clipboard-and-paste
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
      void alert('Pack Imported', `Added "${pack.label}" (${commaString(pack.puzzles.length)} puzzle${pack.puzzles.length === 1 ? '' : 's'}) to your packs.`)
    } catch {
      void alert('Invalid Pack', 'Could not read that as a Hangman pack file.')
    }
  }, [selectKey, onPacksChanged])

  // The built-in manifest is 48 packs (50 total minus whatever's custom) - real enough on-device
  // render cost that the old plain .map() inside a ScrollView was the actual cause of "opening
  // Choose packs feels slow": every row mounted at once instead of just the ones on screen.
  // Custom packs stay a plain .map() in listHeader below (typically a handful, not worth
  // virtualizing) - only the built-in list becomes the FlatList's own `data`.
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
  // label, as the FlatList's own scrolling header rather than a sibling before it - same
  // ListHeaderComponent approach as the Single Player loadout's own pack list.
  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.sectionHeaderRow}>
          <Text variant='titleSmall' style={styles.sectionHeaderInRow}>
            My Packs
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
                // Share/Delete) - this row used to be 3 icons deep with no real gap between
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
          Built-In Packs
        </Text>
      </>
    ),
    [theme.colors.primary, theme.colors.onPrimary, theme.colors.secondary, theme.colors.onSecondary, customPacks, handleImportFile, unlockMap, selectedSet, toggle]
  )

  return (
    <>
      {/* open is gated on !anyOverlayVisible too, not just visible: with every drawer's header and
          footer floating over a blurred backdrop, "still open, just covered" reads as a layering
          glitch (a second blur bleeding through behind the one in front), while sliding this panel
          away and back reads as a clean navigation transition. PackPuzzlesDrawer/
          PackEditorDrawer translate in over this panel's own content, which stays mounted
          underneath either way (Drawer never unmounts on close, just translates) -
          accessibilityElementsHidden below (unchanged) is what keeps this panel's title/close
          button/rows from staying reachable by screen readers and keyboard focus while invisible. */}
      <Drawer open={visible && !anyOverlayVisible} onClose={onDismiss} width={drawerWidth} zIndex={DRAWER_PACKS_SCREEN_Z_INDEX}>
        <View testID='packs-screen-panel' style={styles.panel} accessibilityViewIsModal={visible && !anyOverlayVisible} accessibilityElementsHidden={!visible || anyOverlayVisible} importantForAccessibility={visible && !anyOverlayVisible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible && !anyOverlayVisible ? onDismiss : undefined}>
          <ScrollViewProvider footerFixed>
            {/* Close sits on the LEADING (left) side - this panel slides in over the Single Player
                loadout (its All Packs row), whose own Back arrow sits in that same top-left corner,
                as does PackPuzzlesDrawer's, so every exit in the chain is in one place. 'Close', not
                the Appbar.BackAction default of 'Back' - this dismisses the whole panel rather than
                stepping back a level within it. Custom IconButton, not the
                default callback-driven Appbar.BackAction: a plain arrow in the surface's ink (the fleet's back-button style), matching every other
                back/close action in the app; IconButton already fires the app's own haptic
                convention on press itself, so this needs no manual selection() call the way the
                callback form used to. */}
            <ScrollViewHeader title='Choose Packs' actionSize={40} backAction={<IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={onDismiss} accessibilityLabel='Close' />} />

            {/* "My packs" through the "Built-in packs" label live in listHeader (see its own
                declaration above) - everything above the built-in pack list scrolls away with it
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
              // Solid vibrant fill, not the chip's own default muted surface tint - matches every
              // other accent on this screen now instead of being the one control still washed out.
              chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
            />

            {/* Select all/Clear sit in their own row above Done, not part of the scrollable content
                - same "reachable without scrolling back up" reasoning the old single-row footer
                had. The count that used to live in its own label text next to them now lives in
                Done's own label instead - Done is already the one line every eye lands on before
                closing this screen, so the count reads there rather than needing a second, separate
                bit of text just above it. */}
            <ScrollViewFooter style={styles.footer}>
              <View style={styles.quickActions}>
                <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='select-off' onPress={() => onChangeSelectedKeys([])} style={styles.quickActionButton}>
                  Clear
                </Button>
                <Button mode='contained' buttonColor={theme.colors.tertiary} textColor={theme.colors.onTertiary} icon='select-all' onPress={() => onChangeSelectedKeys(manifest.map((item) => item.key))} style={styles.quickActionButton}>
                  All
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
  // Matches ModePickerDrawer's own footer/footerButton exactly - same plain dismiss-button footer.
  // alignItems/flexDirection override ScrollViewFooter's own row+center defaults - the quick
  // actions row and Done stack vertically here, same convention the loadouts' own footers use for
  // Continue/Random.
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
  // at their own natural width - reads as one cohesive block with the full-width Done button below,
  // instead of two oddly-sized pills floating above it.
  quickActionButton: { flex: 1 },
  quickActions: { flexDirection: 'row', gap: 8 },
  // paddingBottom matches sectionHeaderRow's own marginTop above exactly - the scrollable
  // content's last row sits the same distance from what follows it (the footer) as the first
  // row sits from the header.
  scrollContent: { paddingBottom: 12, paddingHorizontal: 16 },
  sectionActions: { flexDirection: 'row', gap: 8 },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: 4,
    marginTop: 12
  },
  // Same bold treatment as sectionHeader, but no marginTop of its own - this Text sits inside
  // sectionHeaderRow (a flex row alongside Create/Import), which now carries that same 12px as a
  // margin on the ROW itself instead, so both the label and its buttons move down together rather
  // than only the text shifting inside the row.
  sectionHeaderInRow: { fontWeight: '700' },
  // marginTop matches the top-of-content breathing room everywhere else (see the loadout's
  // firstSectionLabel/PackProgressDrawer's firstCard) - this row used to sit flush against the
  // header with no gap at all.
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  }
})
