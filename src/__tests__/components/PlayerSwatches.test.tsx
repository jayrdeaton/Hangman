import { getTriadicPalette, Provider as AutoPaperProvider } from '@rific/auto-paper'
import { type Profile, ProfileChip } from '@tastic/profile'
import { render } from '@testing-library/react-native'
import { isValidElement } from 'react'

import { PaletteSwatch } from '@/components/PaletteSwatch'
import { HarmonySwatches, harmonySwatchRenderer } from '@/components/PlayerSwatches'

const ALICE: Profile = { id: 'profile-a', name: 'Alice', color: '#9c27b0', tag: 'A', createdAt: 1, updatedAt: 1 }

// Every react-native-svg Path's fill (the svg mock renders each as a host element of that name): the
// secondary and tertiary of each palette drawn.
const pathFills = (tree: unknown): unknown[] => {
  const fills: unknown[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    const { type, props, children } = node as { type: string; props: { fill?: unknown }; children: unknown[] | null }
    if (type === 'Path') fills.push(props.fill)
    children?.forEach(walk)
  }
  walk(tree)
  return fills
}

// Jay, 2026-10-18: a chip is one color and a legible tag; the palette is drawn only where a color is
// being chosen.
describe('harmonySwatchRenderer', () => {
  it("keeps a chip's flat fill", () => {
    expect(harmonySwatchRenderer('triadic')(ALICE.color, 24, 'chip')).toBeNull()
  })

  it.each(['colorRow', 'colorPage'] as const)('draws the whole palette, in its harmony, on the %s', (place) => {
    const drawn = harmonySwatchRenderer('complementary')('#f44336', 28, place)

    expect(isValidElement(drawn) && drawn.type).toBe(PaletteSwatch)
    expect(isValidElement(drawn) && drawn.props).toEqual({ color: '#f44336', harmony: 'complementary', size: 28 })
  })
})

describe('HarmonySwatches', () => {
  it('leaves a profile chip inside it flat, its tag on its own color', async () => {
    const screen = await render(
      <AutoPaperProvider initialValue={{ color: '#f44336', harmony: 'complementary' }}>
        <HarmonySwatches harmony='complementary'>
          <ProfileChip profile={ALICE} />
        </HarmonySwatches>
      </AutoPaperProvider>
    )

    expect(screen.getByText('A')).toBeTruthy()
    expect(pathFills(screen.toJSON())).toEqual([])
    const tree = JSON.stringify(screen.toJSON())
    expect(tree).toContain(`"backgroundColor":"${ALICE.color}"`)
    // None of the palette's other colors.
    const { secondary, tertiary } = getTriadicPalette(ALICE.color, 'complementary')
    expect(tree).not.toContain(secondary)
    expect(tree).not.toContain(tertiary)
  })
})
