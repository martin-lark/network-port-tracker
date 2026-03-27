// test/port-scanner.test.js
import { describe, it, expect } from 'vitest';
import { parsePorts, getServiceName, COMMON_PORTS } from '../server/port-scanner.js';

describe('parsePorts', () => {
  it('returns common ports for "common"', () => {
    const ports = parsePorts('common');
    expect(ports.length).toBeGreaterThan(100);
    expect(ports).toContain(22);
    expect(ports).toContain(80);
    expect(ports).toContain(443);
  });

  it('returns common ports when spec is undefined', () => {
    const ports = parsePorts(undefined);
    expect(ports.length).toBe(parsePorts('common').length);
  });

  it('parses comma-separated list', () => {
    const ports = parsePorts('80,443,8080');
    expect(ports).toEqual([80, 443, 8080]);
  });

  it('parses a range', () => {
    const ports = parsePorts('1-10');
    expect(ports).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('parses mixed ranges and singles', () => {
    const ports = parsePorts('22,80-82,443');
    expect(ports).toEqual([22, 80, 81, 82, 443]);
  });

  it('throws on invalid port string', () => {
    expect(() => parsePorts('abc')).toThrow('Invalid port number');
  });

  it('throws on port 0 (below range)', () => {
    expect(() => parsePorts('0')).toThrow('Invalid port number');
  });

  it('throws on port above 65535', () => {
    expect(() => parsePorts('99999')).toThrow('Invalid port number');
  });

  it('throws on invalid range (start > end)', () => {
    expect(() => parsePorts('100-50')).toThrow('Invalid port range');
  });

  it('throws on empty string', () => {
    expect(() => parsePorts('')).toThrow('No ports specified');
  });
});

describe('getServiceName', () => {
  it('returns SSH for port 22', () => {
    expect(getServiceName(22)).toBe('SSH');
  });

  it('returns HTTP for port 80', () => {
    expect(getServiceName(80)).toBe('HTTP');
  });

  it('returns HTTPS for port 443', () => {
    expect(getServiceName(443)).toBe('HTTPS');
  });

  it('returns MySQL for port 3306', () => {
    expect(getServiceName(3306)).toBe('MySQL');
  });

  it('returns unknown for unlisted port', () => {
    expect(getServiceName(59999)).toBe('unknown');
  });
});

describe('COMMON_PORTS', () => {
  it('has more than 100 entries', () => {
    expect(COMMON_PORTS.size).toBeGreaterThan(100);
  });

  it('all keys are valid port numbers', () => {
    for (const port of COMMON_PORTS.keys()) {
      expect(port).toBeGreaterThanOrEqual(1);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });

  it('all values are non-empty strings', () => {
    for (const name of COMMON_PORTS.values()) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
