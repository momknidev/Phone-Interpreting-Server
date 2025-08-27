import { gql } from 'apollo-server';

const typeDefs = gql`
  type CallReports {
    id: ID!
    client_id: ID
    interpreter_id: ID
    interpreter: String
    caller_phone: String
    client_code: String
    source_language_id: ID
    target_language_id: ID
    source_language: String
    serial_no: Int
    target_language: String
    status: String
    call_date: String
    call_duration: Float
    amount: Float
    created_at: String
    updated_at: String
    used_credits: Int
  }

  input CreatePhoneMediationInput {
    interpreter_id: ID
    caller_phone: String
    client_code: String
    source_language_id: ID
    target_language_id: ID
    status: String
    call_date: String
    call_duration: Float
    amount: Float
  }

  type PhoneMediationPaginatedList {
    filteredCount: Int
    callReports: [CallReports]
  }
  type Query {
    allPhoneMediation: [CallReports]
    phoneMediationByID(id: ID, phone_number: String): CallReports
    phoneMediationPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
      phone_number: String!
    ): PhoneMediationPaginatedList
  }

  type Mutation {
    createPhoneMediation(input: CreatePhoneMediationInput): CallReports
    updatePhoneMediation(id: ID, input: CreatePhoneMediationInput): CallReports
    deletePhoneMediation(id: ID): Boolean
  }
`;

export default typeDefs;
