import { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, FileCode2, Folder, Github, KeyRound, Loader2, MessageCircle, Plus, Save, Send, Settings2, ShieldAlert, Sparkles, Trash2, Upload, X } from 'lucide-react';
import type { ScreenType } from '../../types';
import { generateCreativeText, listOpenAiCompatibleModels } from '../../ai/aiEngine';
import { readAppSettings, saveAppSettings, type AppSettings } from '../../store/appSettings';
import { runMemeAgent, type MemeCodingMode } from '../../studio/memeAgent';
import { studioStorage } from '../../studio/studioStorage';
import { applyAtomicChanges, compare, createBranch, createPullRequest, getWorkflowRunsForCommit, getWorkflowJobs, getJobLog, rollbackBranch } from '../../studio/studioGit';
import type { StudioOperationLog, StudioSession, StudioTask } from '../../studio/studioTypes';

type Tab = 'chat' | 'files' | 'changes' | 'crafted' | 'admin' | 'git' | 'settings';
const MEME_MODE_STORE = 'studio:meme-coding-mode';
type Item = { name: string; path: string; type: 'file' | 'dir'; sha?: string };
type Change = { path: string; content: string; reason?: string; risk?: 'low' | 'medium' | 'high'; operation?: 'create' | 'update' | 'delete'; originalContent?: string; validation?: { status: 'passed' | 'needs_revision' | 'needs_more_context'; summary: string; checks: string[]; concerns: string[]; changedLines: number; removedLines: number } };

const STORE = {
  base: 'studio:ai-base',
  key: 'studio:ai-key',
  model: 'studio:model',
  owner: 'studio:github-owner',
  repo: 'studio:github-repo',
  branch: 'studio:github-branch',
  token: 'studio:github-token',
};

function readStore(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function writeStore(key: string, value: string) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}

function aiUrl(base: string) {
  const value = base.trim().replace(/\/+$/, '');
  if (!value) throw new Error('AI Base URL 未填写');
  return /\/chat\/completions$/i.test(value) ? value : value + '/chat/completions';
}

async function github(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let message = '';
    try {
      const data = await response.json();
      message = data?.message || '';
    } catch {}
    throw new Error('GitHub ' + response.status + (message ? ' · ' + message : ''));
  }
  return response.json();
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

export function ProjectStudioScreenView({ onNavigate }: { onNavigate: (screen: ScreenType) => void }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [aiSettings, setAiSettings] = useState<AppSettings>(() => readAppSettings());
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [owner, setOwner] = useState(() => readStore(STORE.owner, 'baekyuko3-sys'));
  const [repo, setRepo] = useState(() => readStore(STORE.repo, '333oookkkkkkkkk'));
  const [branch, setBranch] = useState(() => readStore(STORE.branch, 'main'));
  const [token, setToken] = useState(() => readStore(STORE.token));

  const [items, setItems] = useState<Item[]>([]);
  const [path, setPath] = useState('');
  const [file, setFile] = useState<Item | null>(null);
  const [code, setCode] = useState('');
  const [original, setOriginal] = useState('');
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState('hey ✦ 我是 Studio。你告诉我想改什么，我们一起改这个小手机。');
  const [changes, setChanges] = useState<Change[]>([]);
  const [newPath, setNewPath] = useState('');
  const [newContent, setNewContent] = useState('');
  const [deletePath, setDeletePath] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [memeMode, setMemeMode] = useState<MemeCodingMode>(() => readStore(MEME_MODE_STORE, 'always-ask') as MemeCodingMode);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState<string[]>([]);
  const [tasks, setTasks] = useState<StudioTask[]>(() => studioStorage.tasks());
  const [logs, setLogs] = useState<StudioOperationLog[]>(() => studioStorage.logs());
  const [gitCommits, setGitCommits] = useState<any[]>([]);
  const [prUrl, setPrUrl] = useState('');
  const [ciText, setCiText] = useState('');
  const [crafted, setCrafted] = useState<any[]>(() => { try { return JSON.parse(readStore('studio:crafted','[]')); } catch { return []; } });
  const [sessions, setSessions] = useState<StudioSession[]>(() => studioStorage.sessions());
  const [currentTask, setCurrentTask] = useState<StudioTask | null>(null);
  const [taskSteps, setTaskSteps] = useState<string[]>([]);
  const [sessionTitle, setSessionTitle] = useState('New build session');

  const ready = Boolean(owner.trim() && repo.trim() && branch.trim() && token.trim());
  const aiReady = Boolean(aiSettings.apiBaseUrl.trim() && aiSettings.apiKey.trim() && aiSettings.model.trim());
  const dirty = Boolean(file && code !== original);

  const log = (type: StudioOperationLog['type'], text: string) => { const item={id:'log-'+Date.now(),at:Date.now(),type,text}; setLogs(v=>[item,...v].slice(0,100)); studioStorage.addLog(item); };

  const notify = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const saveSettings = () => {
    saveAppSettings(aiSettings);
    writeStore(STORE.owner, owner);
    writeStore(STORE.repo, repo);
    writeStore(STORE.branch, branch);
    writeStore(STORE.token, token);
    notify('Studio 设置已保存');
  };

  const updateAi = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = saveAppSettings({ [key]: value });
    setAiSettings(next);
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const models = await listOpenAiCompatibleModels(aiSettings);
      setAvailableModels(models);
      notify(models.length ? '已拉取 ' + models.length + ' 个模型' : '接口没有返回模型列表');
    } catch (error) {
      notify(error instanceof Error ? error.message : '模型拉取失败');
    } finally {
      setLoadingModels(false);
    }
  };

  const testAi = async () => {
    setTestingAi(true);
    try {
      // Studio 的连接测试必须走“普通模型对话”，不能进入角色卡/角色聊天引擎。
      const text = await generateCreativeText({
        settings: { ...aiSettings, streaming: false },
        systemPrompt: '你是 Studio 内置的 Meme 助手。这里是普通助手对话，不存在角色卡、角色人设或世界书。请自然、简洁地回答用户。',
        userPrompt: '请回复：你好，有什么可以帮到你？',
        temperature: 0.2,
      });
      notify(text || 'AI 连接成功');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'AI 连接失败');
    } finally {
      setTestingAi(false);
    }
  };

  const list = async (folder = '') => {
    if (!ready) {
      setTab('settings');
      notify('先在 Settings 连接 GitHub');
      return;
    }
    setBusy(true);
    try {
      const clean = folder.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + clean + '?ref=' + encodeURIComponent(branch);
      const data = await github(url, token);
      const array = Array.isArray(data) ? data : [data];
      setItems(array.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        sha: item.sha,
      })));
      setPath(folder);
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取 GitHub 失败');
    } finally {
      setBusy(false);
    }
  };

  const open = async (item: Item) => {
    if (item.type === 'dir') {
      await list(item.path);
      return;
    }
    if (!ready) return;
    setBusy(true);
    try {
      const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + item.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
      const data = await github(url, token);
      setFile(item);
      setCode(decodeBase64(data.content));
      setOriginal(decodeBase64(data.content));
    } catch (error) {
      notify(error instanceof Error ? error.message : '读取文件失败');
    } finally {
      setBusy(false);
    }
  };

  const saveFile = async () => {
    if (!file || !ready) return;
    setSaving(true);
    try {
      const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + file.path.split('/').map(encodeURIComponent).join('/');
      await github(url, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Studio: update ' + file.path,
          content: encodeBase64(code),
          sha: file.sha,
          branch,
        }),
      });
      setOriginal(code);
      await list(path);
      notify('已保存到 GitHub');
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const ask = async () => {
    if (!prompt.trim()) return;
    if (!aiSettings.apiKey.trim() || !aiSettings.model.trim() || !aiSettings.apiBaseUrl.trim()) {
      setTab('settings');
      notify('先填写 AI API Base URL、Key 和 Model');
      return;
    }
    const request = prompt.trim();
    setPrompt('');
    setMessage('你：' + request);
    setAiBusy(true);
    setAgentRunning(true);
    const task: StudioTask = { id:'task-'+Date.now(), title:request.slice(0,50), request, status:'working', steps:[{id:'inspect',title:'Inspect project',status:'working'},{id:'plan',title:'Plan changes',status:'todo'},{id:'review',title:'Review Changes',status:'todo'},{id:'apply',title:'Apply approved changes',status:'todo'}],createdAt:Date.now(),updatedAt:Date.now() };
    setCurrentTask(task); setTasks(v=>{const next=[task,...v].slice(0,30); studioStorage.saveTasks(next); return next;});
    log('agent', 'Started task: ' + request);
    setAgentEvents([]);
    setTaskSteps(['理解需求', '检查相关文件', '准备修改', '等待 Changes 审批']);
    setSessionTitle(request.slice(0, 32));
    try {
      const project = owner + '/' + repo + '@' + branch;
      const result = await runMemeAgent({
        apiBaseUrl: aiSettings.apiBaseUrl,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        provider: aiSettings.provider,
        codingMode: memeMode,
        project,
        tools: [
          {
            name: 'inspect',
            description: 'Inspect a repository directory.',
            run: async ({ path: target = '' }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + clean + '?ref=' + encodeURIComponent(branch);
              const data = await github(url, token);
              return Array.isArray(data)
                ? data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha }))
                : { name: data.name, path: data.path, type: data.type, sha: data.sha };
            },
          },
          {
            name: 'read',
            description: 'Read a repository file.',
            run: async ({ path: target }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + clean + '?ref=' + encodeURIComponent(branch);
              const data = await github(url, token);
              if (Array.isArray(data)) return { error: 'Path is a directory', items: data.map((item: any) => item.path) };
              return { path: data.path, sha: data.sha, content: decodeBase64(data.content).slice(0, 60000) };
            },
          },
          {
            name: 'search',
            description: 'Search the repository code.',
            run: async ({ query }) => {
              const q = encodeURIComponent(String(query) + ' repo:' + owner + '/' + repo);
              const data = await github('https://api.github.com/search/code?q=' + q);
              return (data.items || []).slice(0, 20).map((item: any) => ({ path: item.path, name: item.name, sha: item.sha }));
            },
          },
        ],
        onEvent: event => {
          if (event.type === 'proposal') {
            stageMemeProposal(event.proposal);
          } else if (event.type === 'validation') {
            setAgentEvents(previous => [...previous.slice(-7), 'validation · ' + event.path + ' · ' + event.validation.status]);
            log('agent', 'Validation ' + event.validation.status + ' · ' + event.path);
          } else if (event.type === 'message' || event.type === 'done') {
            setMessage(event.text);
          } else if (event.type === 'tool') {
            setAgentEvents(previous => [...previous.slice(-7), event.name + ' · ' + JSON.stringify(event.input)]);
            log('tool', event.name);
          }
        },
      }, request);
      if (result.text) setMessage(result.text);
      log('agent', 'Finished current pass');
      setCurrentTask(v => v ? {...v,status:'review',updatedAt:Date.now(),steps:v.steps.map((step,i)=>({...step,status:i<2?'done':i===2?'working':'todo'} as any))} : v);
    } catch (error) {
      // Meme Agent 不可用时，Studio 仍然应该像普通 AI 助手一样回复，
      // 尤其是“你好 / 这是什么 / 帮我看看”等非代码请求，不应该落到角色卡逻辑。
      try {
        const fallback = await generateCreativeText({
          settings: { ...aiSettings, streaming: false },
          systemPrompt: '你是 Studio 内置的 Meme 助手。你正在帮助用户维护一个 GitHub 项目。不要扮演任何角色，不要读取角色卡或世界书。对于普通聊天直接回答；对于代码问题，告诉用户你需要 GitHub 项目连接后才能实际检查和修改。',
          userPrompt: request,
          temperature: 0.35,
        });
        setMessage(fallback || '你好，有什么可以帮到你？');
        log('agent', 'Meme Agent fallback → normal model chat');
      } catch (fallbackError) {
        setMessage(error instanceof Error ? error.message : fallbackError instanceof Error ? fallbackError.message : 'Meme 请求失败');
      }
    } finally {
      setAiBusy(false);
      setAgentRunning(false);
    }
  };

  const approveChange = async (change: Change) => {
    if (!ready) { setTab('settings'); notify('先连接 GitHub'); return; }
    setSaving(true);
    try {
      const result = await applyAtomicChanges(owner, repo, branch, token, [{ path: change.path, content: change.content, operation: change.operation || 'update' }], 'Studio: apply Meme change ' + change.path);
      setChanges(previous => previous.filter(item => item.path !== change.path));
      log('git', 'Applied ' + change.path + ' · ' + result.sha.slice(0,8));
      notify('已批准并写入：' + change.path);
      await list(path);
      await waitForCIAndRepair(result.sha);
    } catch (error) { notify(error instanceof Error ? error.message : '应用修改失败'); }
    finally { setSaving(false); }
  };

  const approveAllChanges = async () => {
    if (!ready || !changes.length) return;
    if (!window.confirm('确认把 ' + changes.length + ' 个文件作为一个原子 commit 写入 ' + branch + '？')) return;
    setSaving(true);
    try {
      const result = await applyAtomicChanges(owner, repo, branch, token, changes.map(change => ({ path: change.path, content: change.content, operation: change.operation || 'update' })), 'Studio: apply Meme task · ' + sessionTitle);
      const artifact = { id:'crafted-'+Date.now(), name:sessionTitle, kind:'feature', summary:'Meme completed an approved multi-file change.', files:changes.map(c=>c.path), commitSha:result.sha, createdAt:Date.now() };
      const next=[artifact,...crafted].slice(0,50); setCrafted(next); writeStore('studio:crafted',JSON.stringify(next));
      setChanges([]); setCurrentTask(v => v ? {...v,status:'working',updatedAt:Date.now(),steps:v.steps.map(step=>({...step,status:'done'}))} : v);
      log('git','Atomic commit '+result.sha); notify('已一次性写入 '+artifact.files.length+' 个文件，正在等待 CI…');
      await waitForCIAndRepair(result.sha);
    } catch (error) { notify(error instanceof Error ? error.message : '批量提交失败'); }
    finally { setSaving(false); }
  };

  const createStudioBranch = async () => {
    if (!ready) return;
    const name=window.prompt('新分支名称','meme/'+Date.now());
    if (!name) return;
    try { await createBranch(owner,repo,name,branch,token); setBranch(name); writeStore(STORE.branch,name); notify('已创建分支：'+name); log('git','Created branch '+name); }
    catch(error){ notify(error instanceof Error ? error.message : '创建分支失败'); }
  };

  const openPullRequest = async () => {
    if (!ready || branch === 'main') { notify('PR 需要一个非 main 分支'); return; }
    try { const result=await createPullRequest(owner,repo,branch,'main','Studio · '+sessionTitle,'Created by Meme Studio.',token,true); setPrUrl(result.html_url || result.url || ''); notify('Draft PR 已创建'); }
    catch(error){ notify(error instanceof Error ? error.message : 'PR 创建失败'); }
  };

  const loadDiff = async () => {
    try {
      const data=await compare(owner,repo,'main',branch,token);
      const files=(data.files||[]).map((item:any)=>item.filename+' · '+item.status+' · +'+item.additions+' -'+item.deletions).join('\\n');
      setCiText(files || '没有差异'); setTab('changes');
    } catch(error){ notify(error instanceof Error ? error.message : 'Diff 获取失败'); }
  };

  const rollbackToCommit = async (sha: string) => {
    if (!ready || !sha) return;
    if (!window.confirm('确认把当前分支恢复到这个 commit？\\n' + sha.slice(0,8) + '\\n此操作会改变远端分支指向。')) return;
    try {
      await rollbackBranch(owner, repo, branch, sha, token);
      notify('已恢复到 ' + sha.slice(0,8));
      log('git', 'Rollback ' + branch + ' -> ' + sha.slice(0,8));
      setGitCommits([]);
    } catch (error) {
      notify(error instanceof Error ? error.message : '恢复失败');
    }
  };

  const stageMemeProposal = (p: any) => {
    const validation = p.validation;
    setChanges(previous => [
      ...previous.filter(change => change.path !== p.path),
      {
        path: p.path,
        content: p.content || '',
        reason: p.reason,
        risk: p.risk,
        operation: p.operation || 'update',
        originalContent: p.originalContent || '',
        validation,
      },
    ]);
    setTaskSteps(previous => previous.map((step, index) =>
      index === 2 ? '修复已通过 Meme 自检' : index === 3 ? '等待你的批准' : step
    ));
    setMessage('Meme 已完成修复前后验证：' + p.path + '\\n' + (validation?.summary || p.reason));
    log('change', p.operation + ' ' + p.path + ' · validation passed');
    setTab('changes');
  };

  const buildCIRepairContext = async (ciError: string, failedSha: string) => {
    const base = 'https://api.github.com/repos/' + owner + '/' + repo;
    const errorText = String(ciError || '').slice(-16000);
    const changePaths = changes.map(change => change.path);
    const errorPaths = Array.from(errorText.matchAll(/(?:src|app|lib|components|pages|public|tests?|packages?)\/[A-Za-z0-9_./-]+/g))
      .map(match => match[0].replace(/[),:;]+$/, ''));
    const guessedPaths = Array.from(new Set([...changePaths, ...errorPaths])).filter(Boolean).slice(0, 10);

    let commitInfo: any = {};
    let recentCommits: any[] = [];
    let commitFiles: any[] = [];

    try {
      commitInfo = await github(base + '/commits/' + encodeURIComponent(failedSha), token);
      commitFiles = (commitInfo.files || []).slice(0, 20).map((item: any) => ({
        path: item.filename,
        status: item.status,
        additions: item.additions,
        deletions: item.deletions,
      }));
    } catch (error) {
      log('error', 'Could not load failed commit metadata');
    }

    try {
      const data = await github(base + '/commits?sha=' + encodeURIComponent(branch) + '&per_page=6', token);
      recentCommits = (data || []).slice(0, 6).map((item: any) => ({
        sha: item.sha,
        message: item.commit?.message?.split('\\n')[0],
        author: item.commit?.author?.name,
      }));
    } catch (error) {
      log('error', 'Could not load recent commits');
    }

    const relevantPaths = Array.from(new Set([
      ...guessedPaths,
      ...commitFiles.map(item => item.path),
    ])).slice(0, 8);

    const relevantFiles: Array<{ path: string; sha: string; content: string }> = [];
    for (const filePath of relevantPaths) {
      try {
        const data = await github(
          base + '/contents/' + filePath.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(failedSha),
          token
        );
        if (!Array.isArray(data) && data.content) {
          relevantFiles.push({
            path: filePath,
            sha: data.sha,
            content: decodeBase64(data.content).slice(0, 24000),
          });
        }
      } catch {
        // A deleted/renamed file is still useful through commit metadata.
      }
    }

    return {
      failedCommit: {
        sha: failedSha,
        message: commitInfo.commit?.message || '',
        parentSha: commitInfo.parents?.[0]?.sha || '',
        files: commitFiles,
      },
      recentCommits,
      currentChanges: changes.map(change => ({
        path: change.path,
        operation: change.operation || 'update',
        reason: change.reason || '',
        risk: change.risk || 'medium',
        proposedContent: change.content?.slice(0, 24000) || '',
      })),
      relevantFiles,
      ciError: errorText,
    };
  };

  const runRepairAgent = async (ciError: string, failedSha: string, sourceLabel = 'CI') => {
    if (!aiReady || !ready) {
      setTab('settings');
      notify('CI 已失败，但 Meme 还没有准备好：请检查 AI / GitHub 设置');
      return;
    }

    const context = await buildCIRepairContext(ciError, failedSha);
    const errorText = context.ciError;
    const repairRequest =
      'CI 自动修复任务。' +
      '\\n来源：' + sourceLabel +
      '\\n失败 commit：' + failedSha +
      '\\n\\n你现在拿到的是一次真实的事故现场。必须综合下面全部证据判断根因：CI 错误、失败 commit、最近提交、当前未批准 Changes、以及失败 commit 对应的相关源码。' +
      '\\n不要只根据错误最后一行猜测，也不要重复上一轮已经存在的错误修改。先确认根因，再提出最小修复。' +
      '\\n\\n--- INCIDENT CONTEXT ---\\n' + JSON.stringify(context) +
      '\\n--- END INCIDENT CONTEXT ---' +
      '\\n\\n工作要求：' +
      '\\n1. 优先定位真正失败点，而不是机械修改报错文字。' +
      '\\n2. 检查相关文件之间的依赖、import、类型、配置和构建脚本。' +
      '\\n3. 如果当前 Changes 已经包含可能导致失败的修改，优先审查并修正它。' +
      '\\n4. 只提出能解释 CI 错误的最小必要改动。' +
      '\\n5. 如果证据不足，继续使用 inspect/read/search，不要猜。' +
      '\\n6. 所有实际文件修改必须进入 Studio Changes，等待用户批准；不要直接写 GitHub。';

    setPrompt('');
    setMessage('Meme 正在分析 CI 错误…');
    setAgentRunning(true);
    setAiBusy(true);
    setAgentEvents([]);
    setTaskSteps(['读取 CI 错误', '定位失败原因', '检查相关文件', '准备修复 Changes']);
    const task: StudioTask = {
      id: 'task-ci-' + Date.now(),
      title: 'Repair CI · ' + failedSha.slice(0, 8),
      request: repairRequest,
      status: 'working',
      steps: [
        { id: 'ci', title: 'Read CI failure', status: 'done' },
        { id: 'inspect', title: 'Inspect root cause', status: 'working' },
        { id: 'repair', title: 'Prepare repair', status: 'todo' },
        { id: 'review', title: 'Review Changes', status: 'todo' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCurrentTask(task);
    setTasks(v => {
      const next = [task, ...v].slice(0, 30);
      studioStorage.saveTasks(next);
      return next;
    });
    log('agent', 'Started automatic CI repair for ' + failedSha.slice(0, 8));

    try {
      const project = owner + '/' + repo + '@' + branch;
      const result = await runMemeAgent({
        apiBaseUrl: aiSettings.apiBaseUrl,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        codingMode: memeMode,
        project,
        tools: [
          {
            name: 'inspect',
            description: 'Inspect a repository directory.',
            run: async ({ path: target = '' }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const data = await github(
                'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + clean + '?ref=' + encodeURIComponent(branch),
                token
              );
              return Array.isArray(data)
                ? data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, sha: item.sha }))
                : { name: data.name, path: data.path, type: data.type, sha: data.sha };
            },
          },
          {
            name: 'read',
            description: 'Read a repository file.',
            run: async ({ path: target }) => {
              const clean = String(target).split('/').filter(Boolean).map(encodeURIComponent).join('/');
              const data = await github(
                'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + clean + '?ref=' + encodeURIComponent(branch),
                token
              );
              if (Array.isArray(data)) return { error: 'Path is a directory', items: data.map((item: any) => item.path) };
              return { path: data.path, sha: data.sha, content: decodeBase64(data.content).slice(0, 60000) };
            },
          },
          {
            name: 'search',
            description: 'Search repository code for symbols, imports, error messages, or related implementation.',
            run: async ({ query }) => {
              const q = encodeURIComponent(String(query) + ' repo:' + owner + '/' + repo);
              const data = await github('https://api.github.com/search/code?q=' + q, token);
              return (data.items || []).slice(0, 20).map((item: any) => ({ path: item.path, name: item.name, sha: item.sha }));
            },
          },
        ],
        onEvent: event => {
          if (event.type === 'proposal') {
            stageMemeProposal(event.proposal);
          } else if (event.type === 'validation') {
            setAgentEvents(previous => [...previous.slice(-7), 'validation · ' + event.path + ' · ' + event.validation.status]);
            log('agent', 'Validation ' + event.validation.status + ' · ' + event.path);
          } else if (event.type === 'message' || event.type === 'done') {
            setMessage(event.text);
          } else if (event.type === 'tool') {
            setAgentEvents(previous => [...previous.slice(-7), event.name + ' · ' + JSON.stringify(event.input)]);
            log('tool', event.name);
          } else if (event.type === 'error') {
            log('error', event.text);
          }
        },
      }, repairRequest, JSON.stringify(context));

      if (result.text) setMessage(result.text);
      setCurrentTask(v => v ? {
        ...v,
        status: 'review',
        updatedAt: Date.now(),
        steps: v.steps.map((step, i) => ({ ...step, status: i < 2 ? 'done' : i === 2 ? 'working' : 'todo' } as any)),
      } : v);
      log('agent', 'CI repair analysis finished; awaiting Changes approval');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Meme CI 修复失败';
      setMessage(text);
      log('error', text);
      setCurrentTask(v => v ? { ...v, status: 'failed', updatedAt: Date.now() } : v);
    } finally {
      setAiBusy(false);
      setAgentRunning(false);
    }
  };

  const checkCI = async (sha: string, autoRepair = false) => {
    try {
      const runs = await getWorkflowRunsForCommit(owner, repo, sha, token);
      const run = runs.workflow_runs?.[0];
      if (!run) {
        setCiText('暂时没有找到 CI run');
        return;
      }

      if (run.conclusion === 'failure') {
        const jobs = await getWorkflowJobs(owner, repo, run.id, token);
        const failed = jobs.jobs?.find((job: any) =>
          job.conclusion === 'failure' || job.status === 'failure'
        );
        const text = failed ? await getJobLog(owner, repo, failed.id, token) : 'CI failed';
        const errorText = String(text).slice(-16000);
        setCiText(errorText);
        log('error', 'CI failure returned to Studio · ' + sha.slice(0, 8));

        if (autoRepair) {
          await runRepairAgent(errorText, sha, 'GitHub Actions');
        }
      } else {
        setCiText('CI · ' + run.status + ' · ' + (run.conclusion || 'running'));
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'CI 检查失败');
    }
  };

  const waitForCIAndRepair = async (sha: string) => {
    setCiText('CI 正在运行…');
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const runs = await getWorkflowRunsForCommit(owner, repo, sha, token);
        const run = runs.workflow_runs?.[0];
        if (run && run.status === 'completed') {
          if (run.conclusion === 'success') {
            setCiText('CI · success · ' + sha.slice(0, 8));
            log('git', 'CI passed · ' + sha.slice(0, 8));
            setCurrentTask(v => v ? { ...v, status: 'done', updatedAt: Date.now(), steps: v.steps.map(step => ({ ...step, status: 'done' })) } : v);
            notify('CI 通过 ✓');
            return;
          }
          await checkCI(sha, true);
          return;
        }
      } catch (error) {
        log('error', 'CI poll failed: ' + (error instanceof Error ? error.message : 'unknown'));
      }
      await new Promise(resolve => window.setTimeout(resolve, 5000));
    }
    setCiText('CI 仍在运行。可以稍后在 Git 页面再次检查。');
    log('system', 'CI polling timed out · ' + sha.slice(0, 8));
  };


  const createFile = async () => {
    const target = newPath.trim().replace(/^\/+|\/+$/g, '');
    if (!target || !ready) return;
    setSaving(true);
    try {
      const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + target.split('/').map(encodeURIComponent).join('/');
      await github(url, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Studio: create ' + target, content: encodeBase64(newContent), branch }),
      });
      setNewPath('');
      setNewContent('');
      await list(path);
      notify('文件已创建');
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (targetPath: string) => {
    if (!ready || !targetPath.trim()) return;
    setSaving(true);
    try {
      const target = targetPath.trim().replace(/^\/+|\/+$/g, '');
      const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + target.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
      const data = await github(url, token);
      if (Array.isArray(data)) throw new Error('这是目录，请使用递归删除');
      await github(url.split('?')[0], token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Studio: delete ' + target, sha: data.sha, branch }),
      });
      await list(path);
      notify('文件已删除');
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteTree = async (root: string): Promise<void> => {
    const target = root.trim().replace(/^\/+|\/+$/g, '');
    if (!target || !ready) return;
    const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + target.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
    const data = await github(url, token);
    if (!Array.isArray(data)) {
      await github(url.split('?')[0], token, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Studio: delete ' + target, sha: data.sha, branch }),
      });
      return;
    }
    for (const item of data) {
      await deleteTree(item.path);
    }
  };

  const removeTree = async () => {
    if (!deletePath.trim() || !ready) return;
    if (!window.confirm('确定递归删除这个 App / 目录吗？GitHub 上的文件会被删除。')) return;
    setSaving(true);
    try {
      await deleteTree(deletePath);
      await list(path);
      setDeletePath('');
      notify('目录已删除');
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除目录失败');
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (value: Tab, label: string, Icon: any) => (
    <button
      onClick={() => setTab(value)}
      className={tab === value ? 'py-2 rounded-xl bg-[#292724] text-white text-[8px]' : 'py-2 text-[#777069] text-[8px]'}
    >
      <Icon className="w-3.5 h-3.5 mx-auto" />
      {label}
    </button>
  );

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
      <header className="pt-11 px-4 pb-3 border-b border-black/10 bg-[#f7f4ee]/95">
        <div className="flex items-center gap-2.5">
          <button onClick={() => onNavigate('home')} className="w-8 h-8 rounded-full bg-white/70 grid place-items-center">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">MEME · DEVELOPMENT STUDIO</div>
            <div className="flex items-center gap-1.5">
              <b className="text-[18px]">Studio</b>
              <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-[#292724] text-white">{ready ? 'GITHUB READY' : 'LOCAL MODE'}</span>
            </div>
          </div>
          <button onClick={() => setTab('settings')} className="w-8 h-8 rounded-full bg-white/70 grid place-items-center">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 text-[8px] font-mono text-[#8b8782] flex justify-between">
          <span>{owner} / {repo}</span>
          <span>{branch}</span>
        </div>
      </header>

      <main className="h-[calc(100%-100px)] overflow-y-auto no-scrollbar pb-20">
        {tab === 'chat' && (
          <section className="p-3.5 space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="flex gap-2 items-center">
                <div className="w-9 h-9 rounded-[13px] bg-[#292724] text-white grid place-items-center"><Sparkles className="w-4 h-4" /></div>
                <div><b className="text-[12px]">hey, let's build ✦</b><div className="text-[9px] text-[#7c756e]">AI + GitHub · 在小手机里改代码</div></div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                <button onClick={() => setPrompt('检查当前项目的问题并给最小修复方案')} className="p-2 rounded-xl bg-white/70 text-[8px] text-left">检查代码</button>
                <button onClick={() => setPrompt('把当前页面做得更高级、更干净，不删除已有功能')} className="p-2 rounded-xl bg-white/70 text-[8px] text-left">优化 UI</button>
                <button onClick={() => setPrompt('帮我找可能的构建错误')} className="p-2 rounded-xl bg-white/70 text-[8px] text-left">找 Bug</button>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/70 border border-black/5 text-[10px] whitespace-pre-wrap">{message}</div>
            {currentTask && <div className="p-3 rounded-2xl bg-[#292724] text-white">
              <div className="text-[8px] font-mono tracking-[1.5px] text-white/50">CURRENT TASK</div>
              <div className="mt-1 text-[10px]">{currentTask.title}</div>
              <div className="mt-2 grid grid-cols-4 gap-1">{currentTask.steps.map(step => <div key={step.id} className="text-center"><div className="h-1 rounded-full bg-white/20 overflow-hidden"><div className={step.status === 'done' ? 'h-full w-full bg-white' : step.status === 'working' ? 'h-full w-1/2 bg-white' : 'h-full w-0'} /></div><div className="mt-1 text-[6px] opacity-60">{step.title}</div></div>)}</div>
            </div>}

            {agentRunning && <div className="p-3 rounded-2xl bg-[#292724] text-white text-[8px] font-mono">{agentEvents.length ? agentEvents.map((item, index) => <div key={index}>{item}</div>) : 'MEME · inspecting project…'}</div>}
            {!ready && <div className="p-3 rounded-2xl bg-[#fff4f1] text-[9px]">还没连接 GitHub。去 Settings 填 Token，就可以直接维护项目。</div>}
                      <div className="p-3 rounded-2xl bg-white/60 border border-black/5">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">SESSION HISTORY</div>
              {sessions.slice(0,6).map(session => <button key={session.id} onClick={() => setSessionTitle(session.title)} className="w-full text-left mt-1.5 p-2 rounded-xl bg-white/70"><div className="text-[8px] truncate">{session.title}</div><div className="text-[6px] text-[#999]">{new Date(session.createdAt).toLocaleString()}</div></button>)}
              {!sessions.length && <div className="mt-2 text-[8px] text-[#888]">还没有历史 Session。</div>}
            </div>
</section>
        )}

        {tab === 'git' && (
          <section className="p-3.5 space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de]"><div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">GIT WORKSPACE</div><b className="text-[17px]">History & Recovery</b><div className="mt-1 text-[9px] text-[#777069]">{owner}/{repo} · {branch}</div></div>
            <button onClick={async () => { try { const data=await github('https://api.github.com/repos/'+owner+'/'+repo+'/commits?sha='+encodeURIComponent(branch)+'&per_page=20',token); setGitCommits(data || []); log('git','Loaded commit history'); } catch(e){ notify(e instanceof Error ? e.message : 'Git 历史读取失败'); } }} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px]">刷新提交历史</button>
            {gitCommits.map((c:any)=><div key={c.sha} className="p-3 rounded-2xl bg-white/65"><div className="text-[9px]">{c.commit?.message?.split('\n')[0]}</div><div className="mt-1 text-[7px] font-mono text-[#888]">{c.sha?.slice(0,8)}</div></div>)}
            {!gitCommits.length && <div className="py-10 text-center text-[9px] text-[#888]">刷新后查看最近提交。</div>}
            <div className="p-3 rounded-2xl bg-[#fff4f1] text-[8px] text-[#8f6f68]">回滚入口会要求二次确认；不会让 Meme 悄悄改写历史。</div>
          </section>
        )}

        {tab === 'files' && (
          <section className="p-3.5 space-y-2.5">
            <div className="flex gap-1.5">
              <button onClick={() => void list(path)} className="flex-1 py-2 rounded-xl bg-[#292724] text-white text-[9px]">刷新</button>
              <button onClick={() => void list('')} className="py-2 px-3 rounded-xl bg-white text-[9px]">根目录</button>
            </div>
            {file && (
              <div className="rounded-2xl bg-[#252422] text-white overflow-hidden">
                <div className="p-2.5 flex items-center gap-2 text-[9px] border-b border-white/10">
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span className="flex-1 truncate">{file.path}</span>
                  <button onClick={() => setFile(null)}><X className="w-3 h-3" /></button>
                </div>
                <textarea value={code} onChange={event => setCode(event.target.value)} spellCheck={false} className="w-full h-[310px] bg-transparent p-3 text-[8px] leading-[1.55] font-mono outline-none resize-none" />
                <div className="p-2 border-t border-white/10">
                  <button disabled={!dirty || saving} onClick={() => void saveFile()} className="w-full py-2 rounded-lg bg-white text-[#292724] text-[9px] disabled:opacity-30">
                    <Save className="w-3 h-3 inline mr-1" />{saving ? '保存中…' : '保存到 GitHub'}
                  </button>
                </div>
              </div>
            )}
            <div className="p-2.5 rounded-2xl bg-white/60 text-[9px] text-[#777069]">当前：{path || '/'}</div>
            <div className="rounded-2xl bg-white/60 overflow-hidden">
              {busy ? <div className="p-6 text-center"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div> : items.map(item => (
                <button key={item.path} onClick={() => void open(item)} className="w-full p-2.5 flex gap-2 items-center border-b border-black/5 text-left">
                  {item.type === 'dir' ? <Folder className="w-3.5 h-3.5 text-[#9b8068]" /> : <FileCode2 className="w-3.5 h-3.5" />}
                  <span className="flex-1 text-[9px] truncate">{item.name}</span>
                  <ChevronRight className="w-3 h-3 text-[#aaa]" />
                </button>
              ))}
              {!busy && !items.length && <div className="p-8 text-center text-[9px] text-[#888]">点击“刷新”读取 GitHub。</div>}
            </div>
          </section>
        )}

        {tab === 'changes' && (
          <section className="p-3.5 space-y-2.5">
            <div className="p-3 rounded-2xl bg-[#ebe6de] text-[9px]"><b>Changes</b><div className="mt-1 text-[#777069]">AI 的修改先预览；可以逐文件批准，也可以作为一个原子 commit 一次写入。</div>
              <div className="grid grid-cols-2 gap-1.5 mt-2"><button onClick={() => void loadDiff()} className="py-2 rounded-xl bg-white text-[8px]">Diff</button><button disabled={!changes.length||saving} onClick={() => void approveAllChanges()} className="py-2 rounded-xl bg-[#292724] text-white text-[8px] disabled:opacity-40">Atomic Commit</button></div>
            </div>
            {ciText && <pre className="p-3 rounded-2xl bg-[#252422] text-[#ddd] text-[7px] whitespace-pre-wrap max-h-40 overflow-auto">{ciText}</pre>}
            {changes.map(change => <div key={change.path} className="p-3 rounded-2xl bg-white/65 border border-black/5"><div className="flex gap-2"><div className="text-[9px] font-mono flex-1 truncate">{change.path}</div><span className="text-[7px]">{change.operation||'update'}</span></div>{change.validation && <div className="mt-2 p-2 rounded-xl bg-[#eef5ef] text-[7px]"><b>✓ Meme self-check passed</b><div className="mt-1">{change.validation.summary}</div><div className="mt-1 text-[#777]">Diff: +{change.validation.changedLines} / -{change.validation.removedLines} · risk {change.risk || 'medium'}</div>{change.validation.concerns.length > 0 && <div className="mt-1 text-[#8f6f68]">注意：{change.validation.concerns.join(' · ')}</div>}</div>}{change.reason&&<div className="mt-1 text-[8px] text-[#777069]">{change.reason}</div>}<pre className="mt-2 max-h-24 overflow-hidden rounded-xl bg-[#252422] text-[#ddd] p-2 text-[7px] whitespace-pre-wrap">+ {change.content.slice(0,1000)}</pre><div className="grid grid-cols-2 gap-1.5 mt-2"><button onClick={() => {setFile({name:change.path.split('/').pop()||change.path,path:change.path,type:'file'});setCode(change.content);setOriginal(change.originalContent||'');setTab('files')}} className="py-2 rounded-lg bg-white text-[9px]">查看 / 编辑</button><button disabled={saving} onClick={() => void approveChange(change)} className="py-2 rounded-lg bg-[#292724] text-white text-[9px] disabled:opacity-40">批准</button></div></div>)}
            {!changes.length&&<div className="py-12 text-center text-[9px] text-[#888]">暂无 AI 修改草案。</div>}
          </section>
        )}


        {tab === 'crafted' && (
          <section className="p-3.5 space-y-3"><div className="p-4 rounded-2xl bg-[#ebe6de]"><div className="text-[8px] font-mono tracking-[2px] text-[#8b8782]">CRAFTED BY MEME</div><b className="text-[18px]">作品档案</b><div className="mt-1 text-[9px] text-[#777069]">只有真正批准并写入 Git 的工作才会进入这里。</div></div>
          {crafted.map(item=><div key={item.id} className="p-3 rounded-2xl bg-white/65 border border-black/5"><div className="text-[10px] font-semibold">{item.name}</div><div className="mt-1 text-[8px] text-[#777069]">{item.summary}</div><div className="mt-2 text-[7px] font-mono text-[#999]">{item.files.length} files · {item.commitSha?.slice(0,8)}</div></div>)}
          {!crafted.length&&<div className="py-14 text-center text-[9px] text-[#888]">Nothing here yet.<br/>等 Meme 完成第一个真正作品。</div>}</section>
        )}

        {tab === 'admin' && (
          <section className="p-3.5 space-y-2.5">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] border border-black/5">
              <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /><b>Studio Admin</b></div>
              <div className="mt-1 text-[9px] text-[#777069]">完整项目维护权限：创建、修改、删除文件，也可以递归删除 App / 目录。</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">CREATE FILE</div>
              <input value={newPath} onChange={event => setNewPath(event.target.value)} placeholder="例如 src/components/screens/MyApp.tsx" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <textarea value={newContent} onChange={event => setNewContent(event.target.value)} placeholder="文件内容" className="w-full h-28 p-2.5 rounded-xl text-[8px] font-mono outline-none resize-none" />
              <button disabled={saving} onClick={() => void createFile()} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-40"><Plus className="w-3 h-3 inline mr-1" />{saving ? '处理中…' : '创建文件'}</button>
            </div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">DELETE</div>
              <input value={deletePath} onChange={event => setDeletePath(event.target.value)} placeholder="输入文件或 App / 目录路径" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <div className="grid grid-cols-2 gap-1.5">
                <button disabled={saving} onClick={() => void deleteFile(deletePath)} className="py-2.5 rounded-xl bg-[#8d4e4e] text-white text-[9px] disabled:opacity-40"><Trash2 className="w-3 h-3 inline mr-1" />删除文件</button>
                <button disabled={saving} onClick={() => void removeTree()} className="py-2.5 rounded-xl bg-[#9b625b] text-white text-[9px] disabled:opacity-40"><Trash2 className="w-3 h-3 inline mr-1" />删除 App / 目录</button>
              </div>
              <div className="text-[8px] leading-relaxed text-[#8f6f68]">递归删除属于最高权限操作，会逐个删除 GitHub 中的文件，并需要你确认。</div>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="p-3.5 space-y-2.5">
            <div className="p-3.5 rounded-2xl bg-[#ebe6de] text-[9px]"><b>Studio Settings</b><div className="mt-1 text-[#777069]">AI Key 与 GitHub Token 仅保存在当前浏览器。</div></div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">AI · OPENAI COMPATIBLE</div>
              <label className="text-[9px] block">API Base URL<input value={aiSettings.apiBaseUrl} onChange={event => updateAi('apiBaseUrl', event.target.value)} placeholder="https://api.openai.com/v1" className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" /></label>
              <label className="text-[9px] block">API Key<input type="password" value={aiSettings.apiKey} onChange={event => updateAi('apiKey', event.target.value)} placeholder="sk-..." className="mt-1 w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none" /></label>
              <div className="flex gap-1.5">
                <select value={aiSettings.model} onChange={event => updateAi('model', event.target.value)} className="flex-1 mt-1 p-2.5 rounded-xl bg-white/80 text-[9px] outline-none">
                  <option value="">选择模型</option>
                  {availableModels.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                <button onClick={() => void loadModels()} disabled={loadingModels} className="mt-1 px-3 rounded-xl bg-white text-[8px] disabled:opacity-40">{loadingModels ? '拉取中…' : '拉取模型'}</button>
              </div>
              <button onClick={() => void testAi()} disabled={testingAi || !aiReady} className="w-full py-2.5 rounded-xl bg-[#292724] text-white text-[9px] disabled:opacity-40">{testingAi ? '测试中…' : '测试 AI 连接'}</button>
            </div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">GITHUB PROJECT</div>
              <div className="grid grid-cols-2 gap-1.5">
                <input value={owner} onChange={event => setOwner(event.target.value)} placeholder="Owner" className="p-2.5 rounded-xl text-[9px] outline-none" />
                <input value={repo} onChange={event => setRepo(event.target.value)} placeholder="Repository" className="p-2.5 rounded-xl text-[9px] outline-none" />
              </div>
              <input value={branch} onChange={event => setBranch(event.target.value)} placeholder="Branch" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Fine-grained GitHub Token" className="w-full p-2.5 rounded-xl text-[9px] outline-none" />
              <div className="text-[8px] leading-relaxed text-[#888]">建议 Token 只开放这个仓库的 Contents 读写权限。</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/60 space-y-2">
              <div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">MEME · CODING MODE</div>
              <select value={memeMode} onChange={event => { const value = event.target.value as MemeCodingMode; setMemeMode(value); writeStore(MEME_MODE_STORE, value); }} className="w-full p-2.5 rounded-xl bg-white/80 text-[9px] outline-none">
                <option value="always-ask">Always ask · 每次修改都确认</option>
                <option value="confirm-before-commit">Confirm before commit · 修改可准备，提交前确认</option>
                <option value="auto">Auto · 允许 Agent 自动执行</option>
              </select>
              <div className="text-[8px] leading-relaxed text-[#777069]">推荐 Always ask。Meme 会先检查项目、生成 Changes，再由你决定是否落库。</div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={saveSettings} className="py-2.5 rounded-xl bg-[#292724] text-white text-[9px]"><Check className="w-3 h-3 inline mr-1" />保存</button>
              <button onClick={async () => { try { const data = await github('https://api.github.com/user', token); notify('GitHub 已连接：' + (data?.login || 'OK')); await list(''); } catch (error) { notify(error instanceof Error ? error.message : '连接失败'); } }} className="py-2.5 rounded-xl bg-white text-[9px]"><Github className="w-3 h-3 inline mr-1" />测试 GitHub</button>
            </div>
          </section>
        )}
      </main>

      {notice && <div className="absolute z-50 bottom-20 left-4 right-4 p-2.5 rounded-xl bg-[#292724] text-white text-[9px] text-center">{notice}</div>}

      {tab === 'chat' && (
        <div className="absolute z-40 left-3 right-3 bottom-[65px] flex gap-1.5">
          <input value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void ask(); }} placeholder="告诉 MEME 你想改什么…" className="flex-1 p-2.5 rounded-xl bg-white border border-black/10 text-[9px] outline-none" />
          <button onClick={() => void ask()} disabled={aiBusy || !prompt.trim()} className="w-10 rounded-xl bg-[#292724] text-white grid place-items-center disabled:opacity-30">
            {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      <nav className="absolute bottom-0 left-0 right-0 z-30 px-2 pb-3 pt-2 bg-[#f7f4ee]/95 border-t border-black/10 grid grid-cols-7 gap-1">
        {tabButton('chat', 'Chat', MessageCircle)}
        {tabButton('files', 'Files', FileCode2)}
        {tabButton('changes', 'Changes', Upload)}
        {tabButton('crafted', 'Crafted', Sparkles)}
        {tabButton('admin', 'Admin', ShieldAlert)}
        {tabButton('git', 'Git', Github)}
        {tabButton('settings', 'Settings', KeyRound)}
      </nav>
    </div>
  );
}
