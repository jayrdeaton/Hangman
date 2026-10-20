import { Provider, useAutoPaperTheme } from '@rific/auto-paper'
import { render, waitFor } from '@testing-library/react-native'

import { ReadableAccent } from '@/components/ReadableAccent'
import { contrastRatio } from '@/utils/readableColor'

type Where = 'outside' | 'inside'
type Colors = { primary: string; onPrimary: string; surface: string }

// Reports the colors each probe sees: one outside the wrapper (the player's theme), one inside (the
// dialog's).
const mockOnColors = jest.fn<void, [Where, Colors]>()
const Probe = ({ where }: { where: Where }) => {
  const { primary, onPrimary, surface } = useAutoPaperTheme().colors
  mockOnColors(where, { primary, onPrimary, surface })
  return null
}
const lastSeen = (where: Where): Colors | undefined => mockOnColors.mock.calls.filter(([seenWhere]) => seenWhere === where).pop()?.[1]

const renderIn = async (color: string) => {
  mockOnColors.mockClear()
  await render(
    <Provider statusBar={false} initialValue={{ appearance: 'light', color }}>
      <Probe where='outside' />
      <ReadableAccent>
        <Probe where='inside' />
      </ReadableAccent>
    </Provider>
  )
  await waitFor(() => expect(lastSeen('inside')).toBeDefined())
  return { outside: lastSeen('outside')!, inside: lastSeen('inside')! }
}

describe('ReadableAccent', () => {
  // Hangman's own red reads on a light card: the dialog keeps the player's color exactly.
  it('passes a color that already reads straight through', async () => {
    const { outside, inside } = await renderIn('#f44336')

    expect(inside).toEqual(outside)
  })

  // Jay, 2026-10-19: Player 3's light green title read at 1.5:1 on the card.
  it('gives the dialog a deeper shade of a light color, with readable text on its buttons', async () => {
    const { outside, inside } = await renderIn('#8bc34a')

    expect(inside.primary).not.toBe(outside.primary)
    expect(contrastRatio(inside.primary, inside.surface)).toBeGreaterThan(contrastRatio(outside.primary, outside.surface))
    expect(contrastRatio(inside.primary, inside.surface)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(inside.onPrimary, inside.primary)).toBeGreaterThanOrEqual(2.5)
  })
})
