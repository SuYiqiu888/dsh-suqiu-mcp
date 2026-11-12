/**
 * 穗秋MCP —— Client 半（Web UI）。
 *
 * 没有「新建连接」按钮：下面的表单常驻，填完保存就是新增一条；
 * 点上面列表里的任一连接，表单会载入它，保存即修改、右侧按钮即删除。
 * 状态用彩色文字表达：正常绿、连接中黄、未连接红、停用灰。
 */
window.__ModuleLoader__.load({
  id: 'suqiu-mcp',
  factory: (require) => {
    const React = require('react');
    const { useState, useEffect, useCallback } = React;
    const h = React.createElement;

    const NS = 'suqiu-mcp';

    const zh = {
      nav: '穗秋MCP',
      title: '穗秋MCP',
      lead: '可以同时挂多台 MCP 服务器。每台的工具都会以 mcp__<名称>__<工具> 出现在 AI 手里。',
      refresh: '刷新状态',
      hint: '填好下面表单点保存就是新增一条；点上面的连接可以编辑已有的一条。',
      empty: '还没有连接，填下面的表单保存一条。',
      creating: '新增连接',
      editing: '正在编辑',
      manualTitle: '手动填写',
      manualHint: '逐项填写连接信息；点上方连接卡片可载入已有配置来修改。',
      name: '名称',
      nameHelp: '工具名前缀，只能用字母、数字、下划线、短横线',
      mode: '连接方式',
      modeHttp: 'HTTP 地址',
      modeStdio: '本地命令',
      url: '服务地址',
      urlHelp: '例如 https://example.com/mcp',
      headers: '请求头',
      headersHelp: '每行一条，形如 Authorization: Bearer xxx；留空表示不带',
      command: '启动命令',
      commandHelp: '在手机 Linux 环境里执行的命令',
      args: '命令参数',
      argsHelp: '空格分隔，可留空',
      enabled: '启用',
      save: '保存并重连',
      saving: '保存中…',
      saved: '已保存',
      clear: '清空表单',
      remove: '删除',
      removeConfirm: '再点一次删除',
      statusOnline: '连接正常',
      statusPending: '连接中…',
      statusOff: '未连接',
      statusDisabled: '已停用',
      patch: '写入位置',
      loadFailed: '读取配置失败',
      saveFailed: '保存失败',
      removeFailed: '删除失败',
      test: '测试连接',
      testing: '测试中…',
      importTitle: '导入 JSON',
      importHint: '粘贴 {"mcpServers": {...}} 这类配置，一次导入多条；单条有错不影响其余。',
      importButton: '导入',
      importing: '导入中…',
      importDone: '导入完成',
      auditTitle: '工具风险审核',
      auditHint: '按工具名、描述与参数名判断风险等级，只做提示、不会拦截调用。',
      auditButton: '审核',
      auditing: '审核中…',
      auditPick: '先选一条连接',
      riskLow: '低',
      riskMedium: '中',
      riskHigh: '高',
      riskCritical: '严重',
      toolsUnit: '个工具',
      latency: '耗时',
    };

    const en = {
      nav: 'Suqiu MCP',
      title: 'Suqiu MCP',
      lead: 'Run several MCP servers at once. Each one exposes tools as mcp__<name>__<tool>.',
      refresh: 'Refresh status',
      hint: 'Fill the form below and save to add one; click a connection above to edit it.',
      empty: 'No connections yet. Fill the form below and save.',
      creating: 'New connection',
      editing: 'Editing',
      manualTitle: 'Fill in manually',
      manualHint: 'Enter the connection field by field; click a card above to load an existing one for editing.',
      name: 'Name',
      nameHelp: 'Tool prefix; letters, digits, underscore or dash',
      mode: 'Transport',
      modeHttp: 'HTTP URL',
      modeStdio: 'Local command',
      url: 'Server URL',
      urlHelp: 'For example https://example.com/mcp',
      headers: 'Headers',
      headersHelp: 'One per line, e.g. Authorization: Bearer xxx; leave empty for none',
      command: 'Command',
      commandHelp: 'Runs inside the phone Linux environment',
      args: 'Arguments',
      argsHelp: 'Space separated, optional',
      enabled: 'Enabled',
      save: 'Save and reconnect',
      saving: 'Saving…',
      saved: 'Saved',
      clear: 'Clear form',
      remove: 'Delete',
      removeConfirm: 'Click again to delete',
      statusOnline: 'Connected',
      statusPending: 'Connecting…',
      statusOff: 'Not connected',
      statusDisabled: 'Disabled',
      patch: 'Written to',
      loadFailed: 'Could not read the configuration',
      saveFailed: 'Save failed',
      removeFailed: 'Delete failed',
      test: 'Test connection',
      testing: 'Testing…',
      importTitle: 'Import JSON',
      importHint: 'Paste {"mcpServers": {...}} to import several at once; one bad entry does not block the rest.',
      importButton: 'Import',
      importing: 'Importing…',
      importDone: 'Imported',
      auditTitle: 'Tool risk audit',
      auditHint: 'Scores tools by name, description and parameters. Advisory only; nothing is blocked.',
      auditButton: 'Audit',
      auditing: 'Auditing…',
      auditPick: 'Pick a connection',
      riskLow: 'low',
      riskMedium: 'medium',
      riskHigh: 'high',
      riskCritical: 'critical',
      toolsUnit: 'tools',
      latency: 'latency',
    };

    const strictSchema = { parse: (value) => value };
    const codec = (symbol) => ({ mode: 'strict', typeSymbol: symbol, create: () => strictSchema });
    const descriptor = (method, withPayload) => ({
      id: 'suqiu-mcp#suqiuMcp/' + method,
      service: 'suqiuMcp',
      namespace: 'suqiuMcp',
      method,
      invocation: { kind: 'direct' },
      parameters: withPayload ? [{ name: 'payload', wire: 'payload', source: 'json', codec: codec('suqiu-mcp#' + method) }] : [],
      result: codec('suqiu-mcp#List'),
    });

    const CONTRIBUTION = {
      package: 'suqiu-mcp',
      descriptors: [
        descriptor('list', false),
        descriptor('save', true),
        descriptor('removeServer', true),
        descriptor('setEnabled', true),
        descriptor('probe', true),
        descriptor('importJson', true),
        descriptor('audit', true),
      ],
    };

    const styles = {
      /**
       * 外层负责「占满可用高度」，内层负责滚动。
       *
       * 之前只在单层容器上给了 padding，既没有高度约束也没有 overflow，
       * 内容一旦超出视口就既撑不高也滚不动——表现为下半部分被裁掉。
       * 这里照 dshmarket 的 panelHost 做法：外层 height:100% + min-height:0，
       * 让它在 flex 父级里能收缩，再由 inner 自己 overflow-y:auto。
       */
      page: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        color: 'var(--dsw-alias-label-primary)',
        font: '14px/1.6 system-ui, -apple-system, "PingFang SC", sans-serif',
      },
      scroll: {
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '780px',
        margin: '0 auto',
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        padding: '28px 20px 64px',
      },
      headRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' },
      title: { margin: 0, font: '600 20px/1.4 inherit' },
      lead: { margin: '0 0 20px', color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.7 },

      /* ---------- 连接卡片 ---------- */
      card: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '13px 15px',
        marginBottom: '9px',
        borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        cursor: 'pointer',
        transition: 'border-color .15s, background-color .15s',
      },
      cardActive: {
        borderColor: 'var(--dsw-alias-brand-primary)',
        // 选中态用一层很淡的品牌色，比只换边框更明显
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, var(--dsw-alias-bg-layer-1))',
      },
      cardMain: { flex: '1 1 auto', minWidth: 0 },
      cardTop: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 },
      cardName: { font: '600 14px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'nowrap' },
      cardMeta: { marginTop: '3px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

      /** 状态圆点：一眼看出通没通，比纯文字快。 */
      dot: (color) => ({
        width: '8px',
        height: '8px',
        borderRadius: '999px',
        background: color,
        flex: '0 0 auto',
        boxShadow: '0 0 0 3px ' + 'color-mix(in srgb, ' + color + ' 18%, transparent)',
      }),

      /** 小徽标：传输方式 / 工具数。 */
      badge: {
        padding: '1px 7px',
        borderRadius: '6px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
        fontWeight: 500,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      },
      badgeOk: {
        padding: '1px 7px',
        borderRadius: '6px',
        background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)',
        color: 'var(--dsw-alias-state-success-primary)',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
      },

      ok: { color: 'var(--dsw-alias-state-success-primary)', fontWeight: 600 },
      warn: { color: 'var(--dsw-alias-state-warn-primary)', fontWeight: 600 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontWeight: 600 },
      muted: { color: 'var(--dsw-alias-label-tertiary)' },

      /* ---------- 按钮 ---------- */
      smallButton: {
        padding: '5px 11px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: '12px',
        flex: '0 0 auto',
        transition: 'border-color .15s, color .15s',
      },
      primary: {
        padding: '9px 20px',
        borderRadius: '9px',
        border: 'none',
        background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))',
        color: 'var(--dsw-alias-label-primary-foreground)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.01em',
      },
      ghost: {
        padding: '9px 16px',
        borderRadius: '9px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: '13px',
      },
      primaryDisabled: { opacity: 0.5, cursor: 'default' },

      /* ---------- 分区 ---------- */
      section: {
        marginTop: '24px',
        padding: '18px 16px',
        borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1))',
      },
      sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' },
      sectionTitle: { margin: 0, font: '600 14px/1.4 inherit' },
      sectionHint: { margin: '0 0 14px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.6 },

      field: { marginBottom: '14px' },
      label: { display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' },
      input: {
        boxSizing: 'border-box',
        width: '100%',
        padding: '9px 11px',
        borderRadius: '9px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-1))',
        color: 'inherit',
        font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        outline: 'none',
        transition: 'border-color .15s',
      },
      textarea: {
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '64px',
        padding: '9px 11px',
        borderRadius: '9px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-1))',
        color: 'inherit',
        font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        resize: 'vertical',
        outline: 'none',
      },
      help: { marginTop: '5px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.6 },

      /* ---------- 折叠区 ---------- */
      details: {
        marginTop: '12px',
        borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        padding: '12px 16px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      summary: {
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },

      /* ---------- 结果块 ---------- */
      probeBox: {
        marginTop: '12px',
        padding: '11px 13px',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: '12px',
        lineHeight: 1.7,
      },
      chip: {
        display: 'inline-block',
        padding: '1px 8px',
        marginRight: '6px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 600,
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      toolRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '7px 0',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },

      /* ---------- 分段控件（胶囊切换） ---------- */
      segmented: {
        display: 'inline-flex',
        gap: '2px',
        padding: '3px',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      segment: (active) => ({
        padding: '7px 16px',
        borderRadius: '8px',
        border: 'none',
        background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
        color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-tertiary)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
      }),

      row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      checkRow: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' },
      patch: { marginTop: '20px', fontSize: '11px', color: 'var(--dsw-alias-label-dimmed)', wordBreak: 'break-all', lineHeight: 1.6 },
      empty: {
        padding: '32px 20px',
        textAlign: 'center',
        color: 'var(--dsw-alias-label-tertiary)',
        fontSize: '13px',
        border: '1px dashed var(--dsw-alias-border-l2)',
        borderRadius: '12px',
      },
    };

    function Icon(props) {
      const size = typeof props?.size === 'number' ? props.size : 20;
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
        h('circle', { cx: '12', cy: '12', r: '3.4', fill: 'currentColor' }),
        h('circle', { cx: '12', cy: '12', r: '8.6', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', opacity: 0.55 }),
        h('circle', { cx: '12', cy: '3.2', r: '2', fill: 'currentColor' }),
        h('circle', { cx: '12', cy: '20.8', r: '2', fill: 'currentColor' }),
        h('circle', { cx: '3.2', cy: '12', r: '2', fill: 'currentColor' }),
        h('circle', { cx: '20.8', cy: '12', r: '2', fill: 'currentColor' }),
      );
    }

    function parseHeaders(text) {
      const out = {};
      for (const line of String(text ?? '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        const index = trimmed.indexOf(':');
        if (index <= 0) continue;
        out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
      }
      return out;
    }

    function headersToText(headers) {
      return Object.entries(headers ?? {})
        .map(([key, value]) => key + ': ' + value)
        .join('\n');
    }

    const emptyForm = { name: '', transport: 'streamable-http', url: '', headers: '', command: '', args: '', enabled: true };

    function formOf(server) {
      return {
        name: server.serverName,
        transport: server.transport === 'stdio' ? 'stdio' : 'streamable-http',
        url: server.url ?? '',
        headers: headersToText(server.headers),
        command: server.command ?? '',
        args: Array.isArray(server.args) ? server.args.join(' ') : '',
        enabled: server.enabled !== false,
      };
    }

    function Page(props) {
      const t = props.t;
      const [data, setData] = useState({ servers: [], patchPath: '' });
      const [selected, setSelected] = useState(null);
      const [form, setForm] = useState(emptyForm);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState(null);
      const [confirming, setConfirming] = useState(null);
      // 连接诊断结果
      const [probe, setProbe] = useState(null);
      // JSON 导入
      const [importText, setImportText] = useState('');
      const [importResult, setImportResult] = useState(null);
      // 手动填写区的展开状态：点连接卡片编辑时自动展开
      const [manualOpen, setManualOpen] = useState(false);
      // 风险审核
      const [auditTarget, setAuditTarget] = useState('');
      const [auditResult, setAuditResult] = useState(null);

      const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

      const applyData = useCallback((next) => {
        if (next === null || typeof next !== 'object') return;
        setData({ servers: Array.isArray(next.servers) ? next.servers : [], patchPath: next.patchPath ?? '' });
      }, []);

      const reload = useCallback(async () => {
        try {
          applyData(await props.list());
          setNote(null);
        } catch (error) {
          setNote({ kind: 'error', text: t('loadFailed') + '：' + String(error?.message ?? error) });
        }
      }, [applyData, props, t]);

      useEffect(() => {
        reload();
        // 只跑一次：props 每次渲染都是新对象，不能进依赖
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const resetForm = () => {
        setSelected(null);
        setForm(emptyForm);
        setConfirming(null);
        setNote(null);
      };

      const selectServer = (server) => {
        setSelected(server.serverName);
        setForm(formOf(server));
        setConfirming(null);
        setNote(null);
        // 点卡片是要去改它，表单必须露出来，否则用户找不到刚才载入的配置
        setManualOpen(true);
      };

      const submit = async () => {
        setBusy(true);
        setNote(null);
        const creating = selected === null;
        try {
          const payload = {
            serverName: form.name.trim(),
            transport: form.transport,
            url: form.url.trim(),
            headers: parseHeaders(form.headers),
            command: form.command.trim(),
            args: form.args.trim() === '' ? [] : form.args.trim().split(/\s+/),
            enabled: form.enabled,
          };
          if (!creating) payload.previousName = selected;
          const next = await props.save(payload);
          applyData(next);
          if (creating) {
            // 新增完把表单清空，接着填下一条；列表里已经能看到刚保存的那条
            setSelected(null);
            setForm(emptyForm);
          } else {
            setSelected(payload.serverName);
          }
          setNote({ kind: 'ok', text: t('saved') });
        } catch (error) {
          setNote({ kind: 'error', text: t('saveFailed') + '：' + String(error?.message ?? error) });
        } finally {
          setBusy(false);
        }
      };

      const removeServer = async (serverName) => {
        if (confirming !== serverName) {
          setConfirming(serverName);
          return;
        }
        setBusy(true);
        try {
          const next = await props.removeServer({ serverName });
          applyData(next);
          if (selected === serverName) resetForm();
          setConfirming(null);
        } catch (error) {
          setNote({ kind: 'error', text: t('removeFailed') + '：' + String(error?.message ?? error) });
        } finally {
          setBusy(false);
        }
      };

      /** 连接诊断：把当前表单原样发给 Host 做一次真实握手。 */
      const testConnection = async () => {
        setProbe(null);
        setBusy(true);
        try {
          const payload = {
            serverName: form.name.trim(),
            transport: form.transport,
            url: form.url.trim(),
            headers: parseHeaders(form.headers),
            command: form.command.trim(),
            args: form.args.trim() === '' ? [] : form.args.trim().split(/\s+/),
          };
          setProbe(await props.probe(payload));
        } catch (error) {
          setProbe({ ok: false, error: { message: String(error?.message ?? error) } });
        } finally {
          setBusy(false);
        }
      };

      /** JSON 导入：一次写入多条连接。 */
      const runImport = async () => {
        setBusy(true);
        setImportResult(null);
        try {
          const result = await props.importJson({ text: importText });
          setImportResult(result);
          applyData(await props.list());
          setImportText('');
        } catch (error) {
          setImportResult({ imported: [], failed: [{ name: '-', message: String(error?.message ?? error) }] });
        } finally {
          setBusy(false);
        }
      };

      /** 工具风险审核：只读，不改配置。 */
      const runAudit = async () => {
        if (auditTarget === '') return;
        setBusy(true);
        setAuditResult(null);
        try {
          setAuditResult(await props.audit({ serverName: auditTarget }));
        } catch (error) {
          setAuditResult({ ok: false, error: { message: String(error?.message ?? error) } });
        } finally {
          setBusy(false);
        }
      };

      const toggleEnabled = async (server) => {
        try {
          applyData(await props.setEnabled({ serverName: server.serverName, enabled: !(server.enabled !== false) }));
        } catch (error) {
          setNote({ kind: 'error', text: t('saveFailed') + '：' + String(error?.message ?? error) });
        }
      };

      const field = (label, help, control) =>
        h('div', { style: styles.field }, h('label', { style: styles.label }, label), control, help ? h('div', { style: styles.help }, help) : null);

      const input = (value, onChange, placeholder) =>
        h('input', { style: styles.input, value, placeholder, spellCheck: false, onChange: (event) => onChange(event.target.value) });

      /** 状态：同时给出圆点颜色、文字与徽标，界面上眼睛先看到颜色。 */
      const statusOf = (server) => {
        if (!(server.enabled !== false)) {
          return { text: t('statusDisabled'), color: 'var(--dsw-alias-label-dimmed)', style: styles.muted };
        }
        if (server.toolCount > 0) {
          return { text: t('statusOnline'), color: 'var(--dsw-alias-state-success-primary)', style: styles.ok };
        }
        if (server.phase === 'failed') {
          return { text: t('statusOff'), color: 'var(--dsw-alias-state-error-primary)', style: styles.error };
        }
        if (server.phase === 'loading' || server.phase === 'pending' || server.phase === null) {
          return { text: t('statusPending'), color: 'var(--dsw-alias-state-warn-primary)', style: styles.warn };
        }
        return { text: t('statusOff'), color: 'var(--dsw-alias-state-error-primary)', style: styles.error };
      };

      const cards = data.servers.map((server) => {
        const status = statusOf(server);
        const isActive = selected === server.serverName;
        const target = server.transport === 'stdio' ? server.command || 'stdio' : server.url || '—';
        return h(
          'div',
          {
            key: server.serverName,
            style: isActive ? { ...styles.card, ...styles.cardActive } : styles.card,
            onClick: () => selectServer(server),
          },
          // 状态圆点
          h('span', { style: styles.dot(status.color) }),
          h(
            'div',
            { style: styles.cardMain },
            h(
              'div',
              { style: styles.cardTop },
              h('span', { style: styles.cardName }, server.serverName),
              server.toolCount > 0 ? h('span', { style: styles.badgeOk }, `${server.toolCount} ${t('toolsUnit')}`) : null,
              h('span', { style: styles.badge }, server.transport === 'stdio' ? 'stdio' : 'HTTP'),
            ),
            h('div', { style: styles.cardMeta }, `${status.text} · ${target}`),
          ),
          h(
            'label',
            { style: { ...styles.checkRow, flex: '0 0 auto' }, onClick: (event) => event.stopPropagation() },
            h('input', { type: 'checkbox', checked: server.enabled !== false, onChange: () => toggleEnabled(server) }),
          ),
          h(
            'button',
            {
              type: 'button',
              style: confirming === server.serverName ? { ...styles.smallButton, ...styles.error } : styles.smallButton,
              onClick: (event) => {
                event.stopPropagation();
                removeServer(server.serverName);
              },
            },
            confirming === server.serverName ? t('removeConfirm') : t('remove'),
          ),
        );
      });

      return h(
        'div',
        { style: styles.page },
        h(
          'div',
          { style: styles.scroll },
          h(
            'div',
            { style: styles.headRow },
            h('h1', { style: styles.title }, t('title')),
            h('button', { type: 'button', style: styles.smallButton, onClick: () => reload() }, t('refresh')),
          ),
          h('p', { style: styles.lead }, t('lead')),

          data.servers.length === 0 ? h('div', { style: styles.empty }, t('empty')) : h('div', null, cards),

          /*
           * ── 手动填写 ──
           * 与下面的「导入 JSON」并列，默认收起，避免一进页面就被一整屏表单压住。
           * 点上方任一连接卡片会自动展开（那是「去改它」的意图）。
           * 用受控 open，才能同时兼顾「默认收起」和「需要时自动展开」。
           */
          h(
            'details',
            {
              style: styles.details,
              open: manualOpen,
              onToggle: (event) => {
                // 用户手动点开/收起时同步状态，避免受控值与 DOM 打架
                const next = event.currentTarget.open;
                if (next !== manualOpen) setManualOpen(next);
              },
            },
            h(
              'summary',
              {
                style: styles.summary,
                onClick: (event) => {
                  // 不让浏览器自行切换：展开与否完全由 state 决定，
                  // 否则 onToggle 与受控 open 会互相触发。
                  event.preventDefault();
                  setManualOpen((value) => !value);
                },
              },
              t('manualTitle'),
              selected !== null
                ? h('span', { style: { ...styles.badge, fontWeight: 600 } }, selected)
                : h('span', { style: { ...styles.muted, fontWeight: 400, fontSize: '12px' } }, t('creating')),
            ),
            h('p', { style: styles.sectionHint }, t('manualHint')),

            field(t('name'), t('nameHelp'), input(form.name, (value) => setField('name', value), 'suqiu')),

            h(
              'div',
              { style: styles.field },
              h('label', { style: styles.label }, t('mode')),
              h(
                'div',
                { style: styles.segmented },
                h('button', { type: 'button', style: styles.segment(form.transport === 'streamable-http'), onClick: () => setField('transport', 'streamable-http') }, t('modeHttp')),
                h('button', { type: 'button', style: styles.segment(form.transport === 'stdio'), onClick: () => setField('transport', 'stdio') }, t('modeStdio')),
              ),
            ),

            form.transport === 'streamable-http'
              ? h(
                  'div',
                  null,
                  field(t('url'), t('urlHelp'), input(form.url, (value) => setField('url', value), 'https://example.com/mcp')),
                  field(
                    t('headers'),
                    t('headersHelp'),
                    h('textarea', { style: styles.textarea, value: form.headers, spellCheck: false, onChange: (event) => setField('headers', event.target.value) }),
                  ),
                )
              : h(
                  'div',
                  null,
                  field(t('command'), t('commandHelp'), input(form.command, (value) => setField('command', value), 'npx -y @modelcontextprotocol/server-filesystem')),
                  field(t('args'), t('argsHelp'), input(form.args, (value) => setField('args', value), '/sdcard')),
                ),

            h(
              'div',
              { style: styles.field },
              h(
                'label',
                { style: styles.checkRow },
                h('input', { type: 'checkbox', checked: form.enabled, onChange: (event) => setField('enabled', event.target.checked) }),
                h('span', null, t('enabled')),
              ),
            ),

            h(
              'div',
              { style: styles.row },
              h('button', { type: 'button', disabled: busy, style: busy ? { ...styles.primary, ...styles.primaryDisabled } : styles.primary, onClick: submit }, busy ? t('saving') : t('save')),
              h('button', { type: 'button', disabled: busy, style: styles.ghost, onClick: testConnection }, busy ? t('testing') : t('test')),
              h('button', { type: 'button', style: styles.smallButton, onClick: resetForm }, t('clear')),
              note !== null ? h('span', { style: note.kind === 'ok' ? styles.ok : styles.error }, note.text) : null,
            ),

            /* ── 连接诊断结果 ── */
            probe !== null
              ? h(
                  'div',
                  { style: styles.probeBox },
                  probe.ok === true
                    ? h(
                        'div',
                        null,
                        h('span', { style: styles.ok }, `✓ ${t('latency')} ${probe.latencyMs}ms · ${probe.toolCount} ${t('toolsUnit')}`),
                        h('div', { style: styles.muted }, (probe.tools ?? []).map((tool) => tool.name).join(', ') || '—'),
                        probe.warning ? h('div', { style: styles.warn }, probe.warning) : null,
                      )
                    : h(
                        'div',
                        null,
                        h('div', { style: styles.error }, `✗ ${probe.error?.message ?? '—'}`),
                        probe.error?.hint ? h('div', { style: styles.muted }, probe.error.hint) : null,
                      ),
                )
              : null,
          ),

          /* ── JSON 导入 ── */
          h(
            'details',
            { style: styles.details },
            h('summary', { style: styles.summary }, t('importTitle')),
            h('p', { style: styles.sectionHint }, t('importHint')),
            h('textarea', {
              style: styles.textarea,
              value: importText,
              spellCheck: false,
              placeholder: '{"mcpServers": {"demo": {"url": "https://example.com/mcp"}}}',
              onChange: (event) => setImportText(event.target.value),
            }),
            h(
              'div',
              { style: { ...styles.row, marginTop: '8px' } },
              h('button', { type: 'button', disabled: busy || importText.trim() === '', style: styles.smallButton, onClick: runImport }, busy ? t('importing') : t('importButton')),
            ),
            importResult !== null
              ? h(
                  'div',
                  { style: { ...styles.help, marginTop: '8px' } },
                  h('div', { style: styles.ok }, `${t('importDone')}：${importResult.imported?.length ?? 0}`),
                  (importResult.failed ?? []).map((item, index) => h('div', { key: index, style: styles.error }, `${item.name}：${item.message}`)),
                )
              : null,
          ),

          /* ── 工具风险审核 ── */
          h(
            'details',
            { style: styles.details },
            h('summary', { style: styles.summary }, t('auditTitle')),
            h('p', { style: styles.sectionHint }, t('auditHint')),
            data.servers.length === 0
              ? h('div', { style: styles.muted }, t('empty'))
              : h(
                  'div',
                  { style: styles.row },
                  h(
                    'select',
                    {
                      style: { ...styles.input, width: 'auto', minWidth: '160px' },
                      value: auditTarget,
                      onChange: (event) => setAuditTarget(event.target.value),
                    },
                    h('option', { value: '' }, t('auditPick')),
                    data.servers.map((server) => h('option', { key: server.serverName, value: server.serverName }, server.serverName)),
                  ),
                  h('button', { type: 'button', disabled: busy || auditTarget === '', style: styles.smallButton, onClick: runAudit }, busy ? t('auditing') : t('auditButton')),
                ),
            auditResult !== null
              ? auditResult.ok === true
                ? h(
                    'div',
                    { style: { marginTop: '10px' } },
                    h(
                      'div',
                      { style: { ...styles.help, marginBottom: '6px' } },
                      `${auditResult.total} ${t('toolsUnit')} · ${
                        auditResult.level === 'critical'
                          ? t('riskCritical')
                          : auditResult.level === 'high'
                            ? t('riskHigh')
                            : auditResult.level === 'medium'
                              ? t('riskMedium')
                              : t('riskLow')
                      }`,
                    ),
                    (auditResult.tools ?? []).map((tool) =>
                      h(
                        'div',
                        { key: tool.name, style: styles.toolRow },
                        h(
                          'span',
                          {
                            style: {
                              ...styles.chip,
                              color:
                                tool.level === 'critical' || tool.level === 'high'
                                  ? 'var(--dsw-alias-state-error-primary)'
                                  : tool.level === 'medium'
                                    ? 'var(--dsw-alias-state-warning-primary)'
                                    : 'var(--dsw-alias-label-tertiary)',
                            },
                          },
                          tool.level === 'critical' ? t('riskCritical') : tool.level === 'high' ? t('riskHigh') : tool.level === 'medium' ? t('riskMedium') : t('riskLow'),
                        ),
                        h('span', { style: { ...styles.cardName, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, tool.name),
                        tool.tags?.length ? h('span', { style: { ...styles.muted, fontSize: '11px' } }, tool.tags.join(' / ')) : null,
                      ),
                    ),
                  )
                : h('div', { style: { ...styles.error, marginTop: '8px' } }, auditResult.error?.message ?? '—')
              : null,
          ),

          data.patchPath ? h('div', { style: styles.patch }, t('patch') + '：' + data.patchPath) : null,
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'suqiu-mcp: dictionaries');
      const t = ctx.locale.bind(NS);
      const mount = ctx.remote.$mount(CONTRIBUTION);
      const call = async (method, ...args) => {
        await mount;
        const remote = ctx.get('remote.suqiuMcp');
        if (remote === undefined || remote === null) throw new Error('remote.suqiuMcp unavailable');
        const result = await remote[method](...args);
        if (result === null || typeof result !== 'object') throw new Error('empty remote result');
        if (result.ok === false) throw new Error(result.error?.message ?? 'remote call failed');
        return result.value;
      };

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: 'suqiu-mcp', order: 2, label: () => t('nav'), locale: NS }, Icon),
      );
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: 'suqiu-mcp',
            locale: NS,
            inject: () => ({
              t,
              list: () => call('list'),
              save: (payload) => call('save', payload),
              removeServer: (payload) => call('removeServer', payload),
              setEnabled: (payload) => call('setEnabled', payload),
              probe: (payload) => call('probe', payload),
              importJson: (payload) => call('importJson', payload),
              audit: (payload) => call('audit', payload),
            }),
          },
          Page,
        ),
      );
    }

    const bundleModule = { exports: {} };
    Object.defineProperty(bundleModule.exports, Symbol.toStringTag, { value: 'Module' });
    bundleModule.exports.NS = NS;
    bundleModule.exports.apply = apply;
    bundleModule.exports.inject = ['slots', 'locale', 'remote'];
    return bundleModule.exports;
  },
});
