# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## 项目概述

本地 Express 代理服务，将 OpenAI 兼容 API（Ollama、llama.cpp、LM Studio、LocalAI、NVIDIA NIM 等）转换为 Anthropic API 格式。

## 命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（热重载）
npm start            # 生产模式
```

## 架构

```
src/
├── index.js      # Express 服务器入口
├── config.js     # 配置管理
├── proxy.js      # API 格式转换核心逻辑
├── routes/       # 路由处理（待用）
└── utils/        # 工具函数（待用）
```

## 支持的后端

- Ollama (http://localhost:11434)
- llama.cpp / llama-server (http://localhost:8080)
- LM Studio (http://localhost:1234/v1)
- LocalAI (http://localhost:8080)
- NVIDIA NIM (https://integrate.api.nvidia.com/v1)
- 其他 OpenAI 兼容 API

## 配置

编辑 `config.json` 或设置环境变量：

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| host | PROXY_HOST | 监听地址 |
| port | PROXY_PORT | 监听端口 |
| backendUrl | BACKEND_URL | 后端服务地址 |
| apiKey | BACKEND_API_KEY | 后端 API Key |
| authToken | AUTH_TOKEN | 代理认证 Token |

## Claude Code 配置

`~/.claude/settings.json`:

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