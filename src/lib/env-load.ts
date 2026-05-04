import path from 'path';
import dotenv from 'dotenv';

// Load .env then .env.local from the project root before any module reads process.env.
// This must be the very first import in server.ts so env vars are available
// before Redis.fromEnv() and other eager env readers initialise.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env.local') });
