const mongoose = require('mongoose');

// Caches Open-Meteo responses so the same location/date range isn't fetched again and again.
// MongoDB deletes each entry automatically when expiresAt passes (TTL index),
// so no separate cache server (like Redis) is needed.
const weatherCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});

weatherCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('WeatherCache', weatherCacheSchema);
