import { FadingScrollView } from '@rific/auto-paper'
import type { JSX } from 'react'
import type { ScrollViewProps } from 'react-native'

// For a FlatList's renderScrollComponent: its rows fade out at the top and bottom edges while there is
// more to scroll past them, auto-paper's FadingScrollView treatment (the Settings sheet, Stats, the
// loadout), with the list's own virtualization left as it is. The list hands its scroll ref and
// handlers through these props, and FadingScrollView passes them on to its own ScrollView.
export const renderFadingScrollComponent = (props: ScrollViewProps): JSX.Element => <FadingScrollView {...props} />
