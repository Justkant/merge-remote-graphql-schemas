import { graphql } from 'graphql';
import gql from 'graphql-tag';
import { makeExecutableSchema, mergeSchemas } from 'graphql-tools';
import { printSchema } from 'graphql/utilities';
import { mergeRemoteSchemas } from './merge-remote-schemas';

const combinedSchema = `type Query {
  me: User
  user(id: ID!): User
  users: [User]!
  space(id: ID): Space
  spaces: [Space]!
}

type Space {
  id: ID!
  name: String!
  owner: User!
}

type User {
  id: ID!
  name: String!
  email: String!
  spaces: [Space]!
}
`;

describe('mergeRemoteSchemas', () => {
  const users = [
    {
      id: '0',
      name: 'J.K. Rowling',
      email: 'jkrowling@gmail.com',
    },
    {
      id: '1',
      name: 'Michael Crichton',
      email: 'michaelcrichton@gmail.com',
    },
  ];

  const accountsSchema = makeExecutableSchema({
    typeDefs: gql`
      type Query {
        me: User
        user(id: ID!): User
        users: [User]!
      }

      type User {
        id: ID!
        name: String!
        email: String!
      }
    `,
    resolvers: {
      Query: {
        me: () => users[0],
        user: (parent, args) => users.find(user => user.id === args.id),
        users: () => users,
      },
    },
  });

  const spaces = [
    {
      id: '0',
      name: 'Harry Potter and the Chamber of Secrets',
      ownerId: '0',
    },
    {
      id: '1',
      name: 'Jurassic Park',
      ownerId: '1',
    },
  ];

  const spacesSchema = makeExecutableSchema({
    typeDefs: gql`
      type Query {
        user(id: ID!): User
        space(id: ID): Space
        spaces: [Space]!
      }

      type Space {
        id: ID!
        name: String!
        owner: User!
      }

      type User {
        id: ID
        spaces: [Space]!
      }
    `,
    resolvers: {
      Query: {
        user: (parent, args) => ({ id: args.id }),
        space: (parent, args) => spaces.find(space => space.id === args.id),
        spaces: () => spaces,
      },
      Space: {
        owner: parent => ({ id: parent.ownerId }),
      },
      User: {
        spaces: parent => spaces.filter(space => space.ownerId === parent.id),
      },
    },
  });

  xit('should merge passed in schemas', () => {
    const independentSpacesSchema = makeExecutableSchema({
      typeDefs: gql`
        type Query {
          space(id: ID): Space
          spaces: [Space]!
        }

        type Space {
          id: ID!
          name: String!
        }
      `,
      resolvers: {
        Query: {
          space: (parent, args) => spaces.find(space => space.id === args.id),
          spaces: () => spaces,
        },
      },
    });

    const mergedSchema = mergeRemoteSchemas({
      schemas: [accountsSchema, independentSpacesSchema],
    });
    expect(mergedSchema.toString()).toEqual(
      mergeSchemas({
        schemas: [accountsSchema, independentSpacesSchema],
      }).toString(),
    );
  });

  xit('should merge duplicate types', () => {
    const mergedSchema = mergeRemoteSchemas({
      schemas: [accountsSchema, spacesSchema],
    });
    expect(printSchema(mergedSchema)).toEqual(combinedSchema);
  });

  it('should answer cross-schema queries', async () => {
    const mergedSchema = mergeRemoteSchemas({
      schemas: [accountsSchema, spacesSchema],
    });
    const userId = '0';
    const result = await graphql(
      mergedSchema,
      `
        query {
          me {
            id
            name
            spaces {
              id
              name
              owner {
                id
                name
              }
            }
          }
          user(id: "${userId}") {
            id
            name

            spaces {
              id
              name
            }
          }
        }
      `,
    );

    const user = users.find(user => user.id === userId);
    expect(result).toEqual({
      data: {
        me: {
          id: user.id,
          name: user.name,
          spaces: spaces
            .filter(space => space.ownerId === userId)
            .map(space => ({
              id: space.id,
              name: space.name,
              owner: {
                id: user.id,
                name: user.name,
              },
            })),
        },
        user: {
          id: user.id,
          name: user.name,
          spaces: spaces
            .filter(space => space.ownerId === userId)
            .map(space => ({
              id: space.id,
              name: space.name,
            })),
        },
      },
    });
  });
});
