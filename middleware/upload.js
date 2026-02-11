const multer = require('multer');

const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 5);
const maxFileSizeBytes = Math.max(1, MAX_FILE_SIZE_MB) * 1024 * 1024;

const storage = multer.memoryStorage();

// Allow all image types - only validate that it starts with 'image/'
function fileFilter(req, file, cb) {
  if (file.mimetype && file.mimetype.toLowerCase().startsWith('image/')) {
    return cb(null, true);
  }
  cb(new Error('Only image files are allowed'));
}

const upload = multer({
  storage,
  limits: { fileSize: maxFileSizeBytes },
  fileFilter,
});

const adminProductImageUpload = upload.single('image');
const adminHeroSlideImageUpload = upload.single('image');

module.exports = {
  adminProductImageUpload,
  adminHeroSlideImageUpload,
};
