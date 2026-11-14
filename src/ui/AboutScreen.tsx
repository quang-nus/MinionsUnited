import {
  COMMS_FORECAST_SOLS,
  COMMS_POWER_COST,
  DAILY_SHIELDING_USE,
  FLARE_EVACUATIONS_UNSHIELDED,
  FLARE_SHIELDING_USE,
  FLARE_THRESHOLD_MIN_CLASS,
  MIN_FLARE_SOLS_PER_SCENARIO,
  SOLS_TOTAL,
} from '../engine/constants';
import { flareSols, isReadableFlare } from '../engine/flares';
import type { FlareThreshold, Scenario } from '../engine/types';
import { dateRange, formatDate } from './format';

const THRESHOLD_WORDS: Record<FlareThreshold, string> = {
  X: `X-class only (${FLARE_THRESHOLD_MIN_CLASS.X} and stronger)`,
  M5: `${FLARE_THRESHOLD_MIN_CLASS.M5} and stronger, including every X-class flare`,
  M1: `${FLARE_THRESHOLD_MIN_CLASS.M1} and stronger, including every X-class flare`,
};

export function AboutScreen({ scenarios, onBack }: { scenarios: readonly Scenario[]; onBack: () => void }) {
  return (
    <main className="screen about-screen">
      <article className="screen-card about-card">
        <h1 className="screen-title">About the science</h1>
        <p className="about-lead">
          This page is for teachers, parents and judges. It explains where the solar flares in Mars Outpost come
          from and what the game simplifies.
        </p>

        <h2>Where the flare dates come from</h2>
        <p>
          Every solar flare in the game is a real flare recorded in NASA&rsquo;s DONKI Space Weather Database
          (Database Of Notifications, Knowledge, Information), run by the Community Coordinated Modeling Center at
          NASA Goddard Space Flight Center. Each mission covers {SOLS_TOTAL} real days. The flare records were
          downloaded from this endpoint:
        </p>
        <pre className="about-code">
          GET https://ccmc.gsfc.nasa.gov/DONKI-API/get/FLR?startDate=YYYY-MM-DD&amp;endDate=YYYY-MM-DD
        </pre>
        <p>
          The game keeps three fields from each record exactly as NASA returned them: the flare ID, the peak time
          and the class.
        </p>

        <h2>The missions in this copy of the game</h2>
        {scenarios.length === 0 ? (
          <p>No missions have been downloaded yet.</p>
        ) : (
          <div className="about-table-wrap">
            <table className="about-table">
              <thead>
                <tr>
                  <th scope="col">Mission</th>
                  <th scope="col">Real dates</th>
                  <th scope="col">Flares that count</th>
                  <th scope="col">Flare records</th>
                  <th scope="col">Flare sols</th>
                  <th scope="col">Downloaded</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">{s.name}</th>
                    <td>{dateRange(s.startDate, s.endDate)}</td>
                    <td>{THRESHOLD_WORDS[s.threshold]}</td>
                    <td>
                      {s.flares.length}
                      {s.flares.some((f) => !isReadableFlare(f)) &&
                        ` (${s.flares.filter((f) => !isReadableFlare(f)).length} without a readable class or time)`}
                    </td>
                    <td>{flareSols(s).join(', ')}</td>
                    <td>{formatDate(s.fetchedAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>How a flare&rsquo;s class decides whether it counts</h2>
        <p>
          Flares are classed by their peak X-ray brightness as seen from Earth: A, B, C, M and X. Each letter is ten
          times stronger than the one before, and the number gives the strength within a letter, so an M5 flare is
          five times an M1. Each mission uses one threshold: X-class only, M5 and stronger, or M1 and stronger. The
          download script picks the highest of these that still gives at least {MIN_FLARE_SOLS_PER_SCENARIO} flare
          days in the window, so quieter months still have something to plan for.
        </p>
        <p>
          A flare counts on the sol of its peak time: whole days from midnight UTC on the first date, plus one.
          Several flares on the same day make one flare sol. Records with a missing or unreadable class or peak time
          never count. Weaker flares below the threshold stay in the file but do not affect play.
        </p>

        <h2>What a flare does in the game</h2>
        <p>
          The base uses {DAILY_SHIELDING_USE} shielding every night, and shielding does not keep: whatever is left
          after the night wears out. On a flare sol the shields need {FLARE_SHIELDING_USE} more. If they are too
          weak, {FLARE_EVACUATIONS_UNSHIELDED} crew members at the base are evacuated to the rescue ship, and anyone
          outside comes back sick without their research. Because shields cannot be stockpiled, Mission
          Control&rsquo;s forecasts are the way to know when the extra shielding is worth its power. A call costs{' '}
          {COMMS_POWER_COST} power and covers the next {COMMS_FORECAST_SOLS} sols, so calling every sol is
          possible but leaves little power for exploring. That trade-off is the lesson of the game: no choice is
          free.
        </p>

        <h2>What the game simplifies</h2>
        <p>
          <strong>These are real flares on the Sun on those dates, and the game assumes each one reaches the Mars
          base.</strong>{' '}
          In reality a flare&rsquo;s radiation mostly travels in the direction the flare faces, and Mars is often on a
          different side of the Sun from Earth, where these flares were observed. Many of them would not have
          reached Mars.
        </p>
        <p>
          The game also treats one sol as one Earth day; a real sol is about 24 hours and 39 minutes. Dust storms,
          sickness and research trips are made up, but they are generated from the flare IDs, so the same mission
          always plays out the same way when the same choices are made.
        </p>

        <h2>Archived, not live</h2>
        <p>
          All flare data in the game is archived: it was downloaded on the date shown above and saved with the game.
          Nothing is fetched while you play, and the game never shows live space weather.
        </p>

        <div className="screen-buttons">
          <button type="button" className="big-button" onClick={onBack}>
            Back
          </button>
        </div>
      </article>
    </main>
  );
}
