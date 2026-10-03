import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('🔥 [Faisaa UI ErrorBoundary Caught]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleResetSession = () => {
    localStorage.removeItem('faisaa_token');
    localStorage.removeItem('finora_token');
    window.location.href = '/login';
  };

  override render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || String(this.state.error);
      const stack = this.state.error?.stack || this.state.errorInfo?.componentStack;

      return (
        <div className="min-h-screen bg-[#090A0F] text-white flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-lg w-full bg-[#111218] border border-white/[0.08] rounded-2xl p-6 sm:p-8 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>

            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                Something went wrong
              </h1>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                An unexpected display error occurred. Your financial ledger and account balances remain safe.
              </p>
            </div>

            {errorMsg && (
              <div className="text-left bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300 font-mono break-all">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Dashboard</span>
              </button>
              <button
                type="button"
                onClick={this.handleResetSession}
                className="py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Sign In Again
              </button>
            </div>

            {stack && (
              <div className="pt-2 text-left">
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer mx-auto"
                >
                  <span>{this.state.showDetails ? 'Hide' : 'Show'} technical error trace</span>
                  {this.state.showDetails ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {this.state.showDetails && (
                  <pre className="mt-2 p-3 rounded-lg bg-black/50 border border-white/[0.06] text-[10px] text-zinc-400 overflow-x-auto max-h-48 font-mono">
                    {stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
