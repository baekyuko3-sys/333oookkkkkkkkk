export type MemeCodingMode = 'always-ask' | 'confirm-before-commit' | 'auto';

export type MemeAction =
  | { type: 'inspect'; path?: string }
  | { type: 'search'; query: string }
  | { type: 'read'; path: string }
  | { type: 'propose'; operation: 'create' | 'update' | 'delete'; path: string; content?: string; reason?: string }
  | { type: 'message'; text: string }
  | { type: 'done'; text: string };

export type MemeProposal = {
  id: string;
  operation: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
};

export type MemeEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'proposal'; proposal: MemeProposal }
  | { type: 'message'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; text: string };

export type MemeTool = {
  name: string;
  description: string;
  run: (input: any) => Promise<any>;
};

type AgentOptions = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  codingMode: MemeCodingMode;
  project: string;
  tools: MemeTool[];
  maxRounds?: number;
  onEvent?: (event: MemeEvent) => void;
};

function endpoint(base: string) {
  const value = base.trim().replace(/\\/+$/, '');
  return /\\/chat\\/completions$/i.test(value) ? value : value + '/chat/completions';
}

function extractJson(raw: string) {
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\\{[\\s\\S]*\\}/);
  if (!match) throw new Error('Meme 返回的不是有效 JSON');
  return JSON.parse(match[0]);
}

const system = (project: string, mode: MemeCodingMode) => `
You are MEME, the coding agent inside Studio for the 小手机 project.
Project: ${project}
Coding mode: ${mode}

You are an agent, not a one-shot code generator. Inspect before editing. Use tools to understand related files and dependencies. For multi-file work, inspect all relevant files before proposing changes.
You may work on main or another branch; branch choice is controlled by the user, not by a hidden restriction.
Never pretend a change was applied when it is only a proposal.
For changes to existing functionality, create proposals first. The Studio UI is the human approval layer.
Do not expose chain-of-thought. Return concise user-facing reasoning only.

Return JSON with exactly one action:
{"action":{"type":"inspect","path":""}}
{"action":{"type":"search","query":"..."}}
{"action":{"type":"read","path":"..."}}
{"action":{"type":"propose","operation":"update","path":"...","content":"FULL FILE CONTENT","reason":"...","risk":"low"}}
{"action":{"type":"message","text":"..."}}
{"action":{"type":"done","text":"..."}}

After a tool result, continue with the next action. Do not ask the user to copy code manually when Studio can stage it.
`;

export async function runMemeAgent(options: AgentOptions, userRequest: string) {
  const maxRounds = options.maxRounds ?? 10;
  const history: any[] = [
    { role: 'system', content: system(options.project, options.codingMode) },
    { role: 'user', content: userRequest },
  ];

  for (let round = 0; round < maxRounds; round++) {
    options.onEvent?.({ type: 'thinking', text: round === 0 ? '正在理解项目…' : '正在继续检查…' });
    const response = await fetch(endpoint(options.apiBaseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + options.apiKey,
      },
      body: JSON.stringify({
        model: options.model,
        messages: history,
        temperature: 0.15,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error('Meme API ' + response.status);
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';
    const result = extractJson(raw);
    const action = result.action as MemeAction;
    if (!action?.type) throw new Error('Meme 返回了未知 action');

    if (action.type === 'message') {
      options.onEvent?.({ type: 'message', text: action.text });
      history.push({ role: 'assistant', content: raw });
      history.push({ role: 'user', content: '继续工作。' });
      continue;
    }

    if (action.type === 'done') {
      options.onEvent?.({ type: 'done', text: action.text });
      return { status: 'done' as const, text: action.text };
    }

    if (action.type === 'propose') {
      const proposal: MemeProposal = {
        id: 'meme-' + Date.now() + '-' + round,
        operation: action.operation,
        path: action.path,
        content: action.content,
        reason: action.reason || 'Meme proposes this project change.',
        risk: action.risk || (action.operation === 'delete' ? 'high' : 'medium'),
        status: 'pending',
      };
      options.onEvent?.({ type: 'proposal', proposal });
      history.push({ role: 'assistant', content: raw });
      history.push({ role: 'user', content: 'Proposal staged in Changes. Continue checking for related files or remaining work.' });
      continue;
    }

    const tool = action.type === 'inspect'
      ? options.tools.find(t => t.name === 'inspect')
      : action.type === 'search'
        ? options.tools.find(t => t.name === 'search')
        : options.tools.find(t => t.name === 'read');

    if (!tool) throw new Error('Meme tool unavailable: ' + action.type);
    const input = action.type === 'search' ? { query: action.query } : action.type === 'read' ? { path: action.path } : { path: action.path || '' };
    options.onEvent?.({ type: 'tool', name: tool.name, input });
    const resultText = await tool.run(input);
    history.push({ role: 'assistant', content: raw });
    history.push({ role: 'user', content: 'TOOL RESULT (' + tool.name + '):\\n' + JSON.stringify(resultText).slice(0, 50000) });
  }

  options.onEvent?.({ type: 'done', text: 'Meme 达到本轮 Agent 步数上限，已停止并保留当前 Changes。' });
  return { status: 'limit' as const, text: 'Meme 达到本轮 Agent 步数上限。' };
}
