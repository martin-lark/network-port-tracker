import React from 'react';

export function SearchResults({ results, query, onSelectHost }) {
  if (!results) return null;
  const { hosts, ports, notes } = results;
  const total = hosts.length + ports.length + notes.length;

  return (
    <div>
      <div className="main-header">
        <h2>Search: "{query}"</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{total} result{total !== 1 ? 's' : ''}</span>
      </div>
      {hosts.length > 0 && <div className="search-results-section"><h3>Hosts ({hosts.length})</h3>
        {hosts.map((host) => (
          <div key={host.id} className="search-result-item" onClick={() => onSelectHost(host.id)}>
            <strong>{host.name}</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{host.ip_address}</span>
            {host.os && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>[{host.os}]</span>}
          </div>
        ))}
      </div>}
      {ports.length > 0 && <div className="search-results-section"><h3>Ports ({ports.length})</h3>
        {ports.map((port) => (
          <div key={port.id} className="search-result-item" onClick={() => onSelectHost(port.host_id)}>
            <span className="port-number">:{port.port_number}</span>
            <span style={{ marginLeft: '8px' }}>{port.service_name}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>on {port.host_name} ({port.host_ip})</span>
            {port.client && <span style={{ marginLeft: '8px' }}><span className="tag">{port.client}</span></span>}
            {port.domain && <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{port.domain}</span>}
          </div>
        ))}
      </div>}
      {notes.length > 0 && <div className="search-results-section"><h3>Notes ({notes.length})</h3>
        {notes.map((note) => (
          <div key={note.id} className="search-result-item">
            <strong>{note.title}</strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
              {note.content.length > 100 ? note.content.slice(0, 100) + '...' : note.content}
            </div>
          </div>
        ))}
      </div>}
      {total === 0 && <div className="empty-state"><p>No results found for "{query}"</p></div>}
    </div>
  );
}
