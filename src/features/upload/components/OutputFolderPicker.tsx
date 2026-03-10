// src/features/upload/components/OutputFolderPicker.tsx
/**
 * Output Folder Picker — native OS folder dialog for selecting
 * the auto-save directory. Persists output_directory in ti_settings via API.
 *
 * Jaskier Shared Pattern — uses native Windows FolderBrowserDialog via backend.
 */

import { cn } from '@jaskier/ui';
import { CheckCircle, FolderOpen, HardDrive, Loader2, Pencil, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge, Button, Card, Input } from '@/components/atoms';
import { apiPost } from '@/shared/api/client';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/shared/hooks/useSettings';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

// ============================================================================
// OUTPUT FOLDER PICKER (Card UI)
// ============================================================================

interface OutputFolderPickerProps {
  savedCount?: number;
  totalCount?: number;
}

export const OutputFolderPicker = memo<OutputFolderPickerProps>(({ savedCount, totalCount }) => {
  const { t } = useTranslation();
  const theme = useViewTheme();

  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();

  const [browsing, setBrowsing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const outputDirectory = settings?.output_directory ?? '';

  useEffect(() => {
    setValue(outputDirectory);
  }, [outputDirectory]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  const saveFolder = useCallback(
    async (path: string) => {
      if (!settings) return;
      setSaving(true);
      try {
        await updateSettings.mutateAsync({ ...settings, output_directory: path });
        setValue(path);
        setEditing(false);
        toast.success(
          path ? t('upload.folderSaved', 'Output folder saved') : t('upload.folderCleared', 'Output folder cleared'),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [settings, updateSettings, t],
  );

  const handleBrowse = useCallback(async () => {
    setBrowsing(true);
    try {
      const res = await apiPost<{ path?: string; cancelled?: boolean; error?: string }>('/api/files/browse', {
        initial_path: outputDirectory || '',
      });
      if (res.error) {
        toast.error(res.error);
      } else if (res.path && !res.cancelled) {
        saveFolder(res.path);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open folder dialog');
    } finally {
      setBrowsing(false);
    }
  }, [outputDirectory, saveFolder]);

  const handleSave = useCallback(() => saveFolder(value.trim()), [value, saveFolder]);
  const handleClear = useCallback(() => saveFolder(''), [saveFolder]);
  const handleCancel = useCallback(() => {
    setValue(outputDirectory);
    setEditing(false);
  }, [outputDirectory]);

  // Extract folder name from full path for display
  const folderName = outputDirectory ? (outputDirectory.split(/[/\\]/).filter(Boolean).pop() ?? outputDirectory) : '';

  return (
    <Card>
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--matrix-accent)]/10">
              <HardDrive size={16} className="text-[var(--matrix-accent)]" />
            </div>
            <h3 className={cn('text-sm font-semibold font-mono', theme.text)}>
              {t('upload.outputFolderTitle', 'Auto-Save Folder')}
            </h3>
          </div>

          {savedCount !== undefined && totalCount !== undefined && totalCount > 0 && (
            <motion.div
              key={savedCount}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Badge
                variant={savedCount === totalCount ? 'accent' : 'default'}
                size="sm"
                icon={savedCount === totalCount ? <CheckCircle size={10} /> : <FolderOpen size={10} />}
              >
                {savedCount}/{totalCount} {t('upload.savedShort', 'saved')}
              </Badge>
            </motion.div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {editing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === 'Escape') handleCancel();
                }}
                placeholder="C:\Users\you\Photos"
                disabled={saving}
              />
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>
                  {t('common.save', 'Save')}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
                  {t('common.cancel', 'Cancel')}
                </Button>
              </div>
            </motion.div>
          ) : outputDirectory ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen size={18} className="text-[var(--matrix-accent)] flex-shrink-0" />
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium truncate', theme.text)} title={outputDirectory}>
                    {folderName}
                  </p>
                  <p className={cn('text-xs truncate', theme.textMuted)} title={outputDirectory}>
                    {outputDirectory}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={browsing ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                  onClick={handleBrowse}
                  disabled={browsing || saving}
                >
                  {browsing ? t('upload.openingDialog', 'Opening…') : t('upload.changeFolder', 'Change')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Pencil size={14} />}
                  onClick={() => setEditing(true)}
                  disabled={browsing || saving}
                >
                  {t('upload.editManually', 'Edit')}
                </Button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={saving}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
                  aria-label={t('upload.clearFolder')}
                >
                  <X size={14} className="text-red-400" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <p className={cn('text-sm', theme.textMuted)}>
                {t('upload.outputFolderHint', 'Select a folder to auto-save each restored photo as it completes.')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={browsing ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                onClick={handleBrowse}
                disabled={browsing || saving}
              >
                {browsing
                  ? t('upload.openingDialog', 'Opening…')
                  : t('upload.selectOutputFolder', 'Select Output Folder')}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
});

OutputFolderPicker.displayName = 'OutputFolderPicker';
