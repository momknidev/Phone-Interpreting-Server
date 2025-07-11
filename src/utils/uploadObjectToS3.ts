import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function uploadObjectToS3(params: {
  Bucket: string;
  Key: string;
  Body: any;
  ContentType?: string;
  [key: string]: any;
}) {
  try {
    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);
    return response;
  } catch (err) {
    throw err;
  }
}

// Usage of function
// const stream = createReadStream();
// const params = {
//   Bucket: "lingoyouniverselinguistcv",
//   Key: filename,
//   Body: stream,
// };
// const s3Data = await uploadObjectToS3(params);
