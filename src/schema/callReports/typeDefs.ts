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
    response_time: Int
    phone_number_id: ID
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
    response_time: Int
    phone_number_id: ID
  }

  type PhoneMediationPaginatedList {
    filteredCount: Int
    callReports: [CallReports]
  }
  type CallStatistics {
    completed: Int!
    notCompleted: Int!
    inProgress: Int!
    total: Int!
  }

  type MonthlyCallData {
    month: String!
    totalCalls: Int!
    completed: Int!
    notCompleted: Int!
  }

  type GeneralStatistics {
    callsLastMonth: Int!
    medianCallsPerMonth: Float!
    totalCalls: Int!
    averageResponseTime: Float!
    averageCallDuration: Float!
  }

  type Query {
    allPhoneMediation: [CallReports]
    phoneMediationByID(id: ID, phone_number_id: ID): CallReports
    phoneMediationPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
      phone_number_id: ID!
    ): PhoneMediationPaginatedList
    getCallStatistics(year: String!, phone_number_id: ID!): CallStatistics!
    getMonthlyCallStatistics(
      year: String!
      phone_number_id: ID!
    ): [MonthlyCallData!]!
    getGeneralCallStatistics(
      year: String!
      phone_number_id: ID!
    ): GeneralStatistics!
  }

  type Mutation {
    createPhoneMediation(input: CreatePhoneMediationInput): CallReports
    updatePhoneMediation(id: ID, input: CreatePhoneMediationInput): CallReports
    deletePhoneMediation(id: ID): Boolean
  }
`;

export default typeDefs;
