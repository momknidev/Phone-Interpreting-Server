import { gql } from 'apollo-server';

export const typeDefs = gql`
  scalar Upload
  scalar JSON

  # types =======================>

  type Client {
    id: ID
    first_name: String
    last_name: String
    email: String
    avatar_url: String
    phone: String
    role: String
    type: String
    token: String
    created_at: String
    updated_at: String
    status: String
  }

  type ClientPhone {
    id: ID!
    client_id: ID!
    phone: String!
    label: String
    created_at: String
    updated_at: String
  }
  # Inputs

  input addClientPhoneInput {
    phone: String!
    label: String
  }

  input updateClientPhoneInput {
    phone: String
    label: String
  }
  input clientDetails {
    password: String
    email: String!
    role: String!
    first_name: String!
    status: String
    last_name: String!
    phone: String
    type: String
  }

  type ClientPaginatedList {
    filteredCount: Int
    clients: [Client]
  }
  # ==============> QUERIES <================
  type Query {
    login(email: String, password: String, recaptcha: String): Client
    clientByID(id: String): Client
    clientPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      name: String
      type: String
    ): ClientPaginatedList
    clientPhones(clientId: ID!): [ClientPhone!]!
    clientPhone(id: ID!): ClientPhone
  }

  # ==============> MUTATIONS <================
  type Mutation {
    addClient(clientDetails: clientDetails, file: Upload): Client
    editClient(id: String, clientDetails: clientDetails, file: Upload): Client!
    updateClientPassword(
      id: String
      newPassword: String
      oldPassword: String
    ): Client
    changeStatus(id: ID!, status: String): Client
    requestNewPhone(description: String): Boolean
    addClientPhone(clientId: ID!, input: addClientPhoneInput!): ClientPhone!
    updateClientPhone(id: ID!, input: updateClientPhoneInput!): ClientPhone!
    deleteClientPhone(id: ID!): Boolean!
  }
`;

export default typeDefs;
