## Install Dependencies
```bash
npm install
```

## Start the Server
```bash
node index.js
```

Docs: https://mern-backend-1-hugd.onrender.com/api-docs/

## Required Environment Variables

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| `NODE_ENV` | Environment mode (`production`, `development`, etc.) | Yes | `development` |
| `JWT_SECRET` | Secret used to sign auth cookies | **Yes** | _none_ |
| `JWT_EXPIRES_IN` | Token lifetime (supports `7d`, `12h`, etc.) | Optional | `7d` |
| `COOKIE_DOMAIN` | Explicit cookie domain (e.g. `.winecellar.co.in`) | Optional | If unset, cookie is host-only |
| `RESEND_API_KEY` | Resend API key for transactional emails | **Yes in prod** | _none_ |
| `EMAIL_FROM` | Verified sender, e.g. `Wine Cellar <orders@winecellar.co.in>` | **Yes in prod** | _none_ |

Other feature-specific env vars (Stripe, UPS, MongoDB, etc.) should continue to be set as before.

## Auth & Session Notes

- Customers authenticate via HttpOnly JWT cookies issued by `/api/auth/login` / `/api/auth/signup`.
- `attachUser` middleware attaches `req.user` + `req.userId` for downstream routes.
- Protected routes (`/api/orders/create`, `/api/my-orders`, `/api/cart/*`, etc.) all require `requireAuth`.
- Logout clears only the current device’s cookie; other sessions remain valid.

## QA Checklist

1. **Refresh persistence** – log in, refresh the browser; `/api/auth/me` should still return the user.
2. **Multi-device** – log in from Browser A and Browser B; both remain authenticated independently.
3. **Device-specific logout** – calling `/api/auth/logout` on Browser A removes only A’s cookie; Browser B stays logged in.

https://github.com/users/AkshatPatel15/projects/2
