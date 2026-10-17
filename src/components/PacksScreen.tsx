import { Drawer } from '@rific/drawer'
import { Button, Checkbox, IconButton, SegmentedButtons } from '@rific/feedback-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { createContext, JSX, memo, type Ref, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text, useTheme } from 'react-native-paper'

import { DRAWER_PACKS_SCREEN_Z_INDEX } from '@/constants/drawerStacking'
import { useDrawerWidth } from '@/hooks/useDrawerWidth'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { type CustomPack, deleteCustomPack, importCustomPack, isCustomPackKey } from '@/utils/customPacks'
import { pickHangmanFile, shareCustomPackFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { getUnlockedCountForPack } from '@/utils/unlocks'

import { PackEditorDrawer } from './PackEditorDrawer'
import { PackPuzzlesDrawer } from './PackPuzzlesDrawer'
import { PackRow } from './PackRow'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this screen's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// Which packs the list shows: every pack, or only the selected ones, to review a trimmed selection.
type PackFilter = 'all' | 'selected'
const FILTER_OPTIONS: { value: PackFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'selected', label: 'Selected' }
]

// The selection, for the rows' checkboxes. Each checkbox reads it itself (PackCheckbox), so a toggle
// redraws the checkboxes and nothing else: the row renderers (renderBuiltInPackRow, listHeader's custom
// rows) don't depend on the selection at all, so the rows themselves stay put.
const SelectedPacksContext = createContext<ReadonlySet<string>>(new Set())

// Labeled with the pack's name, so a screen reader says which pack it checks.
const PackCheckbox = ({ packKey, label, onToggle }: { packKey: string; label: string; onToggle: (key: string) => void }): JSX.Element => {
  const selected = useContext(SelectedPacksContext)
  return <Checkbox status={selected.has(packKey) ? 'checked' : 'unchecked'} onPress={() => onToggle(packKey)} accessibilityLabel={label} />
}

// Only shows in the Selected view: the built-in list is never empty otherwise. A component, not an
// element, so it reads styles (declared below) at render time, and stays one stable FlatList prop.
const BuiltInEmpty = (): JSX.Element => (
  <Text variant='bodySmall' style={styles.emptyText}>
    No built-in packs selected.
  </Text>
)

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
  // Read through a ref by every handler that changes the selection (toggle, selectKey, handleDelete),
  // so none of them, and nothing built from them (the row renderers, PackEditorDrawer's memoized
  // props), changes identity on each toggle.
  const selectedKeysRef = useRef(selectedKeys)
  useEffect(() => {
    selectedKeysRef.current = selectedKeys
  })

  // All, or only the selected packs. Live: a pack unchecked in the Selected view leaves it (All brings
  // it back). Each section filters on its own, so My Packs' Create and Import stay put either way.
  const [filter, setFilter] = useState<PackFilter>('all')
  const shownCustomPacks = useMemo(() => (filter === 'selected' ? customPacks.filter((item) => selectedSet.has(item.key)) : customPacks), [filter, customPacks, selectedSet])
  const shownBuiltInPacks = useMemo(() => (filter === 'selected' ? builtInPacks.filter((item) => selectedSet.has(item.key)) : builtInPacks), [filter, builtInPacks, selectedSet])

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

  // Always reopens on the list, with neither overlay open - otherwise a screen left mid-edit or
  // mid-detail on last close would silently resume there next time. Closing this screen closes them
  // too: the loadout closes it on its own when the page loses focus, and an editor left open above a
  // closed list would come back over the page with nothing under it. It reopens on All, too (only on
  // opening, so the list doesn't change under the close slide): a player coming back to add a pack
  // would otherwise find only the ones already in.
  /* eslint-disable react-hooks/set-state-in-effect -- a reset driven by an external prop (the loadout
     opening or closing this screen), not state derived from other state within this render. */
  useEffect(() => {
    setDetailVisible(false)
    setEditorVisible(false)
    if (visible) setFilter('all')
  }, [visible])
  /* eslint-enable react-hooks/set-state-in-effect */

  // The active player's, read again each time this screen opens and whenever a count moves while it's
  // open, like every other pack-progress display in this app (PackPuzzleList, PackProgressDrawer).
  const { unlockMap } = usePuzzleUnlocks({ enabled: visible })

  // useCallback, and the selection read through the ref: a dependency of renderBuiltInPackRow/
  // listHeader below, both of which the FlatList rows/header rely on staying referentially stable,
  // through every toggle.
  const toggle = useCallback(
    (key: string) => {
      const current = selectedKeysRef.current
      onChangeSelectedKeys(current.includes(key) ? current.filter((k) => k !== key) : [...current, key])
    },
    [onChangeSelectedKeys]
  )

  const selectKey = useCallback(
    (key: string) => {
      const current = selectedKeysRef.current
      if (current.includes(key)) return
      onChangeSelectedKeys([...current, key])
    },
    [onChangeSelectedKeys]
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
      // Read after the await: the selection may have moved while the pack was being deleted.
      const current = selectedKeysRef.current
      if (current.includes(key)) onChangeSelectedKeys(current.filter((k) => k !== key))
      onPacksChanged()
    },
    [onChangeSelectedKeys, onPacksChanged]
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
  // virtualizing) - only the built-in list becomes the FlatList's own `data`. Not rebuilt by a
  // toggle: the checkbox reads the selection itself (PackCheckbox), so in the All view a toggle
  // redraws one checkbox, not every visible row.
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
          leading={<PackCheckbox packKey={item.key} label={item.label} onToggle={toggle} />}
          actions={[
            {
              name: 'view',
              label: `View ${item.label} contents`,
              onPress: () => {
                setDetailKey(item.key)
                setDetailVisible(true)
              }
            }
          ]}
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
    [unlockMap, toggle]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // Paper's SegmentedButtons has no per-segment checked background, so both are set through each
  // option's style, in the screen's vibrant primary rather than Paper's muted default (the loadout's
  // Difficulty picker does the same).
  const filterButtons = useMemo(
    () =>
      FILTER_OPTIONS.map((option) => ({
        ...option,
        checkedColor: theme.colors.onPrimary,
        uncheckedColor: theme.colors.onPrimaryContainer,
        style: { backgroundColor: option.value === filter ? theme.colors.primary : theme.colors.primaryContainer }
      })),
    [filter, theme.colors.primary, theme.colors.onPrimary, theme.colors.primaryContainer, theme.colors.onPrimaryContainer]
  )

  // The All / Selected filter, then "My packs" (a handful of custom entries, cheap to always render)
  // through the "Built-in packs" label, as the FlatList's own scrolling header rather than a sibling
  // before it - same ListHeaderComponent approach as the Single Player loadout's own pack list. The
  // filter sits first, not in FlatList's renderFilters: that slot renders after this whole header,
  // under the Built-In Packs label, where it would read as filtering only the built-in list.
  const listHeader = useMemo(
    () => (
      <>
        <SegmentedButtons value={filter} onValueChange={(value) => setFilter(value as PackFilter)} buttons={filterButtons} style={styles.filter} />

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

        {shownCustomPacks.length === 0 ? (
          <Text variant='bodySmall' style={styles.emptyText}>
            {customPacks.length === 0 ? 'No custom packs yet.' : 'No custom packs selected.'}
          </Text>
        ) : (
          shownCustomPacks.map((item) => {
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
                leading={<PackCheckbox packKey={item.key} label={item.label} onToggle={toggle} />}
                actions={[
                  {
                    name: 'edit',
                    label: `Edit ${item.label}`,
                    onPress: () => {
                      setEditingKey(item.key)
                      setEditorVisible(true)
                    }
                  }
                ]}
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
    [filter, filterButtons, theme.colors.primary, theme.colors.onPrimary, theme.colors.secondary, theme.colors.onSecondary, customPacks.length, shownCustomPacks, handleImportFile, unlockMap, toggle]
  )
  // Stable, so a toggle doesn't hand the FlatList a new prop.
  const chipProps = useMemo(() => ({ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }), [theme.colors.primary, theme.colors.onPrimary])

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
            <SelectedPacksContext.Provider value={selectedSet}>
              <FlatList
                data={shownBuiltInPacks}
                keyExtractor={packRowKeyExtractor}
                renderItem={renderBuiltInPackRow}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={BuiltInEmpty}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps='handled'
                // Solid vibrant fill, not the chip's own default muted surface tint - matches every
                // other accent on this screen now instead of being the one control still washed out.
                chipProps={chipProps}
              />
            </SelectedPacksContext.Provider>

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
                {/* "Select All", not just "All", now that the filter at the top has an All of its own. */}
                <Button mode='contained' buttonColor={theme.colors.tertiary} textColor={theme.colors.onTertiary} icon='select-all' onPress={() => onChangeSelectedKeys(manifest.map((item) => item.key))} style={styles.quickActionButton}>
                  Select All
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
  // The same breathing room below the header as sectionHeaderRow's (which now follows it).
  filter: { marginTop: 12 },
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
