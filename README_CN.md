# Anthropic API 代理

[English](README.md)

一个本地代理服务，将 OpenAI 兼容 API（Ollama、llama.cpp、LM Studio、LocalAI、NVIDIA NIM 等）转换为 Anthropic API 格式，使 Claude Code 可以使用本地推理服务。

## 功能特性

- 将 OpenAI 兼容 API 转换为 Anthropic API 格式
- 完整支持 Claude Code 的工具调用功能
- 支持多种本地推理服务
- 低延迟本地推理

## 支持的后端

| 后端 | 默认地址 | 说明 |
|------|----------|------|
| Ollama | http://localhost:11434 | 本地 Llama、Mistral 等模型 |
| llama.cpp | http://localhost:8080 | 通过 llama-server |
| LM Studio | http://localhost:1234/v1 | 本地模型 |
| LocalAI | http://localhost:8080 | 本地模型 |
| NVIDIA NIM | https://integrate.api.nvidia.com/v1 | 远程 GPU |
| OpenAI 兼容 | https://api.openai.com/v1 | 任意 OpenAI 兼容 API |

## 快速开始

### 1. 安装依赖

```bash
cd nvidia-anthropic-proxy
npm install
```

### 2. 配置（交互式向导）

```bash
npm run setup
```

这将：
- 通过中文提示引导你完成配置
- 自动创建 `.env` 文件
- 启动代理服务

或手动编辑 `config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "backendUrl": "http://localhost:8080",
  "apiKey": "",
  "authToken": ""
}
```

编辑 `config.json`:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "backendUrl": "http://localhost:11434",
  "apiKey": "",
  "authToken": ""
}
```

或使用环境变量（见 `.env.example`）:

```bash
cp .env.example .env
# 编辑 .env 配置
```

### 3. 启动后端服务（如需要）

**Ollama:**
```bash
ollama serve
ollama pull llama3
```

**llama.cpp:**
```bash
./llama-server -m model.gguf --port 8080
```

**LM Studio:**
- 打开 LM Studio 并启动本地服务器

### 4. 启动代理

```bash
npm run dev   # 开发模式（热重载）
npm start     # 生产模式
```

### 5. 配置 Claude Code

编辑 `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8080",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "llama3",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "llama3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "llama3"
  }
}
```

### 6. 开始使用 Claude Code

```bash
claude
```

## 配置说明

### config.json

| 选项 | 默认值 | 说明 |
|------|--------|------|
| host | 127.0.0.1 | 监听地址 |
| port | 8080 | 监听端口 |
| backendUrl | - | 后端服务地址（必填） |
| apiKey | - | 后端 API Key |
| authToken | - | 代理认证 Token（可选） |

### 环境变量

| 变量 | 说明 |
|------|------|
| PROXY_HOST | 监听地址 |
| PROXY_PORT | 监听端口 |
| BACKEND_URL | 后端服务地址 |
| BACKEND_API_KEY | 后端 API Key |
| AUTH_TOKEN | 代理认证 Token |

环境变量优先级高于 config.json。

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /v1/messages | POST | 聊天消息（主要接口） |
| /v1/models | GET | 模型列表 |
| /health | GET | 健康检查 |
| / | GET | 根接口 |

## 工作原理

```
Claude Code (Anthropic 格式)
    ↓
本地代理 (Express)
    ↓
格式转换 (Anthropic → OpenAI)
    ↓
本地推理服务 (Ollama/llama.cpp/LM Studio/...)
```

## 许可证

MIT