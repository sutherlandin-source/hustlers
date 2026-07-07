# HUSTLERS Monorepo

A production-ready monorepo scaffold for the HUSTLERS platform.

## Structure

- `apps/web` — React.js web application
- `apps/mobile` — React Native mobile app with Expo
- `apps/server` — Node.js + Express backend
- `packages/shared` — reusable shared utilities and helpers
- `packages/types` — shared TypeScript types and interfaces
- `packages/ui` — shared UI components and design primitives

## Initial setup

```bash
cd hustlers
npm install
npm run dev
```

## Recommended naming conventions

- Packages use `@hustlers/*`
- App routes follow `/apps/*`
- Shared modules are imported with path aliases
- Components use `PascalCase`
- Utility functions use `camelCase`
- Environment variables use uppercase `SNAKE_CASE`

## Environment variable strategy

- Store secrets in `.env` locally
- Keep `.env` out of source control
- Use `.env.example` for defaults and required keys
- Use separate variables for each app: `REACT_APP_*`, `EXPO_PUBLIC_*`, `NODE_*`

## Professional architecture

- Turborepo for build orchestration
- TypeScript everywhere with project references
- Shared packages for code reuse and type safety
- API-first backend with REST endpoints and GraphQL-ready schema boundaries
- Mobile-first design with a React Native app and web admin interface
