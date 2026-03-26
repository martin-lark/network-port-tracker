import React, { useState, useEffect } from 'react';
import * as api from '../api.js';

export function ExportPanel({ hostId, hosts }) {
  const [format, setFormat] = useState('markdown');
  const [scope, setScope] = useState(hostId ? 'host' : 'all');
  const [clientFilter, setClientFilter] = useState('');
  const [preview, setPreview] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = {};
    if (scope === 'host' && hostId) params.host_id = hostId;
    if (scope === 'client' && clientFilter) params.client = clientFilter;
    api.exportData(format, params).then(setPreview).catch(() => setPreview('Export failed'));
  }, [format, scope, hostId, clientFilter]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="export-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <strong>Export</strong>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {copied && <span className="copy-success">Copied!</span>}
          <button className="btn btn-primary btn-sm" onClick={handleCopy}>Copy to Clipboard</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Format</div>
          <div className="export-options">
            {['markdown', 'csv', 'text'].map((f) => (
              <button key={f} className={`export-option ${format === f ? 'active' : ''}`} onClick={() => setFormat(f)}>
                {f === 'markdown' ? 'Markdown' : f === 'csv' ? 'CSV' : 'Plain Text'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Scope</div>
          <div className="export-options">
            {hostId && <button className={`export-option ${scope === 'host' ? 'active' : ''}`} onClick={() => setScope('host')}>This Host</button>}
            <button className={`export-option ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All Hosts</button>
            <button className={`export-option ${scope === 'client' ? 'active' : ''}`} onClick={() => setScope('client')}>By Client</button>
          </div>
        </div>
        {scope === 'client' && <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Client</div>
          <input className="search-input" style={{ width: '200px' }} value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)} placeholder="Client name..." />
        </div>}
      </div>
      <div className="export-preview">{preview}</div>
    </div>
  );
}
