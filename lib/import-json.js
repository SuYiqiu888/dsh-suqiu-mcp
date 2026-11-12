/**
 * JSON 导入 —— 解析社区通行的 mcpServers 配置。
 *
 * 吃这几种写法：
 *   { "mcpServers": { "name": { "command": ..., "args": [...] } } }
 *   { "servers": {...} } / { "connections": {...} } / 直接是连接表
 *
 * 单条坏数据不会让整批失败：坏的进 errors，好的照常导入。
 */

/** 顶层容器键，按优先级尝试。 */
const CONTAINER_KEYS = ['mcpServers', 'servers', 'connections', 'mcp'];

/** 直接映射到 MCP client 配置的字段。 */
const PASSTHROUGH = ['serverName', 'command', 'args', 'env', 'cwd', 'url', 'headers'];

/** serverName 的合法形态，与 dsh-mcp-client 保持一致。 */
const NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * 从外部条目的 type/transport 推断实际传输方式。
 *
 * 社区格式常见 sse / http；dsh-mcp-client 只支持 stdio 与 streamable-http，
 * 因此 sse/http 统一归一为后者。
 * @param {object} entry
 * @returns {'stdio'|'streamable-http'|undefined}
 */
export function inferTransport(entry) {
  const declared = typeof entry.transport === 'string' ? entry.transport : typeof entry.type === 'string' ? entry.type : undefined;
  if (declared !== undefined) {
    const value = declared.trim().toLowerCase();
    if (value === 'stdio') return 'stdio';
    if (value === 'streamable-http' || value === 'streamablehttp' || value === 'http' || value === 'sse') return 'streamable-http';
    throw new Error(`无法识别的连接方式「${declared}」`);
  }
  // 没写就按字段推断：有 command 走本地进程，有 url 走 HTTP。
  if (typeof entry.command === 'string' && entry.command.trim() !== '') return 'stdio';
  if (typeof entry.url === 'string' && entry.url.trim() !== '') return 'streamable-http';
  return undefined;
}

/**
 * 把外部条目转成插件内部使用的连接对象。
 * @param {string} name 键名，作为默认 serverName
 * @param {object} entry
 * @returns {object}
 */
function normalizeEntry(name, entry) {
  const connection = { serverName: entry.serverName ?? name };
  const transport = inferTransport(entry);
  if (transport !== undefined) connection.transport = transport;

  for (const key of PASSTHROUGH) {
    if (key === 'serverName') continue;
    if (entry[key] !== undefined) connection[key] = entry[key];
  }

  // args 兼容「空格分隔的字符串」写法
  if (typeof connection.args === 'string') {
    connection.args = connection.args.trim() === '' ? [] : connection.args.trim().split(/\s+/);
  }
  // env 的值统一转字符串（有些配置写成数字或布尔）
  if (connection.env !== null && typeof connection.env === 'object' && !Array.isArray(connection.env)) {
    connection.env = Object.fromEntries(
      Object.entries(connection.env)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
    );
  }

  if (typeof connection.serverName !== 'string' || !NAME_PATTERN.test(connection.serverName.trim())) {
    throw new Error('名称只能用字母、数字、下划线或短横线，长度 1–32');
  }
  connection.serverName = connection.serverName.trim();

  if (connection.transport === 'stdio') {
    if (typeof connection.command !== 'string' || connection.command.trim() === '') throw new Error('本地命令方式要填启动命令');
    connection.command = connection.command.trim();
    if (!Array.isArray(connection.args)) connection.args = [];
    if (connection.env === undefined) connection.env = {};
    if (typeof connection.cwd !== 'string') connection.cwd = '';
    delete connection.url;
    delete connection.headers;
  } else if (connection.transport === 'streamable-http') {
    if (typeof connection.url !== 'string' || !/^https?:\/\//i.test(connection.url.trim())) {
      throw new Error('地址要以 http:// 或 https:// 开头');
    }
    connection.url = connection.url.trim();
    if (connection.headers === undefined || connection.headers === null) connection.headers = {};
    delete connection.command;
    delete connection.args;
    delete connection.env;
    delete connection.cwd;
  } else {
    throw new Error('无法判断连接方式：请提供 command（本地命令）或 url（HTTP 地址）');
  }

  connection.enabled = entry.enabled !== false && entry.disabled !== true;
  return connection;
}

/**
 * 解析粘贴的 JSON 文本。
 * @param {string} text
 * @returns {{ connections: object[], errors: { name: string, message: string }[] }}
 */
export function parseImportJson(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('请粘贴 JSON 配置');

  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.message}`);
  }

  let table;
  if (Array.isArray(document)) {
    table = Object.fromEntries(document.map((entry, index) => [entry?.serverName ?? `server-${index + 1}`, entry]));
  } else if (document !== null && typeof document === 'object') {
    const containerKey = CONTAINER_KEYS.find((key) => document[key] !== null && typeof document[key] === 'object');
    table = containerKey !== undefined ? document[containerKey] : document;
    if (Array.isArray(table)) {
      table = Object.fromEntries(table.map((entry, index) => [entry?.serverName ?? `server-${index + 1}`, entry]));
    }
  } else {
    throw new Error('JSON 顶层必须是对象或数组');
  }

  if (table === null || typeof table !== 'object') throw new Error('没有找到任何连接定义');

  const connections = [];
  const errors = [];
  const seen = new Set();

  for (const [name, entry] of Object.entries(table)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push({ name, message: '不是对象，已跳过' });
      continue;
    }
    try {
      const connection = normalizeEntry(name, entry);
      const key = connection.serverName.toLowerCase();
      if (seen.has(key)) {
        errors.push({ name, message: `名称「${connection.serverName}」重复，已跳过` });
        continue;
      }
      seen.add(key);
      connections.push(connection);
    } catch (error) {
      errors.push({ name, message: String(error?.message ?? error) });
    }
  }

  if (connections.length === 0 && errors.length === 0) throw new Error('JSON 里没有任何连接定义');
  return { connections, errors };
}
