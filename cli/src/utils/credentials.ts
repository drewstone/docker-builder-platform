import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';

const CREDENTIALS_FILE = path.join(os.homedir(), '.dbp', 'credentials');

export async function saveCredentials(token: string): Promise<void> {
  const dir = path.dirname(CREDENTIALS_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CREDENTIALS_FILE, token, { mode: 0o600 });
}

export async function getCredentials(): Promise<string | null> {
  try {
    return await fs.readFile(CREDENTIALS_FILE, 'utf-8');
  } catch {
    return null;
  }
}

export async function removeCredentials(): Promise<void> {
  try {
    await fs.unlink(CREDENTIALS_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}