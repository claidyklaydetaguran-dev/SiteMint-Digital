import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: string; }

export class CrmErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(err: unknown): State {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, error: msg };
  }

  componentDidCatch(err: unknown, info: { componentStack: string }) {
    if (import.meta.env.DEV) {
      console.error("[CRM ErrorBoundary]", err, info.componentStack);
    }
  }

  reset = () => this.setState({ hasError: false, error: "" });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl border border-red-100 shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6">
            A CRM page crashed unexpectedly. Click below to try again.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-[11px] bg-red-50 text-red-700 rounded-lg p-3 mb-4 overflow-auto max-h-32 whitespace-pre-wrap">
              {this.state.error}
            </pre>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.reset}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
            <a
              href="/admin/crm"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
