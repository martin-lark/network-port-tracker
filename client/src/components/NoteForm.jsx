import React, { useState } from 'react';
import { Modal } from './Modal.jsx';
import * as api from '../api.js';

export function NoteForm({ note, hostId, hosts, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: note?.title || '', content: note?.content || '',
    host_id: note?.host_id ?? hostId ?? ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    const data = { title: form.title, content: form.content,
      host_id: form.host_id ? Number(form.host_id) : null };
    try {
      if (note) await api.updateNote(note.id, data);
      else await api.createNote(data);
      onSaved(); onClose();
    } catch (err) { setError(err.error || 'Failed to save note'); }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <Modal title={note ? 'Edit Note' : 'Add Note'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group"><label>Title</label>
          <input value={form.title} onChange={set('title')} placeholder="Note title" required /></div>
        <div className="form-group"><label>Content</label>
          <textarea value={form.content} onChange={set('content')} placeholder="Write your note..." required /></div>
        {hosts && <div className="form-group"><label>Link to Host (optional)</label>
          <select value={form.host_id} onChange={set('host_id')}>
            <option value="">Global (no host)</option>
            {hosts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></div>}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">{note ? 'Save' : 'Add Note'}</button>
        </div>
      </form>
    </Modal>
  );
}
