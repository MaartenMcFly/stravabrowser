import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import activitiesRoutes from './routes/activities.js';
import equipmentRoutes from './routes/equipment.js';
import statisticsRoutes from './routes/statistics.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();

// Trust proxy - required when behind nginx
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
    resave: false,
    saveUninitialized: false,
    name: 'strava.sid', // Custom cookie name
    cookie: {
      secure: false, // Set to true only when using HTTPS
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
      path: '/',
      domain: undefined, // Don't set domain - let browser handle it
    },
  })
);

// Debug middleware to log session info
app.use((req, res, next) => {
  console.log(`📋 ${req.method} ${req.path} - Session ID: ${req.session?.id || 'NONE'}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/statistics', statisticsRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
