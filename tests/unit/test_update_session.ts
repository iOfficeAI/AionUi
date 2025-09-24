/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UpdateSession } from '../../src/common/update/models/UpdateSession';
import { UpdatePackage } from '../../src/common/update/models/UpdatePackage';

// Helper function to generate valid test checksums
const generateTestChecksum = (seed: string = 'a'): string => {
  const validChars = '0123456789abcdef';
  const charCode = seed.charCodeAt(0) % validChars.length;
  return validChars[charCode].repeat(64);
};

describe('UpdateSession Model', () => {
  let testPackage: UpdatePackage;
  let testSession: UpdateSession;

  beforeEach(() => {
    testPackage = UpdatePackage.createFull({
      version: '1.1.0',
      downloadUrl: 'https://example.com/app-1.1.0.dmg',
      platform: 'darwin',
      arch: 'x64',
      fileSize: 10 * 1024 * 1024, // 10MB
      checksum: generateTestChecksum('test'),
    });

    testSession = UpdateSession.create({
      sessionId: 'test_session_123',
      updatePackage: testPackage,
    });
  });

  describe('Basic Creation and Validation', () => {
    it('should create valid UpdateSession instance', () => {
      expect(testSession.sessionId).toBe('test_session_123');
      expect(testSession.status).toBe('downloading');
      expect(testSession.progress).toBe(0);
      expect(testSession.bytesDownloaded).toBe(0);
      expect(testSession.totalBytes).toBe(10 * 1024 * 1024);
      expect(testSession.isActive()).toBe(true);
      expect(testSession.isCompleted()).toBe(false);
      expect(testSession.isFailed()).toBe(false);
    });

    it('should generate unique session IDs', () => {
      const id1 = UpdateSession.generateSessionId();
      const id2 = UpdateSession.generateSessionId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^update_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^update_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should use custom total bytes when provided', () => {
      const customSession = UpdateSession.create({
        sessionId: 'custom_session',
        updatePackage: testPackage,
        totalBytes: 15 * 1024 * 1024, // Different from package size
      });

      expect(customSession.totalBytes).toBe(15 * 1024 * 1024);
    });

    it('should return UpdatePackage instance from session data', () => {
      const retrievedPackage = testSession.getUpdatePackage();
      expect(retrievedPackage.version).toBe(testPackage.version);
      expect(retrievedPackage.platform).toBe(testPackage.platform);
      expect(retrievedPackage.arch).toBe(testPackage.arch);
    });
  });

  describe('Progress Updates', () => {
    it('should update progress correctly', () => {
      const updatedSession = testSession.updateProgress(
        5 * 1024 * 1024, // 5MB downloaded
        1024 * 1024 // 1MB/s speed
      );

      expect(updatedSession.bytesDownloaded).toBe(5 * 1024 * 1024);
      expect(updatedSession.progress).toBeCloseTo(50, 1);
      expect(updatedSession.speed).toBe(1024 * 1024);
      expect(updatedSession.getRemainingBytes()).toBe(5 * 1024 * 1024);
      expect(updatedSession.estimatedTimeRemaining).toBeCloseTo(5000, 100); // ~5 seconds
    });

    it('should cap progress at 100% when bytes exceed total', () => {
      const updatedSession = testSession.updateProgress(15 * 1024 * 1024); // More than total

      expect(updatedSession.bytesDownloaded).toBe(10 * 1024 * 1024); // Capped at total
      expect(updatedSession.progress).toBeCloseTo(100, 1);
      expect(updatedSession.getRemainingBytes()).toBe(0);
    });

    it('should calculate average speed correctly', () => {
      // Mock Date.now to control time
      const originalNow = Date.now;
      const startTime = 1000000;
      Date.now = jest.fn(() => startTime);

      const session = UpdateSession.create({
        sessionId: 'speed_test',
        updatePackage: testPackage,
      });

      // Simulate 2 seconds later
      Date.now = jest.fn(() => startTime + 2000);
      const updatedSession = session.updateProgress(2 * 1024 * 1024); // 2MB in 2 seconds

      expect(updatedSession.getAverageSpeed()).toBeCloseTo(1024 * 1024, 1); // ~1MB/s

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('State Transitions', () => {
    it('should pause and resume correctly', () => {
      const pausedSession = testSession.pause();
      expect(pausedSession.status).toBe('paused');
      expect(pausedSession.isActive()).toBe(true);

      const resumedSession = pausedSession.resume();
      expect(resumedSession.status).toBe('downloading');
      expect(resumedSession.isActive()).toBe(true);
    });

    it('should complete session correctly', () => {
      const completedSession = testSession.complete();
      expect(completedSession.status).toBe('completed');
      expect(completedSession.progress).toBe(100);
      expect(completedSession.bytesDownloaded).toBe(testSession.totalBytes);
      expect(completedSession.isCompleted()).toBe(true);
      expect(completedSession.isActive()).toBe(false);
    });

    it('should fail session correctly', () => {
      const failedSession = testSession.fail('Network error occurred');
      expect(failedSession.status).toBe('failed');
      expect(failedSession.error).toBe('Network error occurred');
      expect(failedSession.isFailed()).toBe(true);
      expect(failedSession.isActive()).toBe(false);
    });

    it('should cancel session correctly', () => {
      const cancelledSession = testSession.cancel();
      expect(cancelledSession.status).toBe('cancelled');
      expect(cancelledSession.isCancelled()).toBe(true);
      expect(cancelledSession.isActive()).toBe(false);
    });
  });

  describe('Formatting Methods', () => {
    it('should format progress correctly', () => {
      const session50 = testSession.updateProgress(5 * 1024 * 1024);
      const session75 = testSession.updateProgress(7.5 * 1024 * 1024);

      expect(session50.getFormattedProgress()).toBe('50.0%');
      expect(session75.getFormattedProgress()).toBe('75.0%');
    });

    it('should format speed correctly', () => {
      const slowSession = testSession.updateProgress(1024 * 1024, 512 * 1024); // 512 KB/s
      const fastSession = testSession.updateProgress(1024 * 1024, 2 * 1024 * 1024); // 2 MB/s

      expect(slowSession.getFormattedSpeed()).toBe('512.0 KB/s');
      expect(fastSession.getFormattedSpeed()).toBe('2.0 MB/s');
    });

    it('should format time remaining correctly', () => {
      // Create sessions with specific estimated time remaining
      const sessionWith5s = new UpdateSession({
        ...testSession.toJSON(),
        estimatedTimeRemaining: 5000,
      });
      const sessionWith125s = new UpdateSession({
        ...testSession.toJSON(),
        estimatedTimeRemaining: 125000,
      });
      const sessionWith3725s = new UpdateSession({
        ...testSession.toJSON(),
        estimatedTimeRemaining: 3725000,
      });

      expect(sessionWith5s.getFormattedTimeRemaining()).toBe('5s');
      expect(sessionWith125s.getFormattedTimeRemaining()).toBe('2m 5s');
      expect(sessionWith3725s.getFormattedTimeRemaining()).toBe('1h 2m');
    });

    it('should format bytes correctly', () => {
      const session1MB = testSession.updateProgress(1024 * 1024);
      const session5_5MB = testSession.updateProgress(5.5 * 1024 * 1024);

      expect(session1MB.getFormattedBytesDownloaded()).toBe('1.0 MB');
      expect(session5_5MB.getFormattedBytesDownloaded()).toBe('5.5 MB');
      expect(testSession.getFormattedTotalBytes()).toBe('10.0 MB');
    });
  });

  describe('Health Status', () => {
    it('should return healthy status for normal operation', () => {
      const activeSession = testSession.updateProgress(1024 * 1024, 1024 * 1024);
      expect(activeSession.getHealthStatus()).toBe('healthy');
    });

    it('should return slow status for low speed', () => {
      const slowSession = testSession.updateProgress(1024, 5 * 1024); // 5 KB/s
      expect(slowSession.getHealthStatus()).toBe('slow');
    });

    it('should return stalled status for old last update', () => {
      const stalledSession = new UpdateSession({
        ...testSession.toJSON(),
        startedAt: Date.now() - 35000, // 35 seconds ago
      });
      expect(stalledSession.getHealthStatus()).toBe('stalled');
    });

    it('should return error status for failed sessions', () => {
      const failedSession = testSession.fail('Download failed');
      expect(failedSession.getHealthStatus()).toBe('error');
    });
  });

  describe('Elapsed Time Calculation', () => {
    it('should calculate elapsed time correctly', () => {
      const originalNow = Date.now;
      const startTime = 1000000;
      
      // Mock start time
      Date.now = jest.fn(() => startTime);
      const session = UpdateSession.create({
        sessionId: 'elapsed_test',
        updatePackage: testPackage,
      });

      // Mock current time (5 seconds later)
      Date.now = jest.fn(() => startTime + 5000);
      expect(session.getElapsedTime()).toBe(5000);

      // Test completed session
      Date.now = jest.fn(() => startTime + 3000);
      const completedSession = session.complete();
      Date.now = jest.fn(() => startTime + 10000); // Even later

      expect(completedSession.getElapsedTime()).toBe(3000); // Should use completedAt

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('Serialization', () => {
    it('should serialize to and from JSON correctly', () => {
      const progressedSession = testSession
        .updateProgress(3 * 1024 * 1024, 1024 * 1024)
        .pause();

      const json = progressedSession.toJSON();
      const restored = UpdateSession.fromJSON(json);

      expect(restored.equals(progressedSession)).toBe(true);
      expect(restored.sessionId).toBe(progressedSession.sessionId);
      expect(restored.status).toBe(progressedSession.status);
      expect(restored.progress).toBe(progressedSession.progress);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for empty session ID', () => {
      expect(() => {
        UpdateSession.create({
          sessionId: '',
          updatePackage: testPackage,
        });
      }).toThrow('Session ID cannot be empty');
    });

    it('should throw error for negative bytes downloaded', () => {
      expect(() => {
        testSession.updateProgress(-1024);
      }).toThrow('Bytes downloaded cannot be negative');
    });

    it('should throw error when pausing non-downloading session', () => {
      const completedSession = testSession.complete();
      expect(() => {
        completedSession.pause();
      }).toThrow('Can only pause downloading sessions');
    });

    it('should throw error when resuming non-paused session', () => {
      expect(() => {
        testSession.resume();
      }).toThrow('Can only resume paused sessions');
    });

    it('should throw error when completing non-active session', () => {
      const failedSession = testSession.fail('Test error');
      expect(() => {
        failedSession.complete();
      }).toThrow('Can only complete active sessions');
    });

    it('should throw error for empty error message', () => {
      expect(() => {
        testSession.fail('');
      }).toThrow('Error message cannot be empty');

      expect(() => {
        testSession.fail('   ');
      }).toThrow('Error message cannot be empty');
    });

    it('should throw error when cancelling completed session', () => {
      const completedSession = testSession.complete();
      expect(() => {
        completedSession.cancel();
      }).toThrow('Cannot cancel completed sessions');
    });
  });

  describe('Summary Generation', () => {
    it('should generate informative summary for downloading session', () => {
      const activeSession = testSession.updateProgress(2 * 1024 * 1024, 1024 * 1024);
      const summary = activeSession.getSummary();
      
      expect(summary).toContain('test_session_123');
      expect(summary).toContain('⬇️ Downloading');
      expect(summary).toContain('20.0%');
      expect(summary).toContain('1.0 MB/s');
      expect(summary).toContain('v1.1.0');
    });

    it('should generate informative summary for completed session', () => {
      const completedSession = testSession.complete();
      const summary = completedSession.getSummary();
      
      expect(summary).toContain('test_session_123');
      expect(summary).toContain('✅ Completed');
      expect(summary).toContain('v1.1.0');
    });

    it('should generate informative summary for failed session', () => {
      const failedSession = testSession.fail('Network timeout');
      const summary = failedSession.getSummary();
      
      expect(summary).toContain('test_session_123');
      expect(summary).toContain('❌ Failed: Network timeout');
      expect(summary).toContain('v1.1.0');
    });
  });
});