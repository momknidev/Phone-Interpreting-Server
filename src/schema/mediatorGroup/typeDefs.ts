import { gql } from "apollo-server";

export const typeDefs = gql`
  scalar Upload
  scalar JSON

  # types =======================>
  
  type Group {
    id: ID
    group_name: String     
    status: String   
    user: JSON
    client_id:String
    created_at: String
    updated_at: String
    mediatorCount: Int
    mediators: JSON
  }
  # Inputs
  input groupInput {
    group_name: String
    status: String
    phone_number: String!
  }

  type GroupPaginatedList {
    filteredCount: Int
    groups:  [Group]
  }
  # ==============> QUERIES <================
  type Query {
    groupByID(id: String,phone_number: String!
): Group
    allGroups:[Group]
    groupsPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      name: String
      phone_number: String!
    ): GroupPaginatedList
  }

  # ==============> MUTATIONS <================
  type Mutation {
    addGroup(groupInput: groupInput): Group
    editGroup(id: String, groupInput: groupInput): Group!
    changeGroupStatus(id:ID!, status: String): Group
    deleteGroup(id: ID!): String
    addMediatorToGroup(groupID: ID!, mediatorIDs: [ID!]!): String
    removeMediatorFromGroup(groupID: ID!, mediatorID: ID!): String
  }
`;

export default typeDefs;
