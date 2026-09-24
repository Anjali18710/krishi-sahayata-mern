// Stores photos inside MongoDB using GridFS.
//
// Why GridFS: a normal MongoDB document is limited to 16 MB, and we don't want to pay
// for a separate file store like AWS S3. GridFS splits each file into small chunks
// saved in two collections (photos.files and photos.chunks) in the same database,
// so the free MongoDB Atlas cluster is enough.
const mongoose = require('mongoose');

const BUCKET_NAME = 'photos';

function getBucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

/** Saves a file from memory. Resolves with the new file's ObjectId. */
function saveFile(buffer, filename, contentType, metadata = {}) {
  return new Promise((resolve, reject) => {
    const upload = getBucket().openUploadStream(filename, { metadata: { ...metadata, contentType } });
    upload.once('error', reject);
    upload.once('finish', () => resolve(upload.id));
    upload.end(buffer);
  });
}

async function findFile(fileId) {
  const [file] = await getBucket().find({ _id: new mongoose.Types.ObjectId(fileId) }).limit(1).toArray();
  return file || null;
}

function openDownloadStream(fileId) {
  return getBucket().openDownloadStream(new mongoose.Types.ObjectId(fileId));
}

async function deleteFile(fileId) {
  try {
    await getBucket().delete(new mongoose.Types.ObjectId(fileId));
  } catch (err) {
    console.error(`Could not delete file ${fileId}: ${err.message}`);
  }
}

module.exports = { saveFile, findFile, openDownloadStream, deleteFile };
