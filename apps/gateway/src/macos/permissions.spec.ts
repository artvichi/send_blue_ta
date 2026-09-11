import { describe, it, expect } from 'vitest';
import { detectHostApp } from './permissions.js';

/**
 * The host-app detection is the part of the permission flow that is easy to get
 * silently wrong: naming the wrong application sends the user to tick a box that
 * grants nothing.
 */
describe('detectHostApp', () => {
  it('always names something the user could act on', () => {
    const app = detectHostApp();
    expect(app.name).toBeTruthy();
    expect(app.name.length).toBeGreaterThan(0);
  });

  it('never suggests the node binary, which cannot hold the permission', () => {
    const app = detectHostApp();
    expect(app.name.toLowerCase()).not.toBe('node');
    expect(app.name.toLowerCase()).not.toBe('npm');
  });

  it('strips the .app suffix, matching what Settings displays', () => {
    const app = detectHostApp();
    expect(app.name.endsWith('.app')).toBe(false);
  });

  it('reports an app path only when it is a real bundle', () => {
    const app = detectHostApp();
    if (app.appPath !== null) {
      expect(app.appPath).toMatch(/\.app$/);
    }
  });
});
