import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('Uncaught UI Error:', error, errorInfo);
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090A0F] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#111218] border border-white/[0.08] rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Something went wrong
            </h1>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              An unexpected display error occurred. Your financial ledger and account balances remain safe.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Finora Dashboard</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
