import { MEME_PROJECT_MAP, MEME_PROJECT_PRINCIPLES } from './projectMap';
import { generateCreativeText } from '../ai/aiEngine';
import type { ChatProvider } from '../store/appSettings';

export type MemeCodingMode = 'always-ask' | 'confirm-before-commit' | 'auto';

export type MemeAction =
  | { type: 'inspect'; path?: string }
  | { type: 'search'; query: string }
  | { type: 'read'; path: string }
  | { type: 'propose'; operation: 'create' | 'update' | 'delete'; path: string; content?: string; reason?: string }
  | { type: 'message'; text: string }
  | { type: 'done'; text: string };

export type MemeValidation = {
  status: 'passed' | 'needs_revision' | 'needs_more_context';
  summary: string;
  checks: string[];
  concerns: string[];
  changedLines: number;
  removedLines: number;
};

export type MemeProposal = {
  id: string;
  operation: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
  originalContent?: string;
  validation?: MemeValidation;
};

export type MemeEvent =
  | { type: 'thinking'; text: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'validation'; path: string; validation: MemeValidation }
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
  provider?: ChatProvider;
  codingMode: MemeCodingMode;
  project: string;
  tools: MemeTool[];
  maxRounds?: number;
  maxValidationRounds?: number;
  onEvent?: (event: MemeEvent) => void;
};

function endpoint(base: string) {
  const value = base.trim().replace(/\/+$/, '');
  return /\/chat\/completions$/i.test(value) ? value : value + '/chat/completions';
}

function extractJson(raw: string) {
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Meme 返回的不是有效 JSON');
  return JSON.parse(match[0]);
}

function lineStats(before: string, after: string) {
  const a = before.split('\n');
  const b = after.split('\n');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return {
    changedLines: Math.max(0, b.length - prefix - suffix),
    removedLines: Math.max(0, a.length - prefix - suffix),
  };
}

const system = (project: string, mode: MemeCodingMode) => `
You are MEME, the coding agent inside Studio for the 小手机 project.
Project: ${project}
Coding mode: ${mode}

You are a real coding agent, not a one-shot code generator. Inspect before editing. Use tools to understand related files, imports, types, config, build scripts and dependencies. For multi-file work, inspect all relevant files before proposing changes.
You may work on main or another branch; branch choice is controlled by the user.
Never pretend a change was applied when it is only a proposal.
The Studio Changes layer is the human approval boundary.
Do not expose chain-of-thought. Give concise user-facing reasoning.

When repairing CI/build failures, identify the root cause rather than merely reacting to the last log line. The proposed fix must be minimal, relevant to the failure, and checked for regressions.

Return JSON with exactly one action:
{"action":{"type":"inspect","path":""}}
{"action":{"type":"search","query":"..."}}
{"action":{"type":"read","path":"..."}}
{"action":{"type":"propose","operation":"update","path":"...","content":"FULL FILE CONTENT","reason":"...","risk":"low"}}
{"action":{"type":"message","text":"..."}}
{"action":{"type":"done","text":"..."}}

After every tool result, continue working. Do not ask the user to copy code manually when Studio can stage it.
`;

async function callModel(options: AgentOptions, messages: any[], temperature = 0.1) {
  const systemPrompt = String(messages.find(message => message.role === 'system')?.content || '');
  const history = messages
    .filter(message => message.role !== 'system')
    .map(message => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: String(message.content || '') }));

  // Use the same model transport as the rest of the app, including Gemini.
  // Studio must not depend on the character/roleplay engine.
  const raw = await generateCreativeText({
    settings: {
      provider: options.provider || 'openai-compatible',
      apiBaseUrl: options.apiBaseUrl,
      apiKey: options.apiKey,
      model: options.model,
      streaming: false,
      contextLength: 32,
      maxOutputTokens: 5000,
      autoSave: false,
      temperature,
    },
    systemPrompt: systemPrompt + '\n\nReturn JSON only. No Markdown fences.',
    history,
    temperature,
  });
  return { raw, parsed: extractJson(raw) };
}

async function validateProposal(options: AgentOptions, userRequest: string, proposal: MemeProposal, originalContent: string, validationContext: string, toolEvidence: string) {
  const stats = lineStats(originalContent, proposal.content || '');
  const validationSystem = `
You are MEME's pre-approval code reviewer.
Your job is to validate a proposed change BEFORE it reaches the user's Changes queue.

Check four things:
1. ROOT CAUSE: Does the proposed diff directly address the requested task or CI/build failure?
2. MINIMALITY: Is the change limited to what is necessary, or does it rewrite unrelated code?
3. REGRESSION RISK: Could it break imports, types, runtime behavior, existing features, config, or styling?
4. EVIDENCE: Do the inspected files and context actually support the proposed fix?

For CI repair, be strict: a proposal that merely hides an error, weakens checks, deletes unrelated code, or guesses without evidence must not pass.
If evidence is insufficient, return needs_more_context rather than guessing.
Do not expose chain-of-thought.

Return JSON only:
{
  "status":"passed"|"needs_revision"|"needs_more_context",
  "summary":"short explanation",
  "checks":["..."],
  "concerns":["..."]
}
`;
  const user = `
REQUEST:
${userRequest}

INCIDENT / TASK CONTEXT:
${validationContext || '(none)'}

PROPOSED FILE:
${proposal.path}
operation=${proposal.operation}
reason=${proposal.reason}

DIFF STATS:
added/changed lines ~= ${stats.changedLines}
removed lines ~= ${stats.removedLines}

ORIGINAL CONTENT:
${originalContent.slice(0, 30000)}

PROPOSED CONTENT:
${(proposal.content || '').slice(0, 30000)}

AVAILABLE TOOL EVIDENCE:
${toolEvidence.slice(-30000)}
`;
  const result = await callModel(options, [
    { role: 'system', content: validationSystem },
    { role: 'user', content: user },
  ], 0.05);
  const parsed = result.parsed || {};
  return {
    status: parsed.status === 'passed' || parsed.status === 'needs_revision' || parsed.status === 'needs_more_context'
      ? parsed.status
      : 'needs_revision',
    summary: String(parsed.summary || '验证器没有给出明确结论。'),
    checks: Array.isArray(parsed.checks) ? parsed.checks.map(String).slice(0, 8) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 8) : [],
    changedLines: stats.changedLines,
    removedLines: stats.removedLines,
  } as MemeValidation;
}

export async function runMemeAgent(options: AgentOptions, userRequest: string, validationContext = '') {
  const maxRounds = options.maxRounds ?? 12;
  const maxValidationRounds = options.maxValidationRounds ?? 2;
  const history: any[] = [
    { role: 'system', content: system(options.project, options.codingMode) },
    { role: 'user', content: userRequest },
  ];
  const fileSnapshots = new Map<string, string>();
  const proposals: MemeProposal[] = [];
  let lastValidationContext = validationContext;

  for (let round = 0; round < maxRounds; round++) {
    options.onEvent?.({ type: 'thinking', text: round === 0 ? '正在理解项目…' : '正在继续检查…' });
    const { raw, parsed } = await callModel(options, history, 0.12);
    const action = parsed.action as MemeAction;
    if (!action?.type) throw new Error('Meme 返回了未知 action');

    if (action.type === 'message') {
      options.onEvent?.({ type: 'message', text: action.text });
      history.push({ role: 'assistant', content: raw });
      history.push({ role: 'user', content: '继续工作。' });
      continue;
    }

    if (action.type === 'done') {
      options.onEvent?.({ type: 'done', text: action.text });
      return { status: 'done' as const, text: action.text, proposals };
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
        originalContent: fileSnapshots.get(action.path) || '',
      };

      let validation: MemeValidation | null = null;
      let validationRound = 0;
      let evidence = Array.from(fileSnapshots.entries()).map(([path, content]) => path + '\\n' + content.slice(0, 10000)).join('\\n\\n');

      while (validationRound < maxValidationRounds) {
        validationRound++;
        options.onEvent?.({ type: 'thinking', text: '正在验证 ' + proposal.path + ' · diff / 根因 / 回归风险…' });
        validation = await validateProposal(options, userRequest, proposal, proposal.originalContent || '', lastValidationContext, evidence);
        options.onEvent?.({ type: 'validation', path: proposal.path, validation });

        if (validation.status === 'passed') {
          proposal.validation = validation;
          proposals.push(proposal);
          options.onEvent?.({ type: 'proposal', proposal });
          history.push({ role: 'assistant', content: raw });
          history.push({ role: 'user', content: 'Validation PASSED for ' + proposal.path + '. The proposal is now staged in Changes. Continue checking for related files or remaining work.' });
          break;
        }

        history.push({ role: 'assistant', content: raw });
        history.push({
          role: 'user',
          content: 'PRE-APPROVAL VALIDATION FAILED for ' + proposal.path + ':\\n' + JSON.stringify(validation) + '\\nDo not stage this proposal. Inspect/read/search the relevant code and produce a smaller, evidence-based corrected proposal.',
        });
        if (validation.status === 'needs_more_context' && validationRound >= maxValidationRounds) {
          options.onEvent?.({ type: 'message', text: 'Meme 暂不把 ' + proposal.path + ' 交给 Changes：证据不足，正在保留当前检查结果。' });
        }
      }

      if (validation?.status !== 'passed') {
        continue;
      }
      continue;
    }

    const tool = action.type === 'inspect'
      ? options.tools.find(t => t.name === 'inspect')
      : action.type === 'search'
        ? options.tools.find(t => t.name === 'search')
        : options.tools.find(t => t.name === 'read');

    if (!tool) throw new Error('Meme tool unavailable: ' + action.type);
    const input = action.type === 'search'
      ? { query: action.query }
      : action.type === 'read'
        ? { path: action.path }
        : { path: action.path || '' };
    options.onEvent?.({ type: 'tool', name: tool.name, input });
    const resultText = await tool.run(input);

    if (action.type === 'read' && resultText && typeof resultText.content === 'string') {
      fileSnapshots.set(String(action.path), resultText.content);
    }

    history.push({ role: 'assistant', content: raw });
    history.push({ role: 'user', content: 'TOOL RESULT (' + tool.name + '):\\n' + JSON.stringify(resultText).slice(0, 50000) });
  }

  const text = 'Meme 达到本轮 Agent 步数上限，已停止并保留当前已通过验证的 Changes。';
  options.onEvent?.({ type: 'done', text });
  return { status: 'limit' as const, text, proposals };
}
