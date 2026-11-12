/**
 * 穗秋MCP —— Host 半。
 *
 * Typert 远程服务 suqiuMcp：管理 profile cordis.patch.yml 里我们自己的受管块。
 * 块内可以放任意多条 MCP 连接（一行一条 @deepseek-ai/dsh-mcp-client），
 * 按 serverName 增改删、各自独立启停；块外内容逐字节保留。
 *
 *   list()        当前所有连接 + 各自的加载阶段与工具数
 *   save()        按名字新增或更新一条（带 previousName 时视为改名）
 *   removeServer() 删掉一条（不能叫 remove：client api 里是保留名）
 *   setEnabled()  只切某一条的启用状态
 */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { parseImportJson } from './lib/import-json.js';
import { auditTools } from './lib/audit.js';
import { probeConnection } from './lib/probe.js';

export const name = 'suqiu-mcp';
// tools / loader 必须显式注入：状态里的「工具数」「加载阶段」都读它们。
export const inject = ['typert', 'tools', 'loader'];

const MCP_PLUGIN_NAME = '@deepseek-ai/dsh-mcp-client';
const ROW_PREFIX = 'suqiu-mcp-';
const BEGIN = '# >>> suqiu-mcp:begin';
const END = '# <<< suqiu-mcp:end';
const DEFAULT_URL = 'http://127.0.0.1:8787/mcp';

const codec = (symbol, sSchema) => ({ mode: 'strict', typeSymbol: symbol, create: () => sSchema });

const serverNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,32}$/, '名称只能用字母、数字、下划线或短横线，长度 1–32');

function checkTransport(value, ctx) {
  if (value.transport === 'streamable-http') {
    const url = (value.url ?? '').trim();
    if (url === '') ctx.addIssue({ code: 'custom', path: ['url'], message: 'HTTP 方式要填地址' });
    else if (!/^https?:\/\//i.test(url)) ctx.addIssue({ code: 'custom', path: ['url'], message: '地址要以 http:// 或 https:// 开头' });
  } else if ((value.command ?? '').trim() === '') {
    ctx.addIssue({ code: 'custom', path: ['command'], message: '本地命令方式要填启动命令' });
  }
}

const serverShape = {
  serverName: serverNameSchema,
  transport: z.enum(['streamable-http', 'stdio']),
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
};

const savePayloadSchema = z.object({ ...serverShape, previousName: serverNameSchema.optional() }).superRefine(checkTransport);

/**
 * 探测专用形状：只要连接本身需要的字段。
 *
 * 单独定义而不是从 savePayloadSchema 上 `.omit()`——后者带 superRefine，
 * Zod 明确禁止对含 refinement 的 object 做 omit/pick/extend。
 */
const probePayloadSchema = z
  .object({
    serverName: serverNameSchema,
    transport: z.enum(['streamable-http', 'stdio'], { message: '连接方式只能是 HTTP 地址或本地命令' }),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
  })
  .superRefine(checkTransport);

const serverPayloadSchema = z.object({ serverName: serverNameSchema });
const enabledPayloadSchema = z.object({ serverName: serverNameSchema, enabled: z.boolean() });

const serverViewSchema = z.object({
  serverName: z.string(),
  transport: z.enum(['streamable-http', 'stdio']),
  url: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  headers: z.record(z.string(), z.string()),
  enabled: z.boolean(),
  phase: z.string().nullable(),
  toolCount: z.number().int().nonnegative(),
});

const listResultSchema = z.object({
  servers: z.array(serverViewSchema),
  patchPath: z.string(),
});

const MANIFEST = {
  package: 'suqiu-mcp',
  face: 'host',
  schemas: [],
  invocations: [
    { id: 'suqiu-mcp#suqiuMcp/list', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: codec('suqiu-mcp#List', listResultSchema) },
    { id: 'suqiu-mcp#suqiuMcp/save', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'save', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#SavePayload', z.unknown()) }], result: codec('suqiu-mcp#List', listResultSchema) },
    { id: 'suqiu-mcp#suqiuMcp/removeServer', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'removeServer', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#RemovePayload', z.unknown()) }], result: codec('suqiu-mcp#List', listResultSchema) },
    { id: 'suqiu-mcp#suqiuMcp/setEnabled', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'setEnabled', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#EnabledPayload', z.unknown()) }], result: codec('suqiu-mcp#List', listResultSchema) },
    { id: 'suqiu-mcp#suqiuMcp/probe', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'probe', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#ProbePayload', z.unknown()) }], result: codec('suqiu-mcp#ProbeResult', z.unknown()) },
    { id: 'suqiu-mcp#suqiuMcp/importJson', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'importJson', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#ImportPayload', z.unknown()) }], result: codec('suqiu-mcp#ImportResult', z.unknown()) },
    { id: 'suqiu-mcp#suqiuMcp/audit', service: 'suqiuMcp', namespace: 'suqiuMcp', method: 'audit', invocation: { kind: 'direct' }, parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#AuditPayload', z.unknown()) }], result: codec('suqiu-mcp#AuditResult', z.unknown()) },
  ],
  model: { services: [], events: [], objects: [] },
};

const FIBER_PHASE = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: null, 5: 'unloading' };

function phaseOf(state) {
  if (typeof state !== 'number') return null;
  const phase = FIBER_PHASE[state];
  return phase === undefined ? null : phase;
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = stripUndefined(item);
    return out;
  }
  return value;
}

class SuqiuGateway extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'suqiuMcp');
  }

  get C() {
    return this.ctx;
  }

  patchPath() {
    const base = this.C.baseUrl;
    if (typeof base === 'string' && base.length > 0) {
      try {
        const url = new URL(base);
        if (url.protocol === 'file:') return join(fileURLToPath(url), 'cordis.patch.yml');
      } catch {
        // 退到环境变量 / 默认路径
      }
    }
    const profileDir = process.env.DSH_PROFILE_DIR;
    if (typeof profileDir === 'string' && profileDir !== '') return join(profileDir, 'cordis.patch.yml');
    return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', process.env.DSH_PROFILE || 'web', 'cordis.patch.yml');
  }

  async readRaw() {
    try {
      return await readFile(this.patchPath(), 'utf8');
    } catch {
      return '';
    }
  }

  blockOf(raw) {
    const begin = raw.indexOf(BEGIN);
    if (begin < 0) return undefined;
    const end = raw.indexOf(END, begin);
    if (end < 0) return undefined;
    return raw.slice(begin + BEGIN.length, end);
  }

  /** 受管块里属于本插件的行：[{ id, row }]，按文件顺序。 */
  rowsOf(raw) {
    const body = this.blockOf(raw);
    if (body === undefined) return [];
    let document;
    try {
      document = parse(body);
    } catch {
      return [];
    }
    const rows = [];
    for (const item of Array.isArray(document) ? document : []) {
      if (!Array.isArray(item?.insert)) continue;
      for (const row of item.insert) {
        if (typeof row?.id === 'string' && row.id.startsWith(ROW_PREFIX)) rows.push({ id: row.id, row });
      }
    }
    return rows;
  }

  /** 一条连接 → 载荷（写回 YAML 用）。 */
  payloadOf(row) {
    const config = row?.config ?? {};
    const transport = config.transport === 'stdio' ? 'stdio' : 'streamable-http';
    return {
      serverName: typeof config.serverName === 'string' ? config.serverName : 'suqiu',
      transport,
      url: typeof config.url === 'string' ? config.url : '',
      headers: config.headers !== null && typeof config.headers === 'object' ? Object.fromEntries(Object.entries(config.headers).filter(([, value]) => typeof value === 'string')) : {},
      command: typeof config.command === 'string' ? config.command : '',
      args: Array.isArray(config.args) ? config.args.filter((item) => typeof item === 'string') : [],
      enabled: row?.disabled !== true,
    };
  }

  rowOf(input) {
    const row = { id: ROW_PREFIX + input.serverName, name: MCP_PLUGIN_NAME };
    if (input.enabled === false) row.disabled = true;
    const config =
      input.transport === 'streamable-http'
        ? { serverName: input.serverName, transport: 'streamable-http', url: input.url.trim(), headers: input.headers ?? {} }
        : { serverName: input.serverName, transport: 'stdio', command: input.command.trim(), args: input.args ?? [] };
    row.config = {
      ...config,
      toolCallTimeoutMs: 60000,
      failOnatartupError: false,
      reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 },
    };
    return row;
  }

  async writeRows(inputs) {
    const raw = await this.readRaw();
    const block = inputs.length === 0 ? BEGIN + '\n' + END + '\n' : BEGIN + '\n' + stringify([{ insert: inputs.map((input) => this.rowOf(input)) }]) + END + '\n';
    const begin = raw.indexOf(BEGIN);
    const end = begin >= 0 ? raw.indexOf(END, begin) : -1;
    let next;
    if (begin >= 0 && end > begin) {
      let tail = raw.slice(end + END.length);
      if (tail.startsWith('\n')) tail = tail.slice(1);
      next = raw.slice(0, begin) + block + tail;
    } else {
      next = raw.replace(/\s*$/, '') + '\n\n' + block;
    }
    const path = this.patchPath();
    const temporary = path + '.suqiu-mcp.tmp';
    await writeFile(temporary, next, 'utf8');
    await rename(temporary, path);
  }

  statusOf(entryId, serverName) {
    let phase = null;
    try {
      const loader = this.C.loader;
      if (loader !== undefined && typeof loader.entries === 'function') {
        for (const entry of loader.entries()) {
          if (entry?.id === entryId) {
            phase = phaseOf(entry.state ?? entry.phase);
            break;
          }
        }
      }
    } catch {
      // 状态读不到不算失败
    }
    let toolCount = 0;
    try {
      const tools = this.C.tools;
      if (tools !== undefined && typeof tools.schemas === 'function') {
        const prefix = 'mcp__' + serverName + '__';
        const schemas = tools.schemas();
        if (Array.isArray(schemas)) toolCount = schemas.filter((sSchema) => typeof sSchema?.name === 'string' && sSchema.name.startsWith(prefix)).length;
      }
    } catch {
      // 同上
    }
    return { phase, toolCount };
  }

  async listResult() {
    const raw = await this.readRaw();
    const seen = new Set();
    const servers = [];
    for (const { id, row } of this.rowsOf(raw)) {
      const payload = this.payloadOf(row);
      if (seen.has(payload.serverName)) continue;
      seen.add(payload.serverName);
      const { phase, toolCount } = this.statusOf(id, payload.serverName);
      servers.push({ ...payload, phase, toolCount });
    }
    return { servers, patchPath: this.patchPath() };
  }

  async list() {
    return this.listResult();
  }

  async save(rawPayload) {
    const parsed = savePayloadSchema.safeParse(stripUndefined(rawPayload ?? {}));
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message);
      throw new Error(issues.join('；') || '配置不合法');
    }
    const input = parsed.data;
    const raw = await this.readRaw();
    const current = this.rowsOf(raw).map(({ row }) => this.payloadOf(row));
    const previous = input.previousName ?? input.serverName;
    const next = [];
    let replaced = false;
    for (const item of current) {
      if (item.serverName === previous) {
        if (!replaced) {
          next.push({ ...input, enabled: input.enabled !== false });
          replaced = true;
        }
        continue;
      }
      if (item.serverName === input.serverName) continue; // 名字撞了：以本次保存为准
      next.push(item);
    }
    if (!replaced) next.push({ ...input, enabled: input.enabled !== false });
    await this.writeRows(next);
    await this.settle(input.serverName);
    return this.listResult();
  }

  async removeServer(rawPayload) {
    const parsed = serverPayloadSchema.safeParse(stripUndefined(rawPayload ?? {}));
    if (!parsed.success) throw new Error('名称不合法');
    const raw = await this.readRaw();
    const next = this.rowsOf(raw)
      .map(({ row }) => this.payloadOf(row))
      .filter((item) => item.serverName !== parsed.data.serverName);
    await this.writeRows(next);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return this.listResult();
  }

  async setEnabled(rawPayload) {
    const parsed = enabledPayloadSchema.safeParse(stripUndefined(rawPayload ?? {}));
    if (!parsed.success) throw new Error('参数不合法');
    const raw = await this.readRaw();
    const next = this.rowsOf(raw).map(({ row }) => {
      const item = this.payloadOf(row);
      return item.serverName === parsed.data.serverName ? { ...item, enabled: parsed.data.enabled } : item;
    });
    await this.writeRows(next);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return this.listResult();
  }

  /**
   * 连接诊断：真实握手，不写配置。
   *
   * 表单里填到一半就能测：先验字段，再连一次，把工具清单一起带回来，
   * 界面上可以立刻看到「这个服务会给我什么工具」。
   *
   * 注意：这里不能从 savePayloadSchema 上 `.omit()`——它带了 superRefine，
   * 而 Zod 不允许对含 refinement 的 object 做 omit（会直接抛错）。
   * 探测本来就用不到 enabled / previousName，单独用一个形状即可。
   */
  async probe(rawPayload) {
    const payload = rawPayload ?? {};
    const connection = probePayloadSchema.safeParse(stripUndefined(payload));
    if (!connection.success) {
      const issues = connection.error.issues.map((issue) => issue.message);
      return { ok: false, error: { code: 'invalid', message: issues.join('；'), hint: '先把表单填完整再测试' } };
    }
    return probeConnection(connection.data);
  }

  /**
   * 粘贴 JSON 导入：一次写入多条连接。
   *
   * 单条坏数据不会让整批失败——好的一条照常写入，坏的回给界面看。
   */
  async importJson(rawPayload) {
    const payload = rawPayload ?? {};
    const text = typeof payload.text === 'string' ? payload.text : '';
    const { connections, errors } = parseImportJson(text);

    const raw = await this.readRaw();
    const current = this.rowsOf(raw).map(({ row }) => this.payloadOf(row));
    const byName = new Map(current.map((item) => [item.serverName, item]));
    const imported = [];
    const failed = [...errors];

    for (const connection of connections) {
      try {
        byName.set(connection.serverName, connection);
        imported.push(connection.serverName);
      } catch (error) {
        failed.push({ name: connection.serverName, message: String(error?.message ?? error) });
      }
    }

    await this.writeRows([...byName.values()]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { imported, failed, servers: (await this.listResult()).servers };
  }

  /**
   * 工具风险审核。
   *
   * 优先用已挂载工具（实时、准确）；没有工具时退回一次握手探测。
   */
  async audit(rawPayload) {
    const parsed = serverPayloadSchema.safeParse(stripUndefined(rawPayload ?? {}));
    if (!parsed.success) throw new Error('名称不合法');
    const { serverName } = parsed.data;

    const raw = await this.readRaw();
    const row = this.rowsOf(raw).find(({ row }) => this.payloadOf(row).serverName === serverName);
    if (row === undefined) {
      return { ok: false, serverName, error: { code: 'not-found', message: `没有名叫「${serverName}」的连接` } };
    }

    const connection = this.payloadOf(row.row);
    // 先试实时工具清单
    const local = this.toolNamesOf(serverName);
    let tools = local.map((name) => ({ name, description: '' }));
    let source = 'loaded';

    if (tools.length === 0) {
      const probed = await probeConnection(connection);
      if (!probed.ok) return { ok: false, serverName, error: probed.error };
      tools = probed.tools ?? [];
      source = 'probe';
    }

    const result = auditTools(tools);
    return { ok: true, serverName, source, ...result };
  }

  /** 读已挂载的工具原始名（去掉 mcp__<server>__ 前缀）。 */
  toolNamesOf(serverName) {
    const names = [];
    try {
      const tools = this.C.tools;
      if (tools !== undefined && typeof tools.schemas === 'function') {
        const prefix = 'mcp__' + serverName + '__';
        const schemas = tools.schemas();
        if (Array.isArray(schemas)) {
          for (const schema of schemas) {
            if (typeof schema?.name === 'string' && schema.name.startsWith(prefix)) names.push(schema.name.slice(prefix.length));
          }
        }
      }
    } catch {
      // 读不到不算失败
    }
    return names.sort();
  }

  /** 写盘后等这一行重新握手，最多约 3.2 秒，避免界面停在 0。 */
  async settle(serverName) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const result = await this.listResult();
      const server = result.servers.find((item) => item.serverName === serverName);
      if (server === undefined || server.toolCount > 0 || server.phase === 'failed' || server.enabled === false) return;
    }
  }

  /** 首次激活时把受管块建出来，之后一切都由界面改。 */
  async ensureBlock() {
    const raw = await this.readRaw();
    if (this.blockOf(raw) !== undefined) return;
    await this.writeRows([{ serverName: 'suqiu', transport: 'streamable-http', url: DEFAULT_URL, headers: {}, enabled: true }]);
  }
}

/**
 * 仅测试使用的句柄。
 *
 * 生产路径不需要它——apply() 自己创建网关；但测试要能拿到实例直接调
 * probe/audit/importJson，否则只能隔着远程协议黑盒验证。
 */
export const __gateway = SuqiuGateway;

export function apply(ctx) {
  const gateway = new SuqiuGateway(ctx);
  ctx.effect(() => ctx.typert.register(MANIFEST), 'suqiu-mcp: typert manifest');
  ctx.effect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => (cancelled ? undefined : gateway.ensureBlock()))
      .catch((error) => ctx.logger?.warn?.('suqiu-mcp: 初始化受管块失败 ' + String(error)));
    return () => {
      cancelled = true;
    };
  }, 'suqiu-mcp: seed managed block');
}
