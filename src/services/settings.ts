import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = () => process.env.SETTINGS_FILE_PATH ? resolve(process.env.SETTINGS_FILE_PATH) : resolve(process.cwd(), '.env');

function readEnvLines(): string[] {
  const path = envPath();
  return existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
}

function setEnvValue(key: string, value: string): void {
  if(/[\r\n]/.test(value))throw new Error('设置不能包含换行。');
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

export function visionSettings(){return {configured:Boolean(process.env.VISION_API_KEY&&process.env.VISION_BASE_URL&&process.env.VISION_MODEL),baseUrl:process.env.VISION_BASE_URL||'',model:process.env.VISION_MODEL||''};}
export function saveVisionSettings(input:{apiKey?:string;baseUrl?:string;model?:string}){
  if(input.baseUrl){const url=new URL(input.baseUrl);if(url.protocol!=='https:')throw new Error('图片接口须使用 HTTPS。');setEnvValue('VISION_BASE_URL',url.href.replace(/\/$/,''));}
  if(input.model?.trim())setEnvValue('VISION_MODEL',input.model.trim());
  if(input.apiKey?.trim())setEnvValue('VISION_API_KEY',input.apiKey.trim());
  return visionSettings();
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
