// import { FileUpload } from 'graphql-upload/GraphQLUpload.mjs';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { AuthenticationError, UserInputError } from 'apollo-server';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import axios from 'axios'
import { Users, } from '../../models';
import { db } from '../../config/postgres';
import { User } from '../../../types/user'
import { uploadObjectToS3 } from '../../utils/uploadObjectToS3';
import uuidv4 from '../../utils/uuidv4';
import { logger } from '../../config/logger';

interface UserDetails {
  email: string;
  password: string;
  role?: string;
  customer?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  department?: string;
  status?: string,
  type?: string;
}


const generateToken = (user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string | null;
  type: string | null;
}) => {
  const secretKey = process.env.SECRET_KEY;
  if (!secretKey) {
    throw new Error('SECRET_KEY is not defined in environment variables');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      avatarUrl: user.avatarUrl || '',
      role: user.role || '',
      type: user.type || '',
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
    ): Promise<User> => {
      try {
        if (recaptcha) {
          const recaptchaResponse = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptcha}`
          );

          if (!recaptchaResponse.data.success) {
            throw new Error('reCAPTCHA validation failed.');
          }
        }

        const users = await db
          .select()
          .from(Users)
          .where(and(eq(Users.email, email), eq(Users.status, 'active')));

        const user = users[0];

        if (!user) {
          throw new UserInputError('User not found!');
        }

        // Check password validity
        if (!user.password) {
          throw new UserInputError('Invalid user credentials!');
        }

        const isCorrectPassword = await bcrypt.compare(password, user.password);
        if (!isCorrectPassword) {
          throw new UserInputError('Wrong password!');
        }

        // Generate token and return user data
        const token = generateToken(user);
        return {
          ...user,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          role: user.role || '',
          type: user.type || '',
          avatarUrl: user.avatarUrl || '',
          createdAt: user.createdAt?.toISOString() || '',
          updatedAt: user.updatedAt?.toISOString() || '',
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
    clientByID: async (_: any, { id }: { id: string }): Promise<User> => {
      try {
        const users = await db
          .select()
          .from(Users)
          .where(eq(Users.id, id));

        const user = users[0];

        if (!user) {
          throw new UserInputError('User not found!');
        }

        return {
          ...user,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          role: user.role || '',
          type: user.type || '',
          avatarUrl: user.avatarUrl || '',
          createdAt: user.createdAt?.toISOString() || '',
          updatedAt: user.updatedAt?.toISOString() || '',
          phone: String(user.phone) || undefined,
          password: undefined, // Exclude password from the response
        };
      } catch (error: any) {
        console.error('Error fetching client by ID:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },

    usersPaginatedList: async (
      _: any,
      {
        offset = 0,
        limit = 10,
        order = 'DESC',
        orderBy = 'createdAt',
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
        let query = db.select().from(Users);

        const filters = [];

        if (name) {
          filters.push(
            or(
              ilike(Users.firstName, '%' + name + '%'),
              ilike(Users.lastName, '%' + name + '%'),
              ilike(Users.phone, '%' + name + '%'),
              ilike(Users.email, '%' + name + '%'),

            )
          );
        }

        if (type) {
          filters.push(eq(Users.type, type));
        }

        if (filters.length > 0) {
          query.where(and(...filters));
        }

        // Apply sorting
        if (orderBy && order) {
          const isValidColumn = orderBy in Users && typeof Users[orderBy as keyof typeof Users] === 'object';
          if (isValidColumn) {
            const sortColumn = Users[orderBy as keyof typeof Users] as any;
            query.orderBy(
              order.toUpperCase() === 'ASC' ? asc(sortColumn) : desc(sortColumn)
            );
          } else {
            // Default to createdAt if invalid column provided
            query.orderBy(order.toUpperCase() === 'ASC' ? asc(Users.createdAt) : desc(Users.createdAt));
          }
        }

        // Get total count for pagination
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(Users)
          .where(filters.length > 0 ? and(...filters) : undefined);

        const totalCount = countResult[0]?.count || 0;

        // Apply pagination
        const users = await query.limit(limit).offset(offset);

        // Map users to remove sensitive data
        const mappedUsers = users.map(user => ({
          ...user,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          role: user.role || '',
          // type: user.type || '',
          avatarUrl: user.avatarUrl || '',
          createdAt: user.createdAt?.toISOString() || '',
          // updatedAt: user.updatedAt?.toISOString() || '',
          phone: String(user.phone) || undefined,
          // password: undefined, // Exclude password from the response
        }));

        return {
          users: mappedUsers,
          filteredCount: totalCount,
        };
      } catch (error: any) {
        console.error('Error fetching users paginated list:', error.message);
        throw new Error(error.message || 'Internal server error.');
      }
    },
  },
  Mutation: {
    addUser: async (_: any, { userDetails, file }: { userDetails: UserDetails, file?: any }, context: any) => {
      if (!context?.user) {

        throw new UserInputError('Unauthenticated');
      }
      try {
        const password = await bcrypt.hash(userDetails.password, 10);
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
          email: userDetails.email,
          role: userDetails.role,
          firstName: userDetails.firstName,
          lastName: userDetails.lastName,
          phone: userDetails.phone,
          type: userDetails.type,
          avatarUrl: s3URL,
        };
        console.log("result", userData);
        const result = await db.insert(Users).values(userData).returning();
        if (result) {
          console.log(JSON.stringify(result));
          return result[0];
        } else {
          throw new Error('User creation failed. No result returned.');
        }
      } catch (error: any) {
        console.error('Error creating user:', error);
        throw new Error('Error: ' + error);
      }
    },

    editUser: async (_: any, { id, userDetails, file }: { id: string, userDetails: UserDetails, file?: any }, context: any) => {
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
        let password = userDetails.password;
        if (password) {
          password = await bcrypt.hash(password, 10);
        }


        // Fetch the existing user details
        const users = await db.select().from(Users).where(eq(Users.id, id));
        const existingUser = users[0];

        if (!existingUser) {
          throw new UserInputError('User not found');
        }

        // Prepare the updated user data
        const updatedData = {
          password: password || existingUser.password,
          email: userDetails.email || existingUser.email,
          role: userDetails.role || existingUser.role,
          firstName: userDetails.firstName || existingUser.firstName,
          lastName: userDetails.lastName || existingUser.lastName,
          phone: userDetails.phone || existingUser.phone,
          type: userDetails.type || existingUser.type,
          avatarUrl: s3URL || existingUser.avatarUrl,
        };
        // Update user details in the database
        await db.update(Users).set(updatedData).where(eq(Users.id, id));

        // Fetch the updated user details
        const updatedUsers = await db.select().from(Users).where(eq(Users.id, id));
        const updatedUser = updatedUsers[0];

        if (updatedUser) {
          console.log('User updated successfully:', updatedUser);
          const token = generateToken(updatedUser);

          return { ...updatedUser, token };
        } else {
          throw new Error('User update failed. No updated user returned.');
        }
      } catch (error: any) {
        console.error('Error updating user:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },
    updateUserPassword: async (_: any, { id, newPassword, oldPassword }: { id: string, newPassword: string, oldPassword?: string }, context: any) => {
      if (!context?.user) {
        throw new AuthenticationError('Unauthenticated');
      }

      try {
        // Fetch the existing user details
        const users = await db.select().from(Users).where(eq(Users.id, id));
        const existingUser = users[0];

        if (!existingUser) {
          throw new UserInputError('User not found');
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
          await db.update(Users).set(updateData).where(eq(Users.id, id));

          // Fetch the updated user details
          const updatedUsers = await db.select().from(Users).where(eq(Users.id, id));
          const updatedUser = updatedUsers[0];

          // Generate token with updated user info
          const token = generateToken(updatedUser);

          return {
            ...updatedUser,
            token,
            displayName: `${updatedUser.firstName || ''} ${updatedUser.lastName || ''}`,
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
        const users = await db.select().from(Users).where(eq(Users.id, id));
        const existingUser = users[0];

        if (!existingUser) {
          throw new UserInputError('User not found');
        }

        // Update the user's status
        await db.update(Users).set({ status }).where(eq(Users.id, id));

        // Fetch the updated user details
        const updatedUsers = await db.select().from(Users).where(eq(Users.id, id));
        const updatedUser = updatedUsers[0];

        if (updatedUser) {
          console.log('User status updated successfully:', updatedUser);

          return {
            ...updatedUser,
            firstName: updatedUser.firstName || '',
            lastName: updatedUser.lastName || '',
            role: updatedUser.role || '',
            type: updatedUser.type || '',
            avatarUrl: updatedUser.avatarUrl || '',
            createdAt: updatedUser.createdAt?.toISOString() || '',
            updatedAt: updatedUser.updatedAt?.toISOString() || '',
            phone: String(updatedUser.phone) || undefined,
            password: undefined, // Exclude password from the response
            status: updatedUser.status || '',
          };
        } else {
          throw new Error('User status update failed. No updated user returned.');
        }
      } catch (error: any) {
        console.error('Error updating user status:', error.message);
        throw new Error('Error: ' + error.message);
      }
    },


  },
};

export default resolvers;
