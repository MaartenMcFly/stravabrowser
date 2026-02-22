---
name: add-cache-field
description: Add a new field to the activity cache in the stravabrowser project, touching the three required files in the correct order. Use when the user asks to cache a new Strava activity field, add a column to the activities table, or make a new activity property available in the frontend.
user-invocable: true
allowed-tools: Read, Edit
---

# Add Activity Cache Field — stravabrowser

Add a new field to the SQLite activity cache. This always requires changes in exactly
three files, in this order. Missing any one of them will result in the field being
silently null.

## Usage

```
/add-cache-field <field_name> <sql_type> <description>
```

Example: `/add-cache-field suffer_score INTEGER Strava suffer score (perceived exertion)`

## What to do

### 1. Gather context from $ARGUMENTS

Parse the invocation arguments:
- **field_name** — the column name (snake_case), matching the Strava API field name
- **sql_type** — SQLite type: `TEXT`, `INTEGER`, `REAL`
- **description** — what the field contains

If any argument is missing, ask the user before proceeding.

### 2. Verify the field exists in the Strava API response

Read `backend/src/services/stravaApi.js` and check the `getActivities()` function to see
what fields are currently mapped from the Strava response. Confirm the field_name is present
in the Strava List Athlete Activities endpoint response (the function fetches from
`/athlete/activities`).

If the field is not currently mapped, note that it needs to be added to the mapping too.

### 3. File 1 — Add database migration (`backend/src/db/database.js`)

Read the file, find the `migrations` array, and append one entry:

```js
'ALTER TABLE activities ADD COLUMN <field_name> <SQL_TYPE>',
```

The try/catch around each migration silently skips columns that already exist, so this
is safe to run on databases that already have the column.

### 4. File 2 — Update cacheService.js (`backend/src/services/cacheService.js`)

Read the file, then make two changes:

**a) In `saveActivities()` — add to INSERT statement**

Find the `INSERT OR REPLACE INTO activities` statement. Add `<field_name>` to the column
list and `:field_name` (or `$field_name`) to the VALUES list. Add the field to the object
passed to `stmt.run()`:

```js
field_name: activity.field_name ?? null,
```

Use `?? null` (nullish coalescing) to handle missing fields gracefully.
For boolean-style fields (like `device_watts`), convert appropriately:
```js
device_watts: activity.device_watts ? 1 : 0,
```

**b) In `getActivities()` and `getAllActivities()` — add to SELECT**

Find the SELECT statement(s) and add `<field_name>` to the column list.

### 5. File 3 — Map the field from Strava API (`backend/src/services/stravaApi.js`)

Read `getActivities()` in this file. If the field is already included in the raw Strava
response object that is returned (i.e. the function returns the full Strava object without
remapping), no change is needed here.

If the function remaps fields, add the new field to the mapping:
```js
field_name: activity.field_name,
```

### 6. Verify

After all three edits, read through each changed section to confirm:
- The column name is spelled identically in all three files
- The INSERT parameter matches the SELECT column name
- No trailing commas are missing in SQL statements

### 7. Report back

Tell the user:
- Which three files were changed and what was changed in each
- Whether the field was already present in the Strava API mapping or needed to be added
- Remind them that existing cached activities will have `null` for this field until the
  cache is invalidated (Admin → Invalidate Cache) and activities are re-fetched
- Remind them to run `/rebuild` (`./update.sh backend`) to deploy
