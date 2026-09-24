import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TextEditorModal } from '../../../components/files/TextEditorModal';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('TextEditorModal Component', () => {
  const mockFile = {
    name: 'README.md',
    path: '/DATA/README.md',
    is_dir: false,
    size: 1024,
    modified: '2026-08-22T10:05:00Z',
    extension: 'md'
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((_url: string, opts?: any) => {
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ content: '# Saturn Dashboard\n\nWelcome to **Saturn**!' }),
      });
    }));
  });

  it('renders editor with loaded content and allows switching to preview mode for markdown', async () => {
    render(<TextEditorModal file={mockFile} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByText('README.md')).toBeTruthy();
    const textarea = await screen.findByTestId('text-editor-area') as HTMLTextAreaElement;
    expect(textarea.value).toContain('# Saturn Dashboard');

    // Check preview button exists for .md file
    const previewTab = screen.getByTestId('tab-preview');
    expect(previewTab).toBeTruthy();

    fireEvent.click(previewTab);

    // Markdown preview should render formatted header
    expect(await screen.findByText('Saturn Dashboard')).toBeTruthy();
  });

  it('allows editing and saving content', async () => {
    const onSaved = vi.fn();
    render(<TextEditorModal file={mockFile} onClose={vi.fn()} onSaved={onSaved} />);

    const textarea = await screen.findByTestId('text-editor-area');
    fireEvent.change(textarea, { target: { value: '# Updated Content' } });

    const saveBtn = screen.getByTestId('save-text-btn');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/files/content'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            path: '/DATA/README.md',
            content: '# Updated Content',
          }),
        })
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('supports HTML preview mode for .html files', async () => {
    const htmlFile = {
      name: 'index.html',
      path: '/DATA/index.html',
      is_dir: false,
      size: 512,
      modified: '2026-08-22T10:05:00Z',
      extension: 'html'
    };

    render(<TextEditorModal file={htmlFile} onClose={vi.fn()} />);

    const previewTab = await screen.findByTestId('tab-preview');
    fireEvent.click(previewTab);

    const htmlPreview = await screen.findByTestId('html-preview-frame');
    expect(htmlPreview).toBeTruthy();
  });

  it('handles 412 conflict by opening FileConflictModal and allows reloading from disk', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, opts?: any) => {
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          status: 412,
          ok: false,
          json: () => Promise.resolve({
            error: 'Conflict',
            current_content: '# Remote Server Edit\nNew lines from another user',
            current_etag: 'etag-remote-123'
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: '# Initial Content',
          etag: 'etag-initial-001'
        }),
      });
    }));

    render(<TextEditorModal file={mockFile} onClose={vi.fn()} onSaved={vi.fn()} />);

    const textarea = await screen.findByTestId('text-editor-area') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# Initial Content');

    fireEvent.change(textarea, { target: { value: '# My Local Edit' } });
    const saveBtn = screen.getByTestId('save-text-btn');
    fireEvent.click(saveBtn);

    // Conflict modal should appear
    expect(await screen.findByText('Conflito de Versão Detectado')).toBeTruthy();
    expect(screen.getByText(/Remote Server Edit/)).toBeTruthy();

    // Click Reload from disk
    const reloadBtn = screen.getByText('Recarregar do Disco');
    fireEvent.click(reloadBtn);

    // Conflict modal closes and textarea updates with server content
    await waitFor(() => {
      expect(screen.queryByText('Conflito de Versão Detectado')).toBeNull();
      expect(textarea.value).toBe('# Remote Server Edit\nNew lines from another user');
    });
  });

  it('handles 412 conflict and allows force overwrite', async () => {
    let putCount = 0;
    vi.stubGlobal('fetch', vi.fn((_url: string, opts?: any) => {
      if (opts?.method === 'PUT') {
        putCount++;
        if (putCount === 1) {
          return Promise.resolve({
            status: 412,
            ok: false,
            json: () => Promise.resolve({
              error: 'Conflict',
              current_content: '# Remote Server Edit',
              current_etag: 'etag-remote-123'
            }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ success: true, new_etag: 'etag-force-001' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: '# Initial Content',
          etag: 'etag-initial-001'
        }),
      });
    }));

    render(<TextEditorModal file={mockFile} onClose={vi.fn()} onSaved={vi.fn()} />);

    const textarea = await screen.findByTestId('text-editor-area') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '# My Local Edit' } });

    const saveBtn = screen.getByTestId('save-text-btn');
    fireEvent.click(saveBtn);

    // Conflict modal should appear
    expect(await screen.findByText('Conflito de Versão Detectado')).toBeTruthy();

    // Click Force Overwrite
    const overwriteBtn = screen.getByText('Sobrescrever Servidor');
    fireEvent.click(overwriteBtn);

    // Second PUT with force: true
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/files/content'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            path: '/DATA/README.md',
            content: '# My Local Edit',
            force: true,
          }),
        })
      );
      expect(screen.queryByText('Conflito de Versão Detectado')).toBeNull();
    });
  });
});
