'use client';
import React from 'react';

export function MountLog({ name, children }: { name: string; children: React.ReactNode }) {
  React.useEffect(() => {
    // mount/unmount logu
    // eslint-disable-next-line no-console
    console.log(`[Provider mount] ► ${name}`);
    return () => console.log(`[Provider unmount] ◄ ${name}`);
  }, [name]);
  return <>{children}</>;
}

class ProviderBoundaryImpl extends React.Component<
  { name: string; children: React.ReactNode },
  { err?: Error }
> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error(`[ProviderBoundary error] ${this.props.name}`, err);
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 16, background: '#2a1f1f', color: '#ffb4b4' }}>
          ⚠️ Provider crashed: <b>{this.props.name}</b>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}
export function ProviderBoundary(props: { name: string; children: React.ReactNode }) {
  return (
    <ProviderBoundaryImpl name={props.name}>
      <MountLog name={props.name}>{props.children}</MountLog>
    </ProviderBoundaryImpl>
  );
}
