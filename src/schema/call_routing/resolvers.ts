import { eq } from 'drizzle-orm';
import { db } from '../../config/postgres';
import { AuthenticationError, UserInputError } from 'apollo-server';
import uuidv4 from '../../utils/uuidv4';
import { callRoutingSettings } from '../../models';
// import { uploadObjectToS3 } from '../../utils/s3Uploader';
import { uploadObjectToS3 } from '../../utils/uploadObjectToS3';

const bucketName = process.env.AWS_S3_BUCKET_NAME;
const resolvers = {
  Query: {
    getCallRoutingSettings: async (
      _: any,
      { phone_number }: { phone_number: string },
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const result = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.phone_number, phone_number));

      return result[0] || null;
    },

    allCallRoutingSettings: async () => {
      return await db.select().from(callRoutingSettings);
    },
  },

  Mutation: {
    createOrUpdateCallRoutingSettings: async (
      _: any,
      { input }: { input: any },
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');
      const {
        welcomeMessageFile,
        noAnswerMessageFile,
        callingCodeErrorFile,
        sourceLanguageErrorFile,
        sourceLanguagePromptFile,
        targetLanguagePromptFile,
        targetLanguageErrorFile,
        creditErrorFile,
        fallbackPromptTTS,
        ...rest
      } = input;

      const fileUploads: {
        welcomeMessageFile?: string;
        noAnswerMessageFile?: string;
        callingCodeErrorFile?: string;
        sourceLanguageErrorFile?: string;
        sourceLanguagePromptFile?: string;
        targetLanguagePromptFile?: string;
        targetLanguageErrorFile?: string;
        creditErrorFile?: string;
      } = {};

      // Upload files and get URLs
      const fileFields = [
        'welcomeMessageFile',
        'noAnswerMessageFile',
        'callingCodeErrorFile',
        'sourceLanguageErrorFile',
        'sourceLanguagePromptFile',
        'targetLanguagePromptFile',
        'targetLanguageErrorFile',
        'creditErrorFile',
        'callingCodePromptFile',
      ];

      for (const field of fileFields) {
        const file = input[field];
        if (file) {
          const { createReadStream, filename, mimetype } = await file;
          const stream = createReadStream();
          const params = {
            Bucket: bucketName,
            Key: `${Date.now()}-${filename.replace(/\s+/g, '_')}`,
            Body: stream,
            ContentType: mimetype,
          };
          const url = await uploadObjectToS3(params);
          fileUploads[field as keyof typeof fileUploads] = url;
        }
      }

      const baseData = {
        ...rest,
        ...fileUploads,
        fallbackPrompt: fallbackPromptTTS,
        updatedAt: new Date(),
        client_id: context.user.id,
      };
      console.log('baseData', baseData);
      const existing = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.phone_number, input.phone_number));

      if (existing.length) {
        await db
          .update(callRoutingSettings)
          .set(baseData)
          .where(eq(callRoutingSettings.phone_number, input.phone_number));

        const updated = await db
          .select()
          .from(callRoutingSettings)
          .where(eq(callRoutingSettings.phone_number, input.phone_number));

        return updated[0];
      } else {
        const record = {
          id: uuidv4(),
          ...baseData,
          createdAt: new Date(),
        };

        await db.insert(callRoutingSettings).values(record);
        return record;
      }
    },

    deleteCallRoutingSettings: async (
      _: any,
      { client_id, phone_number }: { client_id: string; phone_number: string },
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const existing = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      if (!existing.length) throw new UserInputError('Settings not found');

      await db
        .delete(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      return true;
    },
  },
};

export default resolvers;
