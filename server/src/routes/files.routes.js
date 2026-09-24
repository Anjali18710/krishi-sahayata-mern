// Serves claim photos. Only people who can see the claim can see its photos.
const express = require('express');
const { param } = require('express-validator');
const mongoose = require('mongoose');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const { findFile, openDownloadStream } = require('../services/storage.service');
const { findClaimForUser } = require('../controllers/claims.controller');

const router = express.Router();

router.get('/:fileId', requireAuth, [param('fileId').isMongoId()], validate, async (req, res) => {
  const fileId = new mongoose.Types.ObjectId(req.params.fileId);
  const owner = await Claim.findOne({ 'photos.fileId': fileId }).select('_id');
  if (!owner) throw ApiError.notFound('Photo not found');
  await findClaimForUser(owner._id, req.user); // throws 404 if this user can't see the claim

  const file = await findFile(fileId);
  if (!file) throw ApiError.notFound('Photo not found');

  res.set({
    'Content-Type': file.metadata?.contentType || 'application/octet-stream',
    'Content-Length': file.length,
    'Cache-Control': 'private, max-age=3600',
  });
  openDownloadStream(fileId)
    .on('error', () => res.destroy())
    .pipe(res);
});

module.exports = router;
