const mongoose = require('mongoose');

// Ignore unknown fields in query filters instead of passing them to MongoDB.
mongoose.set('strictQuery', true);
// Note on NoSQL injection: every value that reaches a query is first checked by
// express-validator in the routes (e.g. status must be one of a fixed list) or cast
// with String(), so a request body like { "phone": { "$ne": null } } can't become a query operator.

async function connectDB(uri) {
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
