import { describe, expect, it } from 'vitest';
import {
  createMatch,
  currentSet,
  isMatchOver,
  logPoint,
  matchWinner,
  serverInfo,
  setsWon,
  situation,
  startNextSet,
  stats,
  toggleFirstServer,
  undo,
  type Match,
  type PlayerKey,
} from './engine';

/** Play points where `seq` is a string like '1121', each char = the player who wins with a winner. */
function play(m: Match, seq: string): { m: Match; changeEnds: boolean[] } {
  const ce: boolean[] = [];
  for (const c of seq) {
    const r = logPoint(m, (c === '1' ? 'p1' : 'p2') as PlayerKey, 'WINNER');
    m = r.match;
    ce.push(r.changeEnds);
  }
  return { m, changeEnds: ce };
}

const winSet = (m: Match, p: '1' | '2') => startNextSet(play(m, p.repeat(11)).m);

describe('service rotation', () => {
  it('alternates every two points before 10:10', () => {
    let m = createMatch();
    const servers: string[] = [];
    for (let i = 0; i < 8; i++) {
      servers.push(serverInfo(currentSet(m)).server);
      m = play(m, i % 2 ? '1' : '2').m;
    }
    expect(servers).toEqual(['p1', 'p1', 'p2', 'p2', 'p1', 'p1', 'p2', 'p2']);
  });

  it('alternates every point from 10:10', () => {
    let m = play(createMatch(), '12'.repeat(10)).m; // 10:10
    expect(currentSet(m).p1Score).toBe(10);
    expect(serverInfo(currentSet(m))).toEqual({ server: 'p1', servesRemaining: 1 });
    m = play(m, '1').m; // 11:10
    expect(serverInfo(currentSet(m)).server).toBe('p2');
  });

  it('swaps the first server each set', () => {
    const m = winSet(createMatch(), '1');
    expect(currentSet(m).initialServer).toBe('p2');
  });

  it('first server can be toggled only before the first point', () => {
    const m = toggleFirstServer(createMatch());
    expect(currentSet(m).initialServer).toBe('p2');
    const after = play(m, '1').m;
    expect(toggleFirstServer(after)).toBe(after);
  });
});

describe('sets and match', () => {
  it('needs a two-point lead', () => {
    let m = play(createMatch(), '12'.repeat(10) + '1').m; // 11:10
    expect(currentSet(m).completed).toBe(false);
    m = play(m, '1').m; // 12:10
    expect(currentSet(m).completed).toBe(true);
    expect(currentSet(m).winner).toBe('p1');
  });

  it('ends a best of 5 at three sets', () => {
    let m = createMatch(undefined, 5);
    m = winSet(m, '1');
    m = winSet(m, '2');
    m = winSet(m, '1');
    m = play(m, '1'.repeat(11)).m;
    expect(setsWon(m)).toEqual({ p1: 3, p2: 1 });
    expect(isMatchOver(m)).toBe(true);
    expect(matchWinner(m)).toBe('p1');
    // no more points after match end
    expect(logPoint(m, 'p2', 'WINNER').match).toBe(m);
  });

  it('unforced error gives the point to the opponent', () => {
    const r = logPoint(createMatch(), 'p1', 'UE');
    expect(currentSet(r.match).p2Score).toBe(1);
    const st = stats(r.match.sets);
    expect(st.p1.unforcedErrors).toBe(1);
    expect(st.p2.pointsWon).toBe(1);
  });
});

describe('change of ends in the deciding set', () => {
  it('prompts once when the first player reaches 5', () => {
    let m = createMatch(undefined, 3);
    m = winSet(m, '1');
    m = winSet(m, '2'); // set 3 = deciding
    const r = play(m, '11112' + '1');
    expect(r.changeEnds).toEqual([false, false, false, false, false, true]);
    expect(play(r.m, '1').changeEnds).toEqual([false]);
  });

  it('does not prompt in a non-deciding set', () => {
    const r = play(createMatch(undefined, 3), '11111');
    expect(r.changeEnds.some(Boolean)).toBe(false);
  });
});

describe('undo', () => {
  it('recomputes the score', () => {
    const m = undo(play(createMatch(), '112').m);
    expect([currentSet(m).p1Score, currentSet(m).p2Score]).toEqual([2, 0]);
  });

  it('steps back into the previous set', () => {
    let m = winSet(createMatch(), '1');
    expect(m.currentSetIndex).toBe(1);
    m = undo(m);
    expect(m.currentSetIndex).toBe(0);
    expect(currentSet(m).p1Score).toBe(10);
    expect(currentSet(m).completed).toBe(false);
  });

  it('is a no-op on an empty match', () => {
    const m = createMatch();
    expect(undo(m)).toBe(m);
  });
});

describe('situation', () => {
  it('detects set point, match point and deuce', () => {
    let m = play(createMatch(undefined, 3), '1'.repeat(10)).m;
    expect(situation(m)).toEqual({ kind: 'setPoint', player: 'p1' });
    m = play(createMatch(undefined, 3), '1'.repeat(11)).m;
    m = startNextSet(m);
    m = play(m, '1'.repeat(10)).m;
    expect(situation(m)).toEqual({ kind: 'matchPoint', player: 'p1' });
    m = play(m, '2'.repeat(10)).m;
    expect(situation(m)).toEqual({ kind: 'deuce' });
  });
});

describe('stats', () => {
  it('counts serve points won', () => {
    const m = play(createMatch(), '1212').m; // p1 serves pts 1-2, p2 serves 3-4
    const st = stats(m.sets);
    expect(st.p1.servePtsTotal).toBe(2);
    expect(st.p1.servePtsWon).toBe(1);
    expect(st.p2.servePtsWon).toBe(1);
  });
});
