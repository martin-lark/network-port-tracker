import React, { useState, useEffect } from 'react';
import { Modal } from './Modal.jsx';
import * as api from '../api.js';

// Add/edit port modal form. Shows conflict errors inline (e.g. "Port 8080/TCP already assigned to Nginx").
// Tags are displayed as comma-separated text and converted to/from a JSON array for the API.
export function PortForm({ hostId, port, onClose, onSaved }) {
  const [form, setForm] = useState({
    port_number: port?.port_number || '', port_end: port?.port_end || '',
    service_name: port?.service_name || '', protocol: port?.protocol || 'TCP',
    status: port?.status || 'active',
    tags: port ? (JSON.parse(port.tags || '[]')).join(', ') : '',  // JSON array → comma string for editing
    notes: port?.notes || '', client: port?.client || '',
    domain: port?.domain || '', tunnel: port?.tunnel || '', tunnel_id: port?.tunnel_id || '',
    category_id: port?.category_id || ''
  });
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    // Convert form values to API types: numbers, arrays, nulls
    const data = {
      port_number: Number(form.port_number),
      port_end: form.port_end ? Number(form.port_end) : null,
      service_name: form.service_name, protocol: form.protocol, status: form.status,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),  // Comma string → array
      notes: form.notes || null, client: form.client || null,
      domain: form.domain || null, tunnel: form.tunnel || null, tunnel_id: form.tunnel_id || null,
      category_id: form.category_id ? Number(form.category_id) : null
    };
    try {
      if (port) await api.updatePort(port.id, data);
      else await api.createPort(hostId, data);
      onSaved(); onClose();
    } catch (err) { setError(err.error || 'Failed to save port'); }
  };

  // Returns an onChange handler for a specific form field
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal title={port ? 'Edit Port' : 'Add Port'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group"><label>Port Number</label>
            <input type="number" value={form.port_number} onChange={set('port_number')} min="1" max="65535" required /></div>
          <div className="form-group"><label>Port End (range)</label>
            <input type="number" value={form.port_end} onChange={set('port_end')} min="1" max="65535" placeholder="Optional" /></div>
        </div>
        <div className="form-group"><label>Service Name</label>
          <input value={form.service_name} onChange={set('service_name')} placeholder="Nginx, Portainer, SSH..." required /></div>
        <div className="form-row">
          <div className="form-group"><label>Protocol</label>
            <select value={form.protocol} onChange={set('protocol')}><option value="TCP">TCP</option><option value="UDP">UDP</option></select></div>
          <div className="form-group"><label>Status</label>
            <select value={form.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <div className="form-group"><label>Category</label>
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">None</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Client / Project</label>
            <input value={form.client} onChange={set('client')} placeholder="Acme Corp" /></div>
          <div className="form-group"><label>Domain</label>
            <input value={form.domain} onChange={set('domain')} placeholder="app.example.com" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Tunnel Type</label>
            <select value={form.tunnel} onChange={set('tunnel')}>
              <option value="">None</option><option value="cloudflare">Cloudflare</option><option value="other">Other</option>
            </select></div>
          <div className="form-group"><label>Tunnel ID</label>
            <input value={form.tunnel_id} onChange={set('tunnel_id')} placeholder="tunnel-abc-123" /></div>
        </div>
        <div className="form-group"><label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={set('tags')} placeholder="web, proxy, monitoring" /></div>
        <div className="form-group"><label>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} placeholder="Optional notes..." /></div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{port ? 'Save' : 'Add Port'}</button>
        </div>
      </form>
    </Modal>
  );
}
