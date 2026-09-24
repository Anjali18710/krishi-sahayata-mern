// Gives every test file its own empty database.
// By default it starts a temporary in-memory MongoDB (mongodb-memory-server; the first run
// downloads a MongoDB binary, so it can take a minute). Set MONGO_URI_TEST to use your own
// MongoDB server instead, e.g. MONGO_URI_TEST=mongodb://127.0.0.1:27017
process.env.NODE_ENV = 'test';
const mongoose = require('mongoose');

let memoryServer;

async function connect() {
  let baseUri = process.env.MONGO_URI_TEST;
  if (!baseUri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    baseUri = memoryServer.getUri();
  }
  const dbName = `ks-test-${process.pid}-${Date.now()}`;
  const url = new URL(baseUri);
  url.pathname = `/${dbName}`;
  await mongoose.connect(url.toString());
  // Build indexes (e.g. unique phone) before tests rely on them
  for (const model of Object.values(mongoose.models)) {
    try {
      await model.syncIndexes();
    } catch (err) {
      // Real MongoDB supports every index we use. Some MongoDB-compatible test servers
      // (used via MONGO_URI_TEST) don't support TTL indexes, so only warn in that case.
      if (!process.env.MONGO_URI_TEST) throw err;
      console.warn(`Index warning for ${model.modelName}: ${err.message}`);
    }
  }
}

async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function close() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connect, clear, close };
