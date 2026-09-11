import { describe, it, expect } from 'vitest';
import { appFromCommand, detectHostApp } from './host-app.js';

/**
 * Real process paths from macOS. Getting the name wrong sends the user to tick
 * a box that grants nothing, which is the most common way this setup fails.
 */
describe('appFromCommand', () => {
  it.each([
    ['/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal', 'Terminal'],
    ['/Applications/iTerm.app/Contents/MacOS/iTerm2', 'iTerm'],
    ['/Applications/Visual Studio Code.app/Contents/MacOS/Code', 'Visual Studio Code'],
    ['/Applications/Ghostty.app/Contents/MacOS/ghostty', 'Ghostty'],
    ['/Applications/Warp.app/Contents/MacOS/stable', 'Warp'],
  ])('names %s as %s', (command, expected) => {
    expect(appFromCommand(command)?.name).toBe(expected);
  });

  it('attributes a helper process to its outer bundle', () => {
    // TCC grants the permission to Orca, not to "Orca Helper".
    const command = '/Applications/Orca.app/Contents/Frameworks/Orca Helper.app/Contents/MacOS/Orca Helper';
    expect(appFromCommand(command)).toEqual({
      name: 'Orca',
      appPath: '/Applications/Orca.app',
    });
  });

  it('returns null for a bare binary, so the caller can fall back', () => {
    expect(appFromCommand('/opt/homebrew/Cellar/node/22.0/bin/node')).toBeNull();
    expect(appFromCommand('/bin/zsh')).toBeNull();
  });
});

describe('detectHostApp', () => {
  it('never names node or npm, which cannot hold the permission', () => {
    const name = detectHostApp().name.toLowerCase();
    expect(name).not.toBe('node');
    expect(name).not.toBe('npm');
  });

  it('always returns something actionable', () => {
    expect(detectHostApp().name.length).toBeGreaterThan(0);
  });
});
