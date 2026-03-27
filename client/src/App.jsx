import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import * as api from './api.js';
import { Sidebar } from './components/Sidebar.jsx';
import { HostDetail } from './components/HostDetail.jsx';
import { NotesList } from './components/NotesList.jsx';
import { SearchResults } from './components/SearchResults.jsx';
import { NetworkMap } from './components/NetworkMap.jsx';

// Root layout: sidebar navigation + dynamic main content area.
// View modes: 'host' (detail/empty), 'notes' (global notes list), 'search' (search results).
export default function App() {
  const [hosts, setHosts] = useState([]);
  const [selectedHostId, setSelectedHostId] = useState(null);
  const [view, setView] = useState('host');          // Current view mode
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Theme: read from localStorage, default to 'dark'
  const [theme, setTheme] = useState(() => localStorage.getItem('pt-theme') || 'dark');

  // Apply theme to document root whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pt-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

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
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  const handleShowNotes = () => {
    setSelectedHostId(null);
    setView('notes');
    setSearchQuery('');
    setSearchResults(null);
    setSidebarOpen(false);
  };

  const handleShowMap = () => {
    setSelectedHostId(null);
    setView('map');
    setSearchQuery('');
    setSearchResults(null);
    setSidebarOpen(false);
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
      {/* Mobile top bar with hamburger menu */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>&#9776;</button>
        <span className="mobile-title">Port Tracker</span>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? '\u2600' : '\u263E'}
        </button>
      </div>

      {/* Overlay to close sidebar on mobile when tapping outside */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)} />

      <Sidebar hosts={hosts} selectedHostId={selectedHostId} onSelectHost={handleSelectHost}
        onShowNotes={handleShowNotes} onShowMap={handleShowMap} onSearch={handleSearch} searchQuery={searchQuery}
        view={view} onHostCreated={refreshHosts} theme={theme} onToggleTheme={toggleTheme}
        isOpen={sidebarOpen} />

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
        {view === 'map' && <NetworkMap hosts={hosts} onSelectHost={handleSelectHost} onHostCreated={refreshHosts} />}
      </div>
    </div>
  );
}
