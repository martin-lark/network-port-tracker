import { describe, it, expect } from 'vitest';
import { parseArpOutput, getLocalSubnet } from '../server/scanner.js';

describe('Scanner utilities', () => {
  describe('parseArpOutput', () => {
    it('parses standard Linux arp -a output', () => {
      const output = [
        '? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0',
        '? (192.168.1.50) at 11:22:33:44:55:66 [ether] on eth0',
        '? (192.168.1.100) at <incomplete> on eth0',
      ].join('\n');
      const result = parseArpOutput(output);
      expect(result).toEqual([
        { ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff' },
        { ip: '192.168.1.50', mac: '11:22:33:44:55:66' },
      ]);
    });

    it('returns empty array for empty output', () => {
      expect(parseArpOutput('')).toEqual([]);
    });

    it('skips lines without valid MAC addresses', () => {
      const output = '? (192.168.1.1) at <incomplete> on eth0\nsome garbage line\n';
      expect(parseArpOutput(output)).toEqual([]);
    });
  });

  describe('getLocalSubnet', () => {
    it('returns an object with subnet, localIp, and localMac', () => {
      const result = getLocalSubnet();
      // Should return { subnet, localIp, localMac } or null if no private interface
      if (result) {
        expect(result.subnet).toMatch(/^\d+\.\d+\.\d+$/);
        expect(result.localIp).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
        expect(result.localMac).toBeDefined();
      }
    });
  });
});
