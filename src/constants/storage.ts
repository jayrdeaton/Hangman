// On the web every Tastic game shares one origin (games.infinitetoken.com) and so one localStorage, where
// AsyncStorage keeps each key exactly as given. Every key this game writes starts with this prefix, so no
// other game's key can be one of Hangman's: redux-persist's keyPrefix (hangman:root, hangman:round, in
// place of the persist:root every game used to write) and each key written straight to AsyncStorage. It
// applies on native too; saves under the old keys are left in storage, never read (Hangman hadn't shipped).
export const STORAGE_PREFIX = 'hangman:'
