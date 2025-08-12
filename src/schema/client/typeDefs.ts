import { gql } from "apollo-server";

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
    client_phones: JSON
  }
  # Inputs
  input clientPhoneInput {
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
    phoneList: [clientPhoneInput]
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
    changeStatus(id:ID!, status: String):Client
    requestNewPhone( description:String):Boolean
  }
`;

export default typeDefs;
