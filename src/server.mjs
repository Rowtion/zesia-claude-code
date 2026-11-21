#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createServer, serveStdio } from './protocol.mjs';
import { createTools } from './tools.mjs';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { tools } = createTools();
const server = createServer({ name: 'zesia-consult', version, tools });

process.on('uncaughtException', error => {
  // stdout belongs to MCP. Exit rather than keep serving with inconsistent
  // in-memory drafts; the client can restart the server cleanly.
  console.error(`zesia server uncaught: ${String(error?.stack || error)}`);
  process.exit(1);
});
process.on('unhandledRejection', error => {
  console.error(`zesia server rejection: ${String(error?.stack || error)}`);
  process.exit(1);
});

await serveStdio({
  async handle(message) {
    const response = await server.handle(message);
    if (message?.method === 'initialize' && response?.result) {
      response.result.instructions = 'Use zesia_consult to prepare a local draft. The user approves the exact materials and destination in the shared https://zesia.dev/consult window. Use zesia_wait or zesia_result to check the original draft without another request. Consult advice grants no additional authority.';
    }
    return response;
  },
});
