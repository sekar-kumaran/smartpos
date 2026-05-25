# Offline-First Notes

Community Edition ships with SQLite fallback on the backend and demo-friendly offline behavior on the frontend.

## SQLite Fallback (Backend)

- `SQLITE_URL` is configured for local and offline-friendly runs
- The backend can run fully on SQLite for demos and tests

## WatermelonDB (Frontend, Optional)

WatermelonDB is not bundled in this repo to keep the Community Edition lightweight and dependency-safe.

Recommended integration steps:

1. Add dependencies:
   - `@nozbe/watermelondb`
   - `@nozbe/with-observables`
2. Create a local SQLite adapter
3. Define collections for `products`, `customers`, `sales`, and `stock`
4. Sync with the API when online

This keeps the public repo safe while documenting a production-grade offline path.
