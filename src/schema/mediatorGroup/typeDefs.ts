import { gql } from "apollo-server";

export const typeDefs = gql`
  scalar Upload
  scalar JSON

  # types =======================>
  
  type Group {
    id: ID
    groupName: String     
    status: String   
    user: JSON
    userID:String
    createdAt: String
    updatedAt: String
    mediatorCount: Int
    mediators: JSON
  }
  # Inputs
  input groupInput {
    groupName: String!
    status: String!
  }

  type GroupPaginatedList {
    filteredCount: Int
    groups:  [Group]
  }
  # ==============> QUERIES <================
  type Query {
    groupByID(id: String): Group
    allGroups:[Group]
    groupsPaginatedList(
      offset: Int
      limit: Int
      order: String
      orderBy: String
      name: String
    ): GroupPaginatedList
  }

  # ==============> MUTATIONS <================
  type Mutation {
    addGroup(groupInput: groupInput): Group
    editGroup(id: String, groupInput: groupInput): Group!
    changeGroupStatus(id:ID!, status: String): Group
    deleteGroup(id: ID!): String
    addMediatorToGroup(groupID: ID!, mediatorID: ID!): Group
    removeMediatorFromGroup(groupID: ID!, mediatorID: ID!): Group
  }
`;

export default typeDefs;
