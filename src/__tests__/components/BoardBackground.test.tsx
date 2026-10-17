import { getBlendedColor, Provider } from '@rific/auto-paper'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { type MD3Theme, useTheme } from 'react-native-paper'

import { BoardBackground, boardColor } from '@/components/BoardBackground'

// The theme auto-paper builds for an appearance, read the way BoardBackground reads it.
const themeFor = async (appearance: 'light' | 'dark') => {
  let theme: MD3Theme | undefined
  const Probe = () => {
    theme = useTheme()
    return null
  }
  const { unmount } = await render(
    <Provider initialValue={{ appearance }}>
      <Probe />
    </Provider>
  )
  await unmount()
  return theme!
}

const renderBoard = (appearance: 'light' | 'dark') =>
  render(
    <Provider initialValue={{ appearance }}>
      <BoardBackground />
    </Provider>
  )

describe('BoardBackground', () => {
  it('fills the screen behind everything and never takes a touch', async () => {
    const { getByTestId } = await renderBoard('light')
    const board = getByTestId('board-background')

    expect(board.props.pointerEvents).toBe('none')
    expect(StyleSheet.flatten(board.props.style)).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 })
  })

  const baseColor = async (appearance: 'light' | 'dark') => {
    const { getByTestId } = await renderBoard(appearance)
    const [base] = getByTestId('board-background').children as unknown as { props: { style: unknown } }[]
    return (StyleSheet.flatten(base.props.style) as { backgroundColor?: string }).backgroundColor
  }

  it("paints the theme's surface in light appearance, a whiteboard", async () => {
    const { surface } = (await themeFor('light')).colors

    expect(await baseColor('light')).toBe(surface)
  })

  // hud 0.22's wells are the theme's surface: on a surface-colored chalkboard they showed only by a shadow
  // that barely shows in the dark.
  it('paints a step below the surface in dark appearance, so cards on the surface read on it', async () => {
    const { surface } = (await themeFor('dark')).colors
    const painted = await baseColor('dark')

    expect(painted).toBe(getBlendedColor('#000000', surface, 0.5))
    expect(painted).not.toBe(surface)
    expect(painted).toBe(boardColor(true, surface))
  })

  // The SVG primitives are bare host elements under the mock (Svg itself renders only its children),
  // so the vignette and smudges sit right beside the surface.
  it('draws the vignette and the wiped smudges over the surface, each filled from a gradient it defines', async () => {
    const { getByTestId } = await renderBoard('dark')
    const layers = getByTestId('board-background').children as unknown as { type: string; props: Record<string, unknown>; children: { type: string; props: Record<string, unknown> }[] }[]
    const defs = layers.find((layer) => layer.type === 'Defs')!
    const gradientIds = defs.children.filter((child) => child.type === 'RadialGradient').map((gradient) => gradient.props.id)
    const fills = layers.filter((layer) => layer.type === 'Ellipse' || layer.type === 'Rect').map((layer) => layer.props.fill)

    expect(layers.filter((layer) => layer.type === 'Ellipse')).toHaveLength(4)
    expect(layers.filter((layer) => layer.type === 'Rect')).toHaveLength(1)
    expect(new Set(gradientIds).size).toBe(2)
    for (const fill of fills) expect(gradientIds.map((id) => `url(#${id})`)).toContain(fill)
  })

  // react-native-svg's web build hands rx/ry straight to the DOM, where a radialGradient ignores them,
  // so the web drew a far tighter, darker vignette. r is the one radius every platform reads.
  it.each(['light', 'dark'] as const)('sizes both gradients with r, never rx or ry, in %s appearance', async (appearance) => {
    const { getByTestId } = await renderBoard(appearance)
    const layers = getByTestId('board-background').children as unknown as { type: string; props: Record<string, unknown>; children: { type: string; props: Record<string, unknown> }[] }[]
    const gradients = layers.find((layer) => layer.type === 'Defs')!.children.filter((child) => child.type === 'RadialGradient')
    const filling = (type: string) => gradients.find((gradient) => `url(#${gradient.props.id})` === layers.find((layer) => layer.type === type)!.props.fill)!

    // The vignette fills the Rect, the smudge gradient every Ellipse.
    expect(filling('Rect').props.r).toBe('75%')
    expect(filling('Ellipse').props.r).toBe('50%')
    for (const gradient of gradients) {
      expect(gradient.props).not.toHaveProperty('rx')
      expect(gradient.props).not.toHaveProperty('ry')
    }
  })
})
