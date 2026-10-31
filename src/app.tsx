import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createMatch,
  currentSet,
  hasAnyPoints,
  isMatchOver,
  logPoint,
  matchWinner,
  pct,
  serverInfo,
  setsWon,
  situation,
  startNextSet,
  stats,
  todayIso,
  toggleFirstServer,
  undo,
  type Match,
  type MatchMeta,
  type PlayerKey,
  type PointType,
} from './engine';
import { archiveMatch, defaultPrefs, deleteArchived, listArchive, loadCurrent, loadPrefs, loadSettings, requestPersistence, saveCurrent, savePrefs, saveSettings, type Prefs } from './storage';
import { defaultSettings, type AppSettings } from './settings';
import { SettingsView } from './settings-view';
import { ReflectionModal } from './reflection';
import { copyText, download, reportText, share, type Format } from './export';
import { Icon, Modal, Toast, haptic } from './ui';
import { registerSW } from 'virtual:pwa-register';

type Tab = 'live' | 'stats' | 'history' | 'settings';
type ModalName = 'setComplete' | 'settings' | 'reset' | 'export' | 'changeEnds' | null;

const pname = (m: Match, k: PlayerKey) => (k === 'p1' ? m.meta.p1Name : m.meta.p2Name);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const myDetails = (st: AppSettings): Partial<MatchMeta> => ({
  ...(st.myName ? { p1Name: st.myName } : {}),
  ...(st.myClub ? { p1Team: st.myClub } : {}),
});
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function App() {
  const [match, setMatch] = useState<Match | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [tab, setTab] = useState<Tab>('live');
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [bumpKey, setBumpKey] = useState<{ k: PlayerKey; n: number } | null>(null);
  const [updateReady, setUpdateReady] = useState<null | (() => void)>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings());
  const [reflecting, setReflecting] = useState<Match | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (t: string) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2100);
  };

  // Load saved state once.
  useEffect(() => {
    (async () => {
      const [m, p, st] = await Promise.all([loadCurrent(), loadPrefs(), loadSettings()]);
      setMatch(m ?? createMatch(myDetails(st)));
      setPrefs(p);
      setSettings(st);
      requestPersistence();
    })();
    const update = registerSW({
      onNeedRefresh() {
        setUpdateReady(() => () => update(true));
      },
      onOfflineReady() {
        showToast('Ready to work offline');
      },
    });
  }, []);

  // Keep the screen on while tracking (Screen Wake Lock API, where supported).
  useEffect(() => {
    if (!prefs.keepAwake || tab !== 'live' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* denied or unsupported */
      }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [prefs.keepAwake, tab]);

  const commit = (m: Match) => {
    setMatch(m);
    saveCurrent(m);
  };
  const updatePrefs = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(next);
  };

  const applySettings = (st: AppSettings) => {
    setSettings(st);
    saveSettings(st);
    // A match that has not started yet picks up the new details straight away.
    if (match && !hasAnyPoints(match)) commit({ ...match, meta: { ...match.meta, ...myDetails(st) } });
    showToast('Settings saved');
  };

  /** Open the reflection for a match; the current match is saved to History first so it can be linked to Jira. */
  const openReflection = async (m: Match) => {
    await archiveMatch(m);
    setReflecting(m);
  };
  const onReflectionSaved = (m: Match) => {
    setReflecting(m);
    setHistoryVersion((v) => v + 1);
    if (match && m.id === match.id) commit({ ...match, reflection: m.reflection, jira: m.jira });
  };

  if (!match) return <div class="flex h-full items-center justify-center text-slate-500">Loading…</div>;

  const left: PlayerKey = prefs.swappedSides ? 'p2' : 'p1';
  const right: PlayerKey = prefs.swappedSides ? 'p1' : 'p2';

  const tap = (side: PlayerKey, type: PointType) => {
    if (currentSet(match).completed) {
      setModal('setComplete');
      return;
    }
    haptic(20);
    const r = logPoint(match, side, type);
    commit(r.match);
    setBumpKey({ k: type === 'WINNER' ? side : side === 'p1' ? 'p2' : 'p1', n: Date.now() });
    if (r.matchCompleted) archiveMatch(r.match);
    if (r.setCompleted) {
      haptic([40, 60, 80]);
      setTimeout(() => setModal('setComplete'), 180);
    } else if (r.changeEnds) {
      setModal('changeEnds');
    }
  };

  const doUndo = () => {
    if (!hasAnyPoints(match)) return;
    haptic(15);
    commit(undo(match));
    showToast('Last point undone');
  };

  const newMatch = async () => {
    if (hasAnyPoints(match)) await archiveMatch(match);
    commit(
      createMatch(
        { league: match.meta.league, venue: match.meta.venue, p1Name: match.meta.p1Name, p1Team: match.meta.p1Team, ...myDetails(settings), matchDate: todayIso() },
        match.bestOf,
        match.matchInitialServer,
      ),
    );
    setModal(null);
    setTab('live');
    showToast(hasAnyPoints(match) ? 'Previous match saved to History' : 'New match started');
  };

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <Header match={match} left={left} right={right} onSettings={() => setModal('settings')} onSwap={() => { updatePrefs({ swappedSides: !prefs.swappedSides }); showToast('Sides swapped'); }} onReset={() => setModal('reset')} />
      {updateReady && (
        <button class="shrink-0 bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950" onClick={() => updateReady()}>
          New version available. Tap to update.
        </button>
      )}
      <SituationBanner match={match} onContinue={() => setModal('setComplete')} />

      <main class="relative flex min-h-0 flex-1 flex-col">
        {tab === 'live' && (
          <LiveView match={match} left={left} right={right} bump={bumpKey} onTap={tap} onUndo={doUndo} onToggleServer={() => {
            const m2 = toggleFirstServer(match);
            if (m2 === match) showToast('Server can only change before the first point');
            else { commit(m2); showToast(`${pname(m2, currentSet(m2).initialServer)} serves first`); }
          }} />
        )}
        {tab === 'stats' && <StatsView match={match} onReflect={() => openReflection(match)} onExport={() => setModal('export')} onCopy={async () => showToast((await copyText(reportText(match))) ? 'Report copied' : 'Copy not available')} />}
        {tab === 'history' && <HistoryView current={match} version={historyVersion} onReflect={(m) => setReflecting(m)} onToast={showToast} />}
        {tab === 'settings' && <SettingsView settings={settings} keepAwake={prefs.keepAwake} onSave={applySettings} onKeepAwake={(v) => updatePrefs({ keepAwake: v })} />}
      </main>

      <nav class="grid shrink-0 grid-cols-4 gap-1.5 border-t border-slate-800 bg-slate-900/95 px-3 pb-[max(0.5rem,var(--sab))] pt-1.5">
        {([
          ['live', 'live', 'Live'],
          ['stats', 'chart', 'Stats'],
          ['history', 'list', 'History'],
          ['settings', 'sliders', 'Settings'],
        ] as const).map(([t, icon, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            class={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-1.5 text-[11px] font-bold ${tab === t ? 'border-sky-500/30 bg-sky-500/15 text-sky-400' : 'border-transparent text-slate-400'}`}
            aria-current={tab === t ? 'page' : undefined}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>

      <SetCompleteModal
        open={modal === 'setComplete'}
        match={match}
        left={left}
        right={right}
        onNext={() => {
          setModal(null);
          if (isMatchOver(match)) setTab('stats');
          else { commit(startNextSet(match)); showToast(`Set ${match.currentSetIndex + 2} started`); }
        }}
        onUndo={() => { setModal(null); doUndo(); }}
        onStats={() => { setModal(null); setTab('stats'); }}
        onReflect={() => { setModal(null); openReflection(match); }}
        onClose={() => setModal(null)}
      />
      <SettingsModal open={modal === 'settings'} match={match} onClose={() => setModal(null)} onSave={(meta, bestOf) => {
        commit({ ...match, meta, bestOf });
        setModal(null);
        showToast('Match setup saved');
      }} />
      <Modal open={modal === 'reset'} onClose={() => setModal(null)} title="Start a new match?">
        <p class="text-sm text-slate-300">
          {hasAnyPoints(match) ? 'The current match will be saved to History first. Your details, league and venue are kept; the opponent is cleared.' : 'No points logged yet. Your details, league and venue are kept; the opponent is cleared.'}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button class="rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-200" onClick={() => setModal(null)}>Cancel</button>
          <button class="rounded-xl bg-rose-500 py-3 text-sm font-extrabold text-slate-950" onClick={newMatch}>New match</button>
        </div>
      </Modal>
      <Modal open={modal === 'changeEnds'} title="Change ends">
        <p class="text-sm text-slate-300">Deciding set: the first player has reached 5 points. Players change ends.</p>
        <div class="grid grid-cols-2 gap-2">
          <button class="rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-200" onClick={() => setModal(null)}>OK</button>
          <button class="rounded-xl bg-sky-500 py-3 text-sm font-extrabold text-slate-950" onClick={() => { updatePrefs({ swappedSides: !prefs.swappedSides }); setModal(null); }}>Swap screen sides</button>
        </div>
      </Modal>
      <ExportModal open={modal === 'export'} match={match} onClose={() => setModal(null)} onToast={showToast} />
      <ReflectionModal
        match={reflecting}
        settings={settings}
        onClose={() => setReflecting(null)}
        onSaved={onReflectionSaved}
        onToast={showToast}
        onOpenSettings={() => { setReflecting(null); setTab('settings'); }}
      />
      <Toast text={toast} />
    </div>
  );
}

/* ---------------- Header & banner ---------------- */

function Header({ match, left, right, onSettings, onSwap, onReset }: { match: Match; left: PlayerKey; right: PlayerKey; onSettings: () => void; onSwap: () => void; onReset: () => void }) {
  const sc = (s: Match['sets'][number], k: PlayerKey) => (k === 'p1' ? s.p1Score : s.p2Score);
  return (
    <header class="z-20 shrink-0 border-b border-slate-800/80 bg-slate-900/90 px-3 pb-2 pt-[max(0.5rem,var(--sat))]">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <button onClick={onSettings} class="press flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700/70 bg-slate-800/90 px-2.5 py-1.5 text-xs font-semibold text-slate-200" aria-label="Match setup">
            <Icon name="sliders" class="h-3.5 w-3.5 text-sky-400" />
            BO{match.bestOf}
          </button>
          <div class="flex min-w-0 items-center gap-1 overflow-x-auto">
            {match.sets.map((s, i) => (
              <span key={i} class={`score shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${i === match.currentSetIndex ? 'border-sky-500/50 bg-sky-500/20 text-sky-300' : 'border-slate-700 bg-slate-800/80 text-slate-400'}`}>
                {sc(s, left)}-{sc(s, right)}
              </span>
            ))}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <button onClick={onSwap} class="press flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-800/90 text-slate-300" aria-label="Swap sides">
            <Icon name="swap" />
          </button>
          <button onClick={onReset} class="press flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/70 bg-slate-800/90 text-rose-400" aria-label="New match">
            <Icon name="reset" />
          </button>
        </div>
      </div>
      <button onClick={onSettings} class="mt-1 flex w-full items-center justify-between gap-2 text-left text-[11px] text-slate-400">
        <span class="truncate">{[match.meta.league, match.meta.venue].filter(Boolean).join(' · ') || 'Tap to add league and venue'}</span>
        <span class="score shrink-0 rounded bg-slate-800/90 px-1.5 py-0.5 text-[10px] text-slate-300">{match.meta.matchDate}</span>
      </button>
    </header>
  );
}

function SituationBanner({ match, onContinue }: { match: Match; onContinue: () => void }) {
  const s = situation(match);
  if (s.kind === 'none') return null;
  const base = 'shrink-0 border-b px-3 py-1 text-center text-xs font-bold uppercase tracking-wider';
  if (s.kind === 'deuce') return <div class={`${base} border-amber-500/40 bg-amber-500/20 text-amber-300`}>Deuce: serve alternates every point</div>;
  if (s.kind === 'setPoint') return <div class={`${base} border-amber-500/40 bg-amber-500/20 text-amber-300`}>Set point: {pname(match, s.player)}</div>;
  if (s.kind === 'matchPoint') return <div class={`${base} border-rose-500/50 bg-rose-500/25 text-rose-200`}>Match point: {pname(match, s.player)}</div>;
  if (s.kind === 'matchOver') return <button onClick={onContinue} class={`${base} border-emerald-500/40 bg-emerald-500/20 text-emerald-300`}>{pname(match, s.player)} wins the match</button>;
  return <button onClick={onContinue} class={`${base} border-sky-500/40 bg-sky-500/20 text-sky-300`}>Set {match.currentSetIndex + 1} complete: tap to continue</button>;
}

/* ---------------- Live view ---------------- */

function LiveView({ match, left, right, bump, onTap, onUndo, onToggleServer }: {
  match: Match; left: PlayerKey; right: PlayerKey; bump: { k: PlayerKey; n: number } | null;
  onTap: (side: PlayerKey, type: PointType) => void; onUndo: () => void; onToggleServer: () => void;
}) {
  const s = currentSet(match);
  const srv = serverInfo(s, match.targetPoints);
  const won = setsWon(match);
  const st = stats([s]);
  const last = s.points.at(-1);
  const color = (k: PlayerKey) => (k === 'p1' ? { border: 'border-sky-500/45', dot: 'bg-sky-400', text: 'text-sky-400' } : { border: 'border-indigo-500/45', dot: 'bg-indigo-400', text: 'text-indigo-400' });

  const card = (k: PlayerKey) => (
    <div class={`relative flex flex-col justify-between rounded-xl border-2 bg-slate-950/80 p-2.5 ${color(k).border}`}>
      <div class="flex items-center justify-between gap-1">
        <div class="flex min-w-0 items-center gap-1.5">
          <span class={`h-2.5 w-2.5 shrink-0 rounded-full ${color(k).dot}`} />
          <span class="truncate text-sm font-bold text-slate-100">{pname(match, k)}</span>
        </div>
        <span class="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-0.5">
          <span class="text-[10px] font-bold uppercase text-slate-400">Sets</span>
          <span class={`score text-sm font-extrabold ${color(k).text}`}>{won[k]}</span>
        </span>
      </div>
      <div class="relative my-1.5 flex items-center justify-center">
        <div key={bump?.k === k ? bump.n : 0} class={`score text-6xl font-black leading-none text-white ${bump?.k === k ? 'bump' : ''}`}>{k === 'p1' ? s.p1Score : s.p2Score}</div>
        {srv.server === k && !s.completed && (
          <button onClick={onToggleServer} class="serve-badge absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-[10px] font-extrabold text-slate-950" aria-label={`${pname(match, k)} serving, ${srv.servesRemaining} left`}>
            <Icon name="ball" class="h-3 w-3" />
            {srv.servesRemaining}
          </button>
        )}
      </div>
      <div class="grid grid-cols-2 gap-1 border-t border-slate-800/80 pt-1.5 text-[11px]">
        <div class="flex justify-between rounded-lg border border-emerald-800/40 bg-emerald-950/50 px-1.5 py-0.5"><span class="font-semibold text-emerald-400">W</span><span class="score font-bold text-emerald-300">{st[k].winners}</span></div>
        <div class="flex justify-between rounded-lg border border-rose-800/40 bg-rose-950/50 px-1.5 py-0.5"><span class="font-semibold text-rose-400">UE</span><span class="score font-bold text-rose-300">{st[k].unforcedErrors}</span></div>
      </div>
    </div>
  );

  const pad = (k: PlayerKey) => {
    const opp = k === 'p1' ? 'p2' : 'p1';
    return (
      <div class="flex h-full min-h-0 flex-col gap-2.5">
        <button onClick={() => onTap(k, 'WINNER')} class="press flex min-h-0 flex-[1.15] flex-col overflow-hidden items-center justify-center rounded-2xl border-2 border-emerald-400/60 bg-gradient-to-b from-emerald-600/90 to-emerald-800/95 p-3 text-center shadow-lg">
          <Icon name="bolt" class="short-hide mb-1 h-7 w-7 text-emerald-200" />
          <span class="text-base font-extrabold leading-tight text-white">{pname(match, k)}</span>
          <span class="text-xs font-semibold text-emerald-200">Winner</span>
          <span class="mt-1.5 rounded-full border border-emerald-400/40 bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">+1 {pname(match, k)}</span>
        </button>
        <button onClick={() => onTap(k, 'UE')} class="press flex min-h-0 flex-1 flex-col overflow-hidden items-center justify-center rounded-2xl border-2 border-rose-400/50 bg-gradient-to-b from-rose-700/90 to-rose-900/95 p-3 text-center shadow-lg">
          <Icon name="warn" class="short-hide mb-1 h-6 w-6 text-rose-200" />
          <span class="text-sm font-extrabold leading-tight text-white">{pname(match, k)}</span>
          <span class="text-xs text-rose-200/90">Unforced error</span>
          <span class="mt-1.5 rounded-full border border-amber-400/40 bg-slate-950/65 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">+1 {pname(match, opp)}</span>
        </button>
      </div>
    );
  };

  const scoreStr = last ? `${last[left === 'p1' ? 'p1ScoreAfter' : 'p2ScoreAfter']}-${last[right === 'p1' ? 'p1ScoreAfter' : 'p2ScoreAfter']}` : '';

  return (
    <section class="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5">
      <div class="shrink-0 rounded-2xl border border-slate-800 bg-slate-900/95 p-2.5 shadow-xl">
        <div class="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold">
          <span class="font-bold uppercase tracking-wider text-sky-400">Set {match.currentSetIndex + 1} of {match.bestOf}</span>
          <button onClick={onToggleServer} class="rounded-full border border-slate-700/60 bg-slate-800/70 px-2 py-0.5 text-slate-400">
            {pname(match, srv.server)} serving ({srv.servesRemaining} left)
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2.5">{card(left)}{card(right)}</div>
      </div>
      <div class="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-900/90 px-3 py-2">
        <span class="truncate text-xs text-slate-400">
          {last ? (
            <>
              <b class="text-white">{scoreStr}</b> · {last.type === 'WINNER' ? <span class="font-semibold text-emerald-300">{pname(match, last.actor)} winner</span> : <span class="font-semibold text-rose-300">{pname(match, last.actor)} error</span>}
            </>
          ) : (
            `Set ${match.currentSetIndex + 1} ready: tap a button below`
          )}
        </span>
        <button onClick={onUndo} disabled={!hasAnyPoints(match)} class="press flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-amber-300 disabled:opacity-35">
          <Icon name="undo" class="h-3.5 w-3.5" /> Undo
        </button>
      </div>
      <div class="grid min-h-0 flex-1 grid-cols-2 gap-2.5">{pad(left)}{pad(right)}</div>
    </section>
  );
}

/* ---------------- Stats view ---------------- */

function StatRows({ match, filter }: { match: Match; filter: 'all' | number }) {
  const sets = filter === 'all' ? match.sets : [match.sets[filter]].filter(Boolean);
  const st = stats(sets);
  const a = st.p1;
  const b = st.p2;
  const rows: { label: string; v1: string; v2: string; n1: number; n2: number; c1: string; c2: string }[] = [
    { label: 'Points won', v1: `${a.pointsWon}`, v2: `${b.pointsWon}`, n1: a.pointsWon, n2: b.pointsWon, c1: 'bg-sky-400', c2: 'bg-indigo-400' },
    { label: 'Winners', v1: `${a.winners}`, v2: `${b.winners}`, n1: a.winners, n2: b.winners, c1: 'bg-emerald-400', c2: 'bg-emerald-400' },
    { label: 'Unforced errors', v1: `${a.unforcedErrors}`, v2: `${b.unforcedErrors}`, n1: a.unforcedErrors, n2: b.unforcedErrors, c1: 'bg-rose-500', c2: 'bg-rose-500' },
    {
      label: 'Serve points won',
      v1: `${a.servePtsWon}/${a.servePtsTotal} (${pct(a.servePtsWon, a.servePtsTotal)}%)`,
      v2: `${b.servePtsWon}/${b.servePtsTotal} (${pct(b.servePtsWon, b.servePtsTotal)}%)`,
      n1: pct(a.servePtsWon, a.servePtsTotal), n2: pct(b.servePtsWon, b.servePtsTotal), c1: 'bg-amber-400', c2: 'bg-amber-400',
    },
  ];
  return (
    <div class="space-y-3.5">
      {rows.map((r) => {
        const sum = r.n1 + r.n2;
        const p1 = sum > 0 ? Math.round((r.n1 / sum) * 100) : 50;
        return (
          <div key={r.label} class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="score font-extrabold text-white">{r.v1}</span>
              <span class="font-semibold text-slate-400">{r.label}</span>
              <span class="score font-extrabold text-white">{r.v2}</span>
            </div>
            <div class="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div class={`${r.c1} h-full`} style={{ width: `${p1}%` }} />
              <div class={`${r.c2} h-full opacity-75`} style={{ width: `${100 - p1}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatsView({ match, onReflect, onExport, onCopy }: { match: Match; onReflect: () => void; onExport: () => void; onCopy: () => void }) {
  const [filter, setFilter] = useState<'all' | number>('all');
  const sets = filter === 'all' ? match.sets : [match.sets[filter]].filter(Boolean);
  const pts = useMemo(
    () => sets.flatMap((s) => s.points.map((p, i) => ({ ...p, setNum: match.sets.indexOf(s) + 1, n: i + 1 }))).reverse(),
    [match, filter],
  );
  return (
    <section class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2.5">
        <div class="flex gap-1.5 overflow-x-auto">
          <button onClick={() => setFilter('all')} class={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${filter === 'all' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>Match</button>
          {match.sets.map((s, i) => (
            <button key={i} onClick={() => setFilter(i)} class={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${filter === i ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
              S{i + 1} {s.p1Score}-{s.p2Score}
            </button>
          ))}
        </div>
        <div class="flex gap-1.5">
          <button onClick={onExport} class="press flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-950"><Icon name="share" class="h-3.5 w-3.5" /> Export</button>
          <button onClick={onCopy} class="press rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200">Copy</button>
        </div>
      </div>
      <button onClick={onReflect} disabled={!hasAnyPoints(match)} class="press flex w-full items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-left text-sm font-bold text-emerald-200 disabled:opacity-40">
        <span>Reflection & Save to Jira</span>
        <span class="text-xs text-emerald-300">{match.jira ? match.jira.key : match.reflection ? 'draft saved' : '→'}</span>
      </button>
      <div class="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/95 p-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3 text-sm font-extrabold">
          <span class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-sky-400" />{match.meta.p1Name}</span>
          <span class="flex items-center gap-2">{match.meta.p2Name}<span class="h-3 w-3 rounded-full bg-indigo-400" /></span>
        </div>
        <StatRows match={match} filter={filter} />
      </div>
      <div class="rounded-2xl border border-slate-800 bg-slate-900/95 p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">Point by point</h3>
          <span class="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-400">{pts.length} pts</span>
        </div>
        {pts.length === 0 ? (
          <p class="py-6 text-center text-xs text-slate-500">No points logged yet.</p>
        ) : (
          <ul class="max-h-80 space-y-1.5 overflow-y-auto">
            {pts.map((p) => (
              <li key={p.id} class="flex items-center justify-between rounded-xl border border-slate-800/90 bg-slate-950/80 px-3 py-2 text-xs">
                <div class="flex items-center gap-2.5">
                  <span class="score text-[11px] font-bold text-slate-400">S{p.setNum}</span>
                  <span class="score rounded-md bg-slate-800 px-2 py-0.5 text-sm font-extrabold text-white">{p.p1ScoreAfter}-{p.p2ScoreAfter}</span>
                  <div>
                    <div class="font-bold text-slate-200">{pname(match, p.actor)} {p.type === 'WINNER' ? 'winner' : 'unforced error'}</div>
                    <div class="text-[10px] text-slate-500">Serve: {pname(match, p.server)} · {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
                <span class={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${p.type === 'WINNER' ? 'border-emerald-700/50 bg-emerald-950/90 text-emerald-300' : 'border-rose-700/50 bg-rose-950/90 text-rose-300'}`}>{p.type === 'WINNER' ? 'W' : 'UE'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------------- History view ---------------- */

function HistoryView({ current, version, onReflect, onToast }: { current: Match; version: number; onReflect: (m: Match) => void; onToast: (t: string) => void }) {
  const [items, setItems] = useState<Match[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const reload = () => listArchive().then(setItems);
  useEffect(() => { reload(); }, [current, version]);

  return (
    <section class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {isIos() && !isStandalone() && (
        <div class="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <b>Install for offline use:</b> tap Share in Safari, then <b>Add to Home Screen</b>. Installed, the app keeps its data reliably.
        </div>
      )}
      <div class="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-3">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Saved on this device</span>
        <button
          class="press rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-emerald-300 disabled:opacity-40"
          disabled={!hasAnyPoints(current)}
          onClick={async () => { await archiveMatch(current); await reload(); onToast('Current match saved'); }}
        >
          + Save current match
        </button>
      </div>
      {items === null ? null : items.length === 0 ? (
        <p class="py-6 text-center text-xs text-slate-500">No saved matches yet. Matches are saved when they finish or when you start a new one.</p>
      ) : (
        <ul class="space-y-2">
          {items.map((m) => {
            const w = setsWon(m);
            const win = matchWinner(m);
            return (
              <li key={m.id} class="rounded-xl border border-slate-800 bg-slate-950/85 p-3 text-xs">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate font-bold text-white">{m.meta.p1Name} vs {m.meta.p2Name}{m.meta.p2Ttr ? ` (${m.meta.p2Ttr})` : ''}</div>
                    <div class="truncate text-[11px] text-slate-400">
                      <span class="score font-bold text-sky-400">{w.p1}-{w.p2}</span> ({m.sets.map((s) => `${s.p1Score}-${s.p2Score}`).join(', ')}) · {m.meta.matchDate}
                      {win ? '' : ' · unfinished'}
                    </div>
                  </div>
                  <div class="flex shrink-0 gap-1.5">
                    <button class="rounded-lg border border-emerald-700/60 bg-emerald-950 px-2 py-1 text-[10px] font-bold text-emerald-300" onClick={() => share(m, 'csv')}>CSV</button>
                    <button class="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200" onClick={() => share(m, 'json')}>JSON</button>
                    <button class="rounded-lg bg-slate-800 px-2 py-1 text-slate-400" aria-label="Delete" onClick={() => setConfirmId(m.id)}><Icon name="trash" class="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <button onClick={() => onReflect(m)} class="mt-2 flex w-full items-center justify-between rounded-lg border border-emerald-700/50 bg-emerald-950/60 px-3 py-2 text-[11px] font-bold text-emerald-200">
                  <span>Reflection & Jira</span>
                  <span class={m.jira ? 'text-sky-300' : 'text-emerald-400'}>{m.jira ? `✓ ${m.jira.key}` : m.reflection ? 'not in Jira yet' : 'add reflection'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={confirmId !== null} onClose={() => setConfirmId(null)} title="Delete saved match?">
        <p class="text-sm text-slate-300">This removes it from this device. It cannot be undone.</p>
        <div class="grid grid-cols-2 gap-2">
          <button class="rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-200" onClick={() => setConfirmId(null)}>Cancel</button>
          <button class="rounded-xl bg-rose-500 py-3 text-sm font-extrabold text-slate-950" onClick={async () => { await deleteArchived(confirmId!); setConfirmId(null); await reload(); onToast('Deleted'); }}>Delete</button>
        </div>
      </Modal>
    </section>
  );
}

/* ---------------- Modals ---------------- */

function SetCompleteModal({ open, match, left, right, onNext, onUndo, onStats, onReflect, onClose }: {
  open: boolean; match: Match; left: PlayerKey; right: PlayerKey; onNext: () => void; onUndo: () => void; onStats: () => void; onReflect: () => void; onClose: () => void;
}) {
  if (!open) return null;
  const s = currentSet(match);
  if (!s.completed) return null;
  const over = isMatchOver(match);
  const w = setsWon(match);
  const st = stats([s]);
  const sc = (k: PlayerKey) => (k === 'p1' ? s.p1Score : s.p2Score);
  return (
    <Modal open onClose={onClose} title={over ? `Match complete (${w.p1}-${w.p2})` : `Set ${match.currentSetIndex + 1} complete`}>
      <div class="space-y-1 text-center">
        <p class="text-xl font-black text-white">{pname(match, s.winner!)} wins {over ? 'the match' : `set ${match.currentSetIndex + 1}`}</p>
        <p class="score text-3xl font-black text-amber-400">{sc(left)} - {sc(right)}</p>
      </div>
      <div class="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 text-xs">
        <div class="grid grid-cols-3 border-b border-slate-800 pb-1 font-semibold text-slate-400">
          <span class="truncate text-left text-sky-400">{match.meta.p1Name}</span><span class="text-center text-[10px] uppercase">Set</span><span class="truncate text-right text-indigo-400">{match.meta.p2Name}</span>
        </div>
        <div class="grid grid-cols-3"><span class="score font-bold text-emerald-400">{st.p1.winners}</span><span class="text-center text-slate-300">Winners</span><span class="score text-right font-bold text-emerald-400">{st.p2.winners}</span></div>
        <div class="grid grid-cols-3"><span class="score font-bold text-rose-400">{st.p1.unforcedErrors}</span><span class="text-center text-slate-300">Unforced errors</span><span class="score text-right font-bold text-rose-400">{st.p2.unforcedErrors}</span></div>
      </div>
      {over && <button onClick={onReflect} class="w-full rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-slate-950">Reflection & Save to Jira</button>}
      <button onClick={onNext} class={`w-full rounded-xl py-3 text-sm font-extrabold ${over ? 'border border-slate-700 bg-slate-800 text-slate-200' : 'bg-sky-500 text-slate-950'}`}>{over ? 'View match stats' : `Start set ${match.currentSetIndex + 2}`}</button>
      <div class="grid grid-cols-2 gap-2">
        <button onClick={onUndo} class="rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-amber-300">Undo last point</button>
        <button onClick={onStats} class="rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-200">Full stats</button>
      </div>
    </Modal>
  );
}

function SettingsModal({ open, match, onClose, onSave }: {
  open: boolean; match: Match; onClose: () => void; onSave: (meta: MatchMeta, bestOf: Match['bestOf']) => void;
}) {
  const [meta, setMeta] = useState<MatchMeta>(match.meta);
  const [bestOf, setBestOf] = useState(match.bestOf);
  // Reset the draft each time the dialog opens: changes apply only on Save.
  useEffect(() => {
    if (open) { setMeta(match.meta); setBestOf(match.bestOf); }
  }, [open]);
  const locked = hasAnyPoints(match);
  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-base text-white outline-none focus:border-sky-400';
  const field = (k: keyof MatchMeta, label: string, opts: { type?: 'text' | 'date'; max?: number } = {}) => (
    <label class="block space-y-1">
      <span class="text-[11px] font-medium text-slate-400">{label}</span>
      {opts.type === 'date' ? (
        <input type="date" value={meta[k]} onInput={(e) => setMeta({ ...meta, [k]: (e.target as HTMLInputElement).value })} class={inputClass} />
      ) : (
        <input type="text" maxLength={opts.max} value={meta[k]} onInput={(e) => setMeta({ ...meta, [k]: (e.target as HTMLInputElement).value })} class={inputClass} />
      )}
    </label>
  );
  return (
    <Modal open={open} onClose={onClose} title="Match setup">
      <div class="grid grid-cols-2 gap-2.5">
        {field('p1Name', 'You', { max: 24 })}
        {field('p2Name', 'Opponent', { max: 32 })}
        {field('p1Team', 'Your club / team', { max: 32 })}
        {field('p2Team', 'Opponent club / team', { max: 32 })}
        {field('matchDate', 'Date', { type: 'date' })}
        {field('p2Ttr', 'Opponent TTR', { max: 6 })}
      </div>
      {field('venue', 'Venue', { max: 40 })}
      {field('league', 'League / competition', { max: 60 })}
      <div class="space-y-2">
        <span class="block text-xs font-bold uppercase tracking-wider text-slate-400">Format (11 points, win by 2)</span>
        <div class="grid grid-cols-3 gap-2">
          {([3, 5, 7] as const).map((n) => (
            <button key={n} disabled={locked && n !== bestOf} onClick={() => setBestOf(n)} class={`rounded-xl border py-2.5 text-xs font-bold disabled:opacity-35 ${bestOf === n ? 'border-sky-400 bg-sky-500/20 text-sky-300' : 'border-slate-700 bg-slate-950 text-slate-400'}`}>
              Best of {n}
            </button>
          ))}
        </div>
        {locked && <p class="text-[11px] text-slate-500">Format is fixed once the first point is logged.</p>}
      </div>
      <button
        onClick={() => onSave({ ...meta, p1Name: meta.p1Name.trim() || 'Player 1', p2Name: meta.p2Name.trim() || 'Player 2', p2Ttr: meta.p2Ttr.trim(), matchDate: meta.matchDate || todayIso() }, bestOf)}
        class="w-full rounded-xl bg-sky-500 py-3 text-sm font-extrabold text-slate-950"
      >
        Save
      </button>
    </Modal>
  );
}

function ExportModal({ open, match, onClose, onToast }: { open: boolean; match: Match; onClose: () => void; onToast: (t: string) => void }) {
  const doShare = async (f: Format) => {
    const r = await share(match, f);
    if (r === 'shared') onToast('Shared');
    if (r === 'downloaded') onToast('File downloaded');
  };
  return (
    <Modal open={open} onClose={onClose} title="Export match">
      <p class="text-xs text-slate-400">Opens the share sheet: pick Google Drive, Files, Mail or any other app. Falls back to a download where sharing is not available.</p>
      <div class="grid grid-cols-3 gap-2">
        <button onClick={() => doShare('csv')} class="rounded-xl bg-emerald-500 py-3 text-xs font-extrabold text-slate-950">CSV</button>
        <button onClick={() => doShare('txt')} class="rounded-xl border border-slate-700 bg-slate-800 py-3 text-xs font-bold text-slate-200">Report</button>
        <button onClick={() => doShare('json')} class="rounded-xl border border-slate-700 bg-slate-800 py-3 text-xs font-bold text-slate-200">JSON</button>
      </div>
      <button onClick={() => { download(match, 'csv'); onToast('CSV downloaded'); }} class="w-full text-center text-[11px] font-bold text-sky-400">Download CSV instead</button>
    </Modal>
  );
}
