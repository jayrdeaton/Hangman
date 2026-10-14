# TODO

Found during the 2026-10-14 README pass. Nothing here has been changed yet.

## Copy

1. **Title Case labels.** Much of the in-app copy is sentence case, which breaks the fleet rule (Title Case for UI labels, one-word buttons where possible). Known examples: "Pass & play", "Choose packs", "Export progress", "Hand off". Sweep every button, tab, dialog title, and settings label. The README already uses the Title Case names, so they will match once this is done.
2. **Remove every em dash and en dash.** 122 tracked files contain them, about 172 of those lines in non-comment code under `src/`. Follow the Solitaire sweep (commit 2b0508c): in comments, docs, and CLAUDE.md, a spaced dash becomes a spaced hyphen; user-facing copy gets reworded with a period, comma, colon, or parentheses. Search with a byte-level grep (`git ls-files | xargs grep -nF $'\xe2\x80\x94'`), not `grep -P`, which silently misses them.

## Dead code and data

3. **Unloaded data files.** `src/data/geography.json`, `sports.json`, `themePacks.json`, and `geographyLandmarks.json` are tracked, but nothing in the manifest or loaders references them. Either delete them or add them to `puzzleCatalog.generated.ts` (and to the private companion repo that generates `src/data/`, so they don't come back or disappear on the next drop-in).
4. **Unused `src/modes/shared/letterforms.ts`** (264 lines). Only the Hershey version (`letterformsHershey.ts`) is imported. Delete it unless it's being kept on purpose.
5. **Share links can be opened but not created.** `buildPuzzleLink` in `src/utils/puzzleLink.ts` has no UI caller (only its test uses it). The app handles incoming `hangman://play` links, but there's no Share button. Either add one (Pass & Play's Hand Off screen is a natural spot) or drop the builder.

## Content

6. **NFL pack has 31 teams.** `src/data/sportsNFL.json` is missing the San Francisco 49ers, almost certainly because `normalizePhrase` strips digits, so "49ers" would play as "SAN FRANCISCO ERS". Options: answer "San Francisco Forty Niners", or leave it out on purpose and note why in the companion repo. Fix it at the source, since `src/data/` is generated there.

## Tests and docs

7. **Possible flaky test.** One full Jest run had 2 failures out of 392, and a re-run passed all 30 suites. Run the suite a few times under load to find which test is timing-sensitive.
