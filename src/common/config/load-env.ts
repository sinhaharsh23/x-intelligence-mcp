import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// NitroStudio starts the MCP child independently of the shell that launched
// the project. Resolve the project .env from this bootstrap module rather than
// relying on the child process current working directory.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: resolve(projectRoot, '.env') });
