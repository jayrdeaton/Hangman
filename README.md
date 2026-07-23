# Hangman

## Scrapers

The project includes script-based data scrapers for generating puzzles used in solo/randomized play.

### Available Commands

Run individual scrapers:

- `npm run scraper:wheel`
- `npm run scraper:geography`
- `npm run scraper:landmarks`
- `npm run scraper:themes`
- `npm run scraper:jeopardy`
- `npm run scraper:music`
- `npm run scraper:movies`
- `npm run scraper:tv`
- `npm run scraper:spotify`
- `npm run scraper:catalog`

Run all scrapers through the orchestrator:

- `npm run scraper:all`

The orchestrator is prerequisite-aware. It will:

- run supported scrapers when requirements are present
- skip scrapers with missing prerequisites
- print a pass/skip/fail summary at the end

### Prerequisites

#### Jeopardy

- Required file: `./JEOPARDY.csv`

#### Movies and TV

- Required env var: `TMDB_API_KEY`

#### Spotify

- Required env var: `SPOTIFY_TOKEN`

#### Wheel

- Optional env var: `WHEEL_MAX_PAGES`
- Default is `1` page per category for stable scraping.

### Example Setup

```bash
cp .env.example .env

# fill in .env values, then load them in your shell
source .env

npm run scraper:all
```

### Output Files

Scrapers write JSON data under `./data/`:

- `wheel.json`
- `geography.json`
- `geographyCountries.json`
- `geographyUSStates.json`
- `geographyCities.json`
- `geographyLandmarks.json`
- `geographyNationalParks.json`
- `geographyLandmarksUNESCO.json`
- `geographyWorldWonders.json`
- `themePacks.json`
- `themeSuperheroes.json`
- `themeCartoons.json`
- `themeUSPresidents.json`
- `themeFirstLadies.json`
- `themeActors.json`
- `themeSportsTeams.json`
- `themeMythology.json`
- `themeScienceSpace.json`
- `themeBrandsProducts.json`
- `themeLiterature.json`
- `themeFoodAndDrink.json`
- `themeTravel.json`
- `themeVehicles.json`
- `themeVideoGames.json`
- `themeBoardGamesToys.json`
- `themeTechnology.json`
- `themeCompanies.json`
- `themeMovieTitles.json`
- `themeTVShows.json`
- `themeMusicByEra.json`
- `themeNature.json`
- `themeHistory.json`
- `themeHolidaysCelebrations.json`
- `themeWordplay.json`
- `puzzleManifest.json`
- `puzzlesAll.json`
- `jeopardy.json`
- `bands.json`
- `movies.json`
- `tvShows.json`
- `songs.json`

### Notes

- If a prerequisite is missing, scrapers fail fast with a clear message.
- `scraper:all` skips missing prerequisites instead of failing the whole run.
- Some upstream sites can rate-limit or challenge traffic (for example, Cloudflare). If that happens, rerun later or lower request intensity.
- `scraper:catalog` generates a manifest for category metadata and a merged puzzle file, plus `src/data/puzzleCatalog.generated.ts` for runtime lazy loading.
