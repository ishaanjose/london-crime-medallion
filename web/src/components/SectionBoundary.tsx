import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: string | null };

export default class SectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: { componentStack: string }) {
    console.error("[SectionBoundary]", err, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3">
          <pre className="text-xs whitespace-pre-wrap text-red-700 dark:text-red-300 mb-2">
            {this.state.error}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs text-red-700 dark:text-red-300 underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
