import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { handleMessages, handleModels } from './proxy.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const envPath = join(projectRoot, '.env');

let rl;

function getRL() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

function question(prompt) {
  return new Promise((resolve) => {
    getRL().question(prompt, resolve);
  });
}

function closeRL() {
  return new Promise((resolve) => {
    if (rl) {
      rl.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function printHeader(text) {
  console.log('\n' + '='.repeat(50));
  console.log('  ' + text);
  console.log('='.repeat(50));
}

function printSection(text) {
  console.log('\n--- ' + text + ' ---');
}

async function setup() {
  console.clear();
  printHeader('Anthropic API Proxy 配置向导');

  printSection('基本设置');
  const proxyHost = await question('代理服务器监听地址 (默认: 127.0.0.1): ') || '127.0.0.1';
  const proxyPort = await question('代理服务器监听端口 (默认: 8088): ') || '8088';

  printSection('后端服务设置');
  console.log('请选择后端服务类型:');
  console.log('  1. Ollama - http://localhost:11434');
  console.log('  2. llama.cpp / llama-server - http://localhost:8080');
  console.log('  3. LM Studio - http://localhost:1234/v1');
  console.log('  4. LocalAI - http://localhost:8080');
  console.log('  5. NVIDIA NIM - https://integrate.api.nvidia.com/v1');
  console.log('  6. OpenAI 兼容 - 自定义 URL');
  console.log('  7. 手动输入');

  const backendChoice = await question('\n请选择 (1-7，默认 2): ') || '2';

  let backendUrl = '';
  let backendApiKey = '';

  switch (backendChoice) {
    case '1':
      backendUrl = 'http://localhost:11434';
      break;
    case '2':
      backendUrl = 'http://localhost:8080';
      break;
    case '3':
      backendUrl = 'http://localhost:1234/v1';
      break;
    case '4':
      backendUrl = 'http://localhost:8080';
      break;
    case '5':
      backendUrl = 'https://integrate.api.nvidia.com/v1';
      break;
    case '6':
    case '7':
      backendUrl = await question('请输入后端服务 URL: ');
      break;
    default:
      backendUrl = 'http://localhost:8080';
  }

  // API Key
  if (backendUrl.includes('nvidia.com') || backendUrl.includes('openai.com')) {
    backendApiKey = await question('请输入后端 API Key: ');
  } else {
    printSection('API Key 设置');
    const needKey = await question('后端服务是否需要 API Key? (y/N): ');
    if (needKey.toLowerCase() === 'y' || needKey.toLowerCase() === 'yes') {
      backendApiKey = await question('请输入后端 API Key: ');
    }
  }

  printSection('代理认证 (可选)');
  console.log('设置认证 Token 后，访问代理需要提供 x-api-key 头');
  const authToken = await question('请输入认证 Token (直接回车跳过): ');

  // 生成 .env 文件
  const envContent = `# Anthropic API Proxy 配置
# 由配置向导生成

# 代理服务器
PROXY_HOST=${proxyHost}
PROXY_PORT=${proxyPort}

# 后端服务
BACKEND_URL=${backendUrl}
${backendApiKey ? `BACKEND_API_KEY=${backendApiKey}` : '# BACKEND_API_KEY='}

# 认证 Token (可选)
${authToken ? `AUTH_TOKEN=${authToken}` : '# AUTH_TOKEN='}
`;

  const fs = await import('fs');
  fs.writeFileSync(envPath, envContent);

  console.clear();
  printHeader('配置完成！');
  console.log('\n配置文件已保存到: .env\n');
  console.log(envContent);

  return true;
}

// 检查并加载配置
async function checkConfig() {
  // 如果已启动过（watch 模式重启），直接跳过配置检查
  // 使用环境变量标记，因为模块重新加载会重置变量
  if (process.env.PROXY_STARTED === 'true') {
    console.log('\n🔄 服务重启中...\n');
    return;
  }

  process.env.PROXY_STARTED = 'true';

  // 先尝试加载 .env
  const { default: dotenv } = await import('dotenv');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });

    // 显示当前配置让用户确认
    console.clear();
    printHeader('Anthropic API Proxy');

    printSection('当前配置');
    console.log(`  监听地址: ${process.env.PROXY_HOST || '127.0.0.1'}`);
    console.log(`  监听端口: ${process.env.PROXY_PORT || '8080'}`);
    console.log(`  后端地址: ${process.env.BACKEND_URL || '(未配置)'}`);
    console.log(`  API Key: ${process.env.BACKEND_API_KEY ? '******' : '(无)'}`);
    console.log(`  认证 Token: ${process.env.AUTH_TOKEN ? '******' : '(无)'}`);

    const confirm = await question('\n是否使用当前配置启动服务? (Y/n): ');
    if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
      console.log('\n进入配置向导...\n');
      await setup();
      // 重新加载
      dotenv.config({ path: envPath });
    }
  } else {
    // .env 不存在，进入设置向导
    printHeader('Anthropic API Proxy');
    console.log('\n未找到配置文件，现在进入设置向导...\n');
    await setup();
    // 加载新配置
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: envPath });
  }
}

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 请求日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 路由
app.post('/v1/messages', handleMessages);
app.get('/v1/models', handleModels);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Anthropic API Proxy' }));

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: { type: 'not_found', message: 'Not found' } });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: { type: 'internal_error', message: err.message || 'Internal server error' }
  });
});

// 启动服务器
async function startServer() {
  // 检查配置
  await checkConfig();

  // 验证配置
  if (!validateConfig()) {
    console.error('\n配置验证失败，请重新运行 npm run dev');
    await closeRL();
    process.exit(1);
  }

  const host = process.env.PROXY_HOST || '127.0.0.1';
  const port = parseInt(process.env.PROXY_PORT, 10) || 8088;

  app.listen(port, host, () => {
    console.log('\n' + '='.repeat(50));
    console.log('  🚀 Anthropic API Proxy 已启动');
    console.log('='.repeat(50));
    console.log(`\n  代理地址: http://${host}:${port}`);
    console.log(`  后端地址: ${process.env.BACKEND_URL}`);
    console.log('\n  可用接口:');
    console.log(`    健康检查: http://${host}:${port}/health`);
    console.log(`    模型列表: http://${host}:${port}/v1/models`);
    console.log(`    消息接口: http://${host}:${port}/v1/messages`);
    console.log('\n  Claude Code 配置:');
    console.log(`    ANTHROPIC_BASE_URL=http://${host}:${port}\n`);
  });
}

// 处理 Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n\n正在关闭服务...');
  await closeRL();
  process.exit(0);
});

startServer();