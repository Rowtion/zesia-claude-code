#!/usr/bin/env node
import { createServer, serveStdio } from './protocol.mjs';
import { createTools } from './tools.mjs';

const { tools, close } = createTools();
const server = createServer({ name: 'zesia-consult', version: '0.2.0', tools });

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

await serveStdio(server);
