import React, { useState } from 'react';
import { HostForm } from './HostForm.jsx';

export function Sidebar({ hosts, selectedHostId, onSelectHost, onShowNotes, onSearch, searchQuery, view, onHostCreated }) {
  const [showHostForm, setShowHostForm] = useState(false);
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Port Tracker</div>
        <input className="search-input" placeholder="Search hosts, ports, domains..."
          value={searchQuery} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <div className="host-list">
        {hosts.map((host) => (
          <div key={host.id}
            className={`host-item ${selectedHostId === host.id && view === 'host' ? 'active' : ''}`}
            onClick={() => onSelectHost(host.id)}>
            <div>
              <div className="host-item-name">{host.name}</div>
              <div className="host-item-ip">{host.ip_address}</div>
            </div>
            <span className="host-item-count">{host.port_count}</span>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className={`sidebar-nav-item ${view === 'notes' ? 'active' : ''}`} onClick={onShowNotes}>Notes</div>
        <button className="btn btn-primary btn-full" onClick={() => setShowHostForm(true)}>+ Add Host</button>
      </div>
      {showHostForm && <HostForm onClose={() => setShowHostForm(false)} onSaved={onHostCreated} />}
    </div>
  );
}
