// The fixed stacking tiers this app's Drawer chain uses (Drawer's own zIndex prop, added in
// @rific/drawer 0.2.0 — before that every instance implicitly shared the same z-index and
// stacking order was whatever the JSX happened to declare them in). Each Drawer's panel/handle
// still layer above its own backdrop via zIndex+1/+2 internally; these three only need to stay in
// ascending order relative to each other for the chain below to stack correctly.
export const DRAWER_BASE_Z_INDEX = 50 // PuzzleDrawer (Game Menu) and AchievementsDrawer — separate top-level entry points, never open together.
export const DRAWER_SETTINGS_Z_INDEX = 55 // SettingsDrawer, reached from PuzzleDrawer's own header gear icon — a peer of PacksScreen (below), never open at the same time as it.
export const DRAWER_PACKS_SCREEN_Z_INDEX = 60 // PacksScreen, reached from PuzzleDrawer's own Choose Packs.
export const DRAWER_PACK_DETAIL_Z_INDEX = 70 // PackPuzzlesDrawer/PackEditorDrawer — always innermost, stacking above whichever of PuzzleDrawer/PacksScreen opened them.
