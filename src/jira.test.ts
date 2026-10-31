import { describe, expect, it } from 'vitest';
import { createMatch, emptyReflection, logPoint, startNextSet, type Match } from './engine';
import { createBody, issueSummary, updateBody } from './jira';
import { defaultSettings } from './settings';

const j = defaultSettings().jira;
const now = new Date('2026-10-31T12:00:00Z');

function wonMatch(): Match {
  let m = createMatch({ p1Name: 'Me', p2Name: 'Kai Schwenk', p2Team: 'Ergewa III', p2Ttr: '1257', matchDate: '2026-10-30' }, 3);
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < 11; i++) m = logPoint(m, 'p1', 'WINNER').match;
    m = startNextSet(m);
  }
  return m;
}

describe('issue summary', () => {
  it('uses the TT1 title format', () => {
    expect(issueSummary(wonMatch())).toBe('Ergewa III: Kai Schwenk (1257)');
  });
  it('drops empty club and TTR', () => {
    expect(issueSummary(createMatch({ p2Name: 'Anna' }))).toBe('Anna');
  });
});

describe('create body', () => {
  it('maps fields to TT1 custom fields', () => {
    const m = wonMatch();
    m.reflection = { ...emptyReflection(), mood: 'Positiv', concentration: 85, concentrationNote: 'Satz 2 schwächer', wentWell: 'Aufschlag', flow: 7 };
    const b = createBody(m, j, now).fields as Record<string, unknown>;
    expect(b.project).toEqual({ key: 'TT1' });
    expect(b.issuetype).toEqual({ id: '10006' });
    expect(b.labels).toEqual(['Gewonnen']);
    expect(b.customfield_10060).toBe('2026-10-30');
    expect(b.customfield_10052).toBe('Positiv');
    expect(b.customfield_10054).toBe('85 %\nSatz 2 schwächer');
    expect(b.customfield_10057).toBe('Aufschlag');
    expect(b).not.toHaveProperty('customfield_10053'); // empty answers are left out
    expect(String(b.description)).toContain('Ergebnis: Sieg 2:0 (11:0, 11:0)');
    expect(String(b.description)).toContain('Flow: 7/10');
  });

  it('adds no result label for an unfinished match', () => {
    const b = createBody(createMatch({ p2Name: 'X' }), j, now).fields as Record<string, unknown>;
    expect(b).not.toHaveProperty('labels');
  });
});

describe('update body', () => {
  it('swaps only the result label and never touches project or type', () => {
    const b = updateBody(wonMatch(), j, now);
    expect(b.update).toEqual({ labels: [{ remove: 'Verloren' }, { add: 'Gewonnen' }] });
    expect(b.fields).not.toHaveProperty('project');
    expect(b.fields).not.toHaveProperty('issuetype');
    expect(b.fields).not.toHaveProperty('labels');
  });
});
