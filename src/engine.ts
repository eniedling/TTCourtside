// Pure scoring rules for a table tennis singles match. No DOM, no storage: unit-tested in engine.test.ts.

export type PlayerKey = 'p1' | 'p2';
export type PointType = 'WINNER' | 'UE';

export interface Point {
  id: string;
  pointWinner: PlayerKey;
  actor: PlayerKey; // who hit the winner or made the error
  type: PointType;
  server: PlayerKey;
  p1ScoreAfter: number;
  p2ScoreAfter: number;
  timestamp: string; // ISO 8601
}

export interface GameSet {
  initialServer: PlayerKey;
  p1Score: number;
  p2Score: number;
  completed: boolean;
  winner: PlayerKey | null;
  points: Point[];
  endsChangedPrompted?: boolean;
}

export interface MatchMeta {
  p1Name: string;
  p2Name: string;
  p1Team: string;
  p2Team: string;
  matchDate: string; // YYYY-MM-DD
  venue: string;
  league: string;
}

export interface Match {
  id: string;
  createdAt: string;
  meta: MatchMeta;
  bestOf: 3 | 5 | 7;
  targetPoints: number;
  matchInitialServer: PlayerKey;
  currentSetIndex: number;
  sets: GameSet[];
}

export const other = (p: PlayerKey): PlayerKey => (p === 'p1' ? 'p2' : 'p1');

export function todayIso(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createSet(initialServer: PlayerKey): GameSet {
  return { initialServer, p1Score: 0, p2Score: 0, completed: false, winner: null, points: [] };
}

export function createMatch(meta?: Partial<MatchMeta>, bestOf: 3 | 5 | 7 = 5, firstServer: PlayerKey = 'p1'): Match {
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    meta: {
      p1Name: 'Player 1',
      p2Name: 'Player 2',
      p1Team: '',
      p2Team: '',
      matchDate: todayIso(),
      venue: '',
      league: '',
      ...meta,
    },
    bestOf,
    targetPoints: 11,
    matchInitialServer: firstServer,
    currentSetIndex: 0,
    sets: [createSet(firstServer)],
  };
}

export const currentSet = (m: Match): GameSet => m.sets[m.currentSetIndex];

/** ITTF service: alternate every 2 points; from 10:10 every point. */
export function serverInfo(s: GameSet, target = 11): { server: PlayerKey; servesRemaining: number } {
  const total = s.p1Score + s.p2Score;
  const first = s.initialServer;
  const deuceAt = (target - 1) * 2;
  if (total < deuceAt) {
    const block = Math.floor(total / 2);
    return { server: block % 2 === 0 ? first : other(first), servesRemaining: 2 - (total % 2) };
  }
  return { server: (total - deuceAt) % 2 === 0 ? first : other(first), servesRemaining: 1 };
}

export function setsWon(m: Match): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (const s of m.sets) {
    if (s.completed && s.winner === 'p1') p1++;
    if (s.completed && s.winner === 'p2') p2++;
  }
  return { p1, p2 };
}

export const setsNeeded = (m: Match): number => Math.ceil(m.bestOf / 2);

export function isMatchOver(m: Match): boolean {
  const w = setsWon(m);
  return w.p1 >= setsNeeded(m) || w.p2 >= setsNeeded(m);
}

export function matchWinner(m: Match): PlayerKey | null {
  if (!isMatchOver(m)) return null;
  const w = setsWon(m);
  return w.p1 > w.p2 ? 'p1' : 'p2';
}

/** True if the current set is the last possible one (e.g. set 5 in best of 5). */
export const isDecidingSet = (m: Match): boolean => m.currentSetIndex === m.bestOf - 1;

function isSetFinished(p1: number, p2: number, target: number): boolean {
  return (p1 >= target || p2 >= target) && Math.abs(p1 - p2) >= 2;
}

export interface PointResult {
  match: Match;
  setCompleted: boolean;
  matchCompleted: boolean;
  /** ITTF: in the deciding set, players change ends when the first player reaches 5 points. */
  changeEnds: boolean;
}

/**
 * Log a point. `side` is the player whose button was tapped.
 * WINNER: that player won the rally with a winner. UE: that player made an unforced error, the opponent scores.
 */
export function logPoint(m: Match, side: PlayerKey, type: PointType, now = new Date()): PointResult {
  const match = structuredClone(m);
  const s = currentSet(match);
  if (s.completed || isMatchOver(match)) {
    return { match: m, setCompleted: false, matchCompleted: isMatchOver(m), changeEnds: false };
  }
  const { server } = serverInfo(s, match.targetPoints);
  const pointWinner = type === 'WINNER' ? side : other(side);
  if (pointWinner === 'p1') s.p1Score++;
  else s.p2Score++;
  s.points.push({
    id: newId(),
    pointWinner,
    actor: side,
    type,
    server,
    p1ScoreAfter: s.p1Score,
    p2ScoreAfter: s.p2Score,
    timestamp: now.toISOString(),
  });

  let changeEnds = false;
  if (isDecidingSet(match) && !s.endsChangedPrompted && Math.max(s.p1Score, s.p2Score) === 5) {
    s.endsChangedPrompted = true;
    changeEnds = true;
  }

  let setCompleted = false;
  if (isSetFinished(s.p1Score, s.p2Score, match.targetPoints)) {
    s.completed = true;
    s.winner = s.p1Score > s.p2Score ? 'p1' : 'p2';
    setCompleted = true;
  }
  return { match, setCompleted, matchCompleted: isMatchOver(match), changeEnds };
}

/** Start the next set; the player who did not serve first in the previous set serves first. */
export function startNextSet(m: Match): Match {
  if (!currentSet(m).completed || isMatchOver(m)) return m;
  const match = structuredClone(m);
  match.sets.push(createSet(other(currentSet(match).initialServer)));
  match.currentSetIndex = match.sets.length - 1;
  return match;
}

/** Undo the last point; steps back into the previous set if the current one is still 0:0. */
export function undo(m: Match): Match {
  const match = structuredClone(m);
  let s = currentSet(match);
  if (s.points.length === 0 && match.currentSetIndex > 0) {
    match.sets.pop();
    match.currentSetIndex--;
    s = currentSet(match);
  }
  if (s.points.length === 0) return m;
  s.points.pop();
  s.completed = false;
  s.winner = null;
  s.p1Score = s.points.filter((p) => p.pointWinner === 'p1').length;
  s.p2Score = s.points.length - s.p1Score;
  if (Math.max(s.p1Score, s.p2Score) < 5) s.endsChangedPrompted = false;
  return match;
}

/** Switch who serves first in the current set (only before its first point). */
export function toggleFirstServer(m: Match): Match {
  const s = currentSet(m);
  if (s.points.length > 0) return m;
  const match = structuredClone(m);
  const cs = currentSet(match);
  cs.initialServer = other(cs.initialServer);
  if (match.currentSetIndex === 0) match.matchInitialServer = cs.initialServer;
  return match;
}

export const hasAnyPoints = (m: Match): boolean => m.sets.some((s) => s.points.length > 0);

export type Situation =
  | { kind: 'none' }
  | { kind: 'deuce' }
  | { kind: 'setPoint' | 'matchPoint'; player: PlayerKey }
  | { kind: 'setOver' }
  | { kind: 'matchOver'; player: PlayerKey };

export function situation(m: Match): Situation {
  const s = currentSet(m);
  if (isMatchOver(m)) return { kind: 'matchOver', player: matchWinner(m)! };
  if (s.completed) return { kind: 'setOver' };
  const t = m.targetPoints;
  const { p1Score: a, p2Score: b } = s;
  if (a >= t - 1 && b >= t - 1 && a === b) return { kind: 'deuce' };
  let leader: PlayerKey | null = null;
  if (a >= t - 1 && a > b) leader = 'p1';
  if (b >= t - 1 && b > a) leader = 'p2';
  if (!leader) return { kind: 'none' };
  const won = setsWon(m)[leader];
  return { kind: won + 1 >= setsNeeded(m) ? 'matchPoint' : 'setPoint', player: leader };
}

export interface PlayerStats {
  pointsWon: number;
  winners: number;
  unforcedErrors: number;
  servePtsWon: number;
  servePtsTotal: number;
}

export function stats(sets: GameSet[]): { totalPoints: number; p1: PlayerStats; p2: PlayerStats } {
  const blank = (): PlayerStats => ({ pointsWon: 0, winners: 0, unforcedErrors: 0, servePtsWon: 0, servePtsTotal: 0 });
  const res = { totalPoints: 0, p1: blank(), p2: blank() };
  for (const s of sets) {
    for (const pt of s.points) {
      res.totalPoints++;
      res[pt.pointWinner].pointsWon++;
      if (pt.type === 'WINNER') res[pt.actor].winners++;
      else res[pt.actor].unforcedErrors++;
      res[pt.server].servePtsTotal++;
      if (pt.pointWinner === pt.server) res[pt.server].servePtsWon++;
    }
  }
  return res;
}

export const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);
