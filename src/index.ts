import type { Context } from '@deepseek-ai/cordis';
import catalog from './catalog.json' with { type: 'json' };

export const name = 'dshbase-catalog';
export const inject = ['tools'];

interface Plugin {
  name: string;
  category: string;
  url: string;
  pkg: string;
  npm: boolean;
  test: string;
  platform?: string;
  desc: string;
  desc_zh: string;
  stars: number;
  install: string;
  added: string;
}

const plugins: Plugin[] = (catalog as any).plugins || [];
// 分类从数据动态派生（不再硬编码），保证与网站 plugins.json 的 15 大分类一致
const CATEGORIES = [...new Set(plugins.map((p) => p.category))].sort();
const PF: Record<string, string> = { win32: '🪟 Windows', macos: '🍎 macOS', linux: '🐧 Linux' };

function text(v: string) {
  return [{ type: 'text' as const, text: v }];
}

function pfTag(p: Plugin) {
  return p.platform && p.platform !== 'any' ? ` · ${PF[p.platform] || p.platform}` : '';
}

function takeLimit(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

// DSH 0.2 stores tool parameters as JSON Schema and rejects the 0.1 property-map
// DSL at activation. Register the object-root schema directly. defineTool()
// compiles that DSL and throws on this shape (`required` array, `additionalProperties`).
type ToolParameters = {
  type: 'object';
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
  additionalProperties: boolean;
};

interface ToolRegistry {
  register(definition: {
    name: string;
    description: string;
    parameters: ToolParameters;
    output: { schema: { type: 'string' }; render: (args: unknown, value: string) => ReturnType<typeof text> };
    execute: (args: any, exec?: unknown) => Promise<string>;
  }): unknown;
}

// `tools` is declared by the host's @deepseek-ai/dsh-tools augmentation of Context.
// This package does not import that module at runtime, so the register call is typed locally.
function registerTool(ctx: Context, tool: Parameters<ToolRegistry['register']>[0]) {
  (ctx as Context & { tools: ToolRegistry }).tools.register(tool);
}

// 按星数降序排好的副本
const byStars = [...plugins].sort((a, b) => (b.stars || 0) - (a.stars || 0));
// 按收录时间降序（新收录在前）
const byNew = [...plugins].sort((a, b) => (b.added || '').localeCompare(a.added || ''));

// Status tiers. Anything that is not verified/listed (incl. empty/unknown) folds into pending,
// so verified + listed + pending always equals the total.
type Tier = 'verified' | 'listed' | 'pending';
function tierOf(p: Plugin): Tier {
  return p.test === 'verified' ? 'verified' : p.test === 'listed' ? 'listed' : 'pending';
}
function statusZh(p: Plugin) {
  const t = tierOf(p);
  return t === 'verified' ? '已验证' : t === 'listed' ? '已收录（未实测）' : '未验证';
}
function statusLabel(p: Plugin) {
  const t = tierOf(p);
  if (t === 'verified') return '✅ 已验证 (verified)';
  if (t === 'listed') return '📋 已收录（未实测） (listed (not yet install-tested))';
  return '⏳ 未验证 (pending)';
}
function statusCounts(list: Plugin[]) {
  const c = { verified: 0, listed: 0, pending: 0 };
  for (const p of list) c[tierOf(p)]++;
  return c;
}

function fmtHit(p: Plugin, i?: number) {
  const idx = i !== undefined ? `${i + 1}. ` : '';
  const star = `★${p.stars || 0}`;
  // 三档：已验证 / 已收录（未实测）/ 未验证
  const status = statusZh(p);
  return `${idx}${p.name} [${status}]${pfTag(p)} ${star}\n   ${p.desc}\n   Install: ${p.install}`;
}

export function apply(ctx: Context) {
  // 1. 搜索插件
  registerTool(ctx, {
    name: 'search_dsh_plugins',
    description:
      'Search the dshbase plugin directory for DeepSeek Harness plugins by keyword. Matches against plugin name, category, or description (English & Chinese). Returns each hit with its install command and verification status so you can install it directly.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword (e.g. "memory", "terminal", "视觉", "浏览器")' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute(args: any) {
      const q = (args.query || '').toLowerCase();
      const lim = takeLimit(args.limit, 10);
      const hits = plugins.filter((p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
        p.desc_zh.toLowerCase().includes(q)
      ).slice(0, lim);
      if (!hits.length) return `No plugins matched "${args.query}". Try a broader keyword.`;
      return `Found ${hits.length} plugins (of ${plugins.length} on dshbase):\n\n${hits.map((p, i) => fmtHit(p, i)).join('\n\n')}`;
    },
  });

  // 2. 插件详情 + 安装命令
  registerTool(ctx, {
    name: 'get_dsh_plugin',
    description:
      'Get details, verification status, and the exact install command for a specific DeepSeek Harness plugin from the dshbase directory.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plugin name (e.g. "dsh-memory")' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute(args: any) {
      const p = plugins.find((x) => x.name === args.name);
      if (!p) return `Plugin "${args.name}" not found. Use search_dsh_plugins to find it.`;
      const status = statusLabel(p);
      const src = p.npm ? `npm (${p.pkg})` : 'GitHub source';
      const pf = p.platform && p.platform !== 'any' ? (PF[p.platform] || p.platform) : 'any';
      return [
        `${p.name} (${p.category})`,
        `Status: ${status} · ★${p.stars || 0} · ${src} · Platform: ${pf}`,
        '',
        p.desc,
        p.desc_zh ? `中文: ${p.desc_zh}` : '',
        '',
        'Install:',
        `  ${p.install}`,
        '',
        `More: ${p.url}`,
      ].filter((l) => l !== '').join('\n');
    },
  });

  // 3. 列出插件（热门 / 新收录 / 分类）
  registerTool(ctx, {
    name: 'list_dsh_plugins',
    description:
      'List DeepSeek Harness plugins from dshbase. Use sort="hot" for most-starred, sort="new" for recently added, or pass a category to list plugins in that category.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category name (e.g. "Developer"). Omit for all categories.' },
        sort: { type: 'string', description: 'Sort: "hot" (by stars, default) or "new" (recently added)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute(args: any) {
      const lim = takeLimit(args.limit, 20);
      let pool = args.sort === 'new' ? byNew : byStars;
      if (args.category) {
        const cat = String(args.category);
        pool = pool.filter((p) => p.category === cat || p.category.toLowerCase().includes(cat.toLowerCase()));
      }
      const hits = pool.slice(0, lim);
      if (!hits.length) return `No plugins found${args.category ? ` in category "${args.category}"` : ''}.`;
      const label = args.sort === 'new' ? 'recently added' : 'most-starred';
      return `Top ${hits.length} ${label} plugins${args.category ? ` in "${args.category}"` : ''}:\n\n${hits.map((p, i) => fmtHit(p, i)).join('\n\n')}`;
    },
  });

  // 4. 站点统计
  registerTool(ctx, {
    name: 'get_dsh_stats',
    description:
      'Get live stats of the dshbase plugin directory: total plugins, verification status counts, and category distribution.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute() {
      const total = plugins.length;
      const { verified, listed, pending } = statusCounts(plugins);
      const npmCount = plugins.filter((p) => p.npm).length;
      const winCount = plugins.filter((p) => p.platform === 'win32').length;
      const macCount = plugins.filter((p) => p.platform === 'macos').length;
      const catLines = CATEGORIES.map((c) => {
        const n = plugins.filter((p) => p.category === c).length;
        return `  ${c}: ${n}`;
      }).join('\n');
      return [
        'dshbase plugin directory stats:',
        `  Total: ${total}`,
        `  ✅ Verified: ${verified}`,
        `  📋 Listed (not yet install-tested) / 已收录（未实测）: ${listed}`,
        `  ⏳ Pending: ${pending}`,
        `  On npm: ${npmCount} · GitHub source: ${total - npmCount}`,
        `  Platform-specific: ${winCount} Windows · ${macCount} macOS`,
        '',
        'By category:',
        catLines,
      ].join('\n');
    },
  });

  // 5. 分类列表
  registerTool(ctx, {
    name: 'get_dsh_categories',
    description:
      'List the plugin categories in the dshbase directory with their plugin counts. Use this to discover what categories exist before listing plugins.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute() {
      const lines = CATEGORIES.map((c) => {
        const n = plugins.filter((p) => p.category === c).length;
        return `${c}: ${n} plugins`;
      });
      return `dshbase categories:\n\n${lines.join('\n')}`;
    },
  });
}
