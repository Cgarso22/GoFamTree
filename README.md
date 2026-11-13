# GoFamTree

A private family tree at gofamtree.com. Relatives sign in, open the tree centered on themselves, and add photos, stories and corrections. Editors approve suggestions.

- **Front end:** Vite + plain JavaScript (`src/`). `tree.js` is the tree UI and `main.js` handles sign-in, families, invites and the data layer.
- **Back end:** Supabase (Postgres, Auth, Storage, Realtime). The full schema and access rules are in `supabase/schema.sql`.
- **Hosting:** Vercel, with the domain's DNS at GoDaddy.

## Roles
| Role | Can |
|---|---|
| Viewer | see the tree |
| Contributor | suggest changes, upload photos for review |
| Editor | edit directly, review suggestions, invite people, see hidden contact info |
| Owner | everything, plus change roles and remove members |

## Setup
1. In the Supabase SQL editor, run `supabase/schema.sql`.
2. Copy `.env.example` to `.env` and fill in the project URL and anon key.
3. Run `npm install`, then `npm run dev`.
4. In Vercel, import the repo and add the same two env vars.
5. Bring in the existing family: `python3 scripts/build_import_sql.py data-export OWNER_EMAIL > supabase/import.sql`. Run it in the SQL editor after the owner has signed up.

## Email
Invite and contact-request emails go out through Resend from Supabase Edge Functions (`invite-email`, `contact-email`).
Secrets on the Supabase project: `RESEND_API_KEY` (required), `MAIL_FROM` (default `GoFamTree <hello@gofamtree.com>`), `SITE_URL` (default `https://www.gofamtree.com`).
