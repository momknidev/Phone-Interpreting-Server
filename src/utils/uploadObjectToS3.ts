import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { logger } from '../config/logger';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Upload function
export async function uploadObjectToS3(
  params: PutObjectCommandInput,
): Promise<string> {
  try {
    logger.info(
      `Starting S3 upload... ${process.env.AWS_REGION} ${process.env.AWS_S3_BUCKET_NAME} ${process.env.AWS_ACCESS_KEY_ID} ${process.env.AWS_SECRET_ACCESS_KEY}`,
    );
    logger.info('Uploading file to S3 with params:', params);

    // Convert stream to buffer if Body is a stream
    if (
      params.Body &&
      typeof params.Body === 'object' &&
      'pipe' in params.Body
    ) {
      const chunks: Buffer[] = [];
      for await (const chunk of params.Body as any) {
        chunks.push(chunk);
      }
      params.Body = Buffer.concat(chunks);
    }

    const command = new PutObjectCommand(params);
    const data = await s3Client.send(command);
    logger.info('S3 Upload Success:', data);
    // Return the S3 public URL (assumes public-read or signed URL policy)
    const region = process.env.AWS_REGION || 'us-east-1';
    const url = `https://${params.Bucket}.s3.${region}.amazonaws.com/${params.Key}`;
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
