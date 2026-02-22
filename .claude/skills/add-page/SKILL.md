---
name: add-page
description: Scaffold a new Vue frontend page for the stravabrowser project, wiring it into the router and Dashboard nav. Use when the user asks to add a new page, view, or screen to the frontend.
user-invocable: true
allowed-tools: Read, Glob, Write, Edit
---

# Add Frontend Page — stravabrowser

Scaffold a new Vue 3 page component and wire it into the router and Dashboard navigation,
following the exact patterns used throughout this codebase.

## Usage

```
/add-page <route-path> <PageName> <description>
```

Example: `/add-page /goals Goals Track training goals`

## What to do

### 1. Gather context from $ARGUMENTS

Parse the invocation arguments:
- **Route path** — the URL path, e.g. `/goals` or `/training-log`
- **PageName** — PascalCase component name, e.g. `Goals`, `TrainingLog`
- **Description** — one sentence describing what the page does

If any argument is missing, ask the user before proceeding.

Derive the **file name** from PageName: `frontend/src/views/<PageName>.vue`

### 2. Read existing pages for context

Before writing, read one of these reference pages to match the exact style:
- `frontend/src/views/Statistics.vue` — good reference for a chart/data page
- `frontend/src/views/Equipment.vue` — good reference for a list/detail page
- `frontend/src/views/Admin.vue` — good reference for a simple action page

### 3. Create the Vue component

Use this skeleton — fill in the PageName and description:

```vue
<template>
  <div class="<kebab-page-name>">
    <header class="header">
      <div class="header-content">
        <h1 class="title"><PageName></h1>
        <button @click="router.push('/dashboard')" class="back-button">
          ← Back to Activities
        </button>
      </div>
    </header>

    <main class="main">
      <!-- TODO: implement page content -->
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// TODO: add reactive state and API calls
</script>

<style scoped>
.<kebab-page-name> {
  min-height: 100vh;
  background: #f5f7fa;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header-content {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
}

.back-button {
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.back-button:hover {
  background: white;
  color: #667eea;
}

.main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 3rem;
}
</style>
```

Rules to follow:
- Use `<script setup>` Composition API — no Options API
- Import API helpers from `../services/api.js`, not directly from axios
- Use `ref()` for reactive state, `onMounted()` for initial data fetching
- Keep `<style scoped>` — never use global styles in a page component
- Match the header gradient, max-width, and back-button exactly as shown — this is the consistent UI chrome across all pages

### 4. Add the route to the router

Read `frontend/src/router/index.js` first, then add the import and route entry:

```js
import <PageName> from '../views/<PageName>.vue';
```

Add to the `routes` array (maintain alphabetical order by path):
```js
{
  path: '<route-path>',
  name: '<PageName>',
  component: <PageName>,
  meta: { requiresAuth: true },
},
```

Use `meta: { requiresGuest: true }` only for pages that should redirect authenticated users away
(like the Home / login page). All other pages use `requiresAuth: true`.

### 5. Add the nav button to Dashboard

Read `frontend/src/views/Dashboard.vue` to see the existing nav button pattern, then add
a new button in the same `.nav-buttons` area:

```vue
<button @click="router.push('<route-path>')" class="nav-button">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- TODO: choose an appropriate SVG icon path -->
  </svg>
  <PageName>
</button>
```

Pick an icon that matches the page purpose. Browse existing nav buttons in Dashboard.vue for
examples of the SVG icon style used (outline, 24×24 viewBox, stroke-based).

### 6. Add API helpers (if needed)

If the page requires new backend endpoints, add helper functions to `frontend/src/services/api.js`
following the existing pattern:

```js
/**
 * Brief description
 */
export async function get<Resource>() {
  const response = await apiClient.get('/<resource>');
  return response.data;
}
```

### 7. Verify

After creating/editing all files, confirm:
- `frontend/src/views/<PageName>.vue` exists and has no obvious syntax errors
- `frontend/src/router/index.js` imports and registers the new route
- `frontend/src/views/Dashboard.vue` has the new nav button
- Any new `api.js` functions are exported correctly

### 8. Report back

Tell the user:
- Files created and modified
- The route path the page is accessible at
- What they need to implement in the TODO sections
- Remind them to run `/rebuild` (which will call `./update.sh frontend`) to deploy
