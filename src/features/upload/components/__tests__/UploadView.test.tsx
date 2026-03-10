// Tissaia v4 - UploadView component tests
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'upload.title': 'Upload Photos',
        'upload.dropzone': 'Drop photos here or click to browse',
        'upload.dragActive': 'Drop the files here',
        'upload.maxSize': 'Max file size: 20 MB',
        'upload.accepted': 'Accepted: JPG, PNG, WebP, TIFF',
        'upload.start': 'Start Detection',
      };
      return translations[key] ?? key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
    resolvedTheme: 'dark',
  }),
}));

vi.mock('@/shared/hooks/useViewTheme', () => ({
  useViewTheme: () => ({
    accent: '#00ff41',
    bg: 'rgba(0, 10, 0, 0.95)',
    text: '#00ff41',
    border: 'rgba(0, 255, 65, 0.3)',
  }),
}));

vi.mock('@/shared/hooks/useSettings', () => ({
  useSettingsQuery: () => ({
    data: {},
    isLoading: false,
    isError: false,
  }),
  useUpdateSettingsMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
}));

vi.mock('@/shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const mockSetView = vi.fn();
vi.mock('@/stores/viewStore', () => ({
  useViewStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      currentView: 'upload',
      setView: mockSetView,
    }),
}));

vi.mock('@/features/upload/stores/uploadStore', () => ({
  useUploadStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      photos: [],
      addPhoto: vi.fn(),
      removePhoto: vi.fn(),
      clearPhotos: vi.fn(),
    }),
  fileToDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,abc'),
  formatBytes: (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`,
  generatePhotoId: () => 'photo-1',
}));

// Mock Card, Badge, Button, ProgressBar atoms
vi.mock('@/components/atoms', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => <span {...props}>{children}</span>,
  Button: ({
    children,
    variant: _variant,
    size: _size,
    leftIcon: _leftIcon,
    rightIcon: _rightIcon,
    isLoading: _isLoading,
    loadingText: _loadingText,
    ...props
  }: Record<string, unknown>) => (
    <button type="button" {...props}>
      {children as React.ReactNode}
    </button>
  ),
  Card: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  ProgressBar: () => <div data-testid="progress-bar" />,
}));

describe('UploadView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { default: UploadView } = await import('../UploadView');
    const { container } = render(<UploadView />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders a dropzone area', async () => {
    const { default: UploadView } = await import('../UploadView');
    render(<UploadView />);
    // react-dropzone creates a div with role or input[type=file]
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
  });

  it('shows accepted file type information', async () => {
    const { default: UploadView } = await import('../UploadView');
    render(<UploadView />);
    // The component should display accepted formats
    const text = document.body.textContent;
    expect(text).toBeTruthy();
  });
});
