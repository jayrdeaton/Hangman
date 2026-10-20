import { Button, Checkbox, IconButton } from '@rific/feedback-press'
import { usePopoverHost } from '@tastic/hud/chrome'
import { createContext, JSX, memo, type Ref, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { type CustomPack, deleteCustomPack, importCustomPack, isCustomPackKey } from '@/utils/customPacks'
import { pickHangmanFile, shareCustomPackFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, type PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { getUnlockedCountForPack } from '@/utils/unlocks'

import { renderFadingScrollComponent } from './fadingScrollComponent'
import { FullScreenLayer } from './FullScreenLayer'
import { PackEditorPage } from './PackEditorPage'
import { PackPuzzlesPage } from './PackPuzzlesPage'
import { PackRow } from './PackRow'
import { ScreenHeader } from './ScreenHeader'

// The grid (Jay, 2026-10-19: on a large enough screen the packs in a grid). The screen takes the
// whole window, past the game's 480pt column on the web (it's a browsing screen), up to MAX_WIDTH, and
// lays its cards out in as many columns of at least MIN_CARD_WIDTH as fit, up to MAX_COLUMNS: one on a
// phone, two from about a tablet held upright, three on a wide window.
const MAX_WIDTH = 1100
const GUTTER = 16
const GAP = 12
const MIN_CARD_WIDTH = 320
const MAX_COLUMNS = 3
// The footer's buttons never stretch past a phone's width, however wide the screen.
const FOOTER_MAX_WIDTH = 560

// How many columns of pack cards fit a screen `width` points wide, and how wide each card is.
export const packGrid = (width: number): { columns: number; cardWidth: number } => {
  const content = Math.min(width, MAX_WIDTH) - 2 * GUTTER
  const columns = Math.max(1, Math.min(MAX_COLUMNS, Math.floor((content + GAP) / (MIN_CARD_WIDTH + GAP))))
  return { columns, cardWidth: (content - GAP * (columns - 1)) / columns }
}

// The selection, for the cards' checkboxes. Each checkbox reads it itself (PackCheckbox), so a toggle
// redraws the checkboxes and nothing else: the card renderers (renderBuiltInPack, listHeader's custom
// cards) don't depend on the selection at all, so the cards themselves stay put.
const SelectedPacksContext = createContext<ReadonlySet<string>>(new Set())

// Labeled with the pack's name, so a screen reader says which pack it checks.
const PackCheckbox = ({ packKey, label, onToggle }: { packKey: string; label: string; onToggle: (key: string) => void }): JSX.Element => {
  const selected = useContext(SelectedPacksContext)
  return <Checkbox status={selected.has(packKey) ? 'checked' : 'unchecked'} onPress={() => onToggle(packKey)} accessibilityLabel={label} />
}

// The room between two rows of cards.
const RowGap = (): JSX.Element => <View style={styles.rowGap} />

// The header's one bulk action (Jay, 2026-10-19, in place of the footer's Clear and Select All pills
// and the All / Selected filter): a tri-state checkbox for every pack, empty with none selected, partly
// checked with some, checked with all. A press selects every pack, or clears them all once they all
// are. A plain glyph in the screen's ink, like the close glyph across from it and the editor's Share,
// and a checkbox to a screen reader ("All packs", checked, unchecked or mixed: aria-checked, which the
// web maps too, where accessibilityState's checked never reaches the page).
const AllPacksCheckbox = ({ selectedCount, total, onSelectAll, onClear }: { selectedCount: number; total: number; onSelectAll: () => void; onClear: () => void }): JSX.Element => {
  const theme = useTheme()
  const all = total > 0 && selectedCount >= total
  const icon = all ? 'checkbox-marked-outline' : selectedCount > 0 ? 'minus-box-outline' : 'checkbox-blank-outline'
  return <IconButton icon={icon} iconColor={theme.colors.onSurface} size={24} hitSlop={4} onPress={all ? onClear : onSelectAll} accessibilityLabel='All packs' accessibilityRole='checkbox' aria-checked={all ? true : selectedCount > 0 ? 'mixed' : false} />
}

// A pack whose every puzzle is unlocked, marked the way Pack Progress (folded in here, 2026-10-18)
// marked it: a trophy on its card, before its buttons. Labeled, so a screen reader that reaches the
// card's parts (the web) hears it.
const CompleteTrophy = (): JSX.Element => {
  const theme = useTheme()
  return (
    <View accessible accessibilityLabel='Complete' style={styles.trophy}>
      <Icon source='trophy' size={20} color={theme.colors.primary} />
    </View>
  )
}

export type PacksScreenProps = {
  visible: boolean
  onDismiss: () => void
  selectedKeys: string[]
  onChangeSelectedKeys: (keys: string[]) => void
  packsVersion: number
  onPacksChanged: () => void
  // What a puzzle started from the pack browser is played with (the active player's art and
  // difficulty), and where it goes: the loadout's start, which asks before abandoning a
  // round with a guess on it. Without onConfirm the pack browser only browses (the Pass & Play
  // table on the packs, whose puzzles come by turns).
  mode: GameMode
  difficulty: 'any' | PuzzleDifficultyTier
  onConfirm?: (payload: GameStartPayload) => void
  ref?: Ref<PacksScreenHandle>
}

// For the loadout's Android back: this screen's own pack browser and editor sit over it, and only
// this screen knows whether one is open.
export type PacksScreenHandle = {
  // Closes the editor or the pack browser, whichever is open. Returns whether it closed one.
  closeTopOverlay: () => boolean
}

// Choose Packs, the loadout's packs card (Jay, 2026-10-19: a whole screen rather than a drawer,
// drawn like the rest of the app): it slides up over the loadout on the board (FullScreenLayer), under
// the fleet's screen header (ScreenHeader: a close glyph and the title), and lists every pack, custom
// and built-in, as raised cards checked for the active player's selection, with its unlock progress and
// a trophy once it's complete (what Pack Progress showed until it was folded in here, 2026-10-18). On a
// wide enough screen the cards sit in a grid (packGrid), every card in a row ending level. The list fades
// at its edges while there's more past them, above Done, which stays put. The header's checkbox selects
// every pack or none (AllPacksCheckbox). A card's info button opens the pack's puzzles (PackPuzzlesPage), where a puzzle or Play This
// Pack starts a round (on the pages that play from it, see onConfirm) and Only This Pack narrows the
// selection to that pack; a custom pack's pencil opens the editor (PackEditorPage). Both slide in from
// the right over this list, as pages inside this screen.
//
// Memoized: it stays mounted (off the screen's edge) even while closed, its own pages with it, and is
// heavy enough that re-rendering it on every unrelated change above is noticeable. Callers keep every
// prop referentially stable (useCallback/useMemo) or this memo does nothing.
export const PacksScreen = memo(({ visible, onDismiss, selectedKeys, onChangeSelectedKeys, packsVersion, onPacksChanged, mode, difficulty, onConfirm, ref }: PacksScreenProps): JSX.Element => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width: windowWidth } = useWindowDimensions()
  const { columns, cardWidth } = packGrid(windowWidth - insets.left - insets.right)

  // packsVersion isn't read inside the memo - it's a change counter bumped whenever a custom pack
  // is created/edited/deleted/imported, since getPuzzleManifest() otherwise looks pure to React.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const customPacks = useMemo(() => manifest.filter((item) => isCustomPackKey(item.key)), [manifest])
  const builtInPacks = useMemo(() => manifest.filter((item) => !isCustomPackKey(item.key)), [manifest])
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])
  // Read through a ref by every handler that changes the selection (toggle, selectKey, handleDelete),
  // so none of them, and nothing built from them (the card renderers, PackEditorPage's memoized
  // props), changes identity on each toggle.
  const selectedKeysRef = useRef(selectedKeys)
  useEffect(() => {
    selectedKeysRef.current = selectedKeys
  })

  // A pack's own puzzles (PackPuzzlesPage: pick a puzzle, Play This Pack, Only This Pack) and the
  // create/edit form (PackEditorPage), each a page sliding in over this list. detailKey/editingKey are
  // deliberately separate from their page's visible flag (detailVisible/editorVisible) - leaving only
  // flips visible, never the key - so the page's content holds through its slide out instead of
  // blanking mid-way. Both visible flags reset together below whenever this screen reopens; the keys
  // are left alone, since they're always overwritten before either page next opens.
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [editorVisible, setEditorVisible] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const anyOverlayVisible = detailVisible || editorVisible
  // The pack page's popover host, for its two filters: here, so Android back (closeTopOverlay) closes
  // an open filter before the page. usePopoverHost hands back a new object every render; the page is
  // memoized, so it only gets a new one when a popover opens or closes.
  const { openId: pageOpenId, toggle: togglePagePopover, close: closePagePopover } = usePopoverHost()
  const pagePopoverHost = useMemo(() => ({ openId: pageOpenId, toggle: togglePagePopover, close: closePagePopover }), [pageOpenId, togglePagePopover, closePagePopover])
  // The list itself is what a screen reader reaches: open, with no page over it.
  const listActive = visible && !anyOverlayVisible

  useImperativeHandle(
    ref,
    () => ({
      closeTopOverlay: () => {
        if (editorVisible) setEditorVisible(false)
        else if (detailVisible && pageOpenId !== null) closePagePopover()
        else if (detailVisible) setDetailVisible(false)
        else return false
        return true
      }
    }),
    [editorVisible, detailVisible, pageOpenId, closePagePopover]
  )

  // Always reopens on the list, with neither page open - otherwise a screen left mid-edit or
  // mid-detail on last close would silently resume there next time. Closing this screen closes them
  // too: the loadout closes it on its own when the page loses focus, and an editor left open above a
  // closed list would come back over the page with nothing under it.
  /* eslint-disable react-hooks/set-state-in-effect -- a reset driven by an external prop (the loadout
     opening or closing this screen), not state derived from other state within this render. */
  useEffect(() => {
    setDetailVisible(false)
    setEditorVisible(false)
    closePagePopover()
  }, [visible, closePagePopover])
  /* eslint-enable react-hooks/set-state-in-effect */

  // The active player's, read again each time this screen opens and whenever a count moves while it's
  // open, like every other pack-progress display in this app (PackPuzzleList).
  const { unlockMap } = usePuzzleUnlocks({ enabled: visible })

  // A card's browse button: that pack's puzzles, over this screen.
  const openDetail = useCallback((key: string) => {
    setDetailKey(key)
    setDetailVisible(true)
  }, [])
  const openEditor = useCallback((key: string | null) => {
    setEditingKey(key)
    setEditorVisible(true)
  }, [])
  // The pack browser's Only This Pack: the selection becomes just that pack (the browser closes itself,
  // back onto this list, where it shows). Off while the selection is already just that pack.
  const handleOnlyThisPack = useCallback((key: string) => onChangeSelectedKeys([key]), [onChangeSelectedKeys])
  const selectedPackKeysInManifest = useMemo(() => manifest.filter((item) => selectedSet.has(item.key)).map((item) => item.key), [manifest, selectedSet])
  const onlyThisPackSelected = selectedPackKeysInManifest.length === 1 && selectedPackKeysInManifest[0] === detailKey
  // Nothing to play from: the screen stays open (its close glyph, Done and a screen reader's escape off,
  // and the loadout's Android back with them) until a pack is picked (Jay, 2026-10-20). Clearing them
  // all is still the way to pick just one or two.
  const noneSelected = selectedPackKeysInManifest.length === 0
  const handleSelectAll = useCallback(() => onChangeSelectedKeys(manifest.map((item) => item.key)), [manifest, onChangeSelectedKeys])
  const handleClearAll = useCallback(() => onChangeSelectedKeys([]), [onChangeSelectedKeys])

  // useCallback, and the selection read through the ref: a dependency of renderBuiltInPack/listHeader
  // below, both of which the list relies on staying referentially stable, through every toggle.
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

  // PackEditorPage's own onSaved/onDelete/onShare props, and that page is memoized, so each keeps
  // one identity.
  const handleSaved = useCallback(
    (pack: CustomPack) => {
      selectKey(pack.key)
      onPacksChanged()
      setEditorVisible(false)
    },
    [selectKey, onPacksChanged]
  )

  // No confirm() here - PackEditorPage's own ConfirmDialog gates the call to this, so by the time it
  // runs the player has already agreed. Unconditional and side-effecting only.
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

  // A filter's popover left open would come back over the next pack's page.
  const handleCloseDetail = useCallback(() => {
    setDetailVisible(false)
    closePagePopover()
  }, [closePagePopover])
  const handleCloseEditor = useCallback(() => setEditorVisible(false), [])

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box - see hangmanFile.ts's own doc comments for why: the old clipboard-and-paste
  // round trip also depended on alert() to tell the player it worked, which isn't reliable on web.
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

  // One pack's card, the same for a custom pack (which adds its pencil) and a built-in one, sized to
  // its grid cell and filling its height, so every card in a row ends level.
  const renderPackCard = useCallback(
    (item: PuzzleManifestItem) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const progress = item.count > 0 ? unlocked / item.count : 0
      const custom = isCustomPackKey(item.key)
      return (
        <View key={item.key} style={{ width: cardWidth }}>
          <PackRow
            label={item.label}
            group={item.group}
            isPack
            fill
            subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`}
            progress={progress}
            onPress={() => toggle(item.key)}
            leading={<PackCheckbox packKey={item.key} label={item.label} onToggle={toggle} />}
            actions={[{ name: 'view', label: `View ${item.label} contents`, onPress: () => openDetail(item.key) }, ...(custom ? [{ name: 'edit', label: `Edit ${item.label}`, onPress: () => openEditor(item.key) }] : [])]}
            // Share and Delete live in the editor's header, so a custom pack's card only needs its way into
            // the pack's puzzles (as a built-in pack's has) and into the editor.
            trailing={
              <View style={styles.cardActions}>
                {item.count > 0 && unlocked >= item.count ? <CompleteTrophy /> : null}
                <IconButton icon='information-outline' size={20} onPress={() => openDetail(item.key)} accessibilityLabel={`View ${item.label} contents`} />
                {custom ? <IconButton icon='pencil-outline' size={20} onPress={() => openEditor(item.key)} accessibilityLabel={`Edit ${item.label}`} /> : null}
              </View>
            }
          />
        </View>
      )
    },
    [unlockMap, cardWidth, toggle, openDetail, openEditor]
  )
  // The built-in packs are the list's own data, virtualized: 48 cards mounting at once used to be what
  // made opening Choose Packs feel slow on a device. Not rebuilt by a toggle: the checkbox reads the
  // selection itself (PackCheckbox).
  const renderBuiltInPack = useCallback(({ item }: { item: PuzzleManifestItem }) => renderPackCard(item), [renderPackCard])
  const packKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // The custom packs, in the grid's own rows (a handful, not worth virtualizing).
  const customRows = useMemo(() => {
    const rows: PuzzleManifestItem[][] = []
    for (let i = 0; i < customPacks.length; i += columns) rows.push(customPacks.slice(i, i + columns))
    return rows
  }, [customPacks, columns])

  // My Packs (its Create and Import, then its cards) through the Built-In Packs label, scrolling with
  // the list as its header.
  const listHeader = useMemo(
    () => (
      <>
        <View style={[styles.sectionHeaderRow, styles.firstSection]}>
          <Text variant='titleMedium' style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            My Packs
          </Text>
          <View style={styles.sectionActions}>
            <Button mode='contained' buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary} icon='plus' onPress={() => openEditor(null)}>
              Create
            </Button>
            <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='import' onPress={() => void handleImportFile()}>
              Import
            </Button>
          </View>
        </View>

        {customRows.length === 0 ? (
          <Text variant='bodySmall' style={styles.emptyText}>
            No custom packs yet.
          </Text>
        ) : (
          <View style={styles.customRows}>
            {customRows.map((row) => (
              <View key={row[0].key} style={styles.gridRow}>
                {row.map(renderPackCard)}
              </View>
            ))}
          </View>
        )}

        <Text variant='titleMedium' style={[styles.sectionTitle, styles.builtInTitle, { color: theme.colors.onSurface }]}>
          Built-In Packs
        </Text>
      </>
    ),
    [theme.colors.onSurface, theme.colors.primary, theme.colors.onPrimary, theme.colors.secondary, theme.colors.onSecondary, customRows, handleImportFile, renderPackCard, openEditor]
  )

  return (
    <FullScreenLayer visible={visible} from='bottom'>
      <View testID='packs-screen-panel' style={styles.panel} accessibilityViewIsModal={listActive} accessibilityElementsHidden={!listActive} importantForAccessibility={listActive ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={listActive && !noneSelected ? onDismiss : undefined}>
        <View style={[styles.column, { paddingLeft: insets.left, paddingRight: insets.right }]}>
          {/* Close, not Back: it puts the whole screen away, back down onto the loadout. */}
          <ScreenHeader icon='close' label='Close' title='Choose Packs' onPress={onDismiss} disabled={noneSelected} trailing={<AllPacksCheckbox selectedCount={selectedPackKeysInManifest.length} total={manifest.length} onSelectAll={handleSelectAll} onClear={handleClearAll} />} />

          <SelectedPacksContext.Provider value={selectedSet}>
            {/* Keyed on the column count: a list can't change its numColumns in place. */}
            <FlatList key={`columns-${columns}`} data={builtInPacks} numColumns={columns} keyExtractor={packKeyExtractor} renderItem={renderBuiltInPack} ListHeaderComponent={listHeader} ItemSeparatorComponent={RowGap} columnWrapperStyle={columns > 1 ? styles.gridRow : undefined} renderScrollComponent={renderFadingScrollComponent} showsVerticalScrollIndicator={false} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps='handled' />
          </SelectedPacksContext.Provider>

          {/* Pinned under the list, so it's reachable without scrolling back: Done, with the count on it,
              the one line every eye lands on before closing, the way Ready ends the loadout. With none
              selected it's off and says what it needs. */}
          <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
            <Button mode='contained' icon={noneSelected ? undefined : 'check'} onPress={onDismiss} disabled={noneSelected} contentStyle={styles.doneContent} labelStyle={styles.doneLabel}>
              {noneSelected ? 'Choose at least one pack' : `Done (${commaString(selectedPackKeysInManifest.length)} of ${commaString(manifest.length)})`}
            </Button>
          </View>
        </View>
      </View>

      <PackPuzzlesPage visible={detailVisible} packKey={detailKey} onDismiss={handleCloseDetail} mode={mode} difficulty={difficulty} onConfirm={onConfirm} onOnlyThisPack={handleOnlyThisPack} onlyThisPackSelected={onlyThisPackSelected} popoverHost={pagePopoverHost} />
      <PackEditorPage visible={editorVisible} editingKey={editingKey} onDismiss={handleCloseEditor} onSaved={handleSaved} onDelete={handleDelete} onShare={handleShare} />
    </FullScreenLayer>
  )
})
PacksScreen.displayName = 'PacksScreen'

const styles = StyleSheet.create({
  builtInTitle: { marginBottom: 8, marginTop: 20 },
  // A card's trophy and buttons, side by side at its end.
  cardActions: { alignItems: 'center', flexDirection: 'row' },
  // The whole screen's column: up to MAX_WIDTH, centered on a wider window.
  column: { alignSelf: 'center', flex: 1, maxWidth: MAX_WIDTH, width: '100%' },
  customRows: { gap: GAP },
  // Ready's size on the loadout.
  doneContent: { height: 48 },
  doneLabel: { fontSize: 16, letterSpacing: 1 },
  emptyText: { marginBottom: 4, opacity: 0.7 },
  // My Packs, the first thing under the header.
  firstSection: { marginTop: 4 },
  footer: { alignSelf: 'center', maxWidth: FOOTER_MAX_WIDTH, paddingHorizontal: GUTTER, paddingTop: 12, width: '100%' },
  // The cards of one row, side by side, each at its own width, all as tall as the tallest.
  gridRow: { flexDirection: 'row', gap: GAP },
  list: { flex: 1 },
  listContent: { paddingBottom: 16, paddingHorizontal: GUTTER, paddingTop: 4 },
  panel: { flex: 1 },
  rowGap: { height: GAP },
  sectionActions: { flexDirection: 'row', gap: 8 },
  sectionHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 20 },
  sectionTitle: { fontWeight: '700' },
  // An icon button's 40pt slot, so the trophy lines up with the buttons beside it.
  trophy: { alignItems: 'center', height: 40, justifyContent: 'center', width: 32 }
})
