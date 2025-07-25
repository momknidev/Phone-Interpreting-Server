import { gql } from "apollo-server";


export const typeDefs = gql`
  scalar JSON
  scalar Upload
  # types =======================>
  type LanguagePair {
  sourceLanguageId:ID!
  sourceLanguageName: String!
  targetLanguageId:ID!
  targetLanguageName: String!
  }
  type Group{
    id: ID
    groupName: String!
    }
  
  type Mediator {
    id: ID
    userID: String
    IBAN: String
    firstName: String!
    lastName: String!
    email: String
    phone: String!
    languages: [LanguagePair]
    createdAt: String
    updatedAt: String
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
    groups:[Group]
  }

  # Inputs
  input LanguagePairInput {
    sourceLanguageId: ID!
    targetLanguageId: ID!
  }
  input MediatorInput {
    firstName: String!
    lastName: String!
    email: String
    phone: String!
    IBAN: String
    languages: [LanguagePairInput]
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
    groupIDs:[String]
  }

  type MediatorPaginatedList {
    filteredCount: Int
    mediators: [Mediator]
  }

  # Add to Query type
  type Query {
    mediatorList: [Mediator]
    mediatorById(id: String!): Mediator
    mediatorsPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      name: String
      targetLanguage: String
      status: String
    ): MediatorPaginatedList
  }

  # Add to Mutation type
  type Mutation {
    addMediator(mediatorData: MediatorInput): Mediator
    updateMediator(id: String!,mediatorData: MediatorInput): Mediator
    deleteMediator(id: String!): Boolean
    updateMediatorStatus(id: String!, status: String!): Mediator
    uploadMediatorFile(file: Upload!): String
  }
`;

export default typeDefs;