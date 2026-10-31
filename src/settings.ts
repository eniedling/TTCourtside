// App-wide settings: my details and the Jira connection. Stored on the phone (IndexedDB).

export interface JiraFieldMap {
  spieltag: string;
  mood: string;
  ownGame: string;
  concentration: string;
  motivation: string;
  opponentGame: string;
  wentWell: string;
  wentBadly: string;
  improve: string;
}

export interface JiraSettings {
  site: string; // e.g. eniedling.atlassian.net
  email: string;
  token: string;
  relayUrl: string; // Cloudflare Worker that forwards calls to Jira (Jira sends no CORS headers)
  projectKey: string;
  issueTypeId: string;
  labelWin: string;
  labelLoss: string;
  fields: JiraFieldMap;
}

export interface AppSettings {
  myName: string;
  myClub: string;
  jira: JiraSettings;
}

/** Defaults match Jira project TT1 as read on 2026-10-31. */
export const defaultFieldMap: JiraFieldMap = {
  spieltag: 'customfield_10060',
  mood: 'customfield_10052',
  ownGame: 'customfield_10053',
  concentration: 'customfield_10054',
  motivation: 'customfield_10055',
  opponentGame: 'customfield_10056',
  wentWell: 'customfield_10057',
  wentBadly: 'customfield_10058',
  improve: 'customfield_10059',
};

export const fieldLabels: Record<keyof JiraFieldMap, string> = {
  spieltag: 'Spieltag',
  mood: 'Stimmung',
  ownGame: 'Eigenes Spiel',
  concentration: 'Konzentration',
  motivation: 'Motivation',
  opponentGame: "Gegner's Spiel",
  wentWell: 'Was lief gut?',
  wentBadly: 'Was lief nicht so gut?',
  improve: 'Was kann ich verbessern?',
};

export const defaultSettings = (): AppSettings => ({
  myName: '',
  myClub: '',
  jira: {
    site: 'eniedling.atlassian.net',
    email: '',
    token: '',
    relayUrl: '',
    projectKey: 'TT1',
    issueTypeId: '10006',
    labelWin: 'Gewonnen',
    labelLoss: 'Verloren',
    fields: { ...defaultFieldMap },
  },
});

export function normalizeSettings(s: Partial<AppSettings> | undefined): AppSettings {
  const d = defaultSettings();
  if (!s) return d;
  return {
    ...d,
    ...s,
    jira: { ...d.jira, ...(s.jira ?? {}), fields: { ...d.jira.fields, ...(s.jira?.fields ?? {}) } },
  };
}

export const jiraConfigured = (j: JiraSettings): boolean =>
  Boolean(j.site && j.email && j.token && j.relayUrl && j.projectKey && j.issueTypeId);
