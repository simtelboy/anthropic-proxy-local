import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载 .env 文件
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// 默认配置
const defaultConfig = {
  host: '127.0.0.1',
  port: 8088,
  backendUrl: '',
  apiKey: '',
  authToken: '',
};

// 尝试加载 config.json
function loadConfigFile() {
  try {
    const configPath = join(__dirname, '..', 'config.json');
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return {};
  }
}

// 加载配置（config.json 优先级低于环境变量/.env）
const fileConfig = loadConfigFile();

// 环境变量覆盖
const config = {
  host: process.env.PROXY_HOST || fileConfig.host || defaultConfig.host,
  port: parseInt(process.env.PROXY_PORT, 10) || fileConfig.port || defaultConfig.port,
  backendUrl: process.env.BACKEND_URL || fileConfig.backendUrl || defaultConfig.backendUrl,
  apiKey: process.env.BACKEND_API_KEY || fileConfig.apiKey || defaultConfig.apiKey,
  authToken: process.env.AUTH_TOKEN || fileConfig.authToken || defaultConfig.authToken,
};

// 验证必需配置
function validateConfig() {
  const errors = [];

  if (!config.host) {
    errors.push('Missing config: host');
  }
  if (!config.port) {
    errors.push('Missing config: port');
  }
  if (!config.backendUrl) {
    errors.push('Missing config: backendUrl (BACKEND_URL)');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    console.error('\nPlease configure in config.json or .env, or run: npm run setup');
    return false;
  }

  return true;
}

export { config, validateConfig };