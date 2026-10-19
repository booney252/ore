# Open in Google Docs

Every report, iteration set and creative brief page has an **Open in Google Docs ↗** link. It signs you in with Google, makes a new Google Doc in your Drive from that page (headings, tables, lists kept), and opens it.

Ore asks only for the `drive.file` scope, so it can see and edit only the files it creates, never the rest of your Drive. It keeps no Google tokens: each click signs in again, which takes about a second after the first time.

## One-time setup (free)

1. Go to https://console.cloud.google.com/ and create a project, for example "Ore".
2. Turn on the **Google Drive API**: APIs & Services → Library → Google Drive API → Enable.
3. Set up the **OAuth consent screen** (Google Auth Platform):
   - User type: External.
   - App name: Ore.
   - Add your own Google account under Test users.
   - Scope: `.../auth/drive.file`.
   While the app is in "Testing", only the test users you list can sign in. That's fine while it's just you. Before other people use it, publish the app. `drive.file` is a non-sensitive scope, so publishing it needs no security review.
4. Create the client: Credentials → Create credentials → OAuth client ID → Web application.
   Under authorized redirect URIs, add:
   - `https://<your-vercel-domain>/api/gdoc/callback`
   - `http://localhost:3000/api/gdoc/callback` (for local dev)
5. Add the client ID and secret to Vercel (Project → Settings → Environment Variables) and to `web/.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
   Then redeploy.

Optional: `GOOGLE_REDIRECT_URI` overrides the callback URL. Set it if the site sits behind a proxy that changes the host.
