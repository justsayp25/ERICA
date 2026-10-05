import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  normalizeNumber,
  toImportCandidates,
  isAlreadyAdded,
} from '../src/features/contacts/phoneContactImport';

test('normalizeNumber: spacing and punctuation do not matter, a leading + is kept', () => {
  assert.strictEqual(normalizeNumber('0917 123-4567'), '09171234567');
  assert.strictEqual(normalizeNumber(' +63 (917) 123 4567 '), '+639171234567');
});

test('toImportCandidates: one choice per distinct number, empty numbers skipped, sorted by name', () => {
  const candidates = toImportCandidates([
    { id: 'b', name: 'Ben', phoneNumbers: [{ number: '0917 111 2222' }, { number: '09171112222' }, { number: '' }] },
    { id: 'a', name: 'Ana', phoneNumbers: [{ number: '+63 917 333 4444' }, { number: '02 8123 4567' }] },
    { id: 'c', name: 'No number', phoneNumbers: [] },
    { id: 'd', phoneNumbers: [{ number: '0999 000 1111' }] },
  ]);
  assert.deepStrictEqual(
    candidates.map((c) => [c.name, c.phoneNumber]),
    [
      ['0999 000 1111', '0999 000 1111'], // no name: the number stands in for it
      ['Ana', '+63 917 333 4444'],
      ['Ana', '02 8123 4567'],
      ['Ben', '0917 111 2222'], // the same number written twice appears once
    ]
  );
  assert.strictEqual(new Set(candidates.map((c) => c.key)).size, candidates.length, 'keys are unique');
});

test('isAlreadyAdded: matches existing contacts regardless of formatting', () => {
  const [candidate] = toImportCandidates([{ id: 'x', name: 'Ana', phoneNumbers: [{ number: '0917-123-4567' }] }]);
  assert.strictEqual(isAlreadyAdded(candidate, [{ id: '1', name: 'Ana', phoneNumber: '0917 123 4567' }]), true);
  assert.strictEqual(isAlreadyAdded(candidate, [{ id: '1', name: 'Ana', phoneNumber: '0918 123 4567' }]), false);
});

test('contacts permission is read-only: WRITE_CONTACTS is blocked, READ_CONTACTS requested', () => {
  const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.ok(manifest.includes('android.permission.READ_CONTACTS'));
  assert.ok(/WRITE_CONTACTS" tools:node="remove"/.test(manifest), 'WRITE_CONTACTS must be removed');
  assert.ok(!/USE_BIOMETRIC|USE_FINGERPRINT/.test(manifest), 'biometric permissions left with the PIN removal');
});

test('contacts screen: the add form and import button come before the list (keyboard cannot cover them)', () => {
  const screen = fs.readFileSync('src/features/contacts/ContactsScreen.tsx', 'utf8');
  const form = screen.indexOf('placeholder="Phone number"');
  const list = screen.indexOf('<FlatList');
  assert.ok(form !== -1 && list !== -1 && form < list, 'form must be above the contact list');
  assert.ok(screen.includes('Import from phone'));
});
