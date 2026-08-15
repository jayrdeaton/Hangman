// The fixed stacking tiers this app's Drawer chain uses (Drawer's own zIndex prop, added in
// @rific/drawer 0.2.0 — before that every instance implicitly shared the same z-index and
// stacking order was whatever the JSX happened to declare them in). Each Drawer's panel/handle
// still layer above its own backdrop via zIndex+1/+2 internally; these three only need to stay in
// ascending order relative to each other for the chain below to stack correctly.
export const DRAWER_BASE_Z_INDEX = 50 // PuzzleDrawer (Game Menu) — the app's one top-level entry point.
export const DRAWER_ACHIEVEMENTS_Z_INDEX = 52 // AchievementsDrawer, reached from PuzzleDrawer's own quick-look card — a peer of ModePicker/PacksScreen below.
export const DRAWER_MODE_PICKER_Z_INDEX = 58 // ModePickerDrawer, reached from PuzzleDrawer's own mode summary row — a peer of Achievements/PacksScreen, never open at the same time as either.
export const DRAWER_PACKS_SCREEN_Z_INDEX = 60 // PacksScreen, reached from PuzzleDrawer's own Choose Packs.
export const DRAWER_PACK_DETAIL_Z_INDEX = 70 // PackPuzzlesDrawer/PackEditorDrawer — always innermost, stacking above whichever of PuzzleDrawer/PacksScreen opened them.
