import { getTriadicPalette } from '@rific/auto-paper'
import { render } from '@testing-library/react-native'

import { PaletteSwatch } from '@/components/PaletteSwatch'

// The svg mock renders each react-native-svg primitive as a host element of its name, so the swatch's
// shapes can be read straight off the tree, in drawing order.
type Shape = { type: string; props: { fill?: string; d?: string; r?: number } }
const shapes = (tree: unknown): Shape[] => {
  const found: Shape[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    const { type, props, children } = node as Shape & { children: unknown[] | null }
    if (type === 'Circle' || type === 'Path') found.push({ type, props })
    children?.forEach(walk)
  }
  walk(tree)
  return found
}

describe('PaletteSwatch', () => {
  it("draws the color's whole palette in the given harmony: primary over the top half, secondary bottom left, tertiary bottom right", async () => {
    const screen = await render(<PaletteSwatch color='#009688' harmony='triadic' size={24} />)
    const { primary, secondary, tertiary } = getTriadicPalette('#009688', 'triadic')

    expect(shapes(screen.toJSON())).toEqual([
      // The whole circle in primary, which the top half keeps.
      { type: 'Circle', props: expect.objectContaining({ fill: primary, r: 1 }) },
      // The bottom half, from the left edge down round to the right.
      { type: 'Path', props: expect.objectContaining({ fill: secondary, d: 'M0 1A1 1 0 0 0 2 1Z' }) },
      // The bottom-right quarter, from the right edge down to the bottom.
      { type: 'Path', props: expect.objectContaining({ fill: tertiary, d: 'M1 1L2 1A1 1 0 0 1 1 2Z' }) }
    ])
  })

  it('follows the harmony', async () => {
    const screen = await render(<PaletteSwatch color='#009688' harmony='square' size={24} />)
    const { secondary, tertiary } = getTriadicPalette('#009688', 'square')

    expect(shapes(screen.toJSON()).map((shape) => shape.props.fill)).toEqual(['#009688', secondary, tertiary])
  })

  it("draws a color auto-paper can't read flat, rather than throwing", async () => {
    const screen = await render(<PaletteSwatch color='not-a-color' harmony='triadic' size={24} />)

    expect(shapes(screen.toJSON()).map((shape) => shape.props.fill)).toEqual(['not-a-color', 'not-a-color', 'not-a-color'])
  })
})
