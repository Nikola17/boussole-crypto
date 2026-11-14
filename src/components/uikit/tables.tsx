import { clsx } from 'clsx';
import { type ReactNode } from 'react';
// Tableau simple : l'ossature des listes en lignes (découpage du grand ui.tsx, lot 18).

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('-mx-4 overflow-x-auto sm:mx-0', className)}>
      <table className="tnum w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} className={clsx('whitespace-nowrap px-3 py-2 font-medium first:pl-4 last:pr-4 sm:first:pl-3 sm:last:pr-3', i > 0 && 'text-right')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, left }: { children: ReactNode; className?: string; left?: boolean }) {
  return <td className={clsx('whitespace-nowrap border-b border-line px-3 py-2.5 first:pl-4 last:pr-4 sm:first:pl-3 sm:last:pr-3', !left && 'text-right', className)}>{children}</td>;
}
