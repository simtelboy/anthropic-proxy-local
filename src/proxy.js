import { config } from './config.js';

/**
 * 转换 Anthropic 消息格式为 OpenAI 格式
 */
function convertMessage(msg) {
  const content = msg.content;

  if (typeof content === 'string') {
    return { role: msg.role, content };
  }

  const textParts = [];
  const toolCalls = [];
  const toolResults = [];

  for (const block of content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    } else if (block.type === 'tool_result') {
      let resultContent = '';
      if (typeof block.content === 'string') {
        resultContent = block.content;
      } else if (Array.isArray(block.content)) {
        resultContent = block.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
      }
      toolResults.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: resultContent,
      });
    } else if (block.type === 'image') {
      // 处理图片 - 转为 base64 data URL
      textParts.push({
        type: 'image_url',
        image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
      });
    }
  }

  if (toolResults.length > 0) {
    return toolResults;
  }

  if (msg.role === 'assistant' && toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: textParts.join('') || null,
      tool_calls: toolCalls,
    };
  }

  if (textParts.every(p => typeof p === 'string')) {
    return { role: msg.role, content: textParts.join('') };
  }

  return { role: msg.role, content: textParts };
}

/**
 * 构建转发给后端的请求 payload
 */
function buildPayload(body) {
  const messages = [];

  // 处理 system 消息
  if (body.system) {
    const systemContent = typeof body.system === 'string'
      ? body.system
      : body.system.map(b => b.text).join('\n');
    messages.push({ role: 'system', content: systemContent });
  }

  // 处理用户消息
  for (const msg of body.messages) {
    const converted = convertMessage(msg);
    if (Array.isArray(converted)) {
      messages.push(...converted);
    } else {
      messages.push(converted);
    }
  }

  // 构建 payload
  const payload = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens,
    stream: !!body.stream,
  };

  // 可选参数
  if (body.temperature !== undefined) payload.temperature = body.temperature;
  if (body.top_p !== undefined) payload.top_p = body.top_p;
  if (body.stop_sequences) payload.stop = body.stop_sequences;
  if (body.top_k) payload.top_k = body.top_k;

  // Tools 处理
  if (body.tools?.length) {
    payload.tools = body.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));

    if (body.tool_choice) {
      if (body.tool_choice.type === 'auto') {
        payload.tool_choice = 'auto';
      } else if (body.tool_choice.type === 'any') {
        payload.tool_choice = 'required';
      } else if (body.tool_choice.type === 'tool') {
        payload.tool_choice = { type: 'function', function: { name: body.tool_choice.name } };
      }
    }
  }

  return payload;
}

/**
 * 处理非流式响应
 */
function handleNonStreamResponse(data, body) {
  const choice = data.choices[0];
  const message = choice.message;

  const content = [];

  // 处理 thinking（如果有）
  if (message.reasoning_content) {
    content.push({ type: 'thinking', thinking: message.reasoning_content });
  }

  // 处理文本内容
  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }

  // 处理工具调用
  if (message.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      });
    }
  }

  let stop_reason = 'end_turn';
  if (choice.finish_reason === 'length') stop_reason = 'max_tokens';
  if (choice.finish_reason === 'tool_calls' || message.tool_calls?.length) stop_reason = 'tool_use';

  return {
    id: data.id,
    type: 'message',
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
    model: body.model,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * 处理流式响应 - SSE 转换
 */
function handleStream(response, body, res) {
  const model = body.model;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let tokens = 0;
  let contentIndex = 0;
  let hasThinkingBlock = false;
  let hasTextBlock = false;
  let inThinkTag = false;
  let modeDecided = false;
  let contentBuffer = '';
  const toolCalls = {};

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const sendThinking = (text) => {
    if (!text) return;
    if (!hasThinkingBlock) {
      send('content_block_start', {
        type: 'content_block_start',
        index: contentIndex,
        content_block: { type: 'thinking', thinking: '' }
      });
      hasThinkingBlock = true;
    }
    send('content_block_delta', {
      type: 'content_block_delta',
      index: contentIndex,
      delta: { type: 'thinking_delta', thinking: text }
    });
  };

  const sendText = (text) => {
    if (!text) return;
    if (hasThinkingBlock && !hasTextBlock) {
      send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
      hasThinkingBlock = false;
    }
    if (!hasTextBlock) {
      send('content_block_start', {
        type: 'content_block_start',
        index: contentIndex,
        content_block: { type: 'text', text: '' }
      });
      hasTextBlock = true;
    }
    send('content_block_delta', {
      type: 'content_block_delta',
      index: contentIndex,
      delta: { type: 'text_delta', text }
    });
  };

  const processContent = (text) => {
    // 模式已确定且不在 think 标签中，直接发送
    if (modeDecided && !inThinkTag) {
      sendText(text);
      return;
    }

    contentBuffer += text;

    // 首次判断：是否以<think>开头
    if (!modeDecided && contentBuffer.length >= 7) {
      if (contentBuffer.startsWith('<think>')) {
        inThinkTag = true;
        contentBuffer = contentBuffer.slice(7);
      }
      modeDecided = true;
    }

    // 还在等待判断
    if (!modeDecided) return;

    // 在 think 标签中
    if (inThinkTag) {
      const endIdx = contentBuffer.indexOf('</think>');
      if (endIdx !== -1) {
        sendThinking(contentBuffer.slice(0, endIdx));
        const rest = contentBuffer.slice(endIdx + 8);
        contentBuffer = '';
        inThinkTag = false;
        if (rest) sendText(rest);
      } else if (contentBuffer.length > 8) {
        sendThinking(contentBuffer.slice(0, -8));
        contentBuffer = contentBuffer.slice(-8);
      }
    } else {
      // 不在 think 标签中，直接发送全部缓冲内容
      if (contentBuffer) {
        sendText(contentBuffer);
        contentBuffer = '';
      }
    }
  };

  const flushBuffer = () => {
    if (contentBuffer) {
      if (inThinkTag) {
        sendThinking(contentBuffer);
      } else {
        sendText(contentBuffer);
      }
      contentBuffer = '';
    }
  };

  const closeStream = async (reason = 'end_turn') => {
    flushBuffer();
    if (hasThinkingBlock) send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
    if (hasTextBlock) send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
    for (const idx of Object.keys(toolCalls)) {
      send('content_block_stop', { type: 'content_block_stop', index: contentIndex + parseInt(idx) });
    }
    send('message_delta', { type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: tokens } });
    send('message_stop', { type: 'message_stop' });
    res.end();
  };

  const id = `msg_${Date.now()}`;

  // 发送 message_start
  send('message_start', {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    },
  });

  // 处理流式数据
  (async () => {
    try {
      const reader = response.body.getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          if (data === '[DONE]') {
            closeStream(Object.keys(toolCalls).length > 0 ? 'tool_use' : 'end_turn');
            return;
          }

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            console.error('JSON parse error:', data);
            continue;
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta || {};
          const finish = choice.finish_reason;

          // 处理 thinking
          if (delta.reasoning_content) {
            sendThinking(delta.reasoning_content);
          }

          // 处理内容
          if (delta.content) {
            processContent(delta.content);
          }

          // 处理工具调用
          if (delta.tool_calls) {
            flushBuffer();
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCalls[idx]) {
                if (hasTextBlock) {
                  send('content_block_stop', { type: 'content_block_stop', index: contentIndex++ });
                  hasTextBlock = false;
                }
                toolCalls[idx] = { id: tc.id, name: tc.function?.name, arguments: '' };
                send('content_block_start', {
                  type: 'content_block_start',
                  index: contentIndex + idx,
                  content_block: { type: 'tool_use', id: tc.id, name: tc.function?.name, input: {} },
                });
              }
              if (tc.function?.name) toolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) {
                toolCalls[idx].arguments += tc.function.arguments;
                send('content_block_delta', {
                  type: 'content_block_delta',
                  index: contentIndex + idx,
                  delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
                });
              }
            }
          }

          if (finish) {
            let reason = 'end_turn';
            if (finish === 'length') reason = 'max_tokens';
            if (finish === 'tool_calls' || Object.keys(toolCalls).length > 0) reason = 'tool_use';
            closeStream(reason);
            return;
          }

          if (parsed.usage) tokens = parsed.usage.completion_tokens;
        }
      }

      await closeStream('end_turn');
    } catch (err) {
      console.error('Stream processing error:', err);
      res.end();
    }
  })();
}

/**
 * 处理 /v1/messages 请求
 */
async function handleMessages(req, res) {
  const body = req.body;

  // 认证检查
  if (config.authToken) {
    const auth = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (auth !== config.authToken) {
      return res.status(401).json({ error: { type: 'authentication_error', message: 'Invalid API key' } });
    }
  }

  // 构建转发 payload
  const payload = buildPayload(body);

  // 构建请求头
  const headers = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(`${config.backendUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: { type: 'api_error', message: errorText }
      });
    }

    if (body.stream) {
      // 流式响应
      return handleStream(response, body, res);
    }

    // 非流式响应
    const data = await response.json();
    const result = handleNonStreamResponse(data, body);
    return res.json(result);

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: { type: 'proxy_error', message: error.message }
    });
  }
}

/**
 * 处理 /v1/models 请求
 */
function handleModels(req, res) {
  // 返回空模型列表，因为实际的模型由后端决定
  // 客户端可以通过 model 参数指定任意模型
  return res.json({
    data: [],
    has_more: false,
    first_id: null,
    last_id: null
  });
}

export { handleMessages, handleModels };