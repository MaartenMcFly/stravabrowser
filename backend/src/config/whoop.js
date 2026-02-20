import dotenv from 'dotenv';
dotenv.config();

export const whoopConfig = {
  clientId:     process.env.WHOOP_CLIENT_ID,
  clientSecret: process.env.WHOOP_CLIENT_SECRET,
  redirectUri:  process.env.WHOOP_REDIRECT_URI,
  authorizeUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenUrl:     'https://api.prod.whoop.com/oauth/oauth2/token',
  apiBaseUrl:   'https://api.prod.whoop.com/developer/v1',
  scope:        'read:recovery read:cycles read:workout read:profile offline',
};
