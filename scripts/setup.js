#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const envPath = join(projectRoot, '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
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

  // 检查是否已有配置
  if (existsSync(envPath)) {
    printSection('发现已有配置文件');
    const currentConfig = readFileSync(envPath, 'utf-8');
    console.log('当前配置:\n' + currentConfig);

    const overwrite = await question('\n是否重新配置? (y/N): ');
    if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
      console.log('\n使用现有配置启动服务...\n');
      rl.close();
      return false; // 不重新配置
    }
  }

  printSection('基本设置');

  const proxyHost = await question('代理服务器监听地址 (默认: 127.0.0.1): ') || '127.0.0.1';
  const proxyPort = await question('代理服务器监听端口 (默认: 8080): ') || '8080';

  printSection('后端服务设置');
  console.log('请选择后端服务类型:');
  console('  1. Ollama (默认) - http://localhost:11434');
  console('  2. llama.cpp / llama-server - http://localhost:8080');
  console('  3. LM Studio - http://localhost:1234/v1');
  console('  4. LocalAI - http://localhost:8080');
  console('  5. NVIDIA NIM - https://integrate.api.nvidia.com/v1');
  console('  6. OpenAI 兼容 - 自定义 URL');
  console('  7. 手动输入');

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

  // API Key (llama.cpp 不需要，其他可能需要)
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
  console('设置认证 Token 后，访问代理需要提供 x-api-key 头');
  const authToken = await question('请输入认证 Token (直接回车跳过): ');

  // 生成 .env 文件
  const envContent = `# Anthropic API Proxy 配置
# 由 setup 脚本生成

# 代理服务器
PROXY_HOST=${proxyHost}
PROXY_PORT=${proxyPort}

# 后端服务
BACKEND_URL=${backendUrl}
${backendApiKey ? `BACKEND_API_KEY=${backendApiKey}` : '# BACKEND_API_KEY='}

# 认证 Token (可选)
${authToken ? `AUTH_TOKEN=${authToken}` : '# AUTH_TOKEN='}
`;

  writeFileSync(envPath, envContent);

  console.clear();
  printHeader('配置完成！');
  console.log('\n配置文件已保存到: .env\n');
  console.log(envContent);

  return true; // 配置完成
}

async function startServer() {
  console.log('\n启动代理服务...\n');

  const child = spawn('node', ['src/index.js'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  child.on('error', (err) => {
    console.error('启动失败:', err.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.log(`进程退出，代码: ${code}`);
    }
    rl.close();
    process.exit(code);
  });

  // Ctrl+C 处理
  process.on('SIGINT', () => {
    console.log('\n\n正在关闭服务...');
    child.kill('SIGINT');
    rl.close();
    process.exit(0);
  });
}

async function main() {
  try {
    const shouldSetup = await setup();

    if (shouldSetup) {
      await startServer();
    } else {
      // 直接启动
      await startServer();
    }
  } catch (err) {
    console.error('错误:', err.message);
    rl.close();
    process.exit(1);
  }
}

main();