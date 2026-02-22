# Strava Activity Browser - Frontend

Vue.js 3 frontend for the Strava Activity Browser application.

## Technology Stack

- **Vue.js 3** with Composition API (`<script setup>`)
- **Vite 5** for fast builds and HMR
- **Vue Router 4** for navigation with auth guards
- **Pinia** for state management (authentication)
- **Chart.js** for statistics and PMC visualization
- **Axios** for HTTP requests

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable components
│   │   ├── ActivityCard.vue    # Activity card with OSM map thumbnail and sport badge
│   │   ├── ActivityList.vue    # Paginated activity list
│   │   ├── EditActivityModal.vue # Modal for editing name/description/gear
│   │   └── LoginButton.vue     # Strava login trigger
│   ├── views/               # Page components
│   │   ├── Home.vue            # Landing page
│   │   ├── Dashboard.vue       # Main activity browser with nav
│   │   ├── Equipment.vue       # Bike/shoe management
│   │   ├── Statistics.vue      # Cumulative distance charts
│   │   ├── SimilarActivities.vue # Repeated workout comparison
│   │   ├── Fitness.vue         # PMC chart, FTP history, Whoop HRV
│   │   ├── Admin.vue           # Sync new activities, cache management
│   │   └── Callback.vue        # OAuth redirect handler
│   ├── router/              # Vue Router configuration
│   │   └── index.js            # Routes with requiresAuth / requiresGuest guards
│   ├── stores/              # Pinia stores
│   │   └── auth.js             # Authentication state
│   ├── utils/               # Utility functions
│   │   ├── workoutName.js      # Workout name extraction (mirrors backend)
│   │   └── polyline.js         # Google-format polyline decode + OSM tile math
│   ├── services/            # API layer
│   │   └── api.js              # Axios client; all backend API helpers
│   ├── App.vue              # Root component
│   └── main.js              # Application entry point
├── public/                  # Static assets
├── index.html              # HTML template
└── vite.config.js          # Vite configuration
```

## Development

### Start Dev Server

```bash
npm run dev
```

Access at http://localhost:5173

### Build for Production

```bash
npm run build
```

Output goes to `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Key Features

### Authentication
- Pinia store manages auth state (`isAuthenticated`, `athlete`)
- Router guards: `requiresAuth` redirects to Home, `requiresGuest` redirects to Dashboard
- Session-based authentication via httpOnly cookie

### Activity Management
- Paginated activity list (30 per page)
- Map thumbnails use real OpenStreetMap tiles behind the decoded route polyline
- `polyline.js` handles Google-format polyline decoding and Web Mercator tile math
- Click maps to open on Strava; click card to edit name/description/gear

### Equipment Tracking
- Two-column layout: gear list + details
- Activity totals per equipment from cache

### Statistics
- Full-width chart layout with year selector
- Chart.js line charts with cumulative weekly distance data
- Toggle multiple years for comparison

### Similar Activities
- Groups repeated workouts by extracted name (strips Zwift/TrainerRoad/WAHOO prefixes)
- Left panel: workout names sorted by most recent occurrence
- Right panel: summary averages + per-occurrence list

### Fitness (Performance Management Chart)
- PMC chart: CTL (blue), ATL (red), TSB (green) lines + TSS bars
- Date range toggle: 3 months / 6 months / 1 year / All
- FTP history table with add/delete; seeded from known FTP history on first visit
- Whoop section: connect/disconnect/sync; HRV chart with 7-day rolling average

### Administration
- **Sync New Activities**: checks Strava for activities since the last cached one; shows results in a dialog
- **Invalidate Cache**: clears all cached activities; forces full reload on next dashboard visit

## UI Design

### Layout
- Gradient headers (`#667eea → #764ba2`) with back-to-Dashboard navigation
- Card-based designs with box shadows
- Grid layouts optimized for desktop (max-width 1600px)

### Colors
- Primary gradient: `#667eea` → `#764ba2`
- Background: `#f5f7fa`
- Danger: `#dc2626`

### Patterns
All pages follow the same chrome: gradient header + title + back button, `<main>` with `max-width: 1600px` and `padding: 3rem`. Use the `/add-page` Claude Code skill to scaffold new pages with this layout automatically.

## API Integration

All API calls go through `src/services/api.js`. See [API.md](../API.md) for the full endpoint reference.

```javascript
// Authentication
getAuthStatus()
logout()

// Activities
getActivities(page, perPage)
getActivity(id)
updateActivity(id, { name, description, gear_id })
getActivityNames()
getActivitiesByName(name)

// Equipment
getEquipment()
getEquipmentDetails(id)
getEquipmentActivities(gearId)

// Statistics
getWeeklyDistance()          // → /api/statistics/weekly-distance

// Athlete & FTP
getAthleteProfile()          // → /api/athlete
getFtpHistory()
addFtpEntry({ ftp, lthr, valid_from })
deleteFtpEntry(id)

// Fitness
getPmc()                     // → /api/fitness/pmc
getHrv()                     // → /api/fitness/hrv

// Admin
invalidateCache()
syncActivities()

// Whoop
getWhoopStatus()
syncWhoop()
disconnectWhoop()
```

## Development Notes

- Uses Vue 3 Composition API exclusively (`<script setup>`)
- All styles are `<style scoped>` — no global styles in page components
- Axios configured with `withCredentials: true` for session cookies
- `workoutName.js` is duplicated in `frontend/src/utils/` and `backend/src/utils/` — keep in sync

## IDE Setup

Recommended VSCode extensions (`.vscode/extensions.json`):
- Volar (Vue Language Features)
- TypeScript Vue Plugin (Volar)

## Learn More

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Vue Router](https://router.vuejs.org/)
- [Pinia](https://pinia.vuejs.org/)
- [Chart.js](https://www.chartjs.org/)
