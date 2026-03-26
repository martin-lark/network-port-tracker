import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api.js';
import { PortTable } from './PortTable.jsx';
import { PortForm } from './PortForm.jsx';
import { HostForm } from './HostForm.jsx';
import { NoteForm } from './NoteForm.jsx';
import { ExportPanel } from './ExportPanel.jsx';

export function HostDetail({ hostId, onHostUpdated, onHostDeleted, hosts }) {
  const [host, setHost] = useState(null);
  const [showPortForm, setShowPortForm] = useState(false);
  const [editPort, setEditPort] = useState(null);
  const [showHostEdit, setShowHostEdit] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  const refresh = useCallback(async () => { setHost(await api.getHost(hostId)); }, [hostId]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!host) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete host "${host.name}" and all its ports?`)) return;
    await api.deleteHost(host.id); onHostDeleted();
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
          <button className="btn btn-secondary btn-sm" onClick={() => setShowExport(!showExport)}>Export</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowHostEdit(true)}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditPort(null); setShowPortForm(true); }}>+ Add Port</button>
        </div>
      </div>

      {showExport && <ExportPanel hostId={host.id} hosts={hosts} />}

      <PortTable ports={host.ports || []}
        onPortUpdated={async () => { await refresh(); onHostUpdated(); }}
        onEditPort={(port) => { setEditPort(port); setShowPortForm(true); }} />

      <div className="notes-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>Notes</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNoteForm(true)}>+ Add Note</button>
        </div>
        {(host.notes || []).map((note) => (
          <div key={note.id} className="note-card">
            <div className="note-card-header">
              <span className="note-card-title">{note.title}</span>
              <button className="btn btn-danger btn-sm" onClick={async () => { await api.deleteNote(note.id); refresh(); }}>Delete</button>
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
      {showNoteForm && <NoteForm hostId={host.id} onClose={() => setShowNoteForm(false)} onSaved={refresh} />}
    </div>
  );
}
