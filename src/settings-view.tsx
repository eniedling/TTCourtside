import { useEffect, useState } from 'preact/hooks';
import { defaultFieldMap, fieldLabels, jiraConfigured, type AppSettings, type JiraFieldMap } from './settings';
import { testConnection } from './jira';

const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white outline-none focus:border-sky-400';

function Text({ label, value, onInput, type = 'text', placeholder, hint }: {
  label: string; value: string; onInput: (v: string) => void; type?: 'text' | 'email' | 'password' | 'url'; placeholder?: string; hint?: string;
}) {
  const props = {
    value,
    placeholder,
    autocomplete: 'off',
    autocapitalize: 'off' as const,
    spellcheck: false,
    class: inputClass,
    onInput: (e: Event) => onInput((e.target as HTMLInputElement).value),
  };
  return (
    <label class="block space-y-1">
      <span class="text-[11px] font-medium text-slate-400">{label}</span>
      {type === 'email' ? <input type="email" {...props} /> : type === 'password' ? <input type="password" {...props} /> : type === 'url' ? <input type="url" {...props} /> : <input type="text" {...props} />}
      {hint && <span class="block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

type TestResult = Awaited<ReturnType<typeof testConnection>>;

export function SettingsView({ settings, keepAwake, onSave, onKeepAwake }: {
  settings: AppSettings; keepAwake: boolean; onSave: (s: AppSettings) => void; onKeepAwake: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  useEffect(() => setDraft(settings), [settings]);

  const j = draft.jira;
  const setJira = (patch: Partial<AppSettings['jira']>) => setDraft({ ...draft, jira: { ...draft.jira, ...patch } });
  const setField = (k: keyof JiraFieldMap, v: string) => setJira({ fields: { ...j.fields, [k]: v.trim() } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    setTestError(null);
    try {
      setTest(await testConnection(j));
    } catch (e) {
      setTestError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <section class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 pb-24">
      <div class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="text-xs font-bold uppercase tracking-wider text-sky-400">My details</h2>
        <p class="text-[11px] text-slate-500">Used as player 1 in every new match.</p>
        <Text label="My name" value={draft.myName} onInput={(v) => setDraft({ ...draft, myName: v })} />
        <Text label="My club / team" value={draft.myClub} onInput={(v) => setDraft({ ...draft, myClub: v })} />
      </div>

      <div class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="text-xs font-bold uppercase tracking-wider text-emerald-400">Jira connection</h2>
        <p class="text-[11px] text-slate-500">Save to Jira creates one issue per match in this project. It uses a service account API token, not your personal login. The token is stored only on this phone.</p>
        <Text label="Jira site" value={j.site} onInput={(v) => setJira({ site: v })} placeholder="yourname.atlassian.net" />
        <Text label="Project key" value={j.projectKey} onInput={(v) => setJira({ projectKey: v.toUpperCase() })} />
        <div class="space-y-1">
          <Text
            label="Service account API token"
            type={showToken ? 'text' : 'password'}
            value={j.token}
            onInput={(v) => setJira({ token: v })}
            hint="admin.atlassian.com → Directory → Service accounts → Create credentials → API token. Scopes: read:jira-work, write:jira-work (optional: read:jira-user)."
          />
          <button class="text-[11px] font-bold text-sky-400" onClick={() => setShowToken(!showToken)}>{showToken ? 'Hide token' : 'Show token'}</button>
        </div>
        <Text label="Cloud ID" value={j.cloudId} onInput={(v) => setJira({ cloudId: v.trim() })} hint="The ID of your Jira site (pre-filled for eniedling.atlassian.net). In admin.atlassian.com it is the part after /s/ in the address." />
        <details class="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <summary class="cursor-pointer text-xs font-bold text-slate-300">Advanced: issue type, labels, field IDs</summary>
          <div class="mt-3 space-y-3">
            <div class="grid grid-cols-3 gap-2">
              <Text label="Issue type ID" value={j.issueTypeId} onInput={(v) => setJira({ issueTypeId: v.trim() })} />
              <Text label="Win label" value={j.labelWin} onInput={(v) => setJira({ labelWin: v.trim() })} />
              <Text label="Loss label" value={j.labelLoss} onInput={(v) => setJira({ labelLoss: v.trim() })} />
            </div>
            {(Object.keys(fieldLabels) as (keyof JiraFieldMap)[]).map((k) => (
              <Text key={k} label={fieldLabels[k]} value={j.fields[k]} onInput={(v) => setField(k, v)} />
            ))}
            <button class="text-[11px] font-bold text-sky-400" onClick={() => setJira({ fields: { ...defaultFieldMap } })}>Reset field IDs to TT1 defaults</button>
          </div>
        </details>
        <button
          onClick={runTest}
          disabled={!jiraConfigured(j) || testing}
          class="w-full rounded-xl border border-emerald-500/50 bg-emerald-600/20 py-2.5 text-sm font-bold text-emerald-300 disabled:opacity-40"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {testError && <p class="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{testError}</p>}
        {test && (
          <div class="space-y-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-100">
            <p>Logged in as <b>{test.user}</b>, project <b>{test.project}</b>.</p>
            <ul class="space-y-0.5">
              {test.fields.map((f) => (
                <li key={f.key} class={f.name ? '' : 'text-rose-300'}>
                  {f.name ? '✓' : '✗'} {fieldLabels[f.key as keyof JiraFieldMap]}: {f.id} {f.name ? `(${f.name})` : 'not found'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div class="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400">Display</h2>
        <label class="flex items-center justify-between gap-3 text-sm">
          <span>Keep screen on during play</span>
          <input type="checkbox" checked={keepAwake} onChange={(e) => onKeepAwake((e.target as HTMLInputElement).checked)} class="h-5 w-5 accent-sky-500" />
        </label>
      </div>

      <div class="fixed inset-x-0 bottom-[calc(var(--sab)+3.75rem)] z-30 px-3">
        <button
          onClick={() => onSave({ ...draft, myName: draft.myName.trim(), myClub: draft.myClub.trim(), jira: { ...j, site: j.site.trim(), cloudId: j.cloudId.trim(), token: j.token.trim() } })}
          disabled={!dirty}
          class="w-full rounded-xl bg-sky-500 py-3 text-sm font-extrabold text-slate-950 shadow-xl disabled:bg-slate-800 disabled:text-slate-500"
        >
          {dirty ? 'Save settings' : 'Settings saved'}
        </button>
      </div>
    </section>
  );
}
