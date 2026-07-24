# Tanjuriel IMS — Supabase Launch Steps

## 1. Project keys
`.env.local` already has your project URL + anon key.

Add the **service role key** from:
Supabase Dashboard → Project Settings → API → `service_role` (secret)

```
SUPABASE_SERVICE_ROLE_KEY=paste-here
```

## 2. Apply database schema
1. Open Supabase Dashboard → **SQL Editor**
2. Paste and run the full contents of:
   `supabase/migrations/202607240001_tanjuriel_ims_launch.sql`

## 3. Seed Chairman
With the app running (`npm run dev`):

```
POST http://localhost:3000/api/setup/seed-chairman
```

Or in PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/setup/seed-chairman
```

This creates:
- Email: `chairman@tanjuriel.com`
- Password: the one you provided for launch

## 4. Sign in
Open http://localhost:3000 and sign in as Chairman.
Then create other role accounts from Users (Chairman / GM).

## Notes
- Sessions stay signed in (persistent auth).
- Start empty (no mock import) once schema is live.
- Do not commit `.env.local`.
