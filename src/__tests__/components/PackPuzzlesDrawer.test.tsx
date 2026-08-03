import { fireEvent, render } from '@testing-library/react-native'
import type { ComponentProps } from 'react'

import { PackPuzzlesDrawer } from '@/components/PackPuzzlesDrawer'
import { DEFAULT_MODE } from '@/modes/registry'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, getPuzzlesForCategory } from '@/utils/puzzleCatalog'
import { resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined),
  confirm: jest.fn().mockResolvedValue(true)
}))

jest.mock('@/utils/unlocks', () => ({
  ...jest.requireActual('@/utils/unlocks'),
  getPuzzleUnlockMap: jest.fn()
}))

// resolveChosenPuzzle (real, what tapping a specific puzzle uses) stays untouched — only
// resolvePuzzle (Random's own path) is overridden, and only for the one test below that needs to
// prove the parent drawer's difficulty filter actually reaches it; every other test restores the
// real implementation in beforeEach so it exercises genuine resolution against real pack data.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

const mockAlert = jest.mocked(alert)
const mockGetPuzzleUnlockMap = jest.mocked(getPuzzleUnlockMap)
const mockResolvePuzzle = jest.mocked(resolvePuzzle)
const realResolvePuzzle: typeof resolvePuzzle = jest.requireActual('@/utils/puzzlePicker').resolvePuzzle

// The real, smallest built-in pack — small enough that FlatList's initial render window covers
// every puzzle in it, unlike Movies' 9,091.
const smallestPack = () =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .sort((a, b) => a.count - b.count)[0]

const renderPackPuzzles = (overrides: Partial<ComponentProps<typeof PackPuzzlesDrawer>> = {}) => render(<PackPuzzlesDrawer visible packKey={smallestPack().key} mode={DEFAULT_MODE} difficulty='any' onDismiss={jest.fn()} onConfirm={jest.fn()} {...overrides} />)

// Row rendering, masking, and the solved/unsolved/all filter itself are PackPuzzleList's own
// contract — covered in PackPuzzleList.test.tsx. This file only covers what's specific to the
// Drawer shell wrapping it: the header, the Random footer, and that a row tap actually reaches
// the parent's onConfirm/onDismiss through PackPuzzleList's onPlayPuzzle prop.
describe('PackPuzzlesDrawer', () => {
  beforeEach(() => {
    mockAlert.mockClear()
    mockGetPuzzleUnlockMap.mockReset()
    mockGetPuzzleUnlockMap.mockResolvedValue({})
    mockResolvePuzzle.mockReset()
    mockResolvePuzzle.mockImplementation(realResolvePuzzle)
  })

  it('shows the pack label in the header, with the full unlock progress delegated to PackPuzzleList underneath it', async () => {
    const pack = smallestPack()
    const { getByText, findByText } = await renderPackPuzzles()

    expect(getByText(pack.label)).toBeTruthy()
    expect(await findByText(`0 of ${pack.count} unlocked`)).toBeTruthy()
  })

  it('plays the exact puzzle tapped, not a random draw from the rest of the pack, and closes itself so the started round is actually visible', async () => {
    const pack = smallestPack()
    const puzzle = getPuzzlesForCategory(pack.key)[0]
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByTestId } = await renderPackPuzzles({ onConfirm, onDismiss })

    await fireEvent.press(getByTestId(`puzzle-row-${puzzle.id}`))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.puzzleId).toBe(puzzle.id)
    expect(payload.packKey).toBe(pack.key)
    expect(payload.phrase.replace(/ /g, '')).toBe(puzzle.answer.replace(/[^A-Za-z]/g, '').toUpperCase())
    expect(config.sourceMode).toBe('random')
    // Without this, the player is left staring at the puzzle list on top of the round that just
    // started, unable to see or reach the board until they find and tap the close icon themselves.
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('draws a random puzzle from just this pack when Random is pressed, and closes itself the same way picking a specific puzzle does', async () => {
    const pack = smallestPack()
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderPackPuzzles({ onConfirm, onDismiss })

    await fireEvent.press(getByText('Random'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    const [payload, config] = onConfirm.mock.calls[0]
    expect(payload.packKey).toBe(pack.key)
    expect(config.sourceMode).toBe('random')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not close itself when Random fails to find anything (the alert is the only feedback, nothing to dismiss out of)', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
    const onDismiss = jest.fn()
    const { getByText } = await renderPackPuzzles({ onDismiss, difficulty: 'hard' })

    await fireEvent.press(getByText('Random'))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it("passes the parent drawer's difficulty filter through to the Random draw", async () => {
    const pack = smallestPack()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'hard' } })
    const { getByText } = await renderPackPuzzles({ difficulty: 'hard' })

    await fireEvent.press(getByText('Random'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard' }), [pack.key], expect.anything())
  })

  it("passes this pack's own freshly-fetched unlock map through to Random, so it can prefer a puzzle the player hasn't unlocked yet", async () => {
    const pack = smallestPack()
    mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: ['solved-1'] })
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: { phrase: 'X', mode: DEFAULT_MODE, sourceMode: 'random', packKey: pack.key, packLabel: pack.label, puzzleId: 'x', difficultyTier: 'easy' } })
    const { getByText, findByText } = await renderPackPuzzles()

    // Waits for the unlock-map fetch to resolve (PackPuzzleList's own progress header reads the
    // same mocked getPuzzleUnlockMap) before pressing Random, so the assertion below isn't racing
    // against a still-empty {} from before it settled.
    await findByText(`1 of ${pack.count} unlocked`)

    await fireEvent.press(getByText('Random'))

    expect(mockResolvePuzzle).toHaveBeenCalledWith(expect.anything(), [pack.key], { [pack.key]: ['solved-1'] })
  })

  it('shows an alert instead of confirming when Random finds nothing for the current filter', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: false, error: 'No puzzles available for the selected packs and difficulty.' })
    const onConfirm = jest.fn()
    const { getByText } = await renderPackPuzzles({ onConfirm, difficulty: 'hard' })

    await fireEvent.press(getByText('Random'))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(mockAlert).toHaveBeenCalledWith('No puzzles available', 'No puzzles available for the selected packs and difficulty.')
  })

  it('closes via the header close button', async () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = await renderPackPuzzles({ onDismiss })

    await fireEvent.press(getByLabelText('Close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders no header, list, or footer while no pack has ever been chosen', async () => {
    const { queryByText } = await render(<PackPuzzlesDrawer visible={false} packKey={null} mode={DEFAULT_MODE} difficulty='any' onDismiss={jest.fn()} onConfirm={jest.fn()} />)

    expect(queryByText('Random')).toBeNull()
  })

  // PacksScreen's "view contents" on a built-in pack renders this with mode/difficulty/onConfirm
  // all omitted (see its own doc comment) — read-only browsing, nothing to actually play with here.
  describe('read-only mode (mode/difficulty/onConfirm all omitted)', () => {
    it('omits the Random footer entirely', async () => {
      const pack = smallestPack()
      const { queryByText } = await render(<PackPuzzlesDrawer visible packKey={pack.key} onDismiss={jest.fn()} />)

      expect(queryByText('Random')).toBeNull()
    })

    it('still shows the header and puzzle list, just not playable', async () => {
      const pack = smallestPack()
      const { getByText, findByText } = await render(<PackPuzzlesDrawer visible packKey={pack.key} onDismiss={jest.fn()} />)

      expect(getByText(pack.label)).toBeTruthy()
      expect(await findByText(`0 of ${pack.count} unlocked`)).toBeTruthy()
    })

    it('does not crash and calls no onConfirm when a puzzle row is pressed, since there is nothing to play with', async () => {
      const pack = smallestPack()
      const puzzle = getPuzzlesForCategory(pack.key)[0]
      const { getByTestId } = await render(<PackPuzzlesDrawer visible packKey={pack.key} onDismiss={jest.fn()} />)

      // PackPuzzleList itself renders rows as non-tappable when onPlayPuzzle is undefined (see its
      // own contract, tested in PackPuzzleList.test.tsx) — this just proves PackPuzzlesDrawer
      // actually leaves onPlayPuzzle unwired in read-only mode, not that a press is a no-op through
      // some other path.
      expect(() => fireEvent.press(getByTestId(`puzzle-row-${puzzle.id}`))).not.toThrow()
    })
  })
})
