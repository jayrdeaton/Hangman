import { JSX } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { formatWinRate, type PnpStandingRow } from '@/utils/pnpSession'

// One row's height (a bodyLarge line) and the space between rows, for a card that budgets its height
// around the list (see RoundEndDialog's fitAnswerFontSize budget).
export const STANDINGS_ROW_HEIGHT = 24
export const STANDINGS_ROW_GAP = 4

// More players than this and the round-over card lays the standings out in two columns, so a full
// table takes no more of the card's height than four players do (see RoundEndDialog's budget).
export const STANDINGS_ONE_COLUMN_MAX = 4

export type PnpStandingsListProps = {
  // In the order they're shown: seat order on the round-over card, ranked on the session's last card.
  rows: PnpStandingRow[]
  // Two puts the rows side by side in pairs, reading across then down.
  columns?: 1 | 2
  // The ink, and a quieter one for a player who hasn't guessed yet: a card's colors, or the board's.
  color: string
  mutedColor: string
  // A row set in bold: the round's guesser on the round-over card, the winner at the session's end.
  highlightId?: string
  // Each row's win rate as well (the session's end and the loadout), beside its words solved.
  showRate?: boolean
}

// How many lines a list of `count` rows takes in `columns`.
export const standingsLineCount = (count: number, columns: 1 | 2): number => Math.ceil(count / columns)

// A Pass & Play session's standings, one entry per player: the name, then the words solved out of the
// words guessed ("2 of 3"), or the fleet's "-" for a player who hasn't guessed yet. Each entry reads
// as one sentence to a screen reader.
export const PnpStandingsList = ({ rows, columns = 1, color, mutedColor, highlightId, showRate = false }: PnpStandingsListProps): JSX.Element => {
  const entry = (row: PnpStandingRow) => {
    const guessed = row.played > 0
    const textStyle = [styles.text, row.id === highlightId && styles.highlight, { color: guessed ? color : mutedColor }]
    return (
      <View key={row.id} accessible accessibilityLabel={guessed ? `${row.name}: ${row.wins} of ${row.played} solved${showRate ? `, ${formatWinRate(row)}` : ''}` : `${row.name}: no words guessed yet`} style={[styles.entry, columns > 1 && styles.cell]}>
        {/* One line: a long name gives way (with an ellipsis) to the numbers beside it. */}
        <Text variant='bodyLarge' numberOfLines={1} style={[textStyle, styles.name]}>
          {row.name}
        </Text>
        <Text variant='bodyLarge' style={[textStyle, styles.number]}>
          {guessed ? `${row.wins} of ${row.played}` : '-'}
        </Text>
        {showRate ? (
          <Text variant='bodyLarge' style={[textStyle, styles.number, styles.rate]}>
            {formatWinRate(row)}
          </Text>
        ) : null}
      </View>
    )
  }
  const lines = Array.from({ length: standingsLineCount(rows.length, columns) }, (_, line) => rows.slice(line * columns, line * columns + columns))
  return (
    <View style={styles.list}>
      {lines.map((pair) =>
        columns === 1 ? (
          entry(pair[0])
        ) : (
          // A lone last entry keeps its column's width rather than stretching across both.
          <View key={pair[0].id} style={styles.line}>
            {pair.map(entry)}
            {pair.length < columns ? <View testID='standings-spacer' style={styles.cell} /> : null}
          </View>
        )
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // A column's share of a two-column line.
  cell: { flex: 1 },
  entry: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: STANDINGS_ROW_HEIGHT },
  highlight: { fontWeight: '700' },
  line: { flexDirection: 'row', gap: 24 },
  list: { alignSelf: 'stretch', gap: STANDINGS_ROW_GAP },
  name: { flex: 1 },
  // Lined up down the list: right-aligned, in figures of one width.
  number: { fontVariant: ['tabular-nums'], textAlign: 'right' },
  rate: { minWidth: 48 },
  text: { lineHeight: STANDINGS_ROW_HEIGHT }
})
