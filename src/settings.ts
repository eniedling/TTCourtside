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
  site: string; // e.g. eniedling.atlassian.net (used for "open in Jira" links)
  cloudId: string; // Atlassian Cloud ID of the site; API calls go to api.atlassian.com/ex/jira/<cloudId>
  token: string; // service account API token, sent as a Bearer token (no personal email needed)
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
    cloudId: '39a9aad7-33ec-4517-abd1-5018051629c0',
    token: '',
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
  const j = { ...d.jira, ...(s.jira ?? {}), fields: { ...d.jira.fields, ...(s.jira?.fields ?? {}) } };
  // Drop settings from v0.2 (email + relay), which are no longer used.
  delete (j as Record<string, unknown>).email;
  delete (j as Record<string, unknown>).relayUrl;
  return { ...d, ...s, jira: j };
}

export const jiraConfigured = (j: JiraSettings): boolean =>
  Boolean(j.site && j.cloudId && j.token && j.projectKey && j.issueTypeId);
