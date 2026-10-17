import { Provider } from '@rific/auto-paper'
import { fireEvent, render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { ColorsRow } from '@/components/ColorsRow'

// auto-paper's Provider: the live theme settings AutoPalettePicker reads and writes, and the
// Portal.Host its palette dialog opens in.
const renderRow = (first?: boolean) =>
  render(
    <Provider initialValue={{ appearance: 'light' }}>
      <ColorsRow first={first} />
    </Provider>
  )

type Screen = Awaited<ReturnType<typeof renderRow>>

// The label, then auto-paper's swatch trigger beside it (it carries no label of its own).
const row = (screen: Screen) => screen.getByTestId('colors-row')
const trigger = (screen: Screen) => {
  const [, swatch] = row(screen).children
  if (typeof swatch === 'string') throw new Error('expected the palette trigger beside the label')
  return swatch
}

describe('ColorsRow', () => {
  it('labels the row Colors, with the palette swatch beside it', async () => {
    const screen = await renderRow()

    expect(screen.getByText('Colors')).toBeTruthy()
    expect(trigger(screen).props.accessible).toBe(true)
  })

  it("opens auto-paper's palette dialog from the swatch", async () => {
    const screen = await renderRow()
    expect(screen.queryByTestId('dialog')).toBeNull()

    await fireEvent.press(trigger(screen))

    expect(screen.getByTestId('dialog')).toBeTruthy()
  })

  // The loadouts' own rhythm: 12pt under the header for the page's first row, 16 between sections.
  it.each([
    ["the page's first row", 12, true],
    ['a later row', 16, false]
  ])('gives %s a %ipt top gap', async (_row, marginTop, first) => {
    const screen = await renderRow(first)

    expect(StyleSheet.flatten(row(screen).props.style).marginTop).toBe(marginTop)
  })
})
