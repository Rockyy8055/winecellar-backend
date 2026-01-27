const { S3Client } = require('@aws-sdk/client-s3');

const awsRegion = process.env.AWS_REGION;
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

const s3Client = new S3Client({
  region: awsRegion,
  credentials: awsAccessKeyId && awsSecretAccessKey ? {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  } : undefined,
});

module.exports = {
  s3Client,
};
