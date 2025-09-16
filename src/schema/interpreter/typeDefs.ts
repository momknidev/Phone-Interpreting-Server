import { gql } from 'apollo-server';

export const typeDefs = gql`
  scalar JSON
  scalar Upload
  # types =======================>
  type LanguagePair {
    source_language_id: ID!
    sourceLanguageName: String!
    target_language_id: ID!
    targetLanguageName: String!
  }
  type Group {
    id: ID
    group_name: String!
  }

  type Interpreter {
    id: ID
    client_id: String
    iban: String
    first_name: String
    last_name: String
    email: String
    phone: String!
    sourceLanguages: JSON
    targetLanguages: JSON
    created_at: String
    updated_at: String
    status: String
    monday_time_slots: String
    tuesday_time_slots: String
    wednesday_time_slots: String
    thursday_time_slots: String
    friday_time_slots: String
    saturday_time_slots: String
    sunday_time_slots: String
    availableForEmergencies: Boolean
    availableOnHolidays: Boolean
    priority: Int
    groups: JSON
  }

  # Inputs
  input LanguagePairInput {
    source_language_id: ID!
    target_language_id: ID!
  }
  input MediatorInput {
    phone_number_id: String!
    first_name: String!
    last_name: String!
    email: String
    phone: String!
    iban: String
    sourceLanguages: [String]
    targetLanguages: [String]
    status: String
    monday_time_slots: String
    tuesday_time_slots: String
    wednesday_time_slots: String
    thursday_time_slots: String
    friday_time_slots: String
    saturday_time_slots: String
    sunday_time_slots: String
    availableForEmergencies: Boolean
    availableOnHolidays: Boolean
    priority: Int
    groupIDs: [String]
  }

  type MediatorPaginatedList {
    filteredCount: Int
    mediators: [Interpreter]
  }

  # Add to Query type
  type Query {
    mediatorList(phone_number_id: String!): [Interpreter]
    mediatorById(id: String!, phone_number_id: String!): Interpreter
    mediatorsPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      name: String
      targetLanguage: String
      status: String
      phone_number_id: String!
    ): MediatorPaginatedList
  }

  # Add to Mutation type
  type Mutation {
    addMediator(mediatorData: MediatorInput): Interpreter
    updateMediator(id: String!, mediatorData: MediatorInput): Interpreter
    deleteMediator(id: String!): Boolean
    updateMediatorStatus(id: String!, status: String!): Interpreter
    uploadMediatorFile(file: Upload!, phone_number_id: String!): String
  }
`;

export default typeDefs;
