import { useState } from 'react';
import { apiErrorMessage } from '../../ui/feedback';
import type { DatabaseResource } from './DatabaseTable';
import { requestCatalogCsv } from './export-csv';
import styles from './database.module.css';

export function ExportCsvButton({ resource, params, columns }: {
  resource: DatabaseResource;
  params: URLSearchParams;
  columns: string[];
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function download() {
    if (pending) return;
    setPending(true);
    setMessage('');
    setError('');
    try {
      const { blob, filename } = await requestCatalogCsv(resource, params, columns);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage('CSV downloaded with the filtered results across all pages and the visible columns.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return <div className={styles.csvExport}>
    <button className="button button-quiet" type="button" onClick={() => void download()} disabled={pending}>
      {pending ? 'Preparing CSV…' : 'Export CSV'}
    </button>
    {error && <span className={styles.csvError} role="alert">{error}</span>}
    {message && !error && <span className={styles.csvStatus} role="status">{message}</span>}
  </div>;
}
