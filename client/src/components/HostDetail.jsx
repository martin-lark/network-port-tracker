import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api.js';
import { PortTable } from './PortTable.jsx';
import { PortForm } from './PortForm.jsx';
import { HostForm } from './HostForm.jsx';
import { NoteForm } from './NoteForm.jsx';
import { ExportPanel } from './ExportPanel.jsx';

// Main content area for a selected host.
// Shows host metadata, port table, notes, and toggleable export panel.
// Each section has its own modal form for add/edit operations.
export function HostDetail({ hostId, onHostUpdated, onHostDeleted, hosts }) {
  const [host, setHost] = useState(null);
  // Modal/form visibility and editing context
  const [showPortForm, setShowPortForm] = useState(false);
  const [editPort, setEditPort] = useState(null);       // null = add new, object = edit existing
  const [showHostEdit, setShowHostEdit] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editNote, setEditNote] = useState(null);        // null = add new, object = edit existing
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
  const [showScanMenu, setShowScanMenu] = useState(false);
  const [customPorts, setCustomPorts] = useState('');

  const refresh = useCallback(async () => { setHost(await api.getHost(hostId)); }, [hostId]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!host) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete host "${host.name}" and all its ports?`)) return;
    await api.deleteHost(host.id); onHostDeleted();
  };

  const handleScan = async (ports = 'common') => {
    setShowScanMenu(false);
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.scanHostPorts(host.id, ports);
      setScanSummary(result.scan_summary);
      await refresh();
      onHostUpdated();
      setTimeout(() => setScanSummary(null), 8000);
    } catch (err) {
      alert(err.error || 'Scan failed');
    }
    setScanning(false);
  };

  const typeLabel = { physical: 'Physical', vm: 'VM', container: 'Container', other: '' };

  return (
    <div>
      <div className="main-header">
        <div>
          <h2>{host.name}
            <span style={{ color: 'var(--text-muted)', fontSize: '14px', marginLeft: '12px', fontWeight: 400 }}>{host.ip_address}</span>
          </h2>
          <div className="host-meta">
            {host.os && <span>{host.os}</span>}
            {host.os && host.type !== 'other' && <span> &middot; </span>}
            {host.type !== 'other' && <span>{typeLabel[host.type]}</span>}
            {host.description && <span> &middot; {host.description}</span>}
          </div>
        </div>
        <div className="main-actions">
          <div className="scan-dropdown-wrapper">
            <button className="btn btn-primary btn-sm" disabled={scanning}
              onClick={() => setShowScanMenu(!showScanMenu)}>
              {scanning ? 'Scanning...' : 'Scan Ports'}
            </button>
            {showScanMenu && (
              <div className="scan-dropdown">
                <button className="scan-dropdown-item" onClick={() => handleScan('common')}>Common Ports (~150)</button>
                <button className="scan-dropdown-item" onClick={() => handleScan('1-1024')}>Well-Known (1-1024)</button>
                <div className="scan-dropdown-custom">
                  <input className="search-input" value={customPorts} onChange={(e) => setCustomPorts(e.target.value)}
                    placeholder="e.g. 80,443,8080 or 1-1024" style={{ fontSize: '12px' }} />
                  <button className="btn btn-primary btn-sm"
                    onClick={() => { if (customPorts.trim()) handleScan(customPorts.trim()); }}
                    disabled={!customPorts.trim()}>Scan</button>
                </div>
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(!showExport)}>Export</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHostEdit(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditPort(null); setShowPortForm(true); }}>+ Add Port</button>
        </div>
      </div>

      {scanSummary && (
        <div className="scan-summary">
          Found {scanSummary.open} open port{scanSummary.open !== 1 ? 's' : ''} —
          {' '}{scanSummary.new} new, {scanSummary.updated} updated, {scanSummary.closed} closed
        </div>
      )}

      {showExport && <ExportPanel hostId={host.id} hosts={hosts} />}

      <PortTable ports={host.ports || []}
        onPortUpdated={async () => { await refresh(); onHostUpdated(); }}
        onEditPort={(port) => { setEditPort(port); setShowPortForm(true); }} />

      <div className="notes-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>Notes</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => { setEditNote(null); setShowNoteForm(true); }}>+ Add Note</button>
        </div>
        {(host.notes || []).map((note) => (
          <div key={note.id} className="note-card note-card-clickable" onClick={() => { setEditNote(note); setShowNoteForm(true); }}>
            <div className="note-card-header">
              <span className="note-card-title">{note.title}</span>
              <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditNote(note); setShowNoteForm(true); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={async () => { await api.deleteNote(note.id); refresh(); }}>Delete</button>
              </div>
            </div>
            <div className="note-card-content">{note.content}</div>
          </div>
        ))}
      </div>

      {showPortForm && <PortForm hostId={host.id} port={editPort}
        onClose={() => { setShowPortForm(false); setEditPort(null); }}
        onSaved={async () => { await refresh(); onHostUpdated(); }} />}
      {showHostEdit && <HostForm host={host} onClose={() => setShowHostEdit(false)}
        onSaved={async () => { await refresh(); onHostUpdated(); }} />}
      {showNoteForm && <NoteForm note={editNote} hostId={host.id}
        onClose={() => { setShowNoteForm(false); setEditNote(null); }} onSaved={refresh} />}
    </div>
  );
}
