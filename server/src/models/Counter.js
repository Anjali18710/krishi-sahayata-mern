const mongoose = require('mongoose');

// Generates sequential numbers safely, even when two claims are filed at the same moment.
// $inc in findOneAndUpdate is atomic, so no two claims can get the same number.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // counter name, e.g. "claim-2026"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

async function nextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return counter.seq;
}

module.exports = { Counter, nextSequence };
