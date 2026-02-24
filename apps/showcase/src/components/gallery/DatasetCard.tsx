import { Link } from 'react-router-dom';

import type { DatasetDef } from '@/data/datasets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export type DatasetCardProps = {
  dataset: DatasetDef;
};

export function DatasetCard({ dataset }: DatasetCardProps) {
  const defaultSample = dataset.sampleFiles[0];

  return (
    <Card className="border-muted/60 bg-background/90">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{dataset.domain}</Badge>
          <span className="text-xs text-muted-foreground">{dataset.id}</span>
        </div>
        <CardTitle className="text-lg">{dataset.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{dataset.description}</p>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="mb-1 font-medium text-foreground">Why it’s hard</div>
          <ul className="space-y-1 text-muted-foreground">
            {dataset.whyHard.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-1 text-muted-foreground">
          {dataset.originalStats ? (
            <div>
              Original: {dataset.originalStats.nodes.toLocaleString()} nodes •{' '}
              {dataset.originalStats.edges.toLocaleString()} edges
            </div>
          ) : null}
          {defaultSample?.stats ? (
            <div>
              Sample: {defaultSample.stats.nodes.toLocaleString()} nodes •{' '}
              {defaultSample.stats.edges.toLocaleString()} edges
            </div>
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <a className="text-xs text-muted-foreground underline" href={dataset.sourceUrl} target="_blank" rel="noreferrer">
          Source
        </a>
        <Button asChild>
          <Link to={`/gallery/${dataset.id}?sample=${encodeURIComponent(defaultSample?.id ?? '')}`}>Open</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
