import { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, FileCode2, Folder, Github, KeyRound, Loader2, MessageCircle, Plus, Save, Send, Settings2, ShieldAlert, Sparkles, Trash2, Upload, X } from 'lucide-react';
import type { ScreenType } from '../../types';
import { listOpenAiCompatibleModels, testAiConnection } from '../../ai/aiEngine';
import { readAppSettings, saveAppSettings, type AppSettings } from '../../store/appSettings';
import { runMemeAgent, type MemeCodingMode } from '../../studio/memeAgent';

type Tab = 'chat' | 'files' | 'changes' | 'admin' | 'settings';
const MEME_MODE_STORE = 'studio:meme-coding-mode';
type Item = { name: string; path: string; type: 'file' | 'dir'; sha?: string };
type Change = { path: string; content: string; reason?: string; risk?: 'low' | 'medium' | 'high' };

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
  const [taskSteps, setTaskSteps] = useState<string[]>([]);
  const [sessionTitle, setSessionTitle] = useState('New build session');

  const ready = Boolean(owner.trim() && repo.trim() && branch.trim() && token.trim());
  const aiReady = Boolean(aiSettings.apiBaseUrl.trim() && aiSettings.apiKey.trim() && aiSettings.model.trim());
  const dirty = Boolean(file && code !== original);

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
      const result = await testAiConnection(aiSettings);
      notify(result.text || 'AI 连接成功');
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
    setAgentEvents([]);
    setTaskSteps(['理解需求', '检查相关文件', '准备修改', '等待 Changes 审批']);
    setSessionTitle(request.slice(0, 32));
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
            const p = event.proposal;
            setChanges(previous => [
              ...previous.filter(change => change.path !== p.path),
              { path: p.path, content: p.content || '', reason: p.reason, risk: p.risk },
            ]);
            setTaskSteps(previous => previous.map((step, index) => index === 2 ? '修改草案已准备' : index === 3 ? '等待你的批准' : step));
            setMessage('Meme 已提出修改：' + p.path + '\\n' + p.reason);
            setTab('changes');
          } else if (event.type === 'message' || event.type === 'done') {
            setMessage(event.text);
          } else if (event.type === 'tool') {
            setAgentEvents(previous => [...previous.slice(-7), event.name + ' · ' + JSON.stringify(event.input)]);
          }
        },
      }, request);
      if (result.text) setMessage(result.text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Meme 请求失败');
    } finally {
      setAiBusy(false);
      setAgentRunning(false);
    }
  };

  const approveChange = async (change: Change) => {
    if (!ready) {
      setTab('settings');
      notify('先连接 GitHub');
      return;
    }
    setSaving(true);
    try {
      const target = change.path.trim().replace(/^\\/+|\\/+$/g, '');
      const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + target.split('/').map(encodeURIComponent).join('/');
      let existing: any = null;
      try { existing = await github(url + '?ref=' + encodeURIComponent(branch), token); } catch {}
      const body: any = {
        message: 'Studio: apply Meme change ' + target,
        content: encodeBase64(change.content),
        branch,
      };
      if (existing?.sha) body.sha = existing.sha;
      await github(url, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setChanges(previous => previous.filter(item => item.path !== change.path));
      notify('已批准并写入 GitHub：' + target);
      await list(path);
    } catch (error) {
      notify(error instanceof Error ? error.message : '应用修改失败');
    } finally {
      setSaving(false);
    }
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
            {agentRunning && <div className="p-3 rounded-2xl bg-[#292724] text-white text-[8px] font-mono">{agentEvents.length ? agentEvents.map((item, index) => <div key={index}>{item}</div>) : 'MEME · inspecting project…'}</div>}
            {!ready && <div className="p-3 rounded-2xl bg-[#fff4f1] text-[9px]">还没连接 GitHub。去 Settings 填 Token，就可以直接维护项目。</div>}
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
            <div className="p-3 rounded-2xl bg-[#ebe6de] text-[9px]"><b>Changes</b><div className="mt-1 text-[#777069]">AI 的修改先在这里预览，不会自动写 GitHub。</div></div>\n            {changes.length > 0 && <div className="p-3 rounded-2xl bg-white/60 border border-black/5"><div className="text-[8px] font-mono tracking-[1.5px] text-[#8b8782]">REVIEW · {sessionTitle}</div><div className="mt-2 space-y-1 text-[8px]">{taskSteps.map((step, i) => <div key={step} className="flex gap-2"><span>{i < 2 ? '✓' : i === 2 ? '•' : '○'}</span><span>{step}</span></div>)}</div></div>
            {changes.map(change => (
              <div key={change.path} className="p-3 rounded-2xl bg-white/65 border border-black/5">
                <div className="flex items-center gap-2"><div className="text-[9px] font-mono truncate flex-1">{change.path}</div>{change.risk && <span className="text-[7px] px-1.5 py-0.5 rounded-full bg-black/5">{change.risk} risk</span>}</div>{change.reason && <div className="mt-1 text-[8px] text-[#777069]">{change.reason}</div>}
                <pre className="mt-2 max-h-28 overflow-hidden rounded-xl bg-[#252422] text-[#ddd] p-2 text-[7px] whitespace-pre-wrap">{change.content.slice(0, 1000)}</pre>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  <button onClick={() => { setFile({ name: change.path.split('/').pop() || change.path, path: change.path, type: 'file' }); setCode(change.content); setOriginal(''); setTab('files'); }} className="py-2 rounded-lg bg-white text-[#292724] text-[9px]">查看 / 编辑</button>
                  <button disabled={saving} onClick={() => void approveChange(change)} className="py-2 rounded-lg bg-[#292724] text-white text-[9px] disabled:opacity-40">批准并写入</button>
                </div>
              </div>
            ))}
            {!changes.length && <div className="py-12 text-center text-[9px] text-[#888]">暂无 AI 修改草案。</div>}
          </section>
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

      <nav className="absolute bottom-0 left-0 right-0 z-30 px-2 pb-3 pt-2 bg-[#f7f4ee]/95 border-t border-black/10 grid grid-cols-5 gap-1">
        {tabButton('chat', 'Chat', MessageCircle)}
        {tabButton('files', 'Files', FileCode2)}
        {tabButton('changes', 'Changes', Upload)}
        {tabButton('admin', 'Admin', ShieldAlert)}
        {tabButton('settings', 'Settings', KeyRound)}
      </nav>
    </div>
  );
}
