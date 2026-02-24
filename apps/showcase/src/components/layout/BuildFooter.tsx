import { formatBuildDate, shortSha, useBuildInfo } from '@/lib/buildInfo';

export function BuildFooter() {
  const info = useBuildInfo();
  const sha = info.gitSha ?? 'unknown';
  const short = shortSha(sha);
  const date = formatBuildDate(info.builtAt);
  const version = info.libraryVersion ?? 'unknown';
  const commitUrl = sha && sha !== 'unknown' ? `https://github.com/khalidsaidi/topoloom/commit/${sha}` : null;

  return (
    <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
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
