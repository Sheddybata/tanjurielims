# Deploy Tanjuriel IMS to ims.tanjuriel.com

Your main website stays on `tanjuriel.com`.
IMS should be a **separate Vercel project** on the subdomain `ims.tanjuriel.com`.

## 1. Push this app to GitHub
Create a new private repo (example: `tanjuriel-ims`), then from this folder:

```bash
git add .
git commit -m "Launch Tanjuriel IMS for production"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/tanjuriel-ims.git
git push -u origin main
```

## 2. Create a new Vercel project
1. Open [vercel.com/new](https://vercel.com/new)
2. Import the **tanjuriel-ims** repo (do not reuse the main website project)
3. Framework: Next.js
4. Root directory: `/` (this repo)

## 3. Add environment variables in Vercel
Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Add them for Production (and Preview if you want).

## 4. Attach the subdomain
In the **IMS** Vercel project → Settings → Domains:

1. Add `ims.tanjuriel.com`
2. Vercel will show the DNS record to create

In your DNS for `tanjuriel.com` (often already in Vercel Domains):

- Type: `CNAME`
- Name: `ims`
- Value: `cname.vercel-dns.com`  
  (or the exact target Vercel shows)

Because `tanjuriel.com` is already on Vercel, you can usually add `ims.tanjuriel.com` in the IMS project and Vercel will configure it automatically under the same account.

## 5. Update Supabase Auth URLs
Supabase → Authentication → URL Configuration:

- Site URL: `https://ims.tanjuriel.com`
- Redirect URLs: add
  - `https://ims.tanjuriel.com/**`
  - `http://localhost:3000/**` (keep for local dev)

## 6. Deploy
Push to `main` or click Deploy in Vercel.
Then open: https://ims.tanjuriel.com

## Notes
- Do not put IMS files into the existing website repo unless you intentionally want a monorepo.
- Keep `.env.local` out of git (already in `.gitignore`).
- After go-live, change the Chairman password.
