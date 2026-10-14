import { useWindowDimensions } from 'react-native'

// The panel width every fixed-width drawer (Game Menu, Choose Packs, Customize, Achievements)
// shares. Full-width drawers (PackPuzzlesDrawer, PackEditorDrawer) don't use this.
export const DRAWER_MAX_WIDTH = 380

// DRAWER_MAX_WIDTH on any window wide enough for it, and exactly the window's own width on a
// narrower one (a 360dp Android phone, a 375pt iPhone SE or mini), so the panel's far edge never
// runs past the screen. @rific/drawer's own maxWidth can't express this: it's the ceiling a drag
// can expand the panel to past its rest width, not a clamp on it.
//
// Every place that sizes or positions a drawer's panel has to read this same value, not the raw
// constant: Drawer's width, DrawerEdgeSwipe's width, the -width seed of a translateOffset shared
// value (otherwise the closed panel peeks or opens from the wrong spot), and anything laid out in
// pages of the panel's width (ModePickerDrawer's carousel).
export function useDrawerWidth(): number {
  const { width } = useWindowDimensions()
  return Math.min(DRAWER_MAX_WIDTH, width)
}
