import { gql } from "apollo-server-express";
export const typeDefs = gql`
  
  scalar Upload
  type Query {
    allUsers: [Users]
    listSoftwareDevelopers : [Users]
    users(email: String, password: String, recaptcha:String): Users
    userNames: [String]
    managersList(department:String):[Users]
    userById(id: String): Users
    userByEmail(email:String):Users
  }
  # types =======================>
  
  input languages {
    code: String
    name: String
    nativename:String
  }

  type Languages {
    code: String
    name: String
    nativename:String
  }


  type Users {
    id: ID
    password: String
    email: String
    role: String
    name: String
    avatarUrl: String
    phoneNumber: String
    department: String
    description: String
    token: String
    type: String 
    jobTitle:String
    language:[Languages]
     personalEmail:String
    address1:String
    address2:String
    city:String
    postcode:String
    country: Countries
    dob:String
    permissions: [String]
  }
  # Inputs
  input userDetails {
    id: ID
    password: String!
    email: String!
    role: String!
    name: String!
    phoneNumber: String
    department: String
    description: String
    type: String 
    jobTitle:String
    personalEmail:String
    address1:String
    address2:String
    city:String
    postcode:String
    country:countryDetails
    language: [languages]
    dob:String
    permissions: [String]
  }
  input userEditDetails {
    oldPassword: String
    newPassword: String
    email: String
    name: String
    phoneNumber: String
    description: String
    personalEmail:String
    address1:String
    address2:String
    city:String
    jobTitle:String
    postcode:String
    country:countryDetails
    language: [languages]
    dob:String
    permissions: [String]
  }
  
  # ==============> MUTATIONS <================
  type Mutation {
    addUser(userDetails: userDetails, file: Upload): String
    editUsers(id: String, userDetails: userDetails): Users!
    editUser( userDetails: userEditDetails ,file: Upload): Users
    editUserPermissions(id: String, permissions: [String]): Users
  }
`;

export default typeDefs;
