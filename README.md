# XPOD CRM — Backend

Express 5 + Supabase API for the XPOD CRM (admin / lead-manager / sales / partner).

## Setup

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # nodemon, http://localhost:5000
```

Apply the database schema once in the Supabase SQL editor:

```
db/schema.sql
```

### Environment variables

| Var | Required | Notes |
|-----|----------|-------|
| `SUPABASE_URL` | ✅ | Project URL |
| `SUPABASE_ANON_KEY` | ✅ | Used for login + token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ for writes | Creating users & bypassing RLS. **Server-side only.** |
| `PORT` | – | Default `5000` |

Without the service-role key the server still boots, but creating partners /
sales / lead managers will fail (these need `auth.admin.createUser`).

## Architecture

```
routes/        HTTP layer — auth + role guards, then delegate to controllers
controller/    request/response shaping, validation
services/      all Supabase access (the only layer that touches the DB)
middleware/    auth (token → req.user/req.role/req.profile), role guard, errors
utils/         roles, lead-stage vocab, asyncHandler, ApiError
config/        env + supabase clients (anon + service-role admin)
```

Roles (canonical): `admin`, `salesman`, `leadmanager`, `partner`.

## API

All routes except `POST /api/auth/login` require `Authorization: Bearer <access_token>`.

### Auth
| Method | Path | Roles | Body |
|--------|------|-------|------|
| POST | `/api/auth/login` | – | `{ phone, password }` → `{ session, token, user, role, profile }` |
| GET | `/api/auth/verify` | any | – |
| GET | `/api/auth/me` | any | – |
| POST | `/api/auth/logout` | any | – |

### Leads — `/api/leads`
| Method | Path | Roles |
|--------|------|-------|
| GET | `/` (filters: `status,assigned_to,partner_id,lead_manager_id,is_vip,is_general,assigned,trashed,search`) | any |
| GET | `/:id` | any |
| POST | `/` | admin, leadmanager, partner |
| PUT | `/:id` | admin, leadmanager, salesman |
| DELETE | `/:id` (→ trash) | admin, leadmanager |
| POST | `/:id/assign` `{ assigned_to }` | admin, leadmanager |
| PATCH | `/:id/status` `{ status }` | staff |
| POST | `/:id/request-conversion` | staff |
| POST | `/:id/approve-conversion` · `/reject-conversion` | admin, leadmanager |
| POST | `/:id/approve-review` · `/reject-review` | admin, leadmanager |
| POST | `/:id/restore` | admin, leadmanager |
| DELETE | `/:id/permanent` | admin |

### Partners — `/api/partners`
CRUD. `GET` any; `POST/PUT/DELETE` admin only. Create body:
`{ name, email, phone, password, location, state, company, partner_type, photo_url, royalty_percent }`.

### Sales team — `/api/sales-team`
CRUD + `POST /:id/reset-password`. Writes: admin, leadmanager.

### Lead managers — `/api/lead-managers`
CRUD + `POST /:id/reset-password`. Writes: admin only.

### Users / profiles — `/api/users`
`GET /` (optional `?role=`), `GET /:id`.

### Dashboard — `/api/dashboard`
Returns a role-appropriate summary (admin overview, lead-manager scope, or
partner scope) based on the caller's role.

## Lead lifecycle

There is no `stage` column — position is derived from `status` + `deleted_at` +
`assigned_to` + `partner_id`.

```
status: pending ─(approve-review)→ new ─(assign, sets assigned_to)→ new
        new ─(status)→ in_progress / discussion / followup
        ─(request-conversion)→ conversion_requested
              ├─(approve-conversion)→ converted
              └─(reject-conversion)→ in_progress
any ─(DELETE, sets deleted_at)→ trash ─(restore, clears deleted_at)→ active
                                      └─(DELETE /permanent)→ gone
general lead = partner_id IS NULL ·  VIP = is_vip = true
```
