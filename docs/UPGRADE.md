# Upgrading Spyglass

Spyglass tracks skateboard with `scripts/update-skateboard.js`.

The app version in `package.json` is Spyglass's own release. `skateboardVersion` is the boilerplate pin. They are not the same number.

## Skateboard 5.6

The backend is zero-crate Rust in `backend/`. Start it with `cargo run` from `backend/`. The frontend stays on Vite:

```bash
npm install
npm run start
cd backend && cargo run
```

Feature routes (App Store Connect, templates, exports, icons, keywords, precheck, translation, and AI) live in `backend/src/spy/` and are dispatched from `backend/src/routes.rs`. Their tables are created in `backend/src/db.rs`.

State-changing browser calls send `X-CSRF-Token` from `getCSRFToken()`. Icons are named imports from `lucide-react`.

Do not add a crate to `backend/Cargo.toml`. Outbound HTTPS uses `backend/src/httpc.rs` (system libcurl).
