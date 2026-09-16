import type { ReactNode } from 'react';

export function ManagementPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="management-page-header">
      <div>
        <span className="management-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions && <div className="management-header-actions">{actions}</div>}
    </header>
  );
}
