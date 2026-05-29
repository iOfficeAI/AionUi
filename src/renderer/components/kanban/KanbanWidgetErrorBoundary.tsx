import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class KanbanWidgetErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[KanbanWidget] crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "12px 14px",
            fontSize: "11px",
            color: "var(--nk-rose, #fb7185)",
            background: "var(--nk-card, #111827)",
            border: "1px solid var(--nk-border, #1f2937)",
            borderRadius: "10px",
            fontFamily: "var(--nk-font, monospace)",
          }}
        >
          ⚠️ Kanban widget unavailable
        </div>
      );
    }
    return this.props.children;
  }
}
