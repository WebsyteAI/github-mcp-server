# GitHub MCP Server with Organization Support

A Model Context Protocol (MCP) server for GitHub that adds support for creating repositories in organizations.

## Features

- Create repositories in personal accounts
- Create repositories in organizations
- Search repositories
- Get file contents
- Create or update files
- Push multiple files in a single commit

## Installation

```bash
npm install -g @websyteai/github-mcp-server
```

## Usage

To use this MCP server with Cline, add it to your MCP settings file:

```json
{
  "mcpServers": {
    "github.com/websyteai/github-mcp-server": {
      "command": "github-mcp-server",
      "args": [],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Environment Variables

- `GITHUB_PERSONAL_ACCESS_TOKEN`: Your GitHub personal access token with the necessary permissions to create repositories and manage content.

## License

MIT