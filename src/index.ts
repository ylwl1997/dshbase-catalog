import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
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

// 按星数降序排好的副本
const byStars = [...plugins].sort((a, b) => (b.stars || 0) - (a.stars || 0));
// 按收录时间降序（新收录在前）
const byNew = [...plugins].sort((a, b) => (b.added || '').localeCompare(a.added || ''));

function fmtHit(p: Plugin, i?: number) {
  const idx = i !== undefined ? `${i + 1}. ` : '';
  const star = `★${p.stars || 0}`;
  // 两档：已验证 / 未验证（网站已从三档收敛，不再有 broken）
  const status = p.test === 'verified' ? '已验证' : '未验证';
  return `${idx}${p.name} [${status}]${pfTag(p)} ${star}\n   ${p.desc}\n   Install: ${p.install}`;
}

export function apply(ctx: Context) {
  // 1. 搜索插件
  ctx.tools.register(defineTool({
    name: 'search_dsh_plugins',
    description:
      'Search the dshbase plugin directory for DeepSeek Harness plugins by keyword. Matches against plugin name, category, or description (English & Chinese). Returns each hit with its install command and verification status so you can install it directly.',
    parameters: {
      query: { type: 'string', required: true, description: 'Keyword (e.g. "memory", "terminal", "视觉", "浏览器")' },
      limit: { type: 'string', description: 'Max results (default 10)' },
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute(args: any) {
      const q = (args.query || '').toLowerCase();
      const lim = parseInt(args.limit || '10', 10) || 10;
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
  }));

  // 2. 插件详情 + 安装命令
  ctx.tools.register(defineTool({
    name: 'get_dsh_plugin',
    description:
      'Get details, verification status, and the exact install command for a specific DeepSeek Harness plugin from the dshbase directory.',
    parameters: {
      name: { type: 'string', required: true, description: 'Plugin name (e.g. "dsh-memory")' },
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute(args: any) {
      const p = plugins.find((x) => x.name === args.name);
      if (!p) return `Plugin "${args.name}" not found. Use search_dsh_plugins to find it.`;
      const status = p.test === 'verified' ? '✅ 已验证 (verified)' : '⏳ 未验证 (pending)';
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
  }));

  // 3. 列出插件（热门 / 新收录 / 分类）
  ctx.tools.register(defineTool({
    name: 'list_dsh_plugins',
    description:
      'List DeepSeek Harness plugins from dshbase. Use sort="hot" for most-starred, sort="new" for recently added, or pass a category to list plugins in that category.',
    parameters: {
      category: { type: 'string', description: 'Category name (e.g. "Developer"). Omit for all categories.' },
      sort: { type: 'string', description: 'Sort: "hot" (by stars, default) or "new" (recently added)' },
      limit: { type: 'string', description: 'Max results (default 20)' },
    },
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute(args: any) {
      const lim = parseInt(args.limit || '20', 10) || 20;
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
  }));

  // 4. 站点统计
  ctx.tools.register(defineTool({
    name: 'get_dsh_stats',
    description:
      'Get live stats of the dshbase plugin directory: total plugins, verification status counts, and category distribution.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute() {
      const total = plugins.length;
      const verified = plugins.filter((p) => p.test === 'verified').length;
      const pending = plugins.filter((p) => p.test === 'pending').length;
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
        `  ⏳ Pending: ${pending}`,
        `  On npm: ${npmCount} · GitHub source: ${total - npmCount}`,
        `  Platform-specific: ${winCount} Windows · ${macCount} macOS`,
        '',
        'By category:',
        catLines,
      ].join('\n');
    },
  }));

  // 5. 分类列表
  ctx.tools.register(defineTool({
    name: 'get_dsh_categories',
    description:
      'List the plugin categories in the dshbase directory with their plugin counts. Use this to discover what categories exist before listing plugins.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_a: any, v: string) => text(v) },
    async execute() {
      const lines = CATEGORIES.map((c) => {
        const n = plugins.filter((p) => p.category === c).length;
        return `${c}: ${n} plugins`;
      });
      return `dshbase categories:\n\n${lines.join('\n')}`;
    },
  }));
}
