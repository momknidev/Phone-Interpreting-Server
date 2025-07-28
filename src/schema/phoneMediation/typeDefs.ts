import { gql } from 'apollo-server';

const typeDefs = gql`
  type PhoneMediation {
    id: ID!
    client_id: ID
    mediator_id: ID
    mediator: String
    caller_phone: String
    caller_code: String
    source_language_id: ID
    target_language_id: ID
    source_language: String
    phone_mediation_no: Int
    target_language: String
    status: String
    mediation_date: String
    mediation_duration: Float
    amount: Float
    created_at: String
    updated_at: String
  }

  input CreatePhoneMediationInput {
    mediator_id: ID
    caller_phone: String
    caller_code: String
    source_language_id: ID
    target_language_id: ID
    status: String
    mediation_date: String
    mediation_duration: Float
    amount: Float
  }

  type PhoneMediationPaginatedList {
    filteredCount: Int
    phoneMediation: [PhoneMediation]
  }
  type Query {
    allPhoneMediation: [PhoneMediation]
    PhoneMediationByID(id: ID): PhoneMediation
    phoneMediationPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
    ): PhoneMediationPaginatedList
  }

  type Mutation {
    createPhoneMediation(input: CreatePhoneMediationInput): PhoneMediation
    updatePhoneMediation(id: ID, input: CreatePhoneMediationInput): PhoneMediation
    deletePhoneMediation(id: ID): Boolean
  }
`;

export default typeDefs;
