/**
 * 连接诊断 —— 真实握手，不写配置。
 *
 * 保存前先探一次，立刻能回答：地址对不对、要不要 token、命令存不存在、
 * 能连上但一个工具都没有。
 *
 * 实现上刻意不依赖 MCP SDK：只用 Node 内置的 fetch / child_process，
 * 这样插件本身不会因为多一个 SDK 依赖而在宿主里解析失败。
 * 协议层只做诊断必需的三步：initialize → notifications/initialized → tools/list。
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_INFO = { name: 'suqiu-mcp-probe', version: '0.1.0' };

/**
 * 把底层错误翻译成人话 + 可执行建议。
 * @param {unknown} error
 * @param {{ transport: string, target: string }} context
 * @returns {{ code: string, message: string, hint: string }}
 */
export function explainFailure(error, context) {
  const raw = String(error?.message ?? error ?? '');
  const lower = raw.toLowerCase();
  const isHttp = context.transport === 'streamable-http';

  if (/timed out|timeout|aborted|abort/i.test(raw)) {
    return {
      code: 'timeout',
      message: `连接超时：${context.target} 没有在规定时间内响应`,
      hint: isHttp ? '确认服务已启动、端口对、没有被防火墙拦下' : '确认命令能独立跑起来；首次运行可能要下载依赖',
    };
  }
  if (/401|403|unauthorized|forbidden|invalid token/i.test(raw)) {
    return { code: 'unauthorized', message: '服务拒绝了访问（鉴权失败）', hint: '检查请求头里的 Authorization / X-Api-Key 是否正确、是否过期' };
  }
  if (/404|not found/i.test(raw) && isHttp) {
    return { code: 'not-found', message: '地址存在，但该路径下没有 MCP 端点', hint: '很多服务的 MCP 路径是 /mcp 或 /sse，检查是否漏写' };
  }
  if (/certificate|self[- ]signed|tls|ssl/i.test(raw)) {
    return { code: 'tls', message: 'HTTPS 证书校验失败', hint: '自建服务请用受信任证书，或先用内网 http 地址测试' };
  }
  if (/econnrefused|connection refused|econnreset|fetch failed|socket hang up/i.test(lower)) {
    return { code: 'unreachable', message: `连不上 ${context.target}`, hint: isHttp ? '确认服务已启动、端口对' : '确认启动命令正确' };
  }
  if (/enotfound|getaddrinfo|dns/i.test(lower)) {
    return { code: 'dns', message: `域名解析失败：${context.target}`, hint: '检查域名拼写或本机 DNS / 代理' };
  }
  if (/enoent|spawn .*enoent/i.test(lower)) {
    return { code: 'command-not-found', message: '启动命令不存在', hint: '检查 command 是否为可执行文件，并确认它在 PATH 里' };
  }
  if (/eacces|permission denied/i.test(lower)) {
    return { code: 'permission', message: '没有权限执行该命令', hint: '检查文件权限，或换一个可执行路径' };
  }
  if (/eperm/i.test(lower)) {
    return { code: 'spawn-denied', message: '系统不允许启动子进程', hint: '命令本身可能没问题：本机安全策略拦截了进程创建' };
  }
  if (/unexpected token|parse|invalid json|json-rpc/i.test(lower)) {
    return { code: 'protocol', message: '有响应，但不是合法的 MCP 协议数据', hint: '这个地址可能不是 MCP 端点' };
  }
  return { code: 'unknown', message: raw || '连接失败', hint: '查看服务端日志获取更多信息' };
}

/** 带超时地跑一个 promise。 */
function withTimeout(promise, timeoutMs, target) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms connecting to ${target}`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 通过 stdio 与一个 MCP 子进程握手。
 * @param {object} connection
 * @param {number} timeoutMs
 * @param {AbortSignal} signal
 */
async function probeStdio(connection, timeoutMs, signal) {
  const { spawn } = await import('node:child_process');
  const { StringDecoder } = await import('node:string_decoder');

  return new Promise((resolve, reject) => {
    const child = spawn(connection.command, connection.args ?? [], {
      env: { ...process.env, ...(connection.env ?? {}) },
      cwd: connection.cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const decoder = new StringDecoder('utf8');
    let buffer = '';
    let settled = false;
    const pending = new Map();
    let nextId = 1;
    const startedAt = Date.now();

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      try {
        child.kill();
      } catch {
        /* 忽略 */
      }
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const onAbort = () => finish(reject, new Error('aborted'));

    if (signal?.aborted) {
      finish(reject, new Error('aborted'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => finish(reject, new Error(`timed out after ${timeoutMs} ms connecting to ${connection.command}`)), timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      // 进程根本没起来：把原始 errno 保留下来，才能给出准确诊断
      reject(error);
    });
    child.on('close', (code) => {
      if (!settled) {
        clearTimeout(timer);
        reject(new Error(`命令退出了（exit ${code}）：${buffer.slice(-300) || '没有输出'}`));
      }
    });

    child.stdout.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      // MCP stdio 用按行分隔的 JSON
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line === '') continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // 服务端往 stdout 打日志时会出现非 JSON 行
        }
        const handler = pending.get(message.id);
        if (handler !== undefined) {
          pending.delete(message.id);
          handler(message);
        }
      }
    });

    const request = (method, params) =>
      new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });

    const notify = (method, params) => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    };

    (async () => {
      const init = await request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      });
      if (init.error) throw new Error(init.error.message ?? 'initialize 失败');
      notify('notifications/initialized', {});
      const listed = await request('tools/list', {});
      if (listed.error) throw new Error(listed.error.message ?? 'tools/list 失败');
      const latencyMs = Date.now() - startedAt;
      clearTimeout(timer);
      finish(resolve, {
        latencyMs,
        server: init.result?.serverInfo ?? {},
        tools: Array.isArray(listed.result?.tools) ? listed.result.tools : [],
      });
    })().catch((error) => {
      clearTimeout(timer);
      finish(reject, error);
    });
  });
}

/**
 * 通过 HTTP（streamable-http）握手。
 * @param {object} connection
 * @param {number} timeoutMs
 * @param {AbortSignal} signal
 */
async function probeHttp(connection, timeoutMs, signal) {
  const startedAt = Date.now();
  const url = new URL(connection.url);
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(connection.headers ?? {}) };

  const post = async (body) => {
    const response = await withTimeout(
      fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }),
      timeoutMs,
      connection.url,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    const text = await response.text();
    // streamable-http 可能返回 SSE 帧，取其中的 data: 行
    const payloads = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line !== '');
    const candidates = payloads.length > 0 ? payloads : [text];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) return parsed;
      } catch {
        /* 继续找下一个 */
      }
    }
    throw new Error('返回内容不是 JSON-RPC 响应');
  };

  const session = {};
  const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO } });
  if (init.error) throw new Error(init.error.message ?? 'initialize 失败');
  if (session.id) headers['mcp-session-id'] = session.id;

  const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  if (listed.error) throw new Error(listed.error.message ?? 'tools/list 失败');

  return {
    latencyMs: Date.now() - startedAt,
    server: init.result?.serverInfo ?? {},
    tools: Array.isArray(listed.result?.tools) ? listed.result.tools : [],
  };
}

/**
 * 探测一条连接。
 * @param {object} connection 已归一化的连接配置
 * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<object>}
 */
export async function probeConnection(connection, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const isStdio = connection.transport === 'stdio';
  const target = isStdio ? `${connection.command} ${(connection.args ?? []).join(' ')}`.trim() : connection.url;
  const startedAt = Date.now();

  try {
    const result = isStdio
      ? await probeStdio(connection, timeoutMs, options.signal)
      : await probeHttp(connection, timeoutMs, options.signal);
    const tools = result.tools ?? [];
    const output = {
      ok: true,
      transport: connection.transport,
      target,
      latencyMs: result.latencyMs ?? Date.now() - startedAt,
      server: { name: result.server?.name, version: result.server?.version },
      tools,
      toolCount: tools.length,
    };
    if (tools.length === 0) output.warning = '连接成功，但该服务没有提供任何工具';
    return output;
  } catch (error) {
    const cancelled = options.signal?.aborted === true;
    return {
      ok: false,
      transport: connection.transport,
      target,
      latencyMs: Date.now() - startedAt,
      error: cancelled
        ? { code: 'cancelled', message: '测试已取消', hint: '' }
        : explainFailure(error, { transport: connection.transport, target }),
    };
  }
}

/**
 * 把连接探测结果按风险规则审核。
 * @param {object} probeResult probeConnection 的返回
 * @returns {object|null}
 */
export function auditProbeResult(probeResult) {
  if (probeResult?.ok !== true) return null;
  return probeResult.tools ?? [];
}
