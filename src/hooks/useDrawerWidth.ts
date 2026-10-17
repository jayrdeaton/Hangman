import { useDrawerSize } from '@rific/drawer'

// The panel width every fixed-width drawer (Choose Packs, Customize, Pack Progress) shares.
// Full-width drawers (PackPuzzlesDrawer, PackEditorDrawer) don't use this.
export const DRAWER_MAX_WIDTH = 380

// DRAWER_MAX_WIDTH on any window wide enough for it, and exactly the window's own width on a
// narrower one (a 360dp Android phone, a 375pt iPhone SE or mini), so the panel's far edge never
// runs past the screen. The cap itself is @rific/drawer's (useDrawerSize), the same math Drawer and
// DrawerEdgeSwipe size themselves with, so this can never disagree with the panel it describes.
//
// Every place that sizes or positions a drawer's panel reads this value: Drawer's width, the
// -width seed of a translateOffset shared value (the closed offset of a left drawer with no
// maxWidth, PackProgressDrawer's), and anything laid out in pages of the panel's width
// (ModePickerDrawer's carousel).
export function useDrawerWidth(): number {
  return useDrawerSize('left', DRAWER_MAX_WIDTH).effectiveSize
}
