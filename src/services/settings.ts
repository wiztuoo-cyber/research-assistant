import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = () => process.env.SETTINGS_FILE_PATH ? resolve(process.env.SETTINGS_FILE_PATH) : resolve(process.cwd(), '.env');

function readEnvLines(): string[] {
  const path = envPath();
  return existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
}

function setEnvValue(key: string, value: string): void {
  const lines = readEnvLines();
  const prefix = key + '=';
  let found = false;
  const next = lines.map((line) => {
    if (line.trim().startsWith(prefix)) {
      found = true;
      return prefix + value;
    }
    return line;
  });
  if (!found) next.push(prefix + value);
  writeFileSync(envPath(), next.filter((line, i, arr) => !(i === arr.length - 1 && line === '')).join('\n') + '\n', 'utf8');
  process.env[key] = value;
}

export function getAiSettingsStatus() {
  const key = process.env.DEEPSEEK_API_KEY?.trim() ?? '';
  return {
    provider: key ? 'deepseek' : 'local',
    configured: Boolean(key),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-flash'
  };
}

export function saveAiSettings(input: { apiKey?: string; model?: string }) {
  if (input.apiKey !== undefined && input.apiKey.trim()) {
    setEnvValue('DEEPSEEK_API_KEY', input.apiKey.trim());
  }
  if (input.model !== undefined && input.model.trim()) {
    setEnvValue('DEEPSEEK_MODEL', input.model.trim());
  }
  return getAiSettingsStatus();
}
