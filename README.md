# Mars Outpost

A single-page game for children aged 7 to 12, made for a NASA challenge.

You run a Mars base with four astronauts for 28 sols (Mars days). Each sol you
spend power on life support, shielding, research trips and calls to Mission
Control. Solar flares hit on the days real flares happened, taken from NASA's
archived space-weather records. Keep the crew on Mars and collect as much
research as you can. Research is your score.

A won mission earns stars:

- 1 star for finishing.
- 2 stars for also reaching `STARS_2_RESEARCH` research.
- 3 stars for reaching `STARS_3_RESEARCH` with all four crew still on Mars.

Both marks are in `src/engine/constants.ts`; every screen reads them from there.

A lost mission earns none. During play, three star slots beside the research
score show which stars are earned, still possible, or out of reach.

Nobody is ever hurt in the game: if things go wrong, crew members are
evacuated to the rescue ship.

## Running it

You need Node.js 22 or newer.

```sh
npm install
npm run dev        # play at http://localhost:5173
npm test           # run the tests
npm run build      # build the static site into dist/
npm run preview    # serve the built site locally
```

The game is a static site. It needs no server and fetches nothing while you play.

## Adding a scenario (a 28-day mission)

Each mission is one JSON file in `src/data/scenarios/`. To add one, download
28 days of real flare data with the fetch script:

```sh
npx tsx scripts/fetch-donki.ts --start 2017-09-01 --id storm-2017 --name "Storm Month"
```

- `--start` is the first real day (the mission covers that day and the next 27).
- `--id` is the file name and must be lower case letters, numbers and dashes.
- `--name` is the title players see.

The script picks the highest flare threshold (X-class, M5 or M1) that still
gives at least 2 flare days. It warns you if the window has more than 5 flare
days, which would make the mission very hard. Commit the new file, and the game
picks it up on the next build. Each new mission is picked at random, and never
the same one twice in a row.

To check the balance of your missions, run the simulator. It plays thousands of
games with simple automatic strategies:

```sh
npx tsx scripts/simulate.ts --seeds 1000
```

## The NASA data

Solar flares come from the **DONKI** (Database Of Notifications, Knowledge,
Information) space weather database. It is run by the Community Coordinated
Modeling Center at NASA Goddard Space Flight Center. The endpoint is:

```
https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```

The game stores three fields of each flare record exactly as NASA returned
them: `flrID`, `peakTime` and `classType`. The data is **archived**: it was
downloaded once and saved with the game, and players never see live data.

The game makes two simplifications, both explained on the in-game "About the
science" page:

- It assumes every flare reaches Mars, though these flares were seen from Earth.
- It treats a sol as one Earth day.

Storms, sickness and research trips are made up, but they come from a seed made
from the flare IDs. A mission therefore always plays out the same way if the
player makes the same choices.

## Publishing on GitHub Pages

1. Make a new public repository on GitHub, for example `mars-outpost`.
2. Push this project to its `main` branch, including the files in
   `src/data/scenarios/`. `node_modules` and `dist` are ignored.
3. In the repository, open **Settings → Pages**. Under **Build and deployment →
   Source**, choose **GitHub Actions**.
4. Open the **Actions** tab. The workflow "Deploy to GitHub Pages"
   (`.github/workflows/deploy.yml`) runs the tests, builds the game and
   publishes it. If it has not started, click **Run workflow**.
5. When it shows a green tick, the game is live at
   `https://<your-user-name>.github.io/<repository-name>/`. The link is also shown
   under **Settings → Pages**.

Every later push to `main` publishes again automatically.

**Base path:** GitHub Pages serves the site from `/<repository-name>/`, not from
`/`. `vite.config.ts` sets `base: './'`, so every file loads relative to the
page, and the same build works under any repository name. If you ever need an
absolute base instead, set `base: '/mars-outpost/'` (with your repository name).

## Project layout

- `src/engine/`: all game rules, written as pure functions (no page, clock or
  `Math.random`).
- `src/ui/`: React screens.
- `src/store.ts`: game state, saving, and picking a scenario.
- `src/data/scenarios/`: archived NASA flare data.
- `scripts/`: `fetch-donki.ts` downloads data; `simulate.ts` tests the balance.

Browser storage keys (all start with `mars-outpost.`):

- `save`: the game in progress.
- `last-scenario`: the last mission played.
- `crew-names`: the crew names typed in the briefing.
- `guide-seen`: whether the first-sol guide has been shown.
- `sound`: whether sound effects are on.
