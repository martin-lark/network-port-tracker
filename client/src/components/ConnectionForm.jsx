import React, { useState } from 'react';
import * as api from '../api.js';

// Minimal form shown after drag-to-connect on the network map.
// Lets the user pick a connection type and optional label before
// creating the connection between two devices.
const CONNECTION_TYPES = ['ethernet', 'wifi', 'tunnel', 'fiber', 'usb'];

export function ConnectionForm({ sourceId, targetId, onClose, onConnectionCreated }) {
  const [connectionType, setConnectionType] = useState('ethernet');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createConnection({
        source_device_id: Number(sourceId),
        target_device_id: Number(targetId),
        connection_type: connectionType,
        label: label || null,
      });
      onConnectionCreated();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to create connection');
    }
    setSaving(false);
  };

  return (
    <div className="add-device-overlay" onClick={onClose}>
      <form className="connection-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>New Connection</h3>
        <select className="search-input" value={connectionType} onChange={(e) => setConnectionType(e.target.value)}>
          {CONNECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          className="search-input"
          placeholder="Label (optional, e.g. Port 1 → Port 3)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {error && <div className="add-device-error">{error}</div>}
        <div className="add-device-actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
            {saving ? 'Creating...' : 'Create Connection'}
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
