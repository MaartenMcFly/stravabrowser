---
name: new-route
description: Scaffold a new Express backend route for the stravabrowser project, following the established auth, caching, and error-handling patterns. Use when the user asks to add a new API endpoint or backend route.
user-invocable: true
allowed-tools: Read, Glob, Write, Edit
---

# New Backend Route — stravabrowser

Scaffold a new Express route file and wire it into `app.js`, following the exact patterns used throughout this codebase.

## Usage

```
/new-route <mount-path> <description>
```

Example: `/new-route /api/fitness PMC and HRV endpoints`

## What to do

### 1. Gather context from $ARGUMENTS

Parse the invocation arguments:
- **Mount path** — the URL prefix, e.g. `/api/fitness` or `/whoop`
- **Description** — what the route does (used for comments and file naming)

If no arguments were provided, ask the user for the mount path and a brief description before proceeding.

Derive the **file name** from the mount path:
- `/api/fitness`  → `backend/src/routes/fitness.js`
- `/api/ftp-history` → `backend/src/routes/ftpHistory.js`  (camelCase the kebab segment)
- `/whoop` → `backend/src/routes/whoop.js`

### 2. Create the route file

Use this exact skeleton — do not deviate from it:

```js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as cache from '../services/cacheService.js';

const router = express.Router();

// Apply authentication middleware to all routes in this file
router.use(requireAuth);

/**
 * GET <mount-path>/example
 * <description>
 */
router.get('/example', async (req, res, next) => {
  try {
    const athleteId = req.session.athleteId?.toString();

    if (!athleteId) {
      return res.status(401).json({ error: 'Athlete ID not found in session' });
    }

    // TODO: implement

    res.json({});
  } catch (error) {
    next(error);
  }
});

export default router;
```

Rules to follow:
- **Always** use `requireAuth` middleware applied via `router.use()` at the top — never inline auth checks on individual handlers
- **Always** extract `athleteId` as `req.session.athleteId?.toString()` and guard against it being falsy
- **Always** wrap handler bodies in `try { } catch (error) { next(error); }`
- Use `import * as cache from '../services/cacheService.js'` for cache access
- Use `import { getActivities, getAthlete, ... } from '../services/stravaApi.js'` for Strava API calls
- Use `import { createWhoopClient, syncRecoveries, syncCycles } from '../services/whoopApi.js'` for Whoop API calls
- Named imports from stravaApi/whoopApi — check the existing exports in those files before importing
- Add a JSDoc comment above each handler explaining the HTTP method, path, and what it does
- ES module syntax throughout (`import`/`export default`) — no `require()`

### 3. Mount the route in app.js

Read `backend/src/app.js` first to understand the current import order, then add:

1. An import line in the imports block (alphabetical order within the `/routes/` group):
   ```js
   import <camelCaseName>Routes from './routes/<filename>.js';
   ```

2. A `app.use()` call in the Routes section, positioned logically near related routes:
   ```js
   app.use('<mount-path>', <camelCaseName>Routes);
   ```

### 4. Verify

After creating the files, read both the new route file and the updated `app.js` to confirm:
- The import name matches the `app.use()` call
- The mount path matches what the user asked for
- The skeleton compiles (no obvious syntax errors — balanced braces, correct ES module syntax)

### 5. Report back

Tell the user:
- The file path that was created
- The mount path
- What placeholder endpoints were added
- What they need to implement next (the TODO comment)
