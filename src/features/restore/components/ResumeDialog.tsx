// src/features/restore/components/ResumeDialog.tsx

import { Badge, Button, Card } from '@jaskier/ui';
import { History, Play, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { PipelineCheckpoint } from '@/features/restore/utils/pipelineCheckpoint';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';

interface ResumeDialogProps {
  checkpoint: PipelineCheckpoint;
  onResume: () => void;
  onDiscard: () => void;
}

export function ResumeDialog({ checkpoint, onResume, onDiscard }: ResumeDialogProps) {
  const theme = useViewTheme();
  const { t } = useTranslation();

  const minutesAgo = Math.round((Date.now() - checkpoint.savedAt) / 60_000);
  const completedCount = checkpoint.completedIndices.length;
  const remaining = checkpoint.totalCrops - completedCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <Card variant="glass" padding="md" className="ring-1 ring-amber-500/30">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-xl bg-amber-500/10')}>
            <History size={20} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={cn('text-sm font-bold mb-1', theme.title)}>
              {t('restore.resume.title', 'Pipeline przerwany')}
            </h3>
            <p className={cn('text-xs mb-2', theme.textMuted)}>
              {minutesAgo < 1
                ? t('restore.resume.justNow', 'Przed chwila')
                : t('restore.resume.minutesAgo', '{{minutes}} min temu', { minutes: minutesAgo })}
              {' — '}
              <Badge variant="accent" size="sm">
                {completedCount}/{checkpoint.totalCrops}
              </Badge>{' '}
              {t('restore.resume.completed', 'ukonczone')}
              {remaining > 0 && (
                <span className="ml-1">
                  ({remaining} {t('restore.resume.remaining', 'pozostalo')})
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" leftIcon={<Play size={14} />} onClick={onResume}>
                {t('restore.resume.resumeBtn', 'Wznow')}
              </Button>
              <Button variant="ghost" size="sm" leftIcon={<Trash2 size={14} />} onClick={onDiscard}>
                {t('restore.resume.discardBtn', 'Odrzuc')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
