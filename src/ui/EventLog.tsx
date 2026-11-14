import type { LogEntry } from '../engine/types';

interface SolGroup {
  sol: number;
  entries: { entry: LogEntry; index: number }[];
}

/** Groups entries by sol, newest sol first; inside a sol, events stay in the order they happened. */
function groupBySol(log: readonly LogEntry[]): SolGroup[] {
  const groups: SolGroup[] = [];
  log.forEach((entry, index) => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.sol === entry.sol) {
      last.entries.push({ entry, index });
    } else {
      groups.push({ sol: entry.sol, entries: [{ entry, index }] });
    }
  });
  return groups.reverse();
}

export function EventLog({ log }: { log: readonly LogEntry[] }) {
  return (
    <section className="panel event-log" aria-label="What happened">
      <h2>What happened</h2>
      <div className="log-scroll" tabIndex={0} role="region" aria-label="What happened, newest first">
        {groupBySol(log).map((group, groupIndex) => (
          <section key={`${group.sol}-${group.entries[0]?.index ?? groupIndex}`} className="log-group">
            <h3 className="log-sol">Sol {group.sol}</h3>
            <ul className="log-list">
              {group.entries.map(({ entry, index }) => (
                <li key={index} className="log-item">
                  {entry.text}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
