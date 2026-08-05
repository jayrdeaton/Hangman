import { fireEvent, render } from '@testing-library/react-native'

import { ModeSelector } from '@/components/ModeSelector'
import { ALL_MODES, classicMode, robotMode, VISIBLE_MODES } from '@/modes/registry'

const LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 200 } } }

const renderSelector = async (selected = classicMode, onSelect = jest.fn()) => {
  const utils = await render(<ModeSelector selected={selected} color='#ff0000' onSelect={onSelect} />)
  await fireEvent(utils.getByTestId('mode-selector-container'), 'layout', LAYOUT_EVENT)
  return utils
}

describe('ModeSelector', () => {
  it('renders a card for every visible mode with a combined, jargon-free accessibility label', async () => {
    const { getByLabelText } = await renderSelector()

    for (const mode of VISIBLE_MODES) {
      expect(getByLabelText(new RegExp(`^${mode.label} mode, `))).toBeTruthy()
    }
  })

  it('omits a mode marked hidden from the picker entirely, without deleting it from the app', async () => {
    const { queryByLabelText } = await renderSelector()
    const hiddenModes = ALL_MODES.filter((mode) => mode.hidden)

    // Sanity check the fixture itself actually has at least one hidden mode to test — if this
    // fails, the assertions below would trivially pass over an empty list and prove nothing.
    expect(hiddenModes.length).toBeGreaterThan(0)

    for (const mode of hiddenModes) {
      expect(queryByLabelText(new RegExp(`^${mode.label} mode, `))).toBeNull()
    }
  })

  it('does not render the removed jargon behavior badge text', async () => {
    const { queryByText } = await renderSelector()

    expect(queryByText('+ Additive')).toBeNull()
    expect(queryByText('− Subtractive')).toBeNull()
  })

  it('marks only the currently selected mode as accessibility-selected', async () => {
    const { getByLabelText } = await renderSelector(classicMode)

    expect(getByLabelText(/^Classic mode, /).props.accessibilityState).toEqual({ selected: true })
    expect(getByLabelText(/^Robot mode, /).props.accessibilityState).toEqual({ selected: false })
  })

  it('calls onSelect with the pressed mode', async () => {
    const onSelect = jest.fn()
    const { getByLabelText } = await renderSelector(classicMode, onSelect)

    await fireEvent.press(getByLabelText(/^Robot mode, /))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: robotMode.id }))
  })
})
