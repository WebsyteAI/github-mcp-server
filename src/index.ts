#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required');
}

class GitHubServer {
  private server: Server;
  private octokit: Octokit;

  constructor() {
    this.server = new Server(
      {
        name: 'github-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.octokit = new Octokit({
      auth: GITHUB_TOKEN,
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_repository',
          description: 'Create a new GitHub repository in your account or in an organization',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Repository name',
              },
              description: {
                type: 'string',
                description: 'Repository description',
              },
              private: {
                type: 'boolean',
                description: 'Whether the repository should be private',
              },
              autoInit: {
                type: 'boolean',
                description: 'Initialize with README.md',
              },
              org: {
                type: 'string',
                description: 'Optional: organization name to create the repository in',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        {
          name: 'search_repositories',
          description: 'Search for GitHub repositories',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (see GitHub search syntax)',
              },
              page: {
                type: 'number',
                description: 'Page number for pagination (default: 1)',
              },
              perPage: {
                type: 'number',
                description: 'Number of results per page (default: 30, max: 100)',
              },
            },
            required: ['query'],
            additionalProperties: false,
          },
        },
        {
          name: 'get_file_contents',
          description: 'Get the contents of a file or directory from a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner (username or organization)',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              path: {
                type: 'string',
                description: 'Path to the file or directory',
              },
              branch: {
                type: 'string',
                description: 'Branch to get contents from',
              },
            },
            required: ['owner', 'repo', 'path'],
            additionalProperties: false,
          },
        },
        {
          name: 'create_or_update_file',
          description: 'Create or update a single file in a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner (username or organization)',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              path: {
                type: 'string',
                description: 'Path where to create/update the file',
              },
              content: {
                type: 'string',
                description: 'Content of the file',
              },
              message: {
                type: 'string',
                description: 'Commit message',
              },
              branch: {
                type: 'string',
                description: 'Branch to create/update the file in',
              },
              sha: {
                type: 'string',
                description: 'SHA of the file being replaced (required when updating existing files)',
              },
            },
            required: ['owner', 'repo', 'path', 'content', 'message', 'branch'],
            additionalProperties: false,
          },
        },
        {
          name: 'push_files',
          description: 'Push multiple files to a GitHub repository in a single commit',
          inputSchema: {
            type: 'object',
            properties: {
              owner: {
                type: 'string',
                description: 'Repository owner (username or organization)',
              },
              repo: {
                type: 'string',
                description: 'Repository name',
              },
              branch: {
                type: 'string',
                description: 'Branch to push to (e.g., \'main\' or \'master\')',
              },
              files: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                    },
                    content: {
                      type: 'string',
                    },
                  },
                  required: ['path', 'content'],
                  additionalProperties: false,
                },
                description: 'Array of files to push',
              },
              message: {
                type: 'string',
                description: 'Commit message',
              },
            },
            required: ['owner', 'repo', 'branch', 'files', 'message'],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'create_repository': {
          const { name, description, private: isPrivate, autoInit, org } = request.params.arguments as {
            name: string;
            description?: string;
            private?: boolean;
            autoInit?: boolean;
            org?: string;
          };

          try {
            let response;
            
            if (org) {
              // Create repository in organization
              response = await this.octokit.repos.createInOrg({
                org,
                name,
                description,
                private: isPrivate,
                auto_init: autoInit,
              });
            } else {
              // Create repository in user account
              response = await this.octokit.repos.createForAuthenticatedUser({
                name,
                description,
                private: isPrivate,
                auto_init: autoInit,
              });
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error creating repository: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
          break;
        }

        case 'search_repositories': {
          const { query, page = 1, perPage = 30 } = request.params.arguments as {
            query: string;
            page?: number;
            perPage?: number;
          };

          try {
            const response = await this.octokit.search.repos({
              q: query,
              page,
              per_page: perPage,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error searching repositories: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
          break;
        }

        case 'get_file_contents': {
          const { owner, repo, path, branch } = request.params.arguments as {
            owner: string;
            repo: string;
            path: string;
            branch?: string;
          };

          try {
            const response = await this.octokit.repos.getContent({
              owner,
              repo,
              path,
              ref: branch,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error getting file contents: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
          break;
        }

        case 'create_or_update_file': {
          const { owner, repo, path, content, message, branch, sha } = request.params.arguments as {
            owner: string;
            repo: string;
            path: string;
            content: string;
            message: string;
            branch: string;
            sha?: string;
          };

          try {
            const response = await this.octokit.repos.createOrUpdateFileContents({
              owner,
              repo,
              path,
              message,
              content: Buffer.from(content).toString('base64'),
              branch,
              sha,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error creating or updating file: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
          break;
        }

        case 'push_files': {
          const { owner, repo, branch, files, message } = request.params.arguments as {
            owner: string;
            repo: string;
            branch: string;
            files: Array<{ path: string; content: string }>;
            message: string;
          };

          try {
            // Get the latest commit SHA for the branch
            const refResponse = await this.octokit.git.getRef({
              owner,
              repo,
              ref: `heads/${branch}`,
            });
            const latestCommitSha = refResponse.data.object.sha;

            // Get the tree SHA for the latest commit
            const commitResponse = await this.octokit.git.getCommit({
              owner,
              repo,
              commit_sha: latestCommitSha,
            });
            const treeSha = commitResponse.data.tree.sha;

            // Create a new tree with the files
            const treeItems = await Promise.all(
              files.map(async (file) => {
                const blobResponse = await this.octokit.git.createBlob({
                  owner,
                  repo,
                  content: Buffer.from(file.content).toString('base64'),
                  encoding: 'base64',
                });

                return {
                  path: file.path,
                  mode: '100644' as '100644',
                  type: 'blob' as 'blob',
                  sha: blobResponse.data.sha,
                };
              })
            );

            const newTreeResponse = await this.octokit.git.createTree({
              owner,
              repo,
              base_tree: treeSha,
              tree: treeItems,
            });

            // Create a new commit
            const newCommitResponse = await this.octokit.git.createCommit({
              owner,
              repo,
              message,
              tree: newTreeResponse.data.sha,
              parents: [latestCommitSha],
            });

            // Update the reference
            const updateRefResponse = await this.octokit.git.updateRef({
              owner,
              repo,
              ref: `heads/${branch}`,
              sha: newCommitResponse.data.sha,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      commit: newCommitResponse.data,
                      ref: updateRefResponse.data,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error: any) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Error pushing files: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
          break;
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitHub MCP server running on stdio');
  }
}

const server = new GitHubServer();
server.run().catch(console.error);