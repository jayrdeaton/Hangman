// Runs before expo-router turns an incoming native URL into a route. A .hangman file opened from
// another app arrives as a file: or content: URL; left alone, the router would try to match its path
// and land on the not-found route. Returning null keeps the player where they are (or on the default
// first screen at a cold launch), and IncomingFileImport reads the file through expo-linking instead.
// Must never throw, so anything unexpected passes through untouched.
export const redirectSystemPath = ({ path }: { path: string; initial: boolean }): string | null => {
  try {
    if (/^(file|content):/i.test(path)) return null
  } catch {
    // Fall through.
  }
  return path
}
