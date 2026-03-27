import React, { useState, useEffect } from 'react';
import * as api from '../api.js';

const CATEGORIES = ['server', 'desktop', 'mobile', 'iot', 'network', 'other'];

// Popover shown when clicking a device node on the network map.
// Shows device details, linked host info, and action buttons.
export function DevicePopover({ device, devices, hosts, onClose, onSelectHost, onCreateHost, onDeviceUpdated, onDeviceDeleted }) {
  const [services, setServices] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editHostname, setEditHostname] = useState(device.hostname || '');
  const [editCategory, setEditCategory] = useState(device.category || 'other');
  const [linkHostId, setLinkHostId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);

  // Fetch top services if device is linked to a host
  useEffect(() => {
    if (device.host_id) {
      api.getHost(device.host_id).then(host => {
        setServices((host.ports || []).slice(0, 5));
      }).catch(() => {});
    }
  }, [device.host_id]);

  const handleSaveEdit = async () => {
    await api.updateDevice(device.id, { hostname: editHostname, category: editCategory });
    setEditing(false);
    onDeviceUpdated();
  };

  const handleLinkHost = async () => {
    if (!linkHostId) return;
    await api.updateDevice(device.id, { host_id: Number(linkHostId) });
    onDeviceUpdated();
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${device.hostname || device.ip_address} from map?`)) return;
    await api.deleteDevice(device.id);
    onDeviceDeleted();
  };

  const handleScanPorts = async () => {
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.scanHostPorts(device.host_id);
      setScanSummary(result.scan_summary);
      setTimeout(() => setScanSummary(null), 8000);
    } catch (err) {
      alert(err.error || 'Scan failed');
    }
    setScanning(false);
  };

  // Exclude hosts already linked to another device
  const linkedHostIds = new Set((devices || []).filter(d => d.host_id && d.id !== device.id).map(d => d.host_id));
  const availableHosts = hosts.filter(h => !linkedHostIds.has(h.id));

  const lastSeen = device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never';

  return (
    <div className="device-popover">
      <div className="device-popover-header">
        <strong>{device.hostname || device.ip_address}</strong>
        <button className="btn btn-danger btn-sm" onClick={onClose}>&times;</button>
      </div>

      <div className="device-popover-details">
        <div><span className="device-popover-label">IP:</span> {device.ip_address}</div>
        {device.mac_address && <div><span className="device-popover-label">MAC:</span> {device.mac_address}</div>}
        <div><span className="device-popover-label">Category:</span> {device.category}</div>
        <div><span className="device-popover-label">Last seen:</span> {lastSeen}</div>
      </div>

      {/* Linked host info with services */}
      {device.host_id && (
        <div className="device-popover-host">
          <div className="device-popover-label">Host: {device.host_name}</div>
          <div className="device-popover-label">{device.port_count} port{device.port_count !== 1 ? 's' : ''}</div>
          {services.length > 0 && (
            <div className="device-popover-services">
              {services.map(s => (
                <div key={s.id} className="device-popover-service">
                  :{s.port_number} {s.service_name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="device-popover-edit">
          <input className="search-input" value={editHostname} onChange={(e) => setEditHostname(e.target.value)}
            placeholder="Hostname" style={{ marginBottom: '6px' }} />
          <select className="search-input" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
            style={{ marginBottom: '6px' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>Save</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Link to host dropdown */}
      {!device.host_id && !editing && (
        <div className="device-popover-link" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <select className="search-input" value={linkHostId} onChange={(e) => setLinkHostId(e.target.value)}
              style={{ flex: 1, fontSize: '12px' }}>
              <option value="">Link to host...</option>
              {availableHosts.map(h => <option key={h.id} value={h.id}>{h.name} ({h.ip_address})</option>)}
            </select>
            {linkHostId && <button className="btn btn-primary btn-sm" onClick={handleLinkHost}>Link</button>}
          </div>
        </div>
      )}

      {scanSummary && (
        <div style={{ padding: '6px 0', fontSize: '12px', color: 'var(--accent)' }}>
          Found {scanSummary.open} open — {scanSummary.new} new, {scanSummary.updated} updated
        </div>
      )}

      {/* Action buttons */}
      <div className="device-popover-actions">
        {device.host_id && (
          <button className="btn btn-primary btn-sm" onClick={() => onSelectHost(device.host_id)}>View Details</button>
        )}
        {device.host_id && (
          <button className="btn btn-primary btn-sm" onClick={handleScanPorts} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Ports'}
          </button>
        )}
        {!device.host_id && (
          <button className="btn btn-primary btn-sm"
            onClick={() => onCreateHost({ ip_address: device.ip_address, name: device.hostname || '' }, device.id)}>
            Create Host
          </button>
        )}
        {!editing && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit Device</button>}
        <button className="btn btn-danger btn-sm" onClick={handleDelete}>Remove</button>
      </div>
    </div>
  );
}
