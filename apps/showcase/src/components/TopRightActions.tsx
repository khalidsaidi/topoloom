import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/ui/Button';
import { cn } from '@/lib/utils';

export type TopRightActionsProps = {
  visible: boolean;
  onControls: () => void;
  onReport: () => void;
  className?: string;
};

export function TopRightActions({ visible, onControls, onReport, className }: TopRightActionsProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn('pointer-events-auto fixed right-3 top-3 z-30 flex items-center gap-2', className)}
        >
          <Button
            variant="secondary"
            size="sm"
            aria-label="Open controls"
            onClick={onControls}
          >
            Controls
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Open report"
            onClick={onReport}
          >
            Report
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
