import type { Profile } from '@tastic/profile'
import { render } from '@testing-library/react-native'
import { type StyleProp, StyleSheet, type TextStyle } from 'react-native'

import { PnpStandingsList, standingsLineCount } from '@/components/PnpStandings'
import type { PnpStandingRow } from '@/utils/pnpSession'

const rows: PnpStandingRow[] = [
  { id: 'p1', name: 'Ann', played: 3, wins: 2 },
  { id: 'p2', name: 'Bo', played: 0, wins: 0 },
  { id: 'p3', name: 'Cy', played: 1, wins: 0 }
]
const INK = '#111111'
const MUTED = '#777777'
const color = (element: { props: Record<string, unknown> }) => StyleSheet.flatten(element.props.style as StyleProp<TextStyle>)?.color

describe('PnpStandingsList', () => {
  it('lists each player with their words solved out of words guessed, in the order given', async () => {
    const { getAllByText, getByLabelText, getByText } = await render(<PnpStandingsList rows={rows} color={INK} mutedColor={MUTED} />)

    expect(getByLabelText('Ann: 2 of 3 solved')).toBeTruthy()
    expect(getByLabelText('Cy: 0 of 1 solved')).toBeTruthy()
    expect(getByText('2 of 3')).toBeTruthy()
    expect(getAllByText(/^(Ann|Bo|Cy)$/).map((element) => element.props.children)).toEqual(['Ann', 'Bo', 'Cy'])
    // No rates unless asked for.
    expect(() => getByText('67%')).toThrow()
  })

  it("shows the fleet's - in the quieter color for a player who hasn't guessed", async () => {
    const { getByLabelText, getByText } = await render(<PnpStandingsList rows={rows} color={INK} mutedColor={MUTED} />)

    expect(getByLabelText('Bo: no words guessed yet')).toBeTruthy()
    expect(getByText('-')).toBeTruthy()
    expect(color(getByText('Bo'))).toBe(MUTED)
    expect(color(getByText('Ann'))).toBe(INK)
  })

  it('sets the highlighted player in bold, and adds the rates when asked', async () => {
    const { getByLabelText, getByText } = await render(<PnpStandingsList rows={rows} color={INK} mutedColor={MUTED} highlightId='p1' showRate />)

    expect(StyleSheet.flatten(getByText('Ann').props.style).fontWeight).toBe('700')
    expect(StyleSheet.flatten(getByText('Cy').props.style).fontWeight).not.toBe('700')
    expect(getByText('67%')).toBeTruthy()
    expect(getByLabelText('Ann: 2 of 3 solved, 67%')).toBeTruthy()
  })

  it('pairs the entries across two columns, reading across then down, keeping a lone last one to its column', async () => {
    const { getByLabelText, getByTestId } = await render(<PnpStandingsList rows={rows} columns={2} color={INK} mutedColor={MUTED} />)

    const firstLine = getByLabelText('Ann: 2 of 3 solved').parent!
    expect(firstLine.children).toContain(getByLabelText('Bo: no words guessed yet'))
    const lastLine = getByLabelText('Cy: 0 of 1 solved').parent!
    expect(lastLine.children).toEqual([getByLabelText('Cy: 0 of 1 solved'), getByTestId('standings-spacer')])
  })

  // A profile's chip before its name, and with one in the list every guest's name keeps the room.
  it("leads a profile's name with its chip, holding the room open for every guest beside it", async () => {
    const ann: Profile = { id: 'profile-a', name: 'Ann', color: '#9c27b0', tag: 'AN', createdAt: 1, updatedAt: 1 }
    const { getByText, getAllByTestId } = await render(<PnpStandingsList rows={[{ ...rows[0], profile: ann }, rows[1], rows[2]]} color={INK} mutedColor={MUTED} />)

    expect(getByText('AN')).toBeTruthy()
    expect(getAllByTestId('player-mark-slot')).toHaveLength(2)
  })

  it('draws no chips and holds no room for guests alone', async () => {
    const { queryAllByTestId } = await render(<PnpStandingsList rows={rows} color={INK} mutedColor={MUTED} />)

    expect(queryAllByTestId('player-mark-slot')).toHaveLength(0)
  })

  it('counts the lines a list takes', () => {
    expect(standingsLineCount(3, 1)).toBe(3)
    expect(standingsLineCount(5, 2)).toBe(3)
    expect(standingsLineCount(8, 2)).toBe(4)
  })
})
