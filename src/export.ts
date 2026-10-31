// Match exports: text report, CSV, JSON. Delivered via the iOS share sheet when available, else as a download.
import { pct, setsWon, stats, type Match } from './engine';

export function filenameBase(m: Match): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, '_');
  return `TT_Match_${m.meta.matchDate}_${clean(m.meta.p1Name)}_vs_${clean(m.meta.p2Name)}`;
}

const name = (m: Match, k: 'p1' | 'p2') => (k === 'p1' ? m.meta.p1Name : m.meta.p2Name);

export function reportText(m: Match): string {
  const w = setsWon(m);
  const st = stats(m.sets);
  const team = (t: string) => (t ? ` (${t})` : '');
  const block = (k: 'p1' | 'p2', t: string) => {
    const s = st[k];
    const diff = s.winners - s.unforcedErrors;
    return [
      `${name(m, k)}${team(t)}:`,
      `• Points won: ${s.pointsWon}`,
      `• Winners: ${s.winners}`,
      `• Unforced errors: ${s.unforcedErrors}`,
      `• Net (W − UE): ${diff >= 0 ? '+' : ''}${diff}`,
      `• Serve points won: ${s.servePtsWon}/${s.servePtsTotal} (${pct(s.servePtsWon, s.servePtsTotal)}%)`,
    ].join('\n');
  };
  return [
    'TABLE TENNIS MATCH REPORT',
    `${m.meta.p1Name}${team(m.meta.p1Team)} vs ${m.meta.p2Name}${team(m.meta.p2Team)}`,
    `Date: ${m.meta.matchDate}`,
    m.meta.venue ? `Venue: ${m.meta.venue}` : null,
    m.meta.league ? `Competition: ${m.meta.league}` : null,
    `Format: best of ${m.bestOf}`,
    `Sets: ${w.p1}-${w.p2} (${m.sets.map((s, i) => `S${i + 1} ${s.p1Score}-${s.p2Score}`).join(', ')})`,
    '',
    block('p1', m.meta.p1Team),
    '',
    block('p2', m.meta.p2Team),
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

export function csv(m: Match): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const w = setsWon(m);
  const st = stats(m.sets);
  const rows: unknown[][] = [
    ['SECTION', 'KEY', 'P1 / VALUE', 'P2 / EXTRA', 'POINT TYPE', 'ACTOR', 'POINT WINNER', 'SERVER', 'TIMESTAMP'],
    ['META', 'Match date', m.meta.matchDate],
    ['META', 'Venue', m.meta.venue],
    ['META', 'Competition', m.meta.league],
    ['META', 'Players', m.meta.p1Name, m.meta.p2Name],
    ['META', 'Teams', m.meta.p1Team, m.meta.p2Team],
    ['META', 'Format', `Best of ${m.bestOf}`, `Sets ${w.p1}-${w.p2}`],
    ['SUMMARY', 'Points won', st.p1.pointsWon, st.p2.pointsWon],
    ['SUMMARY', 'Winners', st.p1.winners, st.p2.winners],
    ['SUMMARY', 'Unforced errors', st.p1.unforcedErrors, st.p2.unforcedErrors],
    ['SUMMARY', 'Serve points won', `${st.p1.servePtsWon}/${st.p1.servePtsTotal}`, `${st.p2.servePtsWon}/${st.p2.servePtsTotal}`],
  ];
  m.sets.forEach((s, i) => {
    rows.push(['SET', `Set ${i + 1}`, s.p1Score, s.p2Score, s.completed ? 'Completed' : 'In progress', '', s.winner ? name(m, s.winner) : '']);
    s.points.forEach((p, j) =>
      rows.push([
        'POINT',
        `S${i + 1}-P${j + 1}`,
        p.p1ScoreAfter,
        p.p2ScoreAfter,
        p.type === 'WINNER' ? 'Winner' : 'Unforced error',
        name(m, p.actor),
        name(m, p.pointWinner),
        name(m, p.server),
        p.timestamp,
      ]),
    );
  });
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

export function json(m: Match): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), app: 'TT Courtside', version: 1, match: m, stats: stats(m.sets) }, null, 2);
}

export type Format = 'csv' | 'json' | 'txt';

function fileFor(m: Match, f: Format): File {
  const base = filenameBase(m);
  if (f === 'csv') return new File([csv(m)], `${base}.csv`, { type: 'text/csv' });
  if (f === 'json') return new File([json(m)], `${base}.json`, { type: 'application/json' });
  return new File([reportText(m)], `${base}_Report.txt`, { type: 'text/plain' });
}

export function download(m: Match, f: Format): void {
  const file = fileFor(m, f);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Returns 'shared', 'cancelled' or 'downloaded'. */
export async function share(m: Match, f: Format): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const file = fileFor(m, f);
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: `${m.meta.p1Name} vs ${m.meta.p2Name}`, files: [file] });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
  }
  download(m, f);
  return 'downloaded';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
