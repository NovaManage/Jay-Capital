'use client';
import { useState } from 'react';
import Link from 'next/link';
import { importLoansCSV } from '@/lib/actions';

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else field += c;
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(c => c.trim())).map(r => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

export default function ImportPage() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [results, setResults] = useState<{ loan: string; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState('');

  return (
    <div className="wrap">
      <p style={{ marginBottom: 12 }}><Link href="/admin">&larr; Back to Dashboard</Link></p>
      <div className="card">
        <h1 className="title">Import Loans from CSV</h1>
        <div className="rule" />
        <p className="muted">Export your Dashboard tab as CSV. Recognized columns: Loan ID, Borrower, Property,
          Loan Amount, Acquisition, Construction, Interest Rate, Closing Date, Lender. Missing Loan IDs are auto-assigned.</p>

        <input type="file" accept=".csv" onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return;
          setResults([]); setRows(parseCSV(await f.text()));
        }} />

        {rows.length > 0 && (
          <>
            <p style={{ marginTop: 16 }}><b>{rows.length}</b> rows parsed. Preview (first 5):</p>
            <div className="tablescroll">
              <table className="bordered">
                <thead><tr>{Object.keys(rows[0]).map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{Object.keys(rows[0]).map(h => <td key={h}>{r[h]}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <button className="btn" style={{ marginTop: 14 }} disabled={busy}
              onClick={async () => {
                setBusy(true); setImportError('');
                const res = await importLoansCSV(rows);
                if (!res.ok) setImportError(res.error || 'Import failed.');
                else setResults(res.data ?? []);
                setBusy(false);
              }}>
              {busy ? 'Importing…' : `Import ${rows.length} loans`}
            </button>
          </>
        )}

        {importError && <div className="alert error">{importError}</div>}

        {results.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h2 style={{ color: 'var(--navy)' }}>Results</h2>
            <table className="bordered">
              <thead><tr><th>Loan</th><th>Status</th></tr></thead>
              <tbody>{results.map((r, i) => (
                <tr key={i}><td>{r.loan}</td><td>{r.status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
