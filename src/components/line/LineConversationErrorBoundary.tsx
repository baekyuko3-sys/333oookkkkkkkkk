import { Component, type ErrorInfo, type ReactNode } from 'react';

export class LineConversationErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LINE] conversation render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="w-full h-full bg-white flex items-center justify-center px-7">
        <div className="w-full max-w-[320px] rounded-2xl border border-[#eee] bg-[#fafafa] p-6 text-center">
          <div className="text-sm font-semibold text-[#292724]">聊天暂时无法打开</div>
          <div className="mt-2 text-xs leading-5 text-[#999]">聊天数据没有被删除。返回 LINE 后可以重新进入。</div>
          <button onClick={this.props.onBack} className="mt-5 px-5 py-2.5 rounded-full bg-[#292724] text-white text-xs">返回好友</button>
        </div>
      </div>
    );
  }
}
