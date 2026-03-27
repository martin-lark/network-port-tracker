import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ReactFlow, MiniMap, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as api from '../api.js';
import { DeviceNode } from './DeviceNode.jsx';
import { DevicePopover } from './DevicePopover.jsx';
import { HostForm } from './HostForm.jsx';

const nodeTypes = { device: DeviceNode };

const CATEGORIES = ['all', 'server', 'desktop', 'mobile', 'iot', 'network', 'other'];

// Force-layout helper: arrange nodes in a grid pattern for initial placement.
// Nodes with saved positions keep theirs; others get auto-positioned.
function layoutNodes(devices) {
  const unpositioned = devices.filter(d => d.x_position == null);
  const positioned = devices.filter(d => d.x_position != null);
  const cols = Math.max(4, Math.ceil(Math.sqrt(unpositioned.length)));
  const spacing = 200;

  const nodes = positioned.map(d => ({
    id: String(d.id),
    type: 'device',
    position: { x: d.x_position, y: d.y_position },
    data: { device: d },
  }));

  unpositioned.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodes.push({
      id: String(d.id),
      type: 'device',
      position: { x: col * spacing + 50, y: row * spacing + 50 },
      data: { device: d },
    });
  });

  return nodes;
}

// Main network map view with toolbar, React Flow canvas, and device popover.
export function NetworkMap({ hosts, onSelectHost, onHostCreated }) {
  const [devices, setDevices] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges] = useEdgesState([]);
  const [knownOnly, setKnownOnly] = useState(true);
  const [hideDocker, setHideDocker] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [hostFormPrefill, setHostFormPrefill] = useState(null);
  const [linkDeviceId, setLinkDeviceId] = useState(null);
  const dragSaveTimeout = useRef(null);

  const fetchDevices = useCallback(async () => {
    const params = knownOnly ? { known_only: 'true' } : {};
    const data = await api.getDevices(params);
    setDevices(data);
  }, [knownOnly]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Update nodes whenever devices or filters change
  useEffect(() => {
    let filtered = devices;
    if (hideDocker) {
      filtered = filtered.filter(d => !d.ip_address.startsWith('172.'));
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(d => d.category === categoryFilter);
    }
    setNodes(layoutNodes(filtered));
  }, [devices, hideDocker, categoryFilter, setNodes]);

  const handleScan = async () => {
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.scanNetwork();
      setScanSummary(result.scan_summary);
      await fetchDevices();
    } catch (err) {
      alert(err.error || 'Scan failed');
    }
    setScanning(false);
  };

  const handleCleanScan = async () => {
    setScanning(true);
    setScanSummary(null);
    try {
      const result = await api.cleanScanNetwork();
      setScanSummary(result.scan_summary);
      await fetchDevices();
    } catch (err) {
      alert(err.error || 'Clean scan failed');
    }
    setScanning(false);
  };

  const handleTidyGrid = () => {
    const filtered = hideDocker ? devices.filter(d => !d.ip_address.startsWith('172.')) : devices;
    const visible = categoryFilter !== 'all' ? filtered.filter(d => d.category === categoryFilter) : filtered;
    const cols = Math.max(4, Math.ceil(Math.sqrt(visible.length)));
    const spacing = 200;
    const newNodes = visible.map((d, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * spacing + 50;
      const y = row * spacing + 50;
      api.saveDevicePosition(d.id, x, y);
      return { id: String(d.id), type: 'device', position: { x, y }, data: { device: d } };
    });
    setNodes(newNodes);
  };

  // Save position when a node is dragged
  const handleNodeDragStop = useCallback((event, node) => {
    clearTimeout(dragSaveTimeout.current);
    dragSaveTimeout.current = setTimeout(() => {
      api.saveDevicePosition(Number(node.id), node.position.x, node.position.y);
    }, 300);
  }, []);

  const handleNodeClick = useCallback((event, node) => {
    const device = node.data.device;
    setSelectedDevice(device);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedDevice(null);
  }, []);

  const handleCreateHost = (prefill, deviceId) => {
    setHostFormPrefill(prefill);
    setLinkDeviceId(deviceId);
    setShowHostForm(true);
    setSelectedDevice(null);
  };

  const handleHostCreated = async (newHost) => {
    // Link the device to the newly created host
    if (linkDeviceId && newHost?.id) {
      await api.updateDevice(linkDeviceId, { host_id: newHost.id });
    }
    setShowHostForm(false);
    setHostFormPrefill(null);
    setLinkDeviceId(null);
    onHostCreated();
    fetchDevices();
  };

  const visibleDevices = hideDocker ? devices.filter(d => !d.ip_address.startsWith('172.')) : devices;
  const deviceCount = visibleDevices.length;
  const filteredCount = categoryFilter !== 'all'
    ? visibleDevices.filter(d => d.category === categoryFilter).length
    : deviceCount;

  return (
    <div className="network-map">
      {/* Toolbar */}
      <div className="map-toolbar">
        <button className="btn btn-primary btn-sm" onClick={handleScan} disabled={scanning}>
          {scanning ? 'Scanning...' : 'Scan Network'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleCleanScan} disabled={scanning}>
          Clean Scan
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleTidyGrid}>
          Tidy Grid
        </button>
        <button className={`btn btn-sm ${knownOnly ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setKnownOnly(!knownOnly)}>
          {knownOnly ? 'Known Only' : 'Show All'}
        </button>
        <button className={`btn btn-sm ${hideDocker ? 'btn-secondary' : 'btn-primary'}`}
          onClick={() => setHideDocker(!hideDocker)}>
          {hideDocker ? 'Docker Hidden' : 'Show All IPs'}
        </button>
        <select className="map-filter-select" value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
          ))}
        </select>
        <span className="map-device-count">
          {filteredCount} device{filteredCount !== 1 ? 's' : ''}
          {categoryFilter !== 'all' && ` (${deviceCount} total)`}
        </span>
        {scanSummary && (
          <span className="map-scan-summary">
            Found {scanSummary.new} new, updated {scanSummary.updated}
            {scanSummary.removed > 0 && `, removed ${scanSummary.removed} stale`}
          </span>
        )}
      </div>

      {/* React Flow canvas */}
      <div className="map-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            style={{ background: 'var(--bg-tertiary)' }}
            nodeColor="var(--accent)"
            maskColor="var(--overlay)"
          />
          <Controls />
        </ReactFlow>

        {/* Popover positioned near the map */}
        {selectedDevice && (
          <DevicePopover
            device={selectedDevice}
            devices={devices}
            hosts={hosts}
            onClose={() => setSelectedDevice(null)}
            onSelectHost={(id) => { setSelectedDevice(null); onSelectHost(id); }}
            onCreateHost={handleCreateHost}
            onDeviceUpdated={() => { setSelectedDevice(null); fetchDevices(); }}
            onDeviceDeleted={() => { setSelectedDevice(null); fetchDevices(); }}
          />
        )}
      </div>

      {/* Host creation form pre-filled from device */}
      {showHostForm && (
        <HostForm
          prefill={hostFormPrefill}
          onClose={() => { setShowHostForm(false); setHostFormPrefill(null); setLinkDeviceId(null); }}
          onSaved={handleHostCreated}
        />
      )}
    </div>
  );
}
