import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  islandName: string;
  notifyMessage: string;
  fallback: ReactNode;
}

interface State {
  error: unknown;
}

export class ReactIslandErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    console.error(`[${this.props.islandName}/React]`, error);
    window.GrconNotify?.(this.props.notifyMessage, "error");
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
