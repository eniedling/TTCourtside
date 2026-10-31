# Jira relay (Cloudflare Worker)

Jira Cloud does not send CORS headers, so Safari blocks calls from the app straight to Jira.
This worker forwards the calls and adds those headers. It stores nothing: your API token stays
in the app's settings on your phone and travels with each call.

It only forwards to the Jira sites in `ALLOWED_HOSTS`, only `/rest/api/...` paths, and only for
calls coming from `ALLOWED_ORIGIN` (the app's GitHub Pages address).

## Set up (about 10 minutes, free plan)

1. Sign in at https://dash.cloudflare.com (create a free account if needed).
2. Go to **Workers & Pages → Create → Create Worker** (start from "Hello World"), name it e.g. `tt-relay`, then **Deploy**.
3. Click **Edit code**, replace everything with the contents of `worker.js` from this folder, then **Deploy**.
4. Copy the worker address, e.g. `https://tt-relay.<your-subdomain>.workers.dev`.
5. Optional, only if your app or Jira address differs from the defaults in `worker.js`:
   **Settings → Variables and Secrets**, add `ALLOWED_ORIGIN` (e.g. `https://eniedling.github.io`)
   and `ALLOWED_HOSTS` (e.g. `eniedling.atlassian.net`), then deploy again.

Cloudflare's menu names change from time to time; the steps above match the dashboard as far as we know.

## In the app

Settings → Jira connection:

- **Jira site:** `eniedling.atlassian.net`
- **Jira login email** and **API token** (create the token at https://id.atlassian.com/manage-profile/security/api-tokens)
- **Relay URL:** the worker address from step 4

Tap **Save settings**, then **Test connection**. It should show your Jira name, the project and a tick for each field.
