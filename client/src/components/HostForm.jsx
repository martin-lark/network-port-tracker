import React, { useState } from 'react';
import { Modal } from './Modal.jsx';
import * as api from '../api.js';

// Add/edit host modal form. Pass existing host object to edit, or omit for add mode.
export function HostForm({ host, prefill, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: host?.name || prefill?.name || '', ip_address: host?.ip_address || prefill?.ip_address || '',
    os: host?.os || '', type: host?.type || 'other', description: host?.description || ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (host) await api.updateHost(host.id, form);
      else await api.createHost(form);
      onSaved(); onClose();
    } catch (err) { setError(err.error || 'Failed to save host'); }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal title={host ? 'Edit Host' : 'Add Host'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group"><label>Name</label>
            <input value={form.name} onChange={set('name')} placeholder="proxmox-01" required /></div>
          <div className="form-group"><label>IP Address</label>
            <input value={form.ip_address} onChange={set('ip_address')} placeholder="192.168.1.10" required /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>OS</label>
            <input value={form.os} onChange={set('os')} placeholder="Ubuntu 22.04" /></div>
          <div className="form-group"><label>Type</label>
            <select value={form.type} onChange={set('type')}>
              <option value="physical">Physical</option><option value="vm">VM</option>
              <option value="container">Container</option><option value="other">Other</option>
            </select></div>
        </div>
        <div className="form-group"><label>Description</label>
          <textarea value={form.description} onChange={set('description')} placeholder="Optional description..." /></div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{host ? 'Save' : 'Add Host'}</button>
        </div>
      </form>
    </Modal>
  );
}
