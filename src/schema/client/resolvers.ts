// import { FileUpload } from 'graphql-upload/GraphQLUpload.mjs';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import axios from 'axios'
import { Client, clientPhones } from '../../models';
import { db } from '../../config/postgres';
import { Client as ClientUser } from '../../../types/user'
import { uploadObjectToS3 } from '../../utils/uploadObjectToS3';
import uuidv4 from '../../utils/uuidv4';
import { FileUpload } from 'graphql-upload-ts';


interface ClientDetails {
  email: string;
  password: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  status?: string,
  type?: string;
  phoneList?: { phone: string; label: string }[];
  avatar_url?: string | FileUpload;
}


const generateToken = (user: {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string | null;
  type: string | null;
  client_phones?: { phone: string, label: string }[];
}) => {
  const secretKey = process.env.SECRET_KEY;
  if (!secretKey) {
    throw new Error('SECRET_KEY is not defined in environment variables');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      avatar_url: user.avatar_url || '',
      role: user.role || '',
      type: user.type || '',
      client_phones: user.client_phones,
    },
    secretKey,
    { expiresIn: '24h' }
  );
};

const resolvers = {
  // Upload: FileUpload,
  Query: {
    login: async (
      _: any,
      { email, password, recaptcha }: { email: string; password: string; recaptcha?: string }
    ): Promise<ClientUser> => {
      try {
        if (recaptcha) {
          const recaptchaResponse = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptcha}`
          );

          if (!recaptchaResponse.data.success) {
            throw new Error('reCAPTCHA validation failed.');
          }
        }


        const user = await db.query.Client.findFirst({
          where: and(ilike(Client.email, email), eq(Client.status, 'active')),
          with: {
            client_phones: true,
          },
        });

        if (!user) {
          throw new UserInputError('ClientUser not found!');
        }
        // Check password validity
        if (!user.password) {
          throw new UserInputError('Invalid user credentials!');
        }

        const isCorrectPassword = await bcrypt.compare(password, user.password);
        if (!isCorrectPassword) {
          throw new UserInputError('Wrong password!');
        }
        const obj = {
          ...user,
          client_phones: user.client_phones.map(phone => ({
            phone: phone.phone ?? '',
            label: phone.label ?? '',
          })),
        }
        // Generate token and return user data
        const token = generateToken(obj);
        return {
          ...user,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          role: user.role || '',
          type: user.type || '',
          avatar_url: user.avatar_url || '',
          created_at: user.created_at?.toISOString() || '',
          updated_at: user.updated_at?.toISOString() || '',
          phone: String(user.phone) || undefined,
          password: undefined, // Exclude password from the response
          token,
        };
      } catch (error: any) {
        // Handle errors gracefully
        console.error('Error during client login:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
    clientByID: async (_: any, { id }: { id: string }, context: any): Promise<any> => {
      // if (!context?.user) {
      //   throw new AuthenticationError('Unauthenticated');
      // }
      try {
        const result = await db.query.Client.findFirst({
          where: eq(Client.id, id),
          with: {
            client_phones: true,
          },
        });

        console.log("result", result);
        const user = result

        if (!user) {
          throw new UserInputError('ClientUser not found!');
        }

        return result
      } catch (error: any) {
        console.error('Error:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    clientPaginatedList: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'created_at',
        name = '',
        type = ''
      }: {
        offset?: number;
        limit?: number;
        order?: string;
        orderBy?: string;
        name?: string;
        type?: string;
      }, context: any
    ) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        let query = db.select().from(Client);

        const filters = [];

        if (name) {
          filters.push(
            or(
              ilike(Client.first_name, '%' + name + '%'),
              ilike(Client.last_name, '%' + name + '%'),
              ilike(Client.phone, '%' + name + '%'),
              ilike(Client.email, '%' + name + '%'),

            )
          );
        }

        if (type) {
          filters.push(eq(Client.type, type));
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in Client && typeof Client[orderBy as keyof typeof Client] === 'object';
          if (isValidColumn) {
            const sortColumn = Client[orderBy as keyof typeof Client] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn)
            );
          } else {
            // Default to created_at if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(Client.created_at) : desc(Client.created_at));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(Client)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const users = await query.limit(limit).offset(offset);

        // Map users to remove sensitive data
        const mappedUsers = users.map(user => ({
          ...user,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          role: user.role || '',
          // type: user.type || '',
          avatar_url: user.avatar_url || '',
          created_at: user.created_at?.toISOString() || '',
          // updated_at: user.updated_at?.toISOString() || '',
          phone: String(user.phone) || undefined,
          // password: undefined, // Exclude password from the response
        }));

        return {
          clients: mappedUsers,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching users paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },
  Mutation: {
    addClient: async (_: any, { clientDetails, file }: { clientDetails: ClientDetails, file?: any }, context: any) => {
      if (!context?.user) {

        throw new UserInputError('Unauthenticated');
      }
      console.log("clientDetails", clientDetails);
      try {
        if (!clientDetails.password) {
          throw new UserInputError('Password is required');
        }
        const password = await bcrypt.hash(clientDetails.password, 10);
        let s3URL = '';

        if (file) {
          const { createReadStream, filename } = await file;
          const stream = createReadStream();
          const params = {
            Bucket: 'lingoyouniverselinguistimage',
            Key: filename,
            Body: stream,
          };
          const s3Data: any = await uploadObjectToS3(params);
          s3URL = s3Data.Location;
        }

        const userData = {
          id: uuidv4(),
          password,
          email: clientDetails.email,
          role: clientDetails.role,
          first_name: clientDetails.first_name,
          last_name: clientDetails.last_name,
          phone: clientDetails.phone,
          type: clientDetails.type,
          avatar_url: s3URL,
        };
        console.log("result", userData);
        const result = await db.insert(Client).values(userData).returning();
        const phoneNumbers = clientDetails.phoneList || [];
        if (phoneNumbers.length > 0) {
          const phoneData = phoneNumbers.map((phone: { phone: string; label: string }) => ({
            client_id: userData.id,
            id: uuidv4(),
            phone: phone.phone,
            label: phone.label,

          }));
          let phones = await db.insert(clientPhones).values(phoneData).returning();
          console.log("phones", phones);
        }
        if (result) {
          console.log(JSON.stringify(result));
          return result[0];
        } else {
          throw new Error('ClientUser creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating user:', error);
        throw new Error('Error: ' + error);
      }
    },

    editClient: async (_: any, { id, clientDetails, file }: { id: string, clientDetails: ClientDetails, file?: any }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        let s3URL = '';

        if (file) {
          const { createReadStream, filename } = await file;
          const stream = createReadStream();
          const params = {
            Bucket: 'lingoyouniverselinguistimage',
            Key: filename,
            Body: stream,
          };

          const s3Data: any = await uploadObjectToS3(params);
          s3URL = s3Data.Location;
        }

        // If password is provided, hash it; otherwise, leave it as is
        let password = clientDetails.password;
        if (password) {
          password = await bcrypt.hash(password, 10);
        }


        // Fetch the existing user details
        const users = await db.select().from(Client).where(eq(Client.id, id));
        const existingUser = users[0];

        if (!existingUser) {
          throw new UserInputError('ClientUser not found');
        }

        // Prepare the updated user data
        const updatedData = {
          password: password || existingUser.password,
          email: clientDetails.email || existingUser.email,
          role: clientDetails.role || existingUser.role,
          first_name: clientDetails.first_name || existingUser.first_name,
          last_name: clientDetails.last_name || existingUser.last_name,
          phone: clientDetails.phone || existingUser.phone,
          type: clientDetails.type || existingUser.type,
          avatar_url: s3URL || existingUser.avatar_url,
        };
        // Update user details in the database
        await db.update(Client).set(updatedData).where(eq(Client.id, id));

        // Fetch the updated user details
        const updatedUsers = await db.select().from(Client).where(eq(Client.id, id));
        const updatedUser = updatedUsers[0];
        const phoneNumbers = clientDetails.phoneList || [];
        console.log("phoneNumbers", phoneNumbers);
        if (phoneNumbers.length > 0) {
          // Delete existing phone numbers for the user
          console.log("phoneNumbers", phoneNumbers);
          await db.delete(clientPhones).where(eq(clientPhones.client_id, id));
          // Insert new phone numbers
          const phoneData = phoneNumbers.map((phone: { phone: string; label: string }) => ({
            client_id: id,
            id: uuidv4(),
            phone: phone.phone,
            label: phone.label,
          }));
          let res = await db.insert(clientPhones).values(phoneData).returning();
          console.log("res", res);
        }
        if (updatedUser) {
          console.log('ClientUser updated successfully:', updatedUser);
          const token = generateToken(updatedUser);

          return { ...updatedUser, token };
        } else {
          throw new Error('ClientUser update failed. No updated user returned.');
        }
      } catch (error: any) {
        console.error('Error updating user:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    updateClientPassword: async (_: any, { id, newPassword, oldPassword }: { id: string, newPassword: string, oldPassword?: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }
      try {
        // Fetch the existing user details
        const users = await db.select().from(Client).where(eq(Client.id, id));
        const existingUser = users[0];

        if (!existingUser) {
          throw new UserInputError('ClientUser not found');
        }

        // Initialize update object with proper typing
        const updateData: Partial<typeof existingUser> = {};

        // Handle regular password update if provided
        if (newPassword) {
          // Verify old password if provided
          if (oldPassword) {
            if (!existingUser.password) {
              throw new UserInputError('Password not set for this user');
            }
            const isCorrectPassword = await bcrypt.compare(oldPassword, existingUser.password);
            if (!isCorrectPassword) {
              throw new UserInputError('Wrong old password');
            }
          }
          updateData['password'] = await bcrypt.hash(newPassword, 10);
        }




        // Only perform update if there are fields to update
        if (Object.keys(updateData).length > 0) {
          await db.update(Client).set(updateData).where(eq(Client.id, id));

          // Fetch the updated user details
          const updatedUsers = await db.select().from(Client).where(eq(Client.id, id));
          const updatedUser = updatedUsers[0];

          // Generate token with updated user info
          const token = generateToken(updatedUser);

          return {
            ...updatedUser,
            token,
            displayName: `${updatedUser.first_name || ''} ${updatedUser.last_name || ''}`,
          };
        } else {
          throw new UserInputError('No password updates provided');
        }
      } catch (error: any) {
        console.error('Error updating password(s):', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    changeStatus: async (_: any, { id, status }: { id: string, status: string }, context: any) => {
      // if (!context?.user) {
      //   throw new AuthenticationError('Unauthenticated');
      // }

      try {
        // Fetch the existing user details
        const users = await db.select().from(Client).where(eq(Client.id, id));
        const existingUser = users[0];

        if (!existingUser) {
          throw new UserInputError('ClientUser not found');
        }

        // Update the user's status
        await db.update(Client).set({ status }).where(eq(Client.id, id));

        // Fetch the updated user details
        const updatedUsers = await db.select().from(Client).where(eq(Client.id, id));
        const updatedUser = updatedUsers[0];

        if (updatedUser) {
          console.log('ClientUser status updated successfully:', updatedUser);

          return {
            ...updatedUser,
            first_name: updatedUser.first_name || '',
            last_name: updatedUser.last_name || '',
            role: updatedUser.role || '',
            type: updatedUser.type || '',
            avatar_url: updatedUser.avatar_url || '',
            created_at: updatedUser.created_at?.toISOString() || '',
            updated_at: updatedUser.updated_at?.toISOString() || '',
            phone: String(updatedUser.phone) || undefined,
            password: undefined, // Exclude password from the response
            status: updatedUser.status || '',
          };
        } else {
          throw new Error('ClientUser status update failed. No updated user returned.');
        }
      } catch (error: any) {
        console.error('Error updating user status:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },


  },
};

export default resolvers;
