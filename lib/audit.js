/**
 * 工具风险审核 —— 纯规则层，不发网络请求、不改配置。
 *
 * 定位：不是安全边界（真正的边界在 Host 的审批与沙箱），
 * 而是让用户在把连接交给 AI 之前，先看清它会带来什么能力。
 *
 * 判断依据只有工具名、描述、参数名三项，刻意保守。
 */

/**
 * 以「非字母数字」为边界做整词匹配。
 *
 * 不能用 \b：JS 把下划线算作单词字符，\bdrop\b 匹配不到 drop_table，
 * 而 MCP 工具名绝大多数是 snake_case——那样整条规则等于失效。
 * @param {string} words 以 | 分隔的词表
 * @returns {RegExp}
 */
function sepRegex(words) {
  return new RegExp(`(?:^|[^a-z0-9])(${words})(?:$|[^a-z0-9])`, 'i');
}

/** 动作词规则，按严重度降序。 */
const ACTION_RULES = [
  { level: 'critical', tag: '删除数据', pattern: sepRegex('delete|remove|drop|destroy|purge|truncate|wipe|erase|unlink|rmdir'), reason: '会删除或清空数据，通常不可撤销' },
  { level: 'critical', tag: '执行命令', pattern: sepRegex('exec|execute|spawn|shell|bash|powershell|terminal|eval'), reason: '可以在本机执行命令或代码' },
  { level: 'high', tag: '写入数据', pattern: sepRegex('write|create|insert|update|upsert|edit|modify|patch|save|upload|import|append'), reason: '会改动数据' },
  { level: 'high', tag: '财务操作', pattern: sepRegex('payment|pay|transfer|refund|order|purchase|billing|invoice|charge'), reason: '涉及资金或交易' },
  { level: 'medium', tag: '外部请求', pattern: sepRegex('request|fetch|http|curl|browse|scrape|crawl|download|webhook'), reason: '会向外部地址发起请求' },
  { level: 'medium', tag: '对外发送', pattern: sepRegex('send|notify|publish|email|sms|announce|broadcast|deploy'), reason: '会以你的身份对外发送内容' },
];

/** 只读动词：名字里出现这些说明大概率只查询。 */
const READONLY_PATTERN = sepRegex('get|list|search|query|read|find|describe|show|view|inspect|count|status|lookup|diff|check|info');

/** 参数名像凭据，说明该工具会用到你的授权。 */
const CREDENTIAL_PATTERN = /(token|password|passwd|secret|api[_-]?key|credential|private[_-]?key|access[_-]?key|auth)/i;

/** 参数范围很宽的信号。 */
const SCOPE_RULES = [
  { pattern: /^(path|file|filepath|filename|dir|directory|cwd|root)$/i, note: '参数要求文件路径：可能读写本机任意位置' },
  { pattern: /^(url|uri|endpoint|host|server)$/i, note: '参数要求地址：可访问任意主机（含内网）' },
  { pattern: /^(sql|query|statement|command|cmd|script|code)$/i, note: '参数是原样执行的语句或脚本：没有二次过滤' },
];

const WEIGHT = { critical: 40, high: 20, medium: 8, low: 0 };

function worst(a, b) {
  return WEIGHT[a] >= WEIGHT[b] ? a : b;
}

function propertyNames(schema) {
  if (schema === null || typeof schema !== 'object') return [];
  const properties = schema.properties;
  if (properties === null || typeof properties !== 'object') return [];
  return Object.keys(properties);
}

/**
 * 审核单个工具。
 * @param {{ name: string, description?: string, inputSchema?: object }} tool
 * @returns {{ level: string, tags: string[], reasons: string[], readOnly: boolean, needsCredentials: boolean }}
 */
export function auditTool(tool) {
  const name = typeof tool?.name === 'string' ? tool.name : '';
  const description = typeof tool?.description === 'string' ? tool.description : '';
  const haystack = `${name} ${description}`;

  // 名字里带只读动词、且不含破坏性动词时，说明只是查询。
  // 不能拿全部规则判定：READONLY_PATTERN 本身含 request/fetch，
  // 若一起参与，get_user 永远拿不到豁免，降档逻辑等于失效。
  const destructiveInName = ACTION_RULES.some((rule) => (rule.level === 'critical' || rule.level === 'high') && rule.pattern.test(name));
  const nameLooksReadOnly = READONLY_PATTERN.test(name) && !destructiveInName;

  let level = 'low';
  const tags = [];
  const reasons = [];

  for (const rule of ACTION_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    // 只读工具的描述里常有 "write to a temp file"，降一档避免大面积误报。
    const downgrade = nameLooksReadOnly && (rule.level === 'high' || rule.level === 'critical');
    level = worst(level, downgrade ? 'medium' : rule.level);
    if (!tags.includes(rule.tag)) tags.push(rule.tag);
    reasons.push(`${rule.reason}（命中「${rule.tag}」）`);
  }

  const names = propertyNames(tool?.inputSchema);
  const needsCredentials = names.some((param) => CREDENTIAL_PATTERN.test(param));
  if (needsCredentials) {
    level = worst(level, 'high');
    if (!tags.includes('需要凭据')) tags.push('需要凭据');
    reasons.push('参数含 token / password / api_key 之类的凭据：调用会用到你的授权');
  }

  for (const rule of SCOPE_RULES) {
    const hit = names.find((param) => rule.pattern.test(param));
    if (hit !== undefined) {
      level = worst(level, 'medium');
      if (!tags.includes('参数范围宽')) tags.push('参数范围宽');
      reasons.push(`${rule.note}（参数「${hit}」）`);
      break;
    }
  }

  if (names.length >= 12) {
    level = worst(level, 'medium');
    reasons.push(`参数多达 ${names.length} 个：调用面很宽`);
  }

  return { level, tags, reasons: [...new Set(reasons)], readOnly: level === 'low' && !needsCredentials, needsCredentials };
}

/**
 * 审核整台服务器的工具。
 * @param {{ name: string, description?: string, inputSchema?: object }[]} tools
 * @returns {{ level: string, counts: object, total: number, dangerous: string[], tools: object[] }}
 */
export function auditTools(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  const dangerous = [];

  const audited = list.map((tool) => {
    const audit = auditTool(tool);
    counts[audit.level] += 1;
    if (audit.level === 'critical') dangerous.push(tool.name);
    return {
      name: tool.name,
      description: typeof tool.description === 'string' ? tool.description.slice(0, 300) : '',
      level: audit.level,
      tags: audit.tags,
      reasons: audit.reasons,
      readOnly: audit.readOnly,
    };
  });

  const level = counts.critical > 0 ? 'critical' : counts.high > 0 ? 'high' : counts.medium > 0 ? 'medium' : 'low';
  return {
    level,
    counts,
    total: list.length,
    dangerous,
    tools: audited.sort((a, b) => WEIGHT[b.level] - WEIGHT[a.level] || a.name.localeCompare(b.name)),
  };
}
