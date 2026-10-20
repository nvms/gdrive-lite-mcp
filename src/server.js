#!/usr/bin/env node
// gdrive-lite-mcp: read-only Google Drive for agents. `npx gdrive-lite-mcp
// auth` signs in once; run without arguments it is an MCP server on stdio.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { signIn } from './auth.js'
import { download, read, search } from './drive.js'

const VERSION = '0.1.0'

if (process.argv[2] === 'auth') {
  signIn().then(() => process.exit(0), (error) => { console.error(error.message); process.exit(1) })
} else {
  const server = new McpServer({ name: 'gdrive-lite-mcp', version: VERSION })
  const answer = (fn) => async (args) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await fn(args), null, 2) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true }
    }
  }

  server.registerTool('search', {
    description: 'Finds files in Google Drive, shared drives included: by words in their names and contents, by a Drive query, or both. Without words, the most recently changed first. Returns each file\'s id, name, type, when it changed, owner and link.',
    inputSchema: {
      text: z.string().optional().describe('words to find in names and contents'),
      query: z.string().optional().describe('a Drive query, like name contains \'budget\' or mimeType = \'application/pdf\' or modifiedTime > \'2026-10-01\''),
      max: z.number().int().min(1).max(100).optional().describe('how many files, default 20'),
      page_token: z.string().optional().describe('next_page_token from the previous search, for more'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, answer(({ text, query, max, page_token }) => search({ text, query, max, pageToken: page_token })))

  server.registerTool('read', {
    description: 'A file\'s contents as text: a Google Doc as Markdown, a Sheet\'s first sheet as CSV, Slides as plain text, or a text file as it is. Other files, like PDFs, are for download.',
    inputSchema: { id: z.string().describe('the file id from search') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, answer(read))

  server.registerTool('download', {
    description: 'Saves a file into a folder on this computer and returns its path: a Google Doc or Slides as PDF, a Sheet as .xlsx, anything else as it is. An existing file is never replaced; the new one gets a number. A project\'s ledger takes in whatever is saved to its .kagent/documents folder.',
    inputSchema: {
      id: z.string().describe('the file id from search'),
      folder: z.string().describe('an absolute path to save into'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, answer(download))

  await server.connect(new StdioServerTransport())
}
