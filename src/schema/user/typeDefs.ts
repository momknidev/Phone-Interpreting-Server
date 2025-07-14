import { gql } from "apollo-server";

export const typeDefs = gql`
  scalar Upload
  scalar JSON

  # types =======================>

  type User {
    id: ID
    firstName: String     
    lastName: String   
    email: String
    avatarUrl: String    
    phone: String
    role: String
    type: String
    token: String
    createdAt: String
    updatedAt: String
    status: String
  }
  # Inputs
  input userDetails {
    password: String
    email: String!
    role: String!
    firstName: String!
    status: String
    lastName: String!
    phone: String
    type: String
  }

  type UserPaginatedList {
    filteredCount: Int
    users: [User]
  }
  # ==============> QUERIES <================
  type Query {
    login(email: String, password: String, recaptcha: String): User
    clientByID(id: String): User
    usersPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      name: String
      type: String
    ): UserPaginatedList
  }

  # ==============> MUTATIONS <================
  type Mutation {
    addUser(userDetails: userDetails, file: Upload): User
    editUser(id: String, userDetails: userDetails, file: Upload): User!
    updateUserPassword(
      id: String
      newPassword: String
      oldPassword: String
    ): User
    changeStatus(id:ID!, status: String):User
  }
`;

export default typeDefs;
