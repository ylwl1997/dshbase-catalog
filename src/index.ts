import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import catalog from './catalog.json' with { type: 'json' };

export const name = 'dshbase-catalog';
export const inject = ['tools'];

const plugins: any[] = (catalog as any).plugins || [];

function text(v: string) {
  return [{ type: 'text' as const, text: v }];
}

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'search_dsh_plugins',
    description:
      'Search the dshbase plugin directory for DeepSeek Harness plugins. Pass a keyword to match against plugin name, category, or description. Returns matching plugins with their install command and test status.',
    parameters: {
      query: { type: 'string', required: true, description: 'Keyword to search (e.g. "memory", "terminal", "ui")' },
      limit: { type: 'string', description: 'Max results (default 10)' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => text(v),
    },
    async execute(args: any) {
      const q = (args.query || '').toLowerCase();
      const lim = parseInt(args.limit || '10', 10) || 10;
      const hits = plugins.filter((p: any) =>
        !q ||
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.desc || '').toLowerCase().includes(q) ||
        (p.desc_zh || '').toLowerCase().includes(q)
      ).slice(0, lim);
      if (!hits.length) return `No plugins matched "${args.query}". Try a broader keyword.`;
      const lines = hits.map((p: any, i: number) =>
        `${i + 1}. ${p.name} [${p.test}] ★${p.stars || 0}\n   ${p.desc}\n   Install: ${p.install}`
      );
      return `Found ${hits.length} plugins (of ${plugins.length} total):\n\n${lines.join('\n\n')}`;
    },
  }));

  ctx.tools.register(defineTool({
    name: 'get_dsh_plugin',
    description:
      'Get details and the exact install command for a specific DeepSeek Harness plugin from the dshbase directory.',
    parameters: {
      name: { type: 'string', required: true, description: 'Plugin name (e.g. "dsh-memory")' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => text(v),
    },
    async execute(args: any) {
      const p = plugins.find((x: any) => x.name === args.name);
      if (!p) return `Plugin "${args.name}" not found. Use search_dsh_plugins to find it.`;
      return `${p.name} (${p.category})\nStatus: ${p.test} · Stars: ${p.stars || 0}\n${p.desc}\n\nInstall:\n  ${p.install}\n\nMore: ${p.url}`;
    },
  }));
}
