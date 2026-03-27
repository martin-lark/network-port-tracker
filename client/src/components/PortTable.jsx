import React, { useState, useEffect } from 'react';
import * as api from '../api.js';

// Sortable port table with inline status toggle and edit/delete actions.
// All column headers are clickable to sort. Tags are parsed from JSON for sorting.
export function PortTable({ ports, onPortUpdated, onEditPort }) {
  const [sortField, setSortField] = useState('port_number');
  const [sortDir, setSortDir] = useState('asc');
  const [grouped, setGrouped] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  const fetchCategories = () => { api.getCategories().then(setCategories).catch(() => {}); };
  useEffect(() => { fetchCategories(); }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await api.createCategory(newCategoryName.trim());
      setNewCategoryName('');
      fetchCategories();
    } catch (err) {
      alert(err.error || 'Failed to create category');
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (!confirm(`Delete category "${name}"? Ports in this category will become uncategorized.`)) return;
    await api.deleteCategory(id);
    fetchCategories();
  };

  // Click same column to toggle direction, click new column to sort ascending
  const handleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Tags are stored as JSON strings in the DB — parse and alphabetize for consistent sort order
  const getSortValue = (port, field) => {
    if (field === 'tags') {
      try { const tags = JSON.parse(port.tags || '[]'); return tags.sort().join(', '); }
      catch { return ''; }
    }
    return port[field] ?? '';
  };

  const sorted = [...ports].sort((a, b) => {
    const aVal = getSortValue(a, sortField); const bVal = getSortValue(b, sortField);
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

  const toggleGroup = (name) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const groupPorts = (portList) => {
    const groups = new Map();
    for (const port of portList) {
      const name = port.category_name || 'Uncategorized';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(port);
    }
    return groups;
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

  const renderTable = (portList) => (
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
        {portList.map((port) => (
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
      </tbody>
    </table>
  );

  const renderFlat = () => (
    <>
      {renderTable(sorted)}
      {sorted.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No ports yet. Click "Add Port" to get started.</div>}
    </>
  );

  const renderGrouped = () => {
    const groups = groupPorts(sorted);
    if (sorted.length === 0) {
      return <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No ports yet. Click "Add Port" to get started.</div>;
    }
    return [...groups.entries()].map(([name, groupPorts]) => (
      <div key={name} className="port-group">
        <div className="port-group-header" onClick={() => toggleGroup(name)}>
          <span className="port-group-toggle">{collapsedGroups.has(name) ? '\u25B6' : '\u25BC'}</span>
          <span className="port-group-name">{name}</span>
          <span className="port-group-count">{groupPorts.length} port{groupPorts.length !== 1 ? 's' : ''}</span>
        </div>
        {!collapsedGroups.has(name) && renderTable(groupPorts)}
      </div>
    ));
  };

  return (
    <div className="port-table-wrapper">
      <div className="port-table-controls">
        <button className={`btn btn-sm ${grouped ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setGrouped(!grouped)}>
          {grouped ? 'Grouped by Category' : 'Group by Category'}
        </button>
        <button className="btn btn-sm btn-secondary"
          onClick={() => setShowCategoryManager(!showCategoryManager)}>
          {showCategoryManager ? 'Hide Categories' : 'Manage Categories'}
        </button>
      </div>
      {showCategoryManager && (
        <div className="category-manager">
          <div className="category-manager-list">
            {categories.map(c => (
              <div key={c.id} className="category-manager-item">
                <span>{c.name}</span>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCategory(c.id, c.name)}>&times;</button>
              </div>
            ))}
          </div>
          <div className="category-manager-add">
            <input className="search-input" value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
              placeholder="New category name..." />
            <button className="btn btn-primary btn-sm" onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}>Add</button>
          </div>
        </div>
      )}
      {grouped ? renderGrouped() : renderFlat()}
    </div>
  );
}
