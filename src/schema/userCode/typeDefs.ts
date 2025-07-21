import { gql } from 'apollo-server';

export const typeDefs = gql`
  type UserCode {
    id: ID!
    user_code: Int!
    userID: String
    user_name: String!
    status: String!  # e.g., 'active', 'inactive'
    # Timestamps
    created_at: String
    updated_at: String
  }

  input UserCodeInput {
    user_code: Int!
    status: String!  # e.g., 'active', 'inactive'
    user_name: String!
  }
  type UserCodesResponse {
    filteredCount: Int!
    userCodes: [UserCode!]!
  }
  type Query {
    userCodesPaginated(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
    ): UserCodesResponse!
    allUserCodes: [UserCode!]!
    userCode(id: ID!): UserCode
  }

  type Mutation {
    createUserCode(input: UserCodeInput!): UserCode!
    updateUserCode(id: ID!, input: UserCodeInput!): UserCode!
    deleteUserCode(id: ID!): Boolean!
    changeUserCodeStatus(id: ID!, status: String!): UserCode!
  }
`;

export default typeDefs;