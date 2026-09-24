// Builds the Express app (middleware + routes) without starting it.
// Keeping this separate from index.js lets the tests load the app without opening a port.
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// Render and similar hosts sit behind a proxy; needed so rate limiting sees the real IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allow tools like curl/Postman (no origin) and the configured frontend URLs.
      if (!origin || env.clientUrls.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
  })
);
app.use(express.json({ limit: '100kb' }));
if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/claims', require('./routes/claims.routes'));
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/files', require('./routes/files.routes'));
app.use('/api/weather', require('./routes/weather.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));

// If the React app has been built (client/dist exists), serve it from the same server.
// This lets the whole project run as a single service in production.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
