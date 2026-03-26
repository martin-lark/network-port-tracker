import React, { useState } from 'react';
import * as api from '../api.js';

export function PortTable({ ports, onPortUpdated, onEditPort }) {
  const [sortField, setSortField] = useState('port_number');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sorted = [...ports].sort((a, b) => {
    const aVal = a[sortField] ?? ''; const bVal = b[sortField] ?? '';
    const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleStatus = async (port) => {
    await api.updatePort(port.id, { status: port.status === 'active' ? 'inactive' : 'active' });
    onPortUpdated();
  };

  const handleDelete = async (port) => {
    if (!confirm(`Delete port ${port.port_number} (${port.service_name})?`)) return;
    await api.deletePort(port.id); onPortUpdated();
  };

  const formatPort = (p) => p.port_end ? `${p.port_number}-${p.port_end}` : p.port_number;
  const renderTags = (tagsStr) => {
    try { return JSON.parse(tagsStr || '[]').map((t, i) => <span key={i} className="tag">{t}</span>); }
    catch { return null; }
  };

  const columns = [
    { key: 'port_number', label: 'Port' }, { key: 'service_name', label: 'Service' },
    { key: 'protocol', label: 'Protocol' }, { key: 'status', label: 'Status' },
    { key: 'client', label: 'Client' }, { key: 'domain', label: 'Domain' },
    { key: 'tunnel', label: 'Tunnel' }, { key: 'tags', label: 'Tags' }, { key: 'notes', label: 'Notes' },
  ];

  return (
    <table className="port-table">
      <thead><tr>
        {columns.map((col) => (
          <th key={col.key} onClick={() => handleSort(col.key)}>
            {col.label} {sortField === col.key ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
          </th>
        ))}
        <th></th>
      </tr></thead>
      <tbody>
        {sorted.map((port) => (
          <tr key={port.id}>
            <td><span className="port-number">{formatPort(port)}</span></td>
            <td>{port.service_name}</td>
            <td style={{ color: 'var(--text-muted)' }}>{port.protocol}</td>
            <td><span className={`status-badge ${port.status === 'active' ? 'status-active' : 'status-inactive'}`}
              onClick={() => toggleStatus(port)}>{port.status}</span></td>
            <td>{port.client || ''}</td><td>{port.domain || ''}</td>
            <td>{port.tunnel ? <span className="tunnel-badge">{port.tunnel}</span> : ''}</td>
            <td>{renderTags(port.tags)}</td>
            <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{port.notes || ''}</td>
            <td><div className="cell-actions">
              {onEditPort && <button className="btn btn-secondary btn-sm" onClick={() => onEditPort(port)}>Edit</button>}
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(port)}>Delete</button>
            </div></td>
          </tr>
        ))}
        {sorted.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No ports yet. Click "Add Port" to get started.</td></tr>}
      </tbody>
    </table>
  );
}
