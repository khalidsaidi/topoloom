import { formatBuildDate, shortSha, useBuildInfo } from '@/lib/buildInfo';
import { cn } from '@/lib/utils';

export type BuildFooterProps = {
  immersive?: boolean;
  className?: string;
};

export function BuildFooter({ immersive = false, className }: BuildFooterProps) {
  const info = useBuildInfo();
  const sha = info.gitSha ?? 'unknown';
  const short = shortSha(sha);
  const date = formatBuildDate(info.builtAt);
  const version = info.libraryVersion ?? 'unknown';
  const commitUrl = sha && sha !== 'unknown' ? `https://github.com/khalidsaidi/topoloom/commit/${sha}` : null;

  return (
    <footer
      className={cn(
        immersive
          ? 'pointer-events-auto rounded-md border border-slate-400/30 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-300 backdrop-blur'
          : 'mt-8 border-t pt-4 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>TopoLoom v{version}</span>
        <span>•</span>
        {commitUrl ? (
          <a href={commitUrl} target="_blank" rel="noreferrer" title={`${sha} (${info.gitRef ?? 'unknown'})`}>
            {short}
          </a>
        ) : (
          <span>{short}</span>
        )}
        <span>•</span>
        <span>{date}</span>
      </div>
    </footer>
  );
}
