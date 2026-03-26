import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import * as api from './api.js';
import { Sidebar } from './components/Sidebar.jsx';
import { HostDetail } from './components/HostDetail.jsx';
import { NotesList } from './components/NotesList.jsx';
import { SearchResults } from './components/SearchResults.jsx';

export default function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHostId, setSelectedHostId] = useState(null);
  const [view, setView] = useState('host');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  const refreshHosts = useCallback(async () => {
    const data = await api.getHosts();
    setHosts(data);
  }, []);

  useEffect(() => { refreshHosts(); }, [refreshHosts]);

  const handleSelectHost = (id) => {
    setSelectedHostId(id);
    setView('host');
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleShowNotes = () => {
    setSelectedHostId(null);
    setView('notes');
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      if (!selectedHostId) setView('host');
      return;
    }
    setView('search');
    const results = await api.search(q);
    setSearchResults(results);
  };

  return (
    <div className="app">
      <Sidebar hosts={hosts} selectedHostId={selectedHostId} onSelectHost={handleSelectHost}
        onShowNotes={handleShowNotes} onSearch={handleSearch} searchQuery={searchQuery}
        view={view} onHostCreated={refreshHosts} />
      <div className="main">
        {view === 'search' && searchResults && (
          <SearchResults results={searchResults} query={searchQuery} onSelectHost={handleSelectHost} />
        )}
        {view === 'host' && selectedHostId && (
          <HostDetail hostId={selectedHostId} onHostUpdated={refreshHosts}
            onHostDeleted={async () => { setSelectedHostId(null); await refreshHosts(); }} hosts={hosts} />
        )}
        {view === 'host' && !selectedHostId && (
          <div className="empty-state">
            <h2>Port Tracker</h2>
            <p>Select a host from the sidebar or add a new one to get started.</p>
          </div>
        )}
        {view === 'notes' && <NotesList hosts={hosts} />}
      </div>
    </div>
  );
}
