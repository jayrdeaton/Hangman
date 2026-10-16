# TODO

Found during the 2026-10-14 README pass. The Title Case and em dash items were done 2026-10-16.

## Dead code and data

1. **Unloaded data files.** `src/data/geography.json`, `sports.json`, `themePacks.json`, and `geographyLandmarks.json` are tracked, but nothing in the manifest or loaders references them. Either delete them or add them to `puzzleCatalog.generated.ts` (and to the private companion repo that generates `src/data/`, so they don't come back or disappear on the next drop-in).
2. **Unused `src/modes/shared/letterforms.ts`** (264 lines). Only the Hershey version (`letterformsHershey.ts`) is imported. Delete it unless it's being kept on purpose.
3. **Share links can be opened but not created.** `buildPuzzleLink` in `src/utils/puzzleLink.ts` has no UI caller (only its test uses it). The app handles incoming `hangman://play` links, but there's no Share button. Either add one (Pass & Play's Hand Off screen is a natural spot) or drop the builder.

## Content

4. **NFL pack has 31 teams.** `src/data/sportsNFL.json` is missing the San Francisco 49ers, almost certainly because `normalizePhrase` strips digits, so "49ers" would play as "SAN FRANCISCO ERS". Options: answer "San Francisco Forty Niners", or leave it out on purpose and note why in the companion repo. Fix it at the source, since `src/data/` is generated there.

## Tests and docs

5. **Possible flaky test.** One full Jest run had 2 failures out of 392, and a re-run passed all 30 suites. Run the suite a few times under load to find which test is timing-sensitive.
