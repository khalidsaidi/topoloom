import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export type ComputeStatusBadgeProps = {
  computing: boolean;
  label: string;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
};

export function ComputeStatusBadge({
  computing,
  label,
  variant = 'secondary',
}: ComputeStatusBadgeProps) {
  return (
    <Badge variant={computing ? 'secondary' : variant} className={computing ? 'gap-2' : undefined}>
      {computing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {computing ? 'Computing…' : label}
    </Badge>
  );
}
