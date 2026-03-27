import React, { useState } from 'react';
import * as api from '../api.js';

const CONNECTION_TYPES = ['ethernet', 'wifi', 'tunnel', 'fiber', 'usb'];

export function ConnectionPopover({ connection, onClose, onConnectionUpdated, onConnectionDeleted }) {
  const [connectionType, setConnectionType] = useState(connection.connection_type);
  const [label, setLabel] = useState(connection.label || '');
  const [speed, setSpeed] = useState(connection.speed || '');
  const [notes, setNotes] = useState(connection.notes || '');

  const handleSave = async (field, value) => {
    await api.updateConnection(connection.id, { [field]: value || null });
    onConnectionUpdated();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this connection?')) return;
    await api.deleteConnection(connection.id);
    onConnectionDeleted();
  };

  return (
    <div className="connection-popover">
      <div className="device-popover-header">
        <strong>Connection</strong>
        <button className="btn btn-danger btn-sm" onClick={onClose}>&times;</button>
      </div>

      <div className="device-popover-details">
        <div><span className="device-popover-label">From:</span> {connection.source_name} ({connection.source_ip})</div>
        <div><span className="device-popover-label">To:</span> {connection.target_name} ({connection.target_ip})</div>
      </div>

      <div className="connection-popover-fields">
        <div className="connection-popover-field">
          <label className="device-popover-label">Type</label>
          <select className="search-input" value={connectionType}
            onChange={(e) => { setConnectionType(e.target.value); handleSave('connection_type', e.target.value); }}>
            {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="connection-popover-field">
          <label className="device-popover-label">Label</label>
          <input className="search-input" value={label} placeholder="e.g. Port 1 → Port 3"
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => handleSave('label', label)} />
        </div>
        <div className="connection-popover-field">
          <label className="device-popover-label">Speed</label>
          <input className="search-input" value={speed} placeholder="e.g. 1Gbps"
            onChange={(e) => setSpeed(e.target.value)}
            onBlur={() => handleSave('speed', speed)} />
        </div>
        <div className="connection-popover-field">
          <label className="device-popover-label">Notes</label>
          <textarea className="search-input" value={notes} placeholder="Notes..."
            rows={2} onChange={(e) => setNotes(e.target.value)}
            onBlur={() => handleSave('notes', notes)} />
        </div>
      </div>

      <div className="device-popover-actions">
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete Connection</button>
      </div>
    </div>
  );
}
