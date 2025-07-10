import AWS from 'aws-sdk';

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Access key ID
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Secret access key
  region: 'us-east-1', // Region
});
const s3 = new AWS.S3();

export function uploadObjectToS3(params: AWS.S3.PutObjectRequest) {
  return new Promise((resolve, reject) => {
    s3.upload(params, function (err: any, data: any) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

// Usage of function
// const stream = createReadStream();
// const params = {
//   Bucket: "lingoyouniverselinguistcv",
//   Key: filename,
//   Body: stream,
// };
// const s3Data = await uploadObjectToS3(params);
