import { fireEvent, render, within } from '@testing-library/react-native'

import { maskAnswer, PackPuzzleList } from '@/components/PackPuzzleList'
import { commaString } from '@/utils/commaString'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  getPuzzleUnlockMap: jest.fn()
}))

const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)

// The real, smallest built-in pack — small enough that FlatList's initial render window covers
// every puzzle in it, unlike Movies' 9,091.
const smallestPack = () =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => a.count - b.count)[0]

// The real, largest built-in pack (Movies, 9,091 puzzles as of writing) — the actual worst case
// FlatList has to survive without choking, not a synthetic stand-in.
const largestPack = () =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)[0]

describe('maskAnswer', () => {
  // Ground truth against known strings, not against maskAnswer's own output for a differently-cased
  // input — ambiguous punctuation like "Dr." is exactly what resolveChosenPuzzle's normalizePhrase
  // strips before a puzzle is actually played, so the mask has to agree with THAT, not with itself.
  it('masks the normalized phrase, not the raw answer — a period does not count as a letter', () => {
    expect(maskAnswer('Dr. Jekyll and Mr. Hyde')).toBe(maskAnswer('DR JEKYLL AND MR HYDE'))
    // "Dr." is really 2 letters (DR), not 3 — the period must not turn into its own blank.
    expect(maskAnswer('Dr. Jekyll and Mr. Hyde').split('   ')[0]).toBe('_ _')
  })

  it('drops a token made entirely of non-letter characters as a whole word, matching what actually gets played', () => {
    // '&' has nothing left after normalizing and disappears — the real round is 4 words, not 5.
    expect(maskAnswer('Bob Marley & The Wailers').split('   ')).toHaveLength(4)
  })
})

describe('PackPuzzleList', () => {
  beforeEach(() => {
    mockGetPuzzleUnlockMap.mockReset()
    mockGetPuzzleUnlockMap.mockResolvedValue({})
  })

  it('shows how many puzzles are unlocked, for any filter', async () => {
    const pack = smallestPack()
    const { findByText } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    expect(await findByText(`0 of ${pack.count} unlocked`)).toBeTruthy()
  })

  it('masks an unsolved puzzle as blanks rather than showing its answer', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const { getByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    const row = within(getByTestId(`puzzle-row-${puzzle.id}`))
    expect(row.getByText(maskAnswer(puzzle.answer))).toBeTruthy()
    expect(row.queryByText(puzzle.answer)).toBeNull()
  })

  it('reveals the real answer for a puzzle already marked solved, instead of masking it', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [puzzle.id] })
    const { findByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    const row = within(await findByTestId(`puzzle-row-${puzzle.id}`))
    expect(await row.findByText(puzzle.answer)).toBeTruthy()
    expect(row.queryByText(maskAnswer(puzzle.answer))).toBeNull()
  })

  // getByLabelText alone isn't enough here — RNTL matches the accessibilityLabel prop wherever it
  // sits in the tree, the same whether it landed on the real accessible node or (per
  // react-native-paper's Card silently dropping it onto its own non-accessible wrapper instead of
  // the Pressable it actually exposes — see PackRow.tsx's own comment) a node no real screen
  // reader would ever expose it from. The `accessible: true` check is what actually distinguishes
  // "reaches VoiceOver/TalkBack" from "the prop exists somewhere in the tree".
  it("exposes an unsolved row's accessible name on a real accessible node, not just as a prop that exists somewhere in the tree", async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const wordLabel = puzzle.wordCount === 1 ? 'word' : 'words'
    const difficultyLabel = puzzle.difficultyTier.charAt(0).toUpperCase() + puzzle.difficultyTier.slice(1)
    const { getByLabelText } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    const labeled = getByLabelText(`Hidden puzzle, ${puzzle.letterCount} letters, ${puzzle.wordCount} ${wordLabel}, ${difficultyLabel}`)
    expect(labeled.props.accessible).toBe(true)
  })

  it('marks a row as inert (no accessibilityRole="button") when onPlayPuzzle is omitted — read-only browsing has nothing for a tap to do', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const wordLabel = puzzle.wordCount === 1 ? 'word' : 'words'
    const difficultyLabel = puzzle.difficultyTier.charAt(0).toUpperCase() + puzzle.difficultyTier.slice(1)
    const { getByLabelText } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    const row = getByLabelText(`Hidden puzzle, ${puzzle.letterCount} letters, ${puzzle.wordCount} ${wordLabel}, ${difficultyLabel}`)
    expect(row.props.accessibilityRole).toBeUndefined()
  })

  it("marks a row as a button and calls onPlayPuzzle with the tapped puzzle's id when provided", async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const onPlayPuzzle = jest.fn()
    const wordLabel = puzzle.wordCount === 1 ? 'word' : 'words'
    const difficultyLabel = puzzle.difficultyTier.charAt(0).toUpperCase() + puzzle.difficultyTier.slice(1)
    const { getByLabelText, getByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' onPlayPuzzle={onPlayPuzzle} />)

    expect(getByLabelText(`Hidden puzzle, ${puzzle.letterCount} letters, ${puzzle.wordCount} ${wordLabel}, ${difficultyLabel}`).props.accessibilityRole).toBe('button')

    await fireEvent.press(getByTestId(`puzzle-row-${puzzle.id}`))

    expect(onPlayPuzzle).toHaveBeenCalledWith(puzzle.id)
  })

  it('filter="solved" shows only solved puzzles, already revealed', async () => {
    const pack = smallestPack()
    const puzzles = getPuzzlesForCategory(pack.key)
    const solvedPuzzle = puzzles[0]
    const unsolvedPuzzle = puzzles[1]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [solvedPuzzle.id] })
    const { findByText, queryByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='solved' />)

    expect(await findByText(solvedPuzzle.answer)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeNull()
  })

  it('filter="solved" shows the trophy-case empty message when nothing is unlocked yet', async () => {
    const pack = smallestPack()
    const { findByText } = await render(<PackPuzzleList packKey={pack.key} initialFilter='solved' />)

    expect(await findByText('No puzzles solved yet.')).toBeTruthy()
  })

  it('filter="unsolved" shows the completion message once every puzzle in the pack is solved', async () => {
    const pack = smallestPack()
    const allIds = getPuzzlesForCategory(pack.key).map((puzzle) => puzzle.id)
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: allIds })
    const { findByText } = await render(<PackPuzzleList packKey={pack.key} initialFilter='unsolved' />)

    expect(await findByText('All puzzles solved!')).toBeTruthy()
  })

  it('filter="unsolved" excludes already-solved puzzles', async () => {
    const pack = smallestPack()
    const puzzles = getPuzzlesForCategory(pack.key)
    const solvedPuzzle = puzzles[0]
    const unsolvedPuzzle = puzzles[1]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [solvedPuzzle.id] })
    const { findByTestId, queryByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='unsolved' />)

    expect(await findByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${solvedPuzzle.id}`)).toBeNull()
  })

  // The actual worst case this list has to survive, not a stand-in — Movies alone is 9,091
  // puzzles, and FlatList eagerly rendering all of them (rather than windowing) would be a real,
  // user-visible freeze on this pack specifically.
  it('renders the largest built-in pack without eagerly mounting every one of its rows', async () => {
    const pack = largestPack()
    const { findByText, queryAllByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    expect(await findByText(`0 of ${commaString(pack.count)} unlocked`)).toBeTruthy()
    // Not asserting an exact count (FlatList's default window size is an implementation detail) —
    // just that it's nowhere near the full pack, which is what "not choking" actually means here.
    expect(queryAllByTestId(/^puzzle-row-/).length).toBeLessThan(pack.count / 10)
  })

  it('renders nothing for a null packKey', async () => {
    const { queryByText } = await render(<PackPuzzleList packKey={null} initialFilter='all' />)

    expect(queryByText(/unlocked/)).toBeNull()
  })

  it('renders a filter control offering All, Unsolved, and Solved', async () => {
    const pack = smallestPack()
    const { getByText } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    expect(getByText('All')).toBeTruthy()
    expect(getByText('Unsolved')).toBeTruthy()
    expect(getByText('Solved')).toBeTruthy()
  })

  it('switches which puzzles show when a different filter button is pressed, without needing a new packKey', async () => {
    const pack = smallestPack()
    const puzzles = getPuzzlesForCategory(pack.key)
    const solvedPuzzle = puzzles[0]
    const unsolvedPuzzle = puzzles[1]
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: [solvedPuzzle.id] })
    const { getByText, findByTestId, queryByTestId } = await render(<PackPuzzleList packKey={pack.key} initialFilter='all' />)

    // Starts on 'all' — both rows present.
    expect(await findByTestId(`puzzle-row-${solvedPuzzle.id}`)).toBeTruthy()
    expect(await findByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeTruthy()

    await fireEvent.press(getByText('Solved'))

    expect(await findByTestId(`puzzle-row-${solvedPuzzle.id}`)).toBeTruthy()
    expect(queryByTestId(`puzzle-row-${unsolvedPuzzle.id}`)).toBeNull()
  })

  it("resets to the caller's initial filter when a different pack is opened, discarding whatever filter the player had picked for the previous one", async () => {
    const packA = smallestPack()
    const packB = largestPack()
    const { getByText, rerender } = await render(<PackPuzzleList packKey={packA.key} initialFilter='all' />)

    await fireEvent.press(getByText('Solved'))
    expect(getByText('Solved').parent?.parent?.props.accessibilityState.checked).toBe(true)

    // This list stays mounted across a pack switch in its real callers (see PackPuzzlesDrawer) —
    // simulated here with a rerender rather than a fresh render, matching that lifecycle.
    await rerender(<PackPuzzleList packKey={packB.key} initialFilter='all' />)

    expect(getByText('All').parent?.parent?.props.accessibilityState.checked).toBe(true)
  })
})
