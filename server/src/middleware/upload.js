// Handles crop-damage photo uploads for a new claim.
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { saveFile } = require('../services/storage.service');

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Step 1: multer reads the multipart form into memory (req.body + req.files).
const parsePhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
  fileFilter(req, file, cb) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG, PNG or WEBP photos are allowed', 'INVALID_FILE_TYPE'));
    }
    return cb(null, true);
  },
}).array('photos', MAX_PHOTOS);

// The browser-reported type can be faked, so also check the first bytes of the file
// ("magic numbers") to confirm it really is an image.
function looksLikeImage(buffer) {
  if (buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isWebp;
}

// Step 2 (runs after the form fields are validated): save the photos to GridFS
// and put their details on req.uploadedPhotos for the controller.
async function storePhotos(req, res, next) {
  const files = req.files || [];
  for (const file of files) {
    if (!looksLikeImage(file.buffer)) {
      throw ApiError.badRequest(`"${file.originalname}" is not a valid image`, 'INVALID_FILE_TYPE');
    }
  }

  req.uploadedPhotos = [];
  for (const file of files) {
    const fileId = await saveFile(file.buffer, file.originalname, file.mimetype, { uploadedBy: String(req.user._id) });
    req.uploadedPhotos.push({
      fileId,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    });
  }
  next();
}

module.exports = { parsePhotos, storePhotos, looksLikeImage, MAX_PHOTOS, MAX_PHOTO_BYTES };
