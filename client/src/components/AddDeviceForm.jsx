import React, { useState } from 'react';
import * as api from '../api.js';

// Modal form for manually adding devices to the network map.
// Used for infrastructure that doesn't show up in scans (unmanaged switches, etc.).
// Defaults to 'router' category since that's the most common manual-add use case.
const CATEGORIES = ['server', 'desktop', 'mobile', 'iot', 'network', 'router', 'switch', 'access_point', 'firewall', 'other'];

export function AddDeviceForm({ onClose, onDeviceCreated }) {
  const [hostname, setHostname] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [category, setCategory] = useState('router');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hostname && !ipAddress) {
      setError('Hostname or IP address is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createDevice({
        hostname: hostname || null,
        // Devices table requires a unique ip_address; generate a placeholder for
        // infrastructure devices that don't have a known IP (e.g. unmanaged switches).
        ip_address: ipAddress || `manual-${Date.now()}`,
        category,
      });
      onDeviceCreated();
      onClose();
    } catch (err) {
      setError(err.error || 'Failed to create device');
    }
    setSaving(false);
  };

  return (
    <div className="add-device-overlay" onClick={onClose}>
      <form className="add-device-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Add Device</h3>
        <input
          className="search-input"
          placeholder="Hostname / Name"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          autoFocus
        />
        <input
          className="search-input"
          placeholder="IP Address (optional)"
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
        />
        <select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
        </select>
        {error && <div className="add-device-error">{error}</div>}
        <div className="add-device-actions">
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
            {saving ? 'Adding...' : 'Add Device'}
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
