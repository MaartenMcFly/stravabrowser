# Strava Activity Browser

A web application to browse your Strava activities using secure OAuth 2.0 authentication.

## Features

- Secure OAuth 2.0 authentication with Strava
- Browse your activities with details (distance, duration, type)
- Server-side token management for security
- Automatic token refresh
- Clean, responsive UI

## Architecture

- **Backend**: Node.js/Express server handling OAuth flow and API proxying
- **Frontend**: Vue.js 3 + Vite for the user interface
- **Security**: Session-based authentication with tokens stored server-side

## Prerequisites

- Node.js 18+ installed
- Strava API credentials (Client ID and Client Secret)

## Getting Your Strava API Credentials

1. Go to https://www.strava.com/settings/api
2. Create a new application
3. Set the Authorization Callback Domain to `localhost`
4. Note your Client ID and Client Secret

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install dependencies for both backend and frontend workspaces.

### 2. Configure Backend Environment

Create a `.env` file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your Strava credentials:

```env
STRAVA_CLIENT_ID=your_client_id_here
STRAVA_CLIENT_SECRET=your_client_secret_here
STRAVA_REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=generate_a_random_32_character_string_here
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

**Important**: Generate a secure random string for `SESSION_SECRET`. You can use:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the Application

From the root directory, you can start both backend and frontend:

```bash
# Start both servers concurrently
npm run dev

# Or start them separately in different terminals:
npm run dev:backend    # Starts backend on http://localhost:3000
npm run dev:frontend   # Starts frontend on http://localhost:5173
```

### 4. Use the Application

1. Open http://localhost:5173 in your browser
2. Click "Login with Strava"
3. Authorize the application on Strava
4. You'll be redirected back to view your activities

## Project Structure

```
stravabrowser/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── config/       # Configuration files
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Express middleware
│   │   └── utils/        # Utility functions
│   └── package.json
├── frontend/             # Vue.js frontend
│   ├── src/
│   │   ├── components/   # Vue components
│   │   ├── views/        # Page views
│   │   ├── router/       # Vue Router config
│   │   ├── stores/       # Pinia stores
│   │   └── services/     # API services
│   └── package.json
└── package.json          # Root workspace config
```

## Development

### Backend Development

```bash
cd backend
npm run dev  # Starts with nodemon for auto-reload
```

### Frontend Development

```bash
cd frontend
npm run dev  # Starts Vite dev server
```

## Security Notes

- Access tokens are stored server-side only (never sent to frontend)
- Sessions use secure, httpOnly cookies
- CORS is configured to only allow the frontend origin
- Never commit `.env` files to version control
- Use HTTPS in production

## OAuth Flow

1. User clicks "Login with Strava"
2. Backend redirects to Strava authorization page
3. User authorizes the application
4. Strava redirects back with authorization code
5. Backend exchanges code for access/refresh tokens
6. Tokens stored in server session
7. User redirected to dashboard
8. Frontend fetches activities through backend API
9. Backend uses stored tokens to call Strava API

## Troubleshooting

### "Cannot connect to backend"
- Ensure backend is running on port 3000
- Check backend/.env configuration

### "OAuth callback error"
- Verify STRAVA_REDIRECT_URI matches your Strava app settings
- Check that it's set to `http://localhost:3000/auth/callback`

### "No activities showing"
- Check browser console for errors
- Verify your Strava account has activities
- Check backend logs for API errors

## License

MIT
