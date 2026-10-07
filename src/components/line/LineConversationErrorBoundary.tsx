import { Component, type ErrorInfo, type ReactNode } from 'react';

export class LineConversationErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { hasError: boolean; errorMessage: string; componentStack: string }
> {
  state = { hasError: false, errorMessage: '', componentStack: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown render error', componentStack: '' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LINE] conversation render error', error, info);
    this.setState({
      hasError: true,
      errorMessage: error?.stack || error?.message || 'Unknown render error',
      componentStack: info?.componentStack || '',
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const debugText = [this.state.errorMessage, this.state.componentStack].filter(Boolean).join('\n');
    return (
      <div className="w-full h-full bg-white flex items-center justify-center px-7 overflow-hidden">
        <div className="w-full max-w-[320px] rounded-2xl border border-[#eee] bg-[#fafafa] p-6 text-center">
          <div className="text-sm font-semibold text-[#292724]">聊天暂时无法打开</div>
          <div className="mt-2 text-xs leading-5 text-[#999]">聊天数据没有被删除。返回 LINE 后可以重新进入。</div>
          <pre className="mt-3 max-h-40 overflow-auto px-3 py-2 rounded-xl bg-[#f1f1f1] text-left text-[8px] leading-4 text-[#888] whitespace-pre-wrap break-all">{debugText}</pre>
          <button onClick={this.props.onBack} className="mt-5 px-5 py-2.5 rounded-full bg-[#292724] text-white text-xs">返回好友</button>
        </div>
      </div>
    );
  }
}
