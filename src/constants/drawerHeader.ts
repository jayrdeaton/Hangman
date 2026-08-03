import { StyleSheet } from 'react-native'

// Reproduces react-native-paper's Appbar.Header box model exactly: the Appbar row itself uses
// paddingHorizontal:4 and a fixed height:64 (MD3's default Appbar height), and its IconButton
// children carry their own built-in margin:6 plus 8px of icon-centering inside their 40px touch
// target — none of which is expressed here or overridable from outside react-native-paper. The
// only way for a drawer's own leading/trailing IconButton to land pixel-for-pixel where the
// gameplay screen's hamburger/trophy Appbar.Action sits is to reproduce this same box model in
// every header row that needs to line up with it, rather than each drawer picking its own
// padding. Do not adjust padding/height per-file — that drift (some drawers at 16/12, others at
// 8/8, none matching the Appbar's 4/64) is exactly what caused them to visibly misalign.
//
// Both styles below MUST go through StyleSheet.create() rather than being plain exported object
// literals — react-native-web only runs its pointerEvents polyfill (translating 'box-none' into
// real `pointer-events` CSS, see DRAWER_HEADER_TITLE_WRAP_STYLE) for styles that go through its
// atomic-class compiler. A raw object gets applied as a literal inline style attribute instead,
// where 'box-none' isn't valid CSS and the browser just silently drops it — leaving the title
// overlay fully clickable and swallowing every tap meant for the icon button behind/beside it,
// which is exactly the "can't close it" bug this shape caused before switching to StyleSheet.create.
const styles = StyleSheet.create({
  // position:'relative' turns this into the positioning context titleWrap anchors to below.
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 64,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    position: 'relative'
  },
  // The title used to sit in-flow as a flex:1 sibling between the leading icon and a trailing
  // spacer/icon-group — which only lands on the row's true center when both sides happen to
  // occupy equal width. They don't always: PackEditorDrawer's trailing side holds two icons
  // (Share + Delete) against a single leading back arrow, so a flex:1 title there visibly drifts
  // toward the narrower (leading) side instead of centering on the row itself. Positioning the
  // title absolutely across the FULL row — behind/independent of however many icons sit on either
  // edge — fixes that: its center is always the row's true center, full stop, regardless of
  // what's on either side. paddingHorizontal reserves room for the widest side-content case
  // across every header that uses this (PackEditorDrawer's two size=20 icon pair, each ~48px
  // including its own margin, sits inside this same 96px reserve) so a long title still
  // ellipsizes before it would visually run under an icon, without that reserve ever being
  // asymmetric enough to throw off centering itself.
  // pointerEvents:'box-none' (style property, not the deprecated bare prop — see fireworks.tsx's
  // own `inert` style for the same pattern), NOT plain 'none' — this overlay itself spans the
  // full row, so it must never be a touch target itself (that would swallow taps meant for the
  // icon buttons it visually sits beside/behind). But PuzzleDrawer's title is its own tappable
  // TouchableRipple (opens the update check), not just static text, and plain 'none' disables
  // touches for the whole subtree including that child — 'box-none' is the one that keeps the
  // wrapper itself pass-through while still letting a tappable child inside it receive touches
  // normally.
  titleWrap: {
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 96,
    pointerEvents: 'box-none',
    position: 'absolute',
    right: 0,
    top: 0
  }
})

export const DRAWER_HEADER_ROW_STYLE = styles.row
export const DRAWER_HEADER_TITLE_WRAP_STYLE = styles.titleWrap
