// The fixed stacking tiers this app's Drawer chain uses (Drawer's own zIndex prop, added in
// @rific/drawer 0.2.0 - before that every instance implicitly shared the same z-index and
// stacking order was whatever the JSX happened to declare them in). Each Drawer's panel/handle
// still layer above its own backdrop via zIndex+1/+2 internally; these only need to stay in
// ascending order relative to each other for the chain below to stack correctly. All of them open
// over the Single Player loadout (Pass & Play's opens only the art picker).
export const DRAWER_PACK_PROGRESS_Z_INDEX = 52 // PackProgressDrawer, from the loadout's Pack Progress row - a peer of ModePicker/PacksScreen below.
export const DRAWER_MODE_PICKER_Z_INDEX = 58 // ModePickerDrawer, from the loadout's art row - a peer of Pack Progress/PacksScreen, never open at the same time as either.
export const DRAWER_PACKS_SCREEN_Z_INDEX = 60 // PacksScreen, from the loadout's All Packs row.
export const DRAWER_PACK_DETAIL_Z_INDEX = 70 // PackPuzzlesDrawer/PackEditorDrawer - always innermost, stacking above whichever of the loadout/PacksScreen opened them.
