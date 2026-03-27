// test/port-scan-api.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './setup.js';

// Mock the scanPorts function so tests don't hit the network
vi.mock('../server/port-scanner.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    scanPorts: vi.fn().mockResolvedValue([
      { port: 22, open: true },
      { port: 80, open: true },
      { port: 443, open: true },
    ]),
  };
});

describe('POST /api/hosts/:id/scan', () => {
  let app, db;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ app, db } = createTestApp());
    // Create a test host
    db.prepare("INSERT INTO hosts (name, ip_address) VALUES ('test-host', '192.168.1.10')").run();
  });

  it('returns scan summary with open ports', async () => {
    const res = await request(app).post('/api/hosts/1/scan').send({ ports: '22,80,443' });
    expect(res.status).toBe(200);
    expect(res.body.scan_summary).toMatchObject({
      host: 'test-host',
      ip: '192.168.1.10',
      scanned: 3,
      open: 3,
      new: 3,
      updated: 0,
      closed: 0,
    });
    expect(res.body.open_ports).toHaveLength(3);
    expect(res.body.open_ports[0]).toMatchObject({ port: 22, service_name: 'SSH', is_new: true });
  });

  it('creates new port entries for discovered open ports', async () => {
    const { scanPorts } = await import('../server/port-scanner.js');
    scanPorts.mockResolvedValueOnce([{ port: 22, open: true }, { port: 80, open: true }]);
    await request(app).post('/api/hosts/1/scan').send({ ports: '22,80' });
    const ports = db.prepare('SELECT * FROM ports WHERE host_id = 1 ORDER BY port_number').all();
    expect(ports).toHaveLength(2);
    expect(ports[0]).toMatchObject({ port_number: 22, service_name: 'SSH', protocol: 'TCP', status: 'active' });
    expect(ports[1]).toMatchObject({ port_number: 80, service_name: 'HTTP', protocol: 'TCP', status: 'active' });
  });

  it('updates existing active ports and counts them as updated', async () => {
    // Pre-insert port 22 as inactive
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 22, 'OpenSSH', 'TCP', 'inactive')").run();

    const res = await request(app).post('/api/hosts/1/scan').send({ ports: '22,80,443' });
    expect(res.body.scan_summary.updated).toBe(1);
    expect(res.body.scan_summary.new).toBe(2);

    // Port 22 should be active now with original service name preserved
    const port22 = db.prepare("SELECT * FROM ports WHERE host_id = 1 AND port_number = 22").get();
    expect(port22.status).toBe('active');
    expect(port22.service_name).toBe('OpenSSH');

    // open_ports entry should show is_new: false
    const p22Result = res.body.open_ports.find(p => p.port === 22);
    expect(p22Result.is_new).toBe(false);
  });

  it('marks previously active ports as inactive when found closed', async () => {
    const { scanPorts } = await import('../server/port-scanner.js');
    // Mock returns only port 22 open; 80 and 443 are closed
    scanPorts.mockResolvedValueOnce([{ port: 22, open: true }]);

    // Pre-insert ports 22 and 80 as active
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 22, 'SSH', 'TCP', 'active')").run();
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 80, 'HTTP', 'TCP', 'active')").run();

    const res = await request(app).post('/api/hosts/1/scan').send({ ports: '22,80,443' });
    expect(res.body.scan_summary.closed).toBe(1);

    const port80 = db.prepare("SELECT * FROM ports WHERE host_id = 1 AND port_number = 80").get();
    expect(port80.status).toBe('inactive');
  });

  it('does not mark ports outside the scanned range as inactive', async () => {
    const { scanPorts } = await import('../server/port-scanner.js');
    scanPorts.mockResolvedValueOnce([{ port: 22, open: true }]);

    // Pre-insert port 3306 as active (not in scan range)
    db.prepare("INSERT INTO ports (host_id, port_number, service_name, protocol, status) VALUES (1, 3306, 'MySQL', 'TCP', 'active')").run();

    await request(app).post('/api/hosts/1/scan').send({ ports: '22,80' });

    const port3306 = db.prepare("SELECT * FROM ports WHERE host_id = 1 AND port_number = 3306").get();
    expect(port3306.status).toBe('active');
  });

  it('returns 404 for nonexistent host', async () => {
    const res = await request(app).post('/api/hosts/999/scan').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Host not found');
  });

  it('returns 400 for invalid port spec', async () => {
    const res = await request(app).post('/api/hosts/1/scan').send({ ports: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid port/);
  });

  it('uses common ports when no ports specified', async () => {
    const res = await request(app).post('/api/hosts/1/scan').send({});
    expect(res.status).toBe(200);
    expect(res.body.scan_summary.scanned).toBeGreaterThan(100);
  });
});
