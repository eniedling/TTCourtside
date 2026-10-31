// Jira Cloud integration for the TT1 journal. Calls go through a small relay (relay/worker.js)
// because Jira Cloud sends no CORS headers, so Safari blocks direct calls from the app.
import { matchWinner, pct, setsWon, stats, type Match } from './engine';
import type { JiraSettings } from './settings';

export class JiraError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export const cleanSite = (site: string): string => site.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
export const issueUrl = (j: JiraSettings, key: string): string => `https://${cleanSite(j.site)}/browse/${key}`;

/** "Club: Name (TTR)", the title format used in TT1. Player 2 is always the opponent. */
export function issueSummary(m: Match): string {
  const { p2Team, p2Name, p2Ttr } = m.meta;
  return `${p2Team.trim() ? `${p2Team.trim()}: ` : ''}${p2Name.trim()}${p2Ttr.trim() ? ` (${p2Ttr.trim()})` : ''}`;
}

export function resultLabel(m: Match, j: JiraSettings): string | null {
  const w = matchWinner(m);
  if (w === 'p1') return j.labelWin;
  if (w === 'p2') return j.labelLoss;
  return null;
}

export function issueDescription(m: Match, now = new Date()): string {
  const w = setsWon(m);
  const st = stats(m.sets);
  const win = matchWinner(m);
  const result = win === 'p1' ? 'Sieg' : win === 'p2' ? 'Niederlage' : 'Nicht beendet';
  const sets = m.sets.filter((s) => s.p1Score + s.p2Score > 0).map((s) => `${s.p1Score}:${s.p2Score}`).join(', ');
  const r = m.reflection;
  const lines = [
    `Ergebnis: ${result} ${w.p1}:${w.p2}${sets ? ` (${sets})` : ''}`,
    m.meta.league.trim() ? `Wettbewerb: ${m.meta.league.trim()}` : null,
    m.meta.venue.trim() ? `Ort: ${m.meta.venue.trim()}` : null,
    `Statistik: Punkte ${st.p1.pointsWon}:${st.p2.pointsWon} · Winner ${st.p1.winners}:${st.p2.winners} · Eigenfehler ${st.p1.unforcedErrors}:${st.p2.unforcedErrors} · Aufschlagpunkte ${st.p1.servePtsWon}/${st.p1.servePtsTotal} (${pct(st.p1.servePtsWon, st.p1.servePtsTotal)} %)`,
    r?.flow != null ? `Flow: ${r.flow}/10` : null,
    r?.notes.trim() ? `Notizen: ${r.notes.trim()}` : null,
    `Erfasst mit TT Courtside, ${now.toISOString().slice(0, 10)}`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

/** Custom and system fields for create/update (REST API v2: plain strings for text areas, YYYY-MM-DD for dates). */
export function issueFields(m: Match, j: JiraSettings, now = new Date()): Record<string, unknown> {
  const f = j.fields;
  const r = m.reflection;
  const out: Record<string, unknown> = {
    summary: issueSummary(m),
    description: issueDescription(m, now),
  };
  if (f.spieltag && m.meta.matchDate) out[f.spieltag] = m.meta.matchDate;
  if (r) {
    const text: [keyof typeof f, string][] = [
      ['mood', r.mood],
      ['ownGame', r.ownGame],
      ['motivation', r.motivation],
      ['opponentGame', r.opponentGame],
      ['wentWell', r.wentWell],
      ['wentBadly', r.wentBadly],
      ['improve', r.improve],
    ];
    for (const [k, v] of text) if (f[k] && v.trim()) out[f[k]] = v.trim();
    const conc = [r.concentration != null ? `${r.concentration} %` : '', r.concentrationNote.trim()].filter(Boolean).join('\n');
    if (f.concentration && conc) out[f.concentration] = conc;
  }
  return out;
}

export function createBody(m: Match, j: JiraSettings, now = new Date()) {
  const label = resultLabel(m, j);
  return {
    fields: {
      project: { key: j.projectKey },
      issuetype: { id: j.issueTypeId },
      ...issueFields(m, j, now),
      ...(label ? { labels: [label] } : {}),
    },
  };
}

/** Update keeps labels someone added in Jira: only the win/loss label is swapped. */
export function updateBody(m: Match, j: JiraSettings, now = new Date()) {
  const label = resultLabel(m, j);
  const other = label === j.labelWin ? j.labelLoss : label === j.labelLoss ? j.labelWin : null;
  const ops = [...(other ? [{ remove: other }] : []), ...(label ? [{ add: label }] : [])];
  return { fields: issueFields(m, j, now), ...(ops.length ? { update: { labels: ops } } : {}) };
}

function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

async function call<T>(j: JiraSettings, method: string, path: string, body?: unknown): Promise<T> {
  const url = `${j.relayUrl.trim().replace(/\/+$/, '')}/${cleanSite(j.site)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${base64(`${j.email.trim()}:${j.token.trim()}`)}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new JiraError(navigator.onLine === false ? 'You are offline.' : 'Could not reach the relay. Check the relay URL.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const d = data as { errorMessages?: string[]; errors?: Record<string, string>; message?: string } | null;
    const msgs = [...(d?.errorMessages ?? []), ...Object.entries(d?.errors ?? {}).map(([k, v]) => `${k}: ${v}`), ...(d?.message ? [d.message] : [])];
    const hint = res.status === 401 ? 'Login failed: check email and API token.' : res.status === 403 ? 'No permission, or the relay refused the request.' : '';
    throw new JiraError([hint, ...msgs].filter(Boolean).join(' ') || `Jira returned ${res.status}`, res.status);
  }
  return data as T;
}

export async function testConnection(j: JiraSettings) {
  const me = await call<{ displayName: string }>(j, 'GET', '/rest/api/2/myself');
  const project = await call<{ name: string }>(j, 'GET', `/rest/api/2/project/${encodeURIComponent(j.projectKey)}`);
  const all = await call<{ id: string; name: string }[]>(j, 'GET', '/rest/api/2/field');
  const byId = new Map(all.map((f) => [f.id, f.name]));
  const fields = Object.entries(j.fields).map(([k, id]) => ({ key: k, id, name: byId.get(id) ?? null }));
  return { user: me.displayName, project: project.name, fields };
}

export async function getIssue(j: JiraSettings, key: string): Promise<{ key: string; summary: string } | null> {
  try {
    const d = await call<{ key: string; fields: { summary: string } }>(j, 'GET', `/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary`);
    return { key: d.key, summary: d.fields.summary };
  } catch (e) {
    if (e instanceof JiraError && e.status === 404) return null;
    throw e;
  }
}

/** Look for a TT1 issue for the same opponent on the same day (e.g. typed into Jira by hand). Best effort. */
export async function findExisting(j: JiraSettings, m: Match): Promise<{ key: string; summary: string }[]> {
  const cf = j.fields.spieltag.match(/customfield_(\d+)/)?.[1];
  const name = m.meta.p2Name.trim().replace(/["\\]/g, '');
  if (!cf || !name || !m.meta.matchDate) return [];
  const jql = `project = "${j.projectKey}" AND cf[${cf}] = "${m.meta.matchDate}" AND summary ~ "\\"${name}\\""`;
  try {
    const d = await call<{ issues?: { key: string; fields: { summary: string } }[] }>(
      j,
      'GET',
      `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=5`,
    );
    return (d.issues ?? []).map((i) => ({ key: i.key, summary: i.fields.summary }));
  } catch {
    return [];
  }
}

export async function createIssue(j: JiraSettings, m: Match): Promise<string> {
  const d = await call<{ key: string }>(j, 'POST', '/rest/api/2/issue', createBody(m, j));
  return d.key;
}

export async function updateIssue(j: JiraSettings, key: string, m: Match): Promise<void> {
  await call(j, 'PUT', `/rest/api/2/issue/${encodeURIComponent(key)}`, updateBody(m, j));
}
