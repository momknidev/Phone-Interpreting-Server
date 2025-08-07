import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { ReadStream } from 'fs';

// Initialize S3 client
const s3Client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Upload function
export async function uploadObjectToS3(params: PutObjectCommandInput): Promise<string> {
  try {
    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    // Return the S3 public URL (assumes public-read or signed URL policy)
    const url = `https://${params.Bucket}.s3.${s3Client.config.region}.amazonaws.com/${params.Key}`;
    return url;
  } catch (err) {
    console.error('S3 Upload Error:', err);
    throw new Error('Failed to upload file to S3');
  }
}


// const bucketName = 'lingoyouniverselinguistcv';

// const params = {
//   Bucket: bucketName,
//   Key: `${Date.now()}-${filename}`, // Add timestamp to avoid collisions
//   Body: stream,
//   ContentType: mimetype,
//   ACL: 'public-read', // Optional: only if you want public access
// };

// const url = await uploadObjectToS3(params);
// return url;