// Entry point: connect to MongoDB, then start the HTTP server.
const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');

async function start() {
  await connectDB(env.mongoUri);

  app.listen(env.port, () => {
    console.log(`Krishi Sahayata API running on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
