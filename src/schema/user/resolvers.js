import { GraphQLUpload } from "graphql-upload";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AuthenticationError, UserInputError } from "apollo-server-express";
import { userModel } from "./model.js";
import AWS from 'aws-sdk';
import { SECRET_KEY } from "../../config/connection.js";
import axios from "axios";

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phoneNumber: user.phoneNumber,
      department: user.department,
      role: user.role,
      description: user.description,
      language: user.language,
      type: "user",
      jobTitle: user.jobTitle,
      personalEmail: user.personalEmail,
      address1: user.address1,
      address2: user.address2,
      city: user.city,
      country: user.country,
      postcode: user.postcode,
      dob: user.dob,
      permissions: user.permissions || [],
    },
    SECRET_KEY,
    { expiresIn: "24h" }
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolvers = {
  Upload: GraphQLUpload,
  Query: {
    userByEmail:async(_, {email})=>{
       const user = await userModel.findOne({email:email});
       if(user){
        return user
       }
    },
    managersList: async (_, args, context) => {
      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      } const user = await userModel.find({ department: args.department });
      if (user) {
        return user;
      } else {
        throw new UserInputError("No user found!");
      }
    },
    allUsers: async (_, args, context) => {
      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      }
      const user = await userModel.find({});
      if (user) {
        return user;
      } else {
        throw new UserInputError("No user found!");
      }
    },
    listSoftwareDevelopers: async (_, args, context) => {
      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      }
      const user = await userModel.find({role:"Software Developer"});
      if (user) {
        return user?.map(item=>{
          console.log(item)
          return{
            ...item?._doc,
            id: item?._id,
          }
        });      } else {
        throw new UserInputError("No user found!");
      }
    },
    userNames: async (_, args) => {
      const users = await userModel.find({});
      if (users) {
        // Find User and project required Details instead of Map Function
        const userName = users.map((user) => {
          const { name } = user;
          return name;
        });
        return userName;
      } else {
        throw new UserInputError("No user found!");
      }
    },
    users: async (_, { email, password, recaptcha }) => {
      if (recaptcha) {
        const response = await axios.post(
          `https://www.google.com/recaptcha/api/siteverify?secret=${`${process.env.RECAPTCHA_SECRET_KEY}`}&response=${recaptcha}`
        );

        if (!response.data.success) {
          throw new Error('reCAPTCHA validation failed.');
        }
      }
      const user = await userModel.findOne({ email });
      console.log(user);
      if (!user) {
        throw new UserInputError("No user found!");
      }
      const isCorrectPassword = await bcrypt.compare(password, user.password);
      if (!isCorrectPassword) {
        console.log("Incorrect Password")
        throw new UserInputError("Password incorrect!");
      }
      const token = generateToken(user);
      return { ...user._doc, id: user._id, token };
    },
    userById: async (_, args, context) => {
      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      }      // find by user ID
      const user = await userModel.findOne({
        _id: args.id,
      });
      if (user) {
        return user;
      } else {
        throw new UserInputError("No user found!");
      }
    },
  },
  Mutation: {
    addUser: async (_, { userDetails, file }, context) => {
      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      }
      console.log(userDetails)
      const password = await bcrypt.hash(userDetails.password, 10);
      console.log(password);
      const { createReadStream, filename, encoding, mimetype } = await file;
      const stream = createReadStream();
      AWS.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Access key ID
        secretAccesskey: process.env.AWS_SECRET_ACCESS_KEY, // Secret access key
        region: "us-east-1" //Region
      })
      const s3 = new AWS.S3();
      const params = {
        Bucket: 'lingoyouniverselinguistimage',
        Key: filename, // File name you want to save as in S3
        Body: stream
      };
      function uploadFile(params) {
        return new Promise((resolve, reject) => {
          s3.upload(params, function (err, data) {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        });
      }
      const s3Data = await uploadFile(params);
      const s3URL = s3Data.Location;
      const AllDetails = {
        password: password,
        email: userDetails.email,
        role: userDetails.role,
        name: userDetails.name,
        type: 'user',
        description: userDetails.description,
        phoneNumber: userDetails.phoneNumber,
        department: userDetails.department,
        avatarUrl: s3URL,
        time: new Date().getTime(),
        jobTitle: userDetails.jobTitle,
        personalEmail: userDetails.personalEmail,
        address1: userDetails.address1,
        address2: userDetails.address2,
        city: userDetails.city,
        country: userDetails.country,
        language: userDetails.language,
        postcode: userDetails.postcode,
        dob: userDetails.dob,
      };
      let savedDetails = new userModel({ ...AllDetails });
      const res = await savedDetails.save()
      if (res) {
        console.log(res);
        return "Profile Created";
      }
    },
    editUser: async (_, { userDetails, file }, context) => {

      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      } const id = context.user.id
      console.log("context.user", context.user)

      if (userDetails.newPassword && userDetails.oldPassword) {
        console.log("Password Updating Condition Called")
        const user = await userModel.findOne({ _id: id });
        if (!user) {
          throw new UserInputError("Incorrect Email");
        }
        const isCorrectPassword = await bcrypt.compare(userDetails.oldPassword, user.password);
        if (!isCorrectPassword) {
          console.log("Incorrect Old Password")
          throw new UserInputError("Incorrect Old Password");
        }
        console.log("isCorrectPassword", isCorrectPassword)

        const password = await bcrypt.hash(userDetails.newPassword, 10);

        // const pathArray = patharray.split('/');
        const AllDetails = {
          password: password,
        };

        const UpdatedUser = await userModel.findOneAndUpdate(
          { _id: id },
          { ...AllDetails },
          { new: true }
        );
        if (UpdatedUser) {
          const token = generateToken(UpdatedUser);
          const obj = {

            "avatarUrl": UpdatedUser?.avatarUrl,
            "department": UpdatedUser?.department,
            "description": UpdatedUser?.description,
            "email": UpdatedUser?.email,
            "name": UpdatedUser?.name,
            "phoneNumber": UpdatedUser?.phoneNumber,
            "role": UpdatedUser?.role,
            "type": UpdatedUser?.type,
            personalEmail: UpdatedUser.personalEmail,
            address1: UpdatedUser.address1,
            address2: UpdatedUser.address2,
            city: UpdatedUser.city,
            country: UpdatedUser.country,
            postcode: UpdatedUser.postcode,
            dob: UpdatedUser.dob,
          }
          return { id: UpdatedUser._id, token, ...obj, };
        }
      } else if (
        userDetails.name || userDetails.email || userDetails.description || userDetails.phoneNumber || userDetails.language || file
      ) {
        var updatedUser;
        if (!file) {
          console.log("Calling File Not available")
          updatedUser = await userModel.findOneAndUpdate(
            { _id: id },
            {
              ...userDetails,
            },
            { new: true }
          );
          console.log("updatedUser File Not", updatedUser);
          const token = generateToken(updatedUser);
          const data = {
            ...updatedUser._doc, id: updatedUser._id, token
          }
          console.log("Returned Data", data)
          return { ...updatedUser._doc, id: updatedUser._id, token };
          // return updatedUser

        }
        console.log("Other Details Updating Condition Called File Available")
        const { createReadStream, filename, encoding, mimetype } = await file;
        const stream = createReadStream();
        AWS.config.update({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Access key ID
          secretAccesskey: process.env.AWS_SECRET_ACCESS_KEY, // Secret access key
          region: "us-east-1" //Region
        })
        const s3 = new AWS.S3();
        const params = {
          Bucket: 'lingoyouniverselinguistimage',
          Key: filename, // File name you want to save as in S3
          Body: stream
        };
        function uploadFile(params) {
          return new Promise((resolve, reject) => {
            s3.upload(params, function (err, data) {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            });
          });
        }
        const s3Data = await uploadFile(params);
        const s3URL = s3Data.Location;
        updatedUser = await userModel.findOneAndUpdate(
          { _id: id }, { ...userDetails, avatarUrl: s3URL }, { new: true }
        );
        if (updatedUser) {
          console.log("updatedUser File", updatedUser);
          const token = generateToken(updatedUser);
          const data = {
            ...updatedUser._doc, id: updatedUser._id, token
          }
          console.log("Returned Data", data)
          return { ...updatedUser._doc, id: updatedUser._id, token };
        }
      }
      else {
        throw new UserInputError("Error! User Cannot updated");
      }
    },
    editUserPermissions: async (_, {id, permissions}, context) => {
      if (!context?.user) {
        throw new AuthenticationError("Unauthenticated");
      }
      const user = await userModel.findOneAndUpdate({_id: id}, {permissions: permissions}, {new: true});
      if (user) {
        return {  id: user._id, permissions: user.permissions };
      } else {
        throw new UserInputError("No user found!");
      }
    }
  },
};

export default resolvers;
