const { S3Client } = require('@aws-sdk/client-s3');

const awsRegion = process.env.AWS_REGION;
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

// Only create S3 client if credentials are configured
let s3Client = null;
if (awsRegion && awsAccessKeyId && awsSecretAccessKey) {
  s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });
}

module.exports = {
  s3Client,
};
