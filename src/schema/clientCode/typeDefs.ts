import { gql } from 'apollo-server';

export const typeDefs = gql`
  type ClientCode {
    id: ID!
    client_code: Int!
    client_id: String
    code_label: String!
    status: String!
    created_at: String
    updated_at: String
    credits: Int
  }

  input ClientCodeInput {
    client_code: Int!
    status: String!
    code_label: String!
    phone_number_id: ID!
    credits: Int
  }

  type ClientCodesResponse {
    filteredCount: Int!
    clientCodes: [ClientCode]!
  }

  type Query {
    clientCodesPaginated(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
      phone_number_id: ID!
    ): ClientCodesResponse!
    allClientCodes: [ClientCode]!
    clientCode(id: ID!, phone_number_id: ID!): ClientCode
  }

  type Mutation {
    createClientCode(input: ClientCodeInput!): ClientCode!
    updateClientCode(id: ID!, input: ClientCodeInput!): ClientCode!
    deleteClientCode(id: ID!): Boolean!
    changeClientCodeStatus(id: ID!, status: String!): ClientCode!
  }
`;

export default typeDefs;
