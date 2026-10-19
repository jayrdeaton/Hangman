import { FeedbackPressProvider } from '@rific/feedback-press'
import { usePopoverHost } from '@tastic/hud/chrome'
import { fireEvent, render as rtlRender, within } from '@testing-library/react-native'
import { type ReactElement, type ReactNode, useMemo } from 'react'
import { View } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { Provider as ReduxProvider } from 'react-redux'

import { maskAnswer, PackPuzzleList, type PackPuzzleListProps } from '@/components/PackPuzzleList'
import { CatalogProvider } from '@/hooks/useCatalog'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { store } from '@/redux/store'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  getPuzzleUnlockMap: jest.fn()
}))

const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)

// Real in-memory AsyncStorage, not the global always-null mock from jest.setup.ts - the filter
// menus now persist to it (see usePackPuzzleListPrefs), and several tests below need to seed a
// starting preference or assert what got written, the same round-trip pattern unlocks.test.ts
// already uses for its own AsyncStorage-backed persistence.
let mockStore: Record<string, string>
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(Object.prototype.hasOwnProperty.call(mockStore, key) ? mockStore[key] : null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value
    return Promise.resolve(null)
  })
}))

const PREFS_KEY = 'hangman:packPuzzleListPrefs'
const seedPrefs = (patch: Partial<{ statusFilter: string; difficultyFilter: string }>) => {
  mockStore[PREFS_KEY] = JSON.stringify({ statusFilter: 'all', difficultyFilter: 'all', ...patch })
}

// Paper's provider for the pickers and rows, and FeedbackPressProvider's real `paper` module
// injected (see Haptic.tsx, the app's own root wiring) - without it, @rific/feedback-press's
// buttons fall back to bare RN Pressables. The store and the catalog counters are what the list reads the active player's solved
// puzzles through (usePuzzleUnlocks).
const Wrapper = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <CatalogProvider>
      <RNPaper.PaperProvider>
        <FeedbackPressProvider paper={RNPaper}>{children}</FeedbackPressProvider>
      </RNPaper.PaperProvider>
    </CatalogProvider>
  </ReduxProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

// The list takes its unlocked puzzles and its popover host from the page showing it; this stands in
// for that page, reading them the same way (usePuzzleUnlocks, through the mocked getPuzzleUnlockMap
// above, and hud's usePopoverHost, as PacksScreen holds it).
const ListWithUnlocks = (props: Omit<PackPuzzleListProps, 'unlockMap' | 'popoverHost'>) => {
  const { unlockMap } = usePuzzleUnlocks()
  const { openId, toggle, close } = usePopoverHost()
  const popoverHost = useMemo(() => ({ openId, toggle, close }), [openId, toggle, close])
  return <PackPuzzleList {...props} unlockMap={unlockMap} popoverHost={popoverHost} />
}

// The filters' popovers only show once hud's useAutoAlign has measured their pill, and the jest
// preset's View never answers measureInWindow: this one does, from near the top, where the pills sit.
const answerMeasureInWindow = () => jest.spyOn(View.prototype as unknown as { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }, 'measureInWindow').mockImplementation((callback) => callback(16, 120, 140, 44))

type Screen = Awaited<ReturnType<typeof render>>
// A filter's option in its open popover, not a row's difficulty badge of the same name.
const pressOption = async (screen: Screen, label: string) => {
  const inRow = (node: { props: { testID?: unknown }; parent: unknown } | null): boolean => {
    for (let current = node; current; current = current.parent as typeof node) if (typeof current.props.testID === 'string' && current.props.testID.startsWith('puzzle-row-')) return true
    return false
  }
  const option = screen.getAllByText(label).find((node) => !inRow(node))
  if (!option) throw new Error(`no ${label} option open`)
  await fireEvent.press(option)
}

// The real, smallest built-in pack - small enough that FlatList's initial render window covers
// every puzzle in it, unlike Movies' 9,091.
const smallestPack = () =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => a.count - b.count)[0]

// The real, largest built-in pack (Movies, 9,091 puzzles as of writing) - the actual worst case
// FlatList has to survive without choking, not a synthetic stand-in.
const largestPack = () =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)[0]

// The smallest real pack whose puzzles span at least two difficulty tiers - needed to exercise
// the difficulty filter meaningfully against real catalog data, not synthetic puzzles.
const packWithMixedDifficulty = () => {
  const packs = getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => a.count - b.count)
  const found = packs.find((pack) => new Set(getPuzzlesForCategory(pack.key).map((puzzle) => puzzle.difficultyTier)).size >= 2)
  if (!found) throw new Error('No built-in pack spans more than one difficulty tier')
  return found
}

describe('maskAnswer', () => {
  // Ground truth against known strings, not against maskAnswer's own output for a differently-cased
  // input - ambiguous punctuation like "Dr." is exactly what resolveChosenPuzzle's normalizePhrase
  // strips before a puzzle is actually played, so the mask has to agree with THAT, not with itself.
  it('masks the normalized phrase, not the raw answer - a period does not count as a letter', () => {
    expect(maskAnswer('Dr. Jekyll and Mr. Hyde')).toBe(maskAnswer('DR JEKYLL AND MR HYDE'))
    // "Dr." is really 2 letters (DR), not 3 - the period must not turn into its own blank.
    expect(maskAnswer('Dr. Jekyll and Mr. Hyde').split('   ')[0]).toBe('_ _')
  })

  it('drops a token made entirely of non-letter characters as a whole word, matching what actually gets played', () => {
    // '&' has nothing left after normalizing and disappears - the real round is 4 words, not 5.
    expect(maskAnswer('Bob Marley & The Wailers').split('   ')).toHaveLength(4)
  })
})

describe('PackPuzzleList', () => {
  beforeEach(() => {
    mockGetPuzzleUnlockMap.mockReset()
    mockGetPuzzleUnlockMap.mockResolvedValue({})
    mockStore = {}
  })

  it('masks an unsolved puzzle as blanks rather than showing its answer', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const { getByTestId } = await render(<ListWithUnlocks packKey={pack.key} />)

    const row = within(getByTestId(`puzzle-row-${puzzle.id}`))
    expect(row.getByText(maskAnswer(puzzle.answer))).toBeTruthy()
    expect(row.queryByText(puzzle.answer)).toBeNull()
  })

  it('reveals the real answer for a puzzle already marked solved, instead of masking it', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [puzzle.id] })
    const { findByTestId } = await render(<ListWithUnlocks packKey={pack.key} />)

    const row = within(await findByTestId(`puzzle-row-${puzzle.id}`))
    expect(await row.findByText(puzzle.answer)).toBeTruthy()
    expect(row.queryByText(maskAnswer(puzzle.answer))).toBeNull()
  })

  // getByLabelText alone isn't enough here - RNTL matches the accessibilityLabel prop wherever it
  // sits in the tree, the same whether it landed on the real accessible node or (per
  // react-native-paper's Card silently dropping it onto its own non-accessible wrapper instead of
  // the Pressable it actually exposes - see PackRow.tsx's own comment) a node no real screen
  // reader would ever expose it from. The `accessible: true` check is what actually distinguishes
  // "reaches VoiceOver/TalkBack" from "the prop exists somewhere in the tree".
  it("exposes an unsolved row's accessible name on a real accessible node, not just as a prop that exists somewhere in the tree", async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const wordLabel = puzzle.wordCount === 1 ? 'word' : 'words'
    const difficultyLabel = puzzle.difficultyTier.charAt(0).toUpperCase() + puzzle.difficultyTier.slice(1)
    const { getByLabelText } = await render(<ListWithUnlocks packKey={pack.key} />)

    const labeled = getByLabelText(`Hidden puzzle, ${puzzle.letterCount} letters, ${puzzle.wordCount} ${wordLabel}, ${difficultyLabel}`)
    expect(labeled.props.accessible).toBe(true)
  })

  it('marks a row as inert (no accessibilityRole="button") when onPlayPuzzle is omitted - read-only browsing has nothing for a tap to do', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const wordLabel = puzzle.wordCount === 1 ? 'word' : 'words'
    const difficultyLabel = puzzle.difficultyTier.charAt(0).toUpperCase() + puzzle.difficultyTier.slice(1)
    const { getByLabelText } = await render(<ListWithUnlocks packKey={pack.key} />)

    const row = getByLabelText(`Hidden puzzle, ${puzzle.letterCount} letters, ${puzzle.wordCount} ${wordLabel}, ${difficultyLabel}`)
    expect(row.props.accessibilityRole).toBeUndefined()
  })

  it("marks a row as a button and calls onPlayPuzzle with the tapped puzzle's id when provided", async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const onPlayPuzzle = jest.fn()
    const wordLabel = puzzle.wordCount === 1 ? 'word' : 'words'
    const difficultyLabel = puzzle.difficultyTier.charAt(0).toUpperCase() + puzzle.difficultyTier.slice(1)
    const { getByLabelText, getByTestId } = await render(<ListWithUnlocks packKey={pack.key} onPlayPuzzle={onPlayPuzzle} />)

    expect(getByLabelText(`Hidden puzzle, ${puzzle.letterCount} letters, ${puzzle.wordCount} ${wordLabel}, ${difficultyLabel}`).props.accessibilityRole).toBe('button')

    await fireEvent.press(getByTestId(`puzzle-row-${puzzle.id}`))

    expect(onPlayPuzzle).toHaveBeenCalledWith(puzzle.id)
  })

  it('a persisted "solved" status filter shows only solved puzzles, already revealed', async () => {
    const pack = smallestPack()
    const puzzles = getPuzzlesForCategory(pack.key)
    const solvedPuzzle = puzzles[0]
    const unsolvedPuzzle = puzzles[1]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [solvedPuzzle.id] })
    seedPrefs({ statusFilter: 'solved' })
    const { findByText, queryByTestId } = await render(<ListWithUnlocks packKey={pack.key} />)

    expect(await findByText(solvedPuzzle.answer)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeNull()
  })

  it('a persisted "solved" status filter shows the trophy-case empty message when nothing is unlocked yet', async () => {
    const pack = smallestPack()
    seedPrefs({ statusFilter: 'solved' })
    const { findByText } = await render(<ListWithUnlocks packKey={pack.key} />)

    expect(await findByText('No puzzles solved yet.')).toBeTruthy()
  })

  it('a persisted "unsolved" status filter shows the completion message once every puzzle in the pack is solved', async () => {
    const pack = smallestPack()
    const allIds = getPuzzlesForCategory(pack.key).map((puzzle) => puzzle.id)
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: allIds })
    seedPrefs({ statusFilter: 'unsolved' })
    const { findByText } = await render(<ListWithUnlocks packKey={pack.key} />)

    expect(await findByText('All puzzles solved!')).toBeTruthy()
  })

  it('a persisted "unsolved" status filter excludes already-solved puzzles', async () => {
    const pack = smallestPack()
    const puzzles = getPuzzlesForCategory(pack.key)
    const solvedPuzzle = puzzles[0]
    const unsolvedPuzzle = puzzles[1]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [solvedPuzzle.id] })
    seedPrefs({ statusFilter: 'unsolved' })
    const { findByTestId, queryByTestId } = await render(<ListWithUnlocks packKey={pack.key} />)

    expect(await findByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${solvedPuzzle.id}`)).toBeNull()
  })

  // The empty message is derived from BOTH facets now, not just status - a bare "All puzzles
  // solved!" would be misleading while a difficulty filter is also hiding still-unsolved puzzles
  // of a different tier.
  it('combines the status and difficulty filters in the empty message when both are hiding puzzles', async () => {
    const pack = packWithMixedDifficulty()
    const easyPuzzles = getPuzzlesForCategory(pack.key).filter((puzzle) => puzzle.difficultyTier === 'easy')
    if (easyPuzzles.length === 0) throw new Error('expected at least one easy puzzle')
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: easyPuzzles.map((puzzle) => puzzle.id) })
    seedPrefs({ statusFilter: 'unsolved', difficultyFilter: 'easy' })
    const { findByText } = await render(<ListWithUnlocks packKey={pack.key} />)

    expect(await findByText('All easy puzzles solved!')).toBeTruthy()
  })

  // The actual worst case this list has to survive, not a stand-in - Movies alone is 9,091
  // puzzles, and FlatList eagerly rendering all of them (rather than windowing) would be a real,
  // user-visible freeze on this pack specifically.
  it('renders the largest built-in pack without eagerly mounting every one of its rows', async () => {
    const pack = largestPack()
    const { findAllByTestId } = await render(<ListWithUnlocks packKey={pack.key} />)

    // Not asserting an exact count (FlatList's default window size is an implementation detail) -
    // just that it's nowhere near the full pack, which is what "not choking" actually means here.
    const rows = await findAllByTestId(/^puzzle-row-/)
    expect(rows.length).toBeLessThan(pack.count / 10)
  })

  it('renders nothing for a null packKey', async () => {
    const { queryByText } = await render(<ListWithUnlocks packKey={null} />)

    expect(queryByText(/unlocked/)).toBeNull()
  })

  describe('the filters', () => {
    let measure: jest.SpyInstance
    beforeEach(() => {
      measure = answerMeasureInWindow()
    })
    afterEach(() => measure.mockRestore())

    it("shows the pack's category, unlock count and bar, not its name again (the page's title has it)", async () => {
      const pack = smallestPack()
      const screen = await render(<ListWithUnlocks packKey={pack.key} />)

      expect(screen.getByLabelText(`${pack.group ?? 'Custom'}, 0 of ${pack.count} unlocked`)).toBeTruthy()
      expect(screen.queryByText(pack.label)).toBeNull()
    })

    it("are the loadout's picker pills, on All puzzles and Any", async () => {
      const screen = await render(<ListWithUnlocks packKey={smallestPack().key} />)

      expect(screen.getByLabelText('ALL PUZZLES')).toBeTruthy()
      expect(screen.getByLabelText('ANY')).toBeTruthy()
    })

    it('the status picker offers All puzzles, Unsolved and Solved', async () => {
      const screen = await render(<ListWithUnlocks packKey={smallestPack().key} />)

      await fireEvent.press(screen.getByLabelText('ALL PUZZLES'))

      for (const label of ['All puzzles', 'Unsolved', 'Solved']) expect(screen.getByText(label)).toBeTruthy()
    })

    it('the difficulty picker offers Any, Easy, Medium and Hard, and opening it closes the status one', async () => {
      const screen = await render(<ListWithUnlocks packKey={smallestPack().key} />)

      await fireEvent.press(screen.getByLabelText('ALL PUZZLES'))
      await fireEvent.press(screen.getByLabelText('ANY'))

      expect(screen.queryByText('Unsolved')).toBeNull()
      expect(screen.getByText('Any')).toBeTruthy()
      for (const label of ['Easy', 'Medium', 'Hard']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    })

    // A tap away lands on the list's own catcher, over the rows, never on a row.
    it('closes an open popover on a tap away, without playing a puzzle', async () => {
      const onPlayPuzzle = jest.fn()
      const screen = await render(<ListWithUnlocks packKey={smallestPack().key} onPlayPuzzle={onPlayPuzzle} />)

      await fireEvent.press(screen.getByLabelText('ALL PUZZLES'))
      await fireEvent.press(screen.getByLabelText('Dismiss'))

      expect(screen.queryByText('Unsolved')).toBeNull()
      expect(screen.queryByLabelText('Dismiss')).toBeNull()
      expect(onPlayPuzzle).not.toHaveBeenCalled()
    })

    it('switches which puzzles show when a status is picked, without needing a new packKey', async () => {
      const pack = smallestPack()
      const puzzles = getPuzzlesForCategory(pack.key)
      const solvedPuzzle = puzzles[0]
      const unsolvedPuzzle = puzzles[1]
      mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [solvedPuzzle.id] })
      const screen = await render(<ListWithUnlocks packKey={pack.key} />)

      // Starts on 'all' - both rows present.
      expect(await screen.findByTestId(`puzzle-row-${solvedPuzzle.id}`)).toBeTruthy()
      expect(await screen.findByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeTruthy()

      await fireEvent.press(screen.getByLabelText('ALL PUZZLES'))
      await pressOption(screen, 'Solved')

      expect(await screen.findByTestId(`puzzle-row-${solvedPuzzle.id}`)).toBeTruthy()
      expect(screen.queryByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeNull()
      // Picking closes the popover, and the pill shows the pick.
      expect(screen.queryByText('Unsolved')).toBeNull()
      expect(screen.getByLabelText('SOLVED')).toBeTruthy()
    })

    it('filters to a single difficulty tier when picked', async () => {
      const pack = packWithMixedDifficulty()
      const puzzles = getPuzzlesForCategory(pack.key)
      const easyPuzzle = puzzles.find((puzzle) => puzzle.difficultyTier === 'easy')
      const otherPuzzle = puzzles.find((puzzle) => puzzle.difficultyTier !== 'easy')
      if (!easyPuzzle || !otherPuzzle) throw new Error('expected both an easy and a non-easy puzzle')
      const screen = await render(<ListWithUnlocks packKey={pack.key} />)

      await fireEvent.press(screen.getByLabelText('ANY'))
      await pressOption(screen, 'Easy')

      expect(await screen.findByTestId(`puzzle-row-${easyPuzzle.id}`)).toBeTruthy()
      expect(screen.queryByTestId(`puzzle-row-${otherPuzzle.id}`)).toBeNull()
      expect(screen.getByLabelText('EASY')).toBeTruthy()
    })

    it('loads a previously persisted filter preference from storage on mount', async () => {
      const pack = packWithMixedDifficulty()
      const hardPuzzle = getPuzzlesForCategory(pack.key).find((puzzle) => puzzle.difficultyTier === 'hard')
      const easyPuzzle = getPuzzlesForCategory(pack.key).find((puzzle) => puzzle.difficultyTier === 'easy')
      if (!hardPuzzle || !easyPuzzle) throw new Error('expected both an easy and a hard puzzle')
      seedPrefs({ difficultyFilter: 'hard' })
      const screen = await render(<ListWithUnlocks packKey={pack.key} />)

      expect(await screen.findByTestId(`puzzle-row-${hardPuzzle.id}`)).toBeTruthy()
      expect(screen.queryByTestId(`puzzle-row-${easyPuzzle.id}`)).toBeNull()
      expect(screen.getByLabelText('HARD')).toBeTruthy()
    })

    it('persists a newly picked status filter to storage, so a pack opened afterward keeps the same choice', async () => {
      const screen = await render(<ListWithUnlocks packKey={smallestPack().key} />)

      await fireEvent.press(screen.getByLabelText('ALL PUZZLES'))
      await pressOption(screen, 'Unsolved')

      expect(JSON.parse(mockStore[PREFS_KEY])).toEqual({ statusFilter: 'unsolved', difficultyFilter: 'all' })
    })

    // The loadout's picker says Any; the stored preference keeps its 'all'.
    it("stores Any as the difficulty filter's 'all'", async () => {
      seedPrefs({ difficultyFilter: 'easy' })
      const screen = await render(<ListWithUnlocks packKey={packWithMixedDifficulty().key} />)

      await fireEvent.press(await screen.findByLabelText('EASY'))
      await pressOption(screen, 'Any')

      expect(JSON.parse(mockStore[PREFS_KEY])).toEqual({ statusFilter: 'all', difficultyFilter: 'all' })
    })

    it("keeps the player's chosen filter across a pack switch, since it's a persisted preference, not a per-pack default", async () => {
      const packA = smallestPack()
      const packB = largestPack()
      const screen = await render(<ListWithUnlocks packKey={packA.key} />)

      await fireEvent.press(screen.getByLabelText('ALL PUZZLES'))
      await pressOption(screen, 'Solved')
      expect(screen.getByLabelText('SOLVED')).toBeTruthy()

      // This list stays mounted across a pack switch in its real callers (see PackPuzzlesPage) -
      // simulated here with a rerender rather than a fresh render, matching that lifecycle.
      await screen.rerender(<ListWithUnlocks packKey={packB.key} />)

      expect(screen.getByLabelText('SOLVED')).toBeTruthy()
    })
  })
})
