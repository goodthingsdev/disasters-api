import gql from 'graphql-tag';
import { DocumentNode } from 'graphql';

const typeDefs: DocumentNode = gql`
  enum DisasterStatus {
    active
    contained
    resolved
  }

  type Location {
    type: String!
    coordinates: [Float!]!
  }

  type Disaster {
    _id: ID!
    type: String!
    location: Location!
    date: String!
    description: String
    status: DisasterStatus!
  }

  input LocationInput {
    type: String!
    coordinates: [Float!]!
  }

  input DisasterInput {
    type: String!
    location: LocationInput!
    date: String!
    description: String
    status: DisasterStatus!
  }

  input DisasterUpdateInput {
    _id: ID!
    type: String
    location: LocationInput
    date: String
    description: String
    status: DisasterStatus
  }

  type DisasterPage {
    data: [Disaster!]!
    page: Int!
    limit: Int!
    total: Int!
    totalPages: Int!
  }

  type Query {
    disasters(
      page: Int
      limit: Int
      type: String
      dateFrom: String
      dateTo: String
      status: DisasterStatus
    ): DisasterPage!
    disaster(_id: ID!): Disaster
    disastersNear(lat: Float!, lng: Float!, distance: Float!): [Disaster!]!
  }

  type Mutation {
    createDisaster(input: DisasterInput!): Disaster!
    updateDisaster(_id: ID!, input: DisasterInput!): Disaster!
    deleteDisaster(_id: ID!): Boolean!
    bulkInsertDisasters(inputs: [DisasterInput!]!): [Disaster!]!
    bulkUpdateDisasters(updates: [DisasterUpdateInput!]!): Boolean!
  }
`;

export { typeDefs };
