# Strava Activity Browser - Frontend

Vue.js 3 frontend for the Strava Activity Browser application.

## Technology Stack

- **Vue.js 3** with Composition API (`<script setup>`)
- **Vite 5** for fast builds and HMR
- **Vue Router 4** for navigation with auth guards
- **Pinia** for state management (authentication)
- **Chart.js** for statistics visualization
- **Axios** for HTTP requests

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable components
│   │   ├── ActivityCard.vue    # Individual activity card
│   │   └── ActivityList.vue    # Paginated activity list
│   ├── views/               # Page components
│   │   ├── Home.vue            # Landing page
│   │   ├── Dashboard.vue       # Main activity browser
│   │   ├── Equipment.vue       # Bike/shoe management
│   │   ├── Statistics.vue      # Cumulative distance charts
│   │   ├── SimilarActivities.vue # Repeated workout comparison
│   │   ├── Admin.vue           # Cache management
│   │   └── Callback.vue        # OAuth redirect handler
│   ├── router/              # Vue Router configuration
│   │   └── index.js            # Routes with auth guards
│   ├── stores/              # Pinia stores
│   │   └── auth.js             # Authentication state
│   ├── utils/               # Utility functions
│   │   └── workoutName.js      # Workout name extraction
│   ├── services/            # API layer
│   │   └── api.js              # Axios client for backend
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
- Pinia store manages auth state
- Router guards protect authenticated routes
- Session-based authentication with backend

### Activity Management
- Paginated activity list (50 per page)
- SVG map rendering from Strava polylines
- Click maps to open on Strava
- Responsive grid layout optimized for desktop

### Equipment Tracking
- Two-column layout: gear list + details
- Real-time activity totals per equipment
- Summary cards for distance, time, elevation

### Statistics
- Full-width chart layout with year selector
- Chart.js line charts with cumulative data
- Toggle multiple years for comparison
- Responsive legends and tooltips

### Similar Activities
- Groups repeated workouts by extracted name (strips Zwift/TrainerRoad/WAHOO prefixes)
- Left panel: workout names sorted by most recent occurrence
- Right panel: summary averages + per-occurrence list with NP and heart rate

### Administration
- Cache invalidation to force a full reload of all activities from Strava

## UI Design

### Layout
- Gradient headers with back navigation
- Card-based designs with shadows
- Grid layouts optimized for desktop (1600px+)
- Full-width statistics page

### Colors
- Primary: #667eea (purple gradient)
- Accent: Various colors for chart lines
- Background: #f5f7fa (light gray)

### Components
- Desktop-optimized (no mobile breakpoints)
- Activity cards: 380px minimum width
- 50 activities per page for performance

## API Integration

All API calls go through `src/services/api.js`:

```javascript
// Authentication
await checkAuthStatus()
await logout()

// Activities
await getActivities(page, perPage)
await getActivityNames()
await getActivitiesByName(name)

// Equipment
await getEquipment()
await getEquipmentActivities(gearId)

// Statistics
await getWeeklyDistance()

// Admin
await invalidateCache()
```

## Development Notes

- Uses Vue 3 Composition API exclusively
- All components use `<script setup>` syntax
- Axios configured with `withCredentials: true` for cookies
- Chart.js registered components: Line, Point, Scale, Legend
- Polyline decoding for map visualization

## IDE Setup

Recommended VSCode extensions:
- Volar (Vue Language Features)
- TypeScript Vue Plugin (Volar)

## Learn More

- [Vue 3 Documentation](https://vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Vue Router](https://router.vuejs.org/)
- [Pinia](https://pinia.vuejs.org/)
- [Chart.js](https://www.chartjs.org/)
