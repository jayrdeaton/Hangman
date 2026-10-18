// The fixed stacking tiers this app's Drawer chain uses (Drawer's own zIndex prop, added in
// @rific/drawer 0.2.0 - before that every instance implicitly shared the same z-index and
// stacking order was whatever the JSX happened to declare them in). Each Drawer's panel/handle
// still layer above its own backdrop via zIndex+1/+2 internally; these only need to stay in
// ascending order relative to each other for the chain below to stack correctly. Both open over the
// Single Player loadout (Pass & Play's opens none: the art picker that used to open there,
// ModePickerDrawer, is the Settings sheet's ART grid now).
export const DRAWER_PACKS_SCREEN_Z_INDEX = 60 // PacksScreen (Choose Packs), from the loadout's Packs button.
export const DRAWER_PACK_DETAIL_Z_INDEX = 70 // PackPuzzlesDrawer/PackEditorDrawer - always innermost, stacking above PacksScreen, which opens them.
