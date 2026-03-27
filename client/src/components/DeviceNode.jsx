import React from 'react';
import { Handle, Position } from '@xyflow/react';

// Category color mapping for node borders
const CATEGORY_COLORS = {
  server: 'var(--accent)',
  desktop: '#4a90d9',
  mobile: 'var(--green-text)',
  iot: 'var(--yellow-text)',
  network: '#9b59b6',
  other: 'var(--text-muted)',
};

// Custom React Flow node for devices on the network map.
// Shows IP, hostname, category, and port count badge for linked hosts.
export function DeviceNode({ data }) {
  const { device } = data;
  const isLinked = !!device.host_id;
  const borderColor = CATEGORY_COLORS[device.category] || CATEGORY_COLORS.other;

  return (
    <div className={`device-node ${isLinked ? 'device-node-linked' : 'device-node-unknown'}`}
      style={{ borderColor }}>
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div className="device-node-hostname">
        {isLinked ? device.host_name : (device.hostname || 'Unknown')}
      </div>
      <div className="device-node-ip">{device.ip_address}</div>
      <div className="device-node-meta">
        <span className="device-node-category" style={{ color: borderColor }}>{device.category}</span>
        {isLinked && device.port_count > 0 && (
          <span className="device-node-ports">{device.port_count} port{device.port_count !== 1 ? 's' : ''}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  );
}
