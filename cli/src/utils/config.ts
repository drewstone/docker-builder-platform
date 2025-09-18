import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  apiUrl?: string;
  token?: string;
  defaultProject?: string;
  defaultRegion?: string;
  progressType?: string;
  colorOutput?: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.dbp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export async function getConfig(): Promise<Config> {
  try {
    await fs.access(CONFIG_FILE);
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      apiUrl: process.env.DBP_API_URL || 'http://localhost:3000',
      token: process.env.DBP_TOKEN,
      defaultProject: process.env.DBP_PROJECT,
      colorOutput: process.env.NO_COLOR !== '1'
    };
  }
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error: any) {
    throw new Error(`Failed to save configuration: ${error.message}`);
  }
}

export async function getConfigValue(key: string): Promise<any> {
  const config = await getConfig();
  return (config as any)[key];
}

export async function setConfigValue(key: string, value: any): Promise<void> {
  const config = await getConfig();
  (config as any)[key] = value;
  await saveConfig(config);
}