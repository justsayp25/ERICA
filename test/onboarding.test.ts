import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('first run: the app asks for a name before showing anything else', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.ok(app.includes('<WelcomeScreen'), 'App must render the welcome screen');
  assert.ok(/hasName \? \(\s*<RootNavigator \/>/.test(app), 'the main app only renders once a name is saved');
  const welcome = fs.readFileSync('src/features/onboarding/WelcomeScreen.tsx', 'utf8');
  assert.ok(welcome.includes('userName: trimmed'), 'the name is saved as the alert name');
  assert.ok(welcome.includes('disabled={!trimmed}'), 'an empty name cannot continue');
});
