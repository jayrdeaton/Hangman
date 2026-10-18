// The fixed stacking tiers this app's Drawer chain uses (Drawer's own zIndex prop, added in
// @rific/drawer 0.2.0 - before that every instance implicitly shared the same z-index and
// stacking order was whatever the JSX happened to declare them in). Each Drawer's panel/handle
// still layer above its own backdrop via zIndex+1/+2 internally; these only need to stay in
// ascending order relative to each other for the chain below to stack correctly. Both open over the
// loadout, from its packs card (the Single Player page's, and the Pass & Play page's on the packs).
export const DRAWER_PACKS_SCREEN_Z_INDEX = 60 // PacksScreen (Choose Packs), from the loadout's Packs button.
export const DRAWER_PACK_DETAIL_Z_INDEX = 70 // PackPuzzlesDrawer/PackEditorDrawer - always innermost, stacking above PacksScreen, which opens them.
