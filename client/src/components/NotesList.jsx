import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api.js';
import { NoteForm } from './NoteForm.jsx';

// Global notes list view. Shows all notes (global and host-linked).
// Clicking a note card opens it in the edit modal.
export function NotesList({ hosts }) {
  const [notes, setNotes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editNote, setEditNote] = useState(null);

  const refresh = useCallback(async () => { setNotes(await api.getNotes()); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (note) => {
    if (!confirm(`Delete note "${note.title}"?`)) return;
    await api.deleteNote(note.id); refresh();
  };

  const hostName = (hostId) => hosts.find(h => h.id === hostId)?.name;

  return (
    <div>
      <div className="main-header">
        <h2>Notes</h2>
        <button className="btn btn-primary btn-sm" onClick={() => { setEditNote(null); setShowForm(true); }}>+ Add Note</button>
      </div>
      {notes.map((note) => (
        <div key={note.id} className="note-card note-card-clickable" onClick={() => { setEditNote(note); setShowForm(true); }}>
          <div className="note-card-header">
            <span className="note-card-title">{note.title}</span>
            <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditNote(note); setShowForm(true); }}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(note)}>Delete</button>
            </div>
          </div>
          <div className="note-card-content">{note.content}</div>
          <div className="note-card-meta">
            {note.host_id ? `Linked to ${hostName(note.host_id)}` : 'Global note'}
            {' \u00b7 '}{new Date(note.updated_at).toLocaleDateString()}
          </div>
        </div>
      ))}
      {notes.length === 0 && <div className="empty-state"><p>No notes yet. Click "Add Note" to create one.</p></div>}
      {showForm && <NoteForm note={editNote} hosts={hosts}
        onClose={() => { setShowForm(false); setEditNote(null); }} onSaved={refresh} />}
    </div>
  );
}
