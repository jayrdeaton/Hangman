import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { PacksScreen } from '@/components/PacksScreen'
import { loadCustomPacksCache } from '@/utils/customPacks'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

const builtIn = () => getPuzzleManifest().filter((item) => item.count > 0)[0]

const renderScreen = (overrides: Partial<React.ComponentProps<typeof PacksScreen>> = {}) => render(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} {...overrides} />)

describe('PacksScreen', () => {
  beforeEach(async () => {
    // Resets customPacks.ts's module-level cache to empty via the always-null AsyncStorage mock —
    // otherwise a pack created in one test would leak into the next within this file.
    await loadCustomPacksCache()
  })

  it('renders My packs and Built-in packs sections, honoring selectedKeys', async () => {
    const pack = builtIn()
    const { getByText, getByLabelText } = await renderScreen({ selectedKeys: [pack.key] })

    expect(getByText('Choose packs')).toBeTruthy()
    expect(getByText('My packs')).toBeTruthy()
    expect(getByText('Built-in packs')).toBeTruthy()
    expect(getByText('No custom packs yet — tap Create to build your own.')).toBeTruthy()
    expect(getByText(pack.label)).toBeTruthy()
    expect(getByLabelText(`View ${pack.label} contents`)).toBeTruthy()
  })

  it('calls onChangeSelectedKeys when a built-in pack row is toggled', async () => {
    const pack = builtIn()
    const onChangeSelectedKeys = jest.fn()
    const { getByText } = await renderScreen({ onChangeSelectedKeys })

    await fireEvent.press(getByText(pack.label))

    expect(onChangeSelectedKeys).toHaveBeenCalledWith([pack.key])
  })

  it('creates a pack via Create -> Save and returns to the list, selecting it', async () => {
    const onChangeSelectedKeys = jest.fn()
    const onPacksChanged = jest.fn()
    const { getByText, getByTestId, queryByText, rerender } = await renderScreen({ onChangeSelectedKeys, onPacksChanged })

    await fireEvent.press(getByText('Create'))
    expect(getByText('New pack')).toBeTruthy()

    await fireEvent.changeText(getByTestId('pack-label-input'), 'My Trip')
    await fireEvent.changeText(getByTestId('entry-answer-0'), 'PARIS')
    await fireEvent.press(getByText('Save pack'))

    await waitFor(() => expect(getByText('Choose packs')).toBeTruthy())
    expect(queryByText('New pack')).toBeNull()
    expect(onPacksChanged).toHaveBeenCalled()
    expect(onChangeSelectedKeys).toHaveBeenCalled()

    // onPacksChanged only signals the parent to invalidate its own cache — in the real app
    // (Main.tsx) that bumps a `packsVersion` counter passed back in as a prop, which is what
    // actually triggers this screen's manifest to recompute. Simulate that round trip here.
    await rerender(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={onChangeSelectedKeys.mock.calls[0][0]} onChangeSelectedKeys={jest.fn()} packsVersion={1} onPacksChanged={jest.fn()} />)

    expect(getByText('My Trip')).toBeTruthy()
  })

  it("shows a built-in pack's progress on the detail step and returns to the list on back", async () => {
    const pack = builtIn()
    const { getByLabelText, getByText, queryByText } = await renderScreen()

    await fireEvent.press(getByLabelText(`View ${pack.label} contents`))

    expect(getByText(pack.label)).toBeTruthy()
    await waitFor(() => expect(getByText(/unlocked/)).toBeTruthy())
    expect(queryByText('My packs')).toBeNull()

    await fireEvent.press(getByLabelText('Back to packs'))

    expect(getByText('Choose packs')).toBeTruthy()
    expect(getByText('My packs')).toBeTruthy()
  })

  it('calls onDismiss when closed from the list root', async () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = await renderScreen({ onDismiss })

    await fireEvent.press(getByLabelText('Close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('always reopens at the list step, even if it was left mid-edit', async () => {
    const { getByText, rerender } = await renderScreen()

    await fireEvent.press(getByText('Create'))
    expect(getByText('New pack')).toBeTruthy()

    await rerender(<PacksScreen visible={false} onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} />)
    await rerender(<PacksScreen visible onDismiss={jest.fn()} selectedKeys={[]} onChangeSelectedKeys={jest.fn()} packsVersion={0} onPacksChanged={jest.fn()} />)

    expect(getByText('Choose packs')).toBeTruthy()
  })
})
