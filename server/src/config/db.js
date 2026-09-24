const mongoose = require('mongoose');

// Strip MongoDB operators like $gt / $ne out of query filters built from user input.
// This blocks "NoSQL injection", e.g. someone sending { "phone": { "$ne": null } }.
mongoose.set('sanitizeFilter', true);
// Ignore unknown fields in queries instead of silently matching everything.
mongoose.set('strictQuery', true);

async function connectDB(uri) {
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
