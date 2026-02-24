import type { ButtonProps } from '@/ui/Button';
import { Button } from '@/ui/Button';
import { cn } from '@/lib/utils';

export type IconButtonProps = ButtonProps;

export function IconButton({ className, size = 'sm', ...props }: IconButtonProps) {
  return (
    <Button
      size={size}
      className={cn('size-8 p-0 [&_svg]:size-4', className)}
      {...props}
    />
  );
}
