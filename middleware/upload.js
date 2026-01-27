const multer = require('multer');

const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 5);
const maxFileSizeBytes = Math.max(1, MAX_FILE_SIZE_MB) * 1024 * 1024;

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function fileFilter(req, file, cb) {
  if (allowedMimeTypes.has(file.mimetype)) {
    return cb(null, true);
  }
  cb(new Error('Unsupported image type'));
}

const upload = multer({
  storage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter,
});

const adminProductImageUpload = upload.single('image');

module.exports = {
  adminProductImageUpload,
};
