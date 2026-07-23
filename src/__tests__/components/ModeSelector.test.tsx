import { fireEvent, render } from '@testing-library/react-native'

import { ModeSelector } from '@/components/ModeSelector'
import { ALL_MODES, classicMode, robotMode } from '@/modes/registry'

const LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 200 } } }

const renderSelector = async (selected = classicMode, onSelect = jest.fn()) => {
  const utils = await render(<ModeSelector selected={selected} color='#ff0000' onSelect={onSelect} />)
  await fireEvent(utils.getByTestId('mode-selector-container'), 'layout', LAYOUT_EVENT)
  return utils
}

describe('ModeSelector', () => {
  it('renders a card for every registered mode with a combined, jargon-free accessibility label', async () => {
    const { getByLabelText } = await renderSelector()

    for (const mode of ALL_MODES) {
      expect(getByLabelText(new RegExp(`^${mode.label} mode, `))).toBeTruthy()
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
