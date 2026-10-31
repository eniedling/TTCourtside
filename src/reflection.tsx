import { useEffect, useState } from 'preact/hooks';
import { emptyReflection, matchWinner, setsWon, type Match, type Reflection } from './engine';
import { jiraConfigured, type AppSettings } from './settings';
import { createIssue, findExisting, getIssue, issueSummary, issueUrl, updateIssue } from './jira';
import { archiveMatch } from './storage';
import { Modal } from './ui';

type Confirm =
  | { kind: 'update'; key: string; summary: string }
  | { kind: 'found'; key: string; summary: string }
  | { kind: 'gone'; key: string };

const questions: [keyof Reflection, string, string][] = [
  ['mood', 'Stimmung', 'Wie war deine Stimmung?'],
  ['ownGame', 'Eigenes Spiel', 'Wie hast du dein Spiel durchgesetzt?'],
  ['motivation', 'Motivation', 'Was wolltest du erreichen?'],
  ['opponentGame', "Gegner's Spiel", 'Wie hat der Gegner gespielt?'],
  ['wentWell', 'Was lief gut?', ''],
  ['wentBadly', 'Was lief nicht so gut?', ''],
  ['improve', 'Was kann ich verbessern?', ''],
];

const area = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white outline-none focus:border-sky-400';

export function ReflectionModal({ match, settings, onClose, onSaved, onToast, onOpenSettings }: {
  match: Match | null;
  settings: AppSettings;
  onClose: () => void;
  onSaved: (m: Match) => void;
  onToast: (t: string) => void;
  onOpenSettings: () => void;
}) {
  const [r, setR] = useState<Reflection>(emptyReflection());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  useEffect(() => {
    if (match) {
      setR({ ...emptyReflection(), ...match.reflection });
      setError(null);
      setConfirm(null);
    }
  }, [match?.id]);

  if (!match) return null;
  const j = settings.jira;
  const w = setsWon(match);
  const win = matchWinner(match);

  const withReflection = (): Match => ({ ...match, reflection: r });

  const saveLocal = async () => {
    const m = withReflection();
    await archiveMatch(m);
    onSaved(m);
    return m;
  };

  const finish = async (m: Match, key: string, created: boolean) => {
    const linked: Match = { ...m, jira: { key, url: issueUrl(j, key), savedAt: new Date().toISOString() } };
    await archiveMatch(linked);
    onSaved(linked);
    onToast(created ? `Created ${key} in Jira` : `Updated ${key} in Jira`);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const startSave = () =>
    run('Checking Jira…', async () => {
      const m = await saveLocal();
      if (match.jira?.key) {
        const existing = await getIssue(j, match.jira.key);
        setConfirm(existing ? { kind: 'update', key: existing.key, summary: existing.summary } : { kind: 'gone', key: match.jira.key });
        return;
      }
      const found = await findExisting(j, m);
      if (found.length) {
        setConfirm({ kind: 'found', key: found[0].key, summary: found[0].summary });
        return;
      }
      setBusy('Creating issue…');
      await finish(m, await createIssue(j, m), true);
    });

  const doUpdate = (key: string) =>
    run('Updating issue…', async () => {
      setConfirm(null);
      const m = withReflection();
      await updateIssue(j, key, m);
      await finish(m, key, false);
    });

  const doCreate = () =>
    run('Creating issue…', async () => {
      setConfirm(null);
      const m = withReflection();
      await finish(m, await createIssue(j, m), true);
    });

  return (
    <Modal open onClose={busy ? undefined : onClose} title="Reflection">
      <div class="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs">
        <div class="font-bold text-white">{match.meta.p1Name} vs {issueSummary(match) || match.meta.p2Name}</div>
        <div class="text-slate-400">
          {match.meta.matchDate} · <span class={win === 'p1' ? 'text-emerald-300' : win === 'p2' ? 'text-rose-300' : ''}>{win === 'p1' ? 'Won' : win === 'p2' ? 'Lost' : 'Unfinished'} {w.p1}:{w.p2}</span>
          {match.jira && (
            <>
              {' · '}
              <a href={match.jira.url} target="_blank" rel="noopener" class="font-bold text-sky-400 underline">{match.jira.key}</a>
            </>
          )}
        </div>
      </div>

      <div class="space-y-3">
        {questions.slice(0, 2).map(([k, label, hint]) => (
          <label key={k} class="block space-y-1">
            <span class="text-xs font-bold text-slate-300">{label}</span>
            <textarea rows={2} placeholder={hint} value={r[k] as string} onInput={(e) => setR({ ...r, [k]: (e.target as HTMLTextAreaElement).value })} class={area} />
          </label>
        ))}
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-300">Konzentration</span>
            <span class="score text-sm font-bold text-sky-300">{r.concentration == null ? 'not set' : `${r.concentration} %`}</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={r.concentration ?? 80} onInput={(e) => setR({ ...r, concentration: Number((e.target as HTMLInputElement).value) })} class={`w-full accent-sky-500 ${r.concentration == null ? 'opacity-40' : ''}`} aria-label="Konzentration in Prozent" />
          <input type="text" placeholder="Notiz, z. B. Satz 1-2 schwächer" value={r.concentrationNote} onInput={(e) => setR({ ...r, concentrationNote: (e.target as HTMLInputElement).value })} class={area} />
        </div>
        {questions.slice(2).map(([k, label, hint]) => (
          <label key={k} class="block space-y-1">
            <span class="text-xs font-bold text-slate-300">{label}</span>
            <textarea rows={2} placeholder={hint} value={r[k] as string} onInput={(e) => setR({ ...r, [k]: (e.target as HTMLTextAreaElement).value })} class={area} />
          </label>
        ))}
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-300">Flow (optional)</span>
            <span class="score text-sm font-bold text-sky-300">{r.flow == null ? 'not set' : `${r.flow}/10`}</span>
          </div>
          <input type="range" min={0} max={10} step={1} value={r.flow ?? 5} onInput={(e) => setR({ ...r, flow: Number((e.target as HTMLInputElement).value) })} class={`w-full accent-sky-500 ${r.flow == null ? 'opacity-40' : ''}`} aria-label="Flow 0 bis 10" />
        </div>
        <label class="block space-y-1">
          <span class="text-xs font-bold text-slate-300">Notizen</span>
          <textarea rows={2} value={r.notes} onInput={(e) => setR({ ...r, notes: (e.target as HTMLTextAreaElement).value })} class={area} />
        </label>
      </div>

      {error && <p class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}

      {confirm && (
        <div ref={(el) => el?.scrollIntoView({ block: 'center', behavior: 'smooth' })} class="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100">
          {confirm.kind === 'update' && <p><b>{confirm.key}</b> already exists in Jira ("{confirm.summary}"). Update it with the current data?</p>}
          {confirm.kind === 'found' && <p>Jira already has <b>{confirm.key}</b> ("{confirm.summary}") for this opponent on this date. Update it, or create a new issue?</p>}
          {confirm.kind === 'gone' && <p><b>{confirm.key}</b> was saved before but no longer exists in Jira. Create a new issue?</p>}
          <div class="grid grid-cols-2 gap-2">
            <button class="rounded-lg border border-slate-700 bg-slate-800 py-2 font-bold text-slate-200" onClick={() => setConfirm(null)}>Cancel</button>
            {confirm.kind === 'gone' ? (
              <button class="rounded-lg bg-amber-400 py-2 font-extrabold text-slate-950" onClick={doCreate}>Create new</button>
            ) : (
              <button class="rounded-lg bg-amber-400 py-2 font-extrabold text-slate-950" onClick={() => doUpdate(confirm.key)}>Update {confirm.key}</button>
            )}
          </div>
          {confirm.kind === 'found' && <button class="w-full text-center font-bold text-amber-200 underline" onClick={doCreate}>Create a new issue instead</button>}
        </div>
      )}

      <div class="grid grid-cols-2 gap-2">
        <button disabled={!!busy} onClick={async () => { await saveLocal(); onToast('Reflection saved on this phone'); }} class="rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-200 disabled:opacity-40">
          Save on phone
        </button>
        {jiraConfigured(j) ? (
          <button disabled={!!busy || !!confirm} onClick={startSave} class="rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-slate-950 disabled:opacity-50">
            {busy ?? (match.jira ? 'Update in Jira' : 'Save to Jira')}
          </button>
        ) : (
          <button onClick={onOpenSettings} class="rounded-xl border border-emerald-500/50 py-3 text-xs font-bold text-emerald-300">Set up Jira first</button>
        )}
      </div>
    </Modal>
  );
}
