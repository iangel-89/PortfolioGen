import { Info, Scale, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { UserNotice } from '../../shared/types';

const ICONS = {
  legal: Scale,
  confidentiality: ShieldAlert,
  evidence: Info,
  quality: TriangleAlert,
} as const;

/**
 * Things the user needs to know but that are not errors: a regulated profession,
 * work under NDA, thin evidence. Stated once, plainly, without alarm.
 */
export function Notices({ notices }: { notices: UserNotice[] }) {
  if (!notices.length) return null;

  return (
    <div className="space-y-2 px-4 pt-4 sm:px-8">
      {notices.map((notice, index) => {
        const Icon = ICONS[notice.kind] ?? Info;
        return (
          <div
            key={`${notice.kind}-${index}`}
            className="animate-fade mx-auto flex max-w-2xl gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <p className="text-[13px] leading-relaxed text-muted">{notice.message}</p>
          </div>
        );
      })}
    </div>
  );
}
