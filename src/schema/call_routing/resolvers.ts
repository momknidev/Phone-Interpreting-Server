import { eq } from 'drizzle-orm';
import { db } from '../../config/postgres';
import { AuthenticationError, UserInputError } from 'apollo-server';
import uuidv4 from '../../utils/uuidv4';
import { callRoutingSettings, clientPhones } from '../../models';
import { createSystemLog, getClientInfo } from '../../utils/systemLogger';
// import { uploadObjectToS3 } from '../../utils/s3Uploader';
import { uploadObjectToS3 } from '../../utils/uploadObjectToS3';
import { logger } from '../../config/logger';

const bucketName = process.env.AWS_S3_BUCKET_NAME;
const resolvers = {
  Query: {
    getCallRoutingSettings: async (
      _: any,
      { phone_number_id }: { phone_number_id: string },
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const result = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.phone_number_id, phone_number_id));

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
        callingCodePromptFile,
        callingCodeErrorFile,
        sourceLanguageErrorFile,
        sourceLanguagePromptFile,
        targetLanguagePromptFile,
        targetLanguageErrorFile,
        creditErrorFile,
        fallbackPromptTTS,
        inputAttemptsFile,
        callTypePromptFile,
        callTypeErrorFile,
        thirdPartyNumberPromptFile,
        thirdPartyNumberErrorFile,
        thirdPartyConfirmationPromptFile,
        thirdPartyConfirmationErrorFile,
        promptForConfirmationFile,
        ...rest
      } = input;

      const fileUploads: {
        welcomeMessageFile?: string;
        noAnswerMessageFile?: string;
        callingCodePromptFile?: string;
        callingCodeErrorFile?: string;
        sourceLanguageErrorFile?: string;
        sourceLanguagePromptFile?: string;
        targetLanguagePromptFile?: string;
        targetLanguageErrorFile?: string;
        creditErrorFile?: string;
        inputAttemptsFile?: string;
        callTypePromptFile?: string;
        callTypeErrorFile?: string;
        thirdPartyNumberPromptFile?: string;
        thirdPartyNumberErrorFile?: string;
        thirdPartyConfirmationPromptFile?: string;
        thirdPartyConfirmationErrorFile?: string;
        promptForConfirmationFile?: string;
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
        'inputAttemptsFile',
        'callTypePromptFile',
        'callTypeErrorFile',
        'thirdPartyNumberPromptFile',
        'thirdPartyNumberErrorFile',
        'thirdPartyConfirmationPromptFile',
        'thirdPartyConfirmationErrorFile',
        'promptForConfirmationFile',
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
        // Sanitize UUID fields - convert empty strings to null
        sourceLanguageId:
          rest.sourceLanguageId === '' ? null : rest.sourceLanguageId,
        targetLanguageId:
          rest.targetLanguageId === '' ? null : rest.targetLanguageId,
        updatedAt: new Date(),
        client_id: context.user.id,
      };

      // Additional validation for UUID fields
      if (
        baseData.sourceLanguageId &&
        typeof baseData.sourceLanguageId === 'string' &&
        baseData.sourceLanguageId.length > 0 &&
        baseData.sourceLanguageId.length !== 36
      ) {
        throw new UserInputError('Invalid sourceLanguageId format');
      }
      if (
        baseData.targetLanguageId &&
        typeof baseData.targetLanguageId === 'string' &&
        baseData.targetLanguageId.length > 0 &&
        baseData.targetLanguageId.length !== 36
      ) {
        throw new UserInputError('Invalid targetLanguageId format');
      }

      const existing = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.phone_number_id, input.phone_number_id));

      if (existing.length) {
        try {
          await db
            .update(callRoutingSettings)
            .set(baseData)
            .where(
              eq(callRoutingSettings.phone_number_id, input.phone_number_id),
            );

          const updated = await db
            .select()
            .from(callRoutingSettings)
            .where(
              eq(callRoutingSettings.phone_number_id, input.phone_number_id),
            );

          // Create system log for update
          const clientInfo = getClientInfo(context);
          const previous = existing[0] as Record<string, any>;
          const current = updated[0] as Record<string, any>;
          const changes: Record<string, any> = { id: current.id };

          Object.keys(current).forEach((key) => {
            if (
              key !== 'updatedAt' &&
              key !== 'createdAt' && // Optionally skip fields like updatedAt
              previous[key] !== current[key]
            ) {
              changes[key] = {
                old: previous[key],
                new: current[key],
              };
            }
          });

          // Remove id if it's the only field (no actual changes)
          if (Object.keys(changes).length === 1) delete changes.id;
          const existingPhone = await db.query.clientPhones.findFirst({
            where: eq(clientPhones.id, input.phone_number_id),
          });

          await createSystemLog({
            action: 'UPDATE',
            client_id: context.user.id,
            phone_number_id: input.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes,
            description: `Updated call routing settings for phone number ${
              existingPhone?.phone ?? input.phone_number_id
            }`,
          });

          return updated[0];
        } catch (error) {
          throw error;
        }
      } else {
        try {
          const record = {
            id: uuidv4(),
            ...baseData,
            createdAt: new Date(),
          };
          const [inserted] = await db
            .insert(callRoutingSettings)
            .values(record)
            .returning();

          // Create system log for creation
          const clientInfo = getClientInfo(context);
          await createSystemLog({
            action: 'CREATE',
            client_id: context.user.id,
            phone_number_id: input.phone_number_id,
            ip: clientInfo.ip,
            browser: clientInfo.browser,
            changes: {
              created: inserted,
            },
            description: `Created new call routing settings for phone number ${input.phone_number_id}`,
          });

          return inserted;
        } catch (error) {
          throw error;
        }
      }
    },

    deleteCallRoutingSettings: async (
      _: any,
      {
        client_id,
        phone_number_id,
      }: { client_id: string; phone_number_id: string },
      context: any,
    ) => {
      if (!context?.user) throw new AuthenticationError('Unauthenticated');

      const existing = await db
        .select()
        .from(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      if (!existing.length) throw new UserInputError('Settings not found');

      // Create system log for deletion
      const clientInfo = getClientInfo(context);
      await createSystemLog({
        action: 'DELETE',
        client_id,
        phone_number_id,
        ip: clientInfo.ip,
        browser: clientInfo.browser,
        changes: {
          deleted: existing[0],
        },
        description: `Deleted call routing settings for client ${client_id} and phone number ${phone_number_id}`,
      });

      await db
        .delete(callRoutingSettings)
        .where(eq(callRoutingSettings.client_id, client_id));

      return true;
    },
  },
};

export default resolvers;
