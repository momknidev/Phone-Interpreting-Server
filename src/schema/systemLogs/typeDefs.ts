import { gql } from 'apollo-server';

export const systemLogsTypeDefs = gql`
  enum SystemLogAction {
    LOGIN
    LOGOUT
    UPDATE
    CREATE
    DELETE
  }

  type SystemLog {
    id: ID!
    action: SystemLogAction
    client_id: ID
    phone_number_id: ID!
    ip: String
    browser: String
    changes: JSON
    description: String
    createdAt: String
    updatedAt: String
  }

  input SystemLogInput {
    action: SystemLogAction!
    client_id: ID
    phone_number_id: ID!
    ip: String
    browser: String
    changes: JSON
    description: String
  }

  type SystemLogsResponse {
    filteredCount: Int!
    systemLogs: [SystemLog]!
  }

  type Query {
    systemLogsPaginated(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
      phone_number_id: ID!
    ): SystemLogsResponse!
    allSystemLogs: [SystemLog]!
    systemLog(id: ID!, phone_number_id: ID!): SystemLog
  }

  type Mutation {
    createSystemLog(input: SystemLogInput!): SystemLog!
    updateSystemLog(id: ID!, input: SystemLogInput!): SystemLog!
    deleteSystemLog(id: ID!): Boolean!
  }
`;

export default systemLogsTypeDefs;
