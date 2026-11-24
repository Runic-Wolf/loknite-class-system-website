import { useEffect, useRef, useState } from 'react';
import { ApiError, uploadMedia } from '../app/api';
import styles from './media-upload.module.css';

const maxFileSize = 12 * 1024 * 1024;

type Props = {
  id: string;
  label: string;
  value: string;
  hint: string;
  maxLength?: number | undefined;
  error?: string | undefined;
  disabled?: boolean | undefined;
  onChange: (path: string) => void;
  onUploadingChange?: ((uploading: boolean) => void) | undefined;
  onPreviewChange?: ((url: string | null) => void) | undefined;
  onOpenFilePickerChange?: ((open: (() => void) | null) => void) | undefined;
};

function mediaUrl(path: string): string {
  return `/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function uploadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return 'The team session is missing. Sign in again before uploading.';
  if (error instanceof ApiError && error.status === 422) return 'Use a valid PNG, JPEG, or WebP image.';
  if (error instanceof ApiError && error.status === 413) return 'This image is larger than the server upload limit.';
  if (error instanceof Error) return error.message;
  return 'The image could not be uploaded. Try again.';
}

export function MediaUploadField({ id, label, value, hint, maxLength = 1024, error, disabled = false, onChange, onUploadingChange, onPreviewChange, onOpenFilePickerChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [uploadFailure, setUploadFailure] = useState('');
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    onOpenFilePickerChange?.(() => input.current?.click());
    return () => onOpenFilePickerChange?.(null);
  }, [onOpenFilePickerChange]);

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    onPreviewChange?.(null);
  }

  async function upload() {
    if (!file || uploading || disabled) return;
    setUploading(true);
    onUploadingChange?.(true);
    setStatus('Uploading artwork…');
    setUploadFailure('');
    try {
      const result = await uploadMedia(file);
      onChange(result.path);
      setFile(null);
      clearPreview();
      if (input.current) input.current.value = '';
      setStatus('Artwork uploaded and linked to this draft. Save the record to keep the change.');
    } catch (reason) {
      setStatus('');
      setUploadFailure(uploadError(reason));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function selectFile(selected: File | undefined) {
    clearPreview();
    setFile(null);
    setStatus('');
    setUploadFailure('');
    if (!selected) return;
    if (selected.size > maxFileSize) {
      setUploadFailure('Choose an image up to 12 MiB.');
      if (input.current) input.current.value = '';
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)) {
      setUploadFailure('Choose a PNG, JPEG, or WebP image.');
      if (input.current) input.current.value = '';
      return;
    }
    setFile(selected);
    previewUrl.current = URL.createObjectURL(selected);
    onPreviewChange?.(previewUrl.current);
  }

  return <div className={styles.field}>
    <label htmlFor={`${id}-path`}>{label}</label>
    <input
      id={`${id}-path`}
      value={value}
      onChange={event => { clearPreview(); setFile(null); onChange(event.target.value); setStatus(''); }}
      autoComplete="off"
      maxLength={maxLength}
      disabled={disabled || uploading}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : `${id}-hint`}
    />
    {value && <div className={styles.preview}>
      <img src={mediaUrl(value)} alt="" loading="lazy" />
      <code title={value}>{value}</code>
      <button className="button button-quiet" type="button" onClick={() => { clearPreview(); setFile(null); onChange(''); setStatus(''); }} disabled={disabled || uploading}>Clear path</button>
    </div>}
    <div className={styles.uploadRow}>
      <input
        ref={input}
        className={styles.fileInput}
        id={`${id}-file`}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={event => selectFile(event.currentTarget.files?.[0])}
        disabled={disabled || uploading}
        aria-describedby={`${id}-upload-hint`}
      />
      <label className="button button-quiet" htmlFor={`${id}-file`}>Choose artwork</label>
      <button className="button button-primary" type="button" onClick={() => void upload()} disabled={!file || disabled || uploading}>
        {uploading ? 'Uploading…' : 'Upload to vault'}
      </button>
      {file && <span className={styles.fileName} title={file.name}>{file.name}</span>}
    </div>
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    <small id={`${id}-upload-hint`}>PNG, JPEG, or WebP · up to 12 MiB. Uploads are stored immediately in the vault and remain there if this form is canceled.</small>
    {error && <small id={`${id}-error`} className={styles.error} role="alert">{error}</small>}
    {status && <small className={styles.status} role="status" aria-live="polite">{status}</small>}
    {uploadFailure && <small className={styles.error} role="alert">{uploadFailure}</small>}
  </div>;
}
