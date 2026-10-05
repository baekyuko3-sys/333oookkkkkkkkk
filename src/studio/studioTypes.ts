export type StudioTab = 'build' | 'files' | 'crafted' | 'changes' | 'git' | 'settings';

export type StudioChangeStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export type StudioChange = {
  id: string;
  operation: 'create' | 'update' | 'delete';
  path: string;
  content?: string;
  originalContent?: string;
  reason: string;
  risk: 'low' | 'medium' | 'high';
  status: StudioChangeStatus;
  createdAt: number;
};

export type StudioCodingMode = 'always-ask' | 'confirm-before-commit' | 'auto';

export type StudioSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{ role: 'user' | 'meme' | 'system'; text: string }>;
};

export type StudioGitTarget = {
  owner: string;
  repo: string;
  branch: string;
};
