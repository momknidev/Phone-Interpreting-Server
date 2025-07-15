import { gql } from 'apollo-server';

export const typeDefs = gql`
  type Language {
    id: ID!
    language_code: Int!
    userID: String
    language_name: String!
    created_at: String
    updated_at: String
  }

  input LanguageInput {
    language_code: Int!
    language_name: String!
  }
  type LanguagesResponse {
    filteredCount: Int!
    languages: [Language!]!
  }
  type Query {
    languages(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      search: String
    ): LanguagesResponse!
    allLanguages: [Language!]!
    language(id: ID!): Language
  }

  type Mutation {
    createLanguage(input: LanguageInput!): Language!
    updateLanguage(id: ID!, input: LanguageInput!): Language!
    deleteLanguage(id: ID!): Boolean!
  }
`;

export default typeDefs;