/**
 * Metadata Precheck Unit Tests
 *
 * Tests each precheck rule individually and the combined runPrecheck function.
 * Uses Node.js built-in test runner (node --test).
 *
 * Run with: node --test precheck.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRECHECK_RULES, runPrecheck } from './precheck.js';

describe('PRECHECK_RULES', () => {
  it('has 10 rules defined', () => {
    assert.equal(PRECHECK_RULES.length, 10);
  });

  it('every rule has an id and name', () => {
    for (const rule of PRECHECK_RULES) {
      assert.ok(rule.id, `Rule missing id`);
      assert.ok(rule.name, `Rule ${rule.id} missing name`);
    }
  });
});

describe('runPrecheck', () => {
  it('returns empty array for clean text', async () => {
    const warnings = await runPrecheck('My awesome productivity app helps you stay organized.');
    assert.equal(warnings.length, 0);
  });

  it('detects negative Apple sentiment', async () => {
    const warnings = await runPrecheck('Apple sucks and their review process is terrible.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('negative_apple'));
  });

  it('detects competitor mentions', async () => {
    const warnings = await runPrecheck('Also available on Android and Google Play.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('competitor_mention'));
  });

  it('detects objectionable language', async () => {
    const warnings = await runPrecheck('This damn app is great.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('curse_words'));
  });

  it('detects future functionality', async () => {
    const warnings = await runPrecheck('Dark mode coming soon in the next update.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('future_functionality'));
  });

  it('detects test/debug words', async () => {
    const warnings = await runPrecheck('This is a test version with debug logging.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('test_words'));
  });

  it('detects placeholder text', async () => {
    const warnings = await runPrecheck('Lorem ipsum dolor sit amet consectetur.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('placeholder_text'));
  });

  it('detects free IAP claims', async () => {
    const warnings = await runPrecheck('Get free in-app purchases with this offer.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('free_iap'));
  });

  it('detects outdated copyright year', async () => {
    const warnings = await runPrecheck('© 2020 My Company. All rights reserved.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('copyright_year'));
    const msg = warnings.find(w => w.id === 'copyright_year').message;
    assert.ok(msg.includes('2020'));
  });

  it('passes current copyright year', async () => {
    const currentYear = new Date().getFullYear();
    const warnings = await runPrecheck(`© ${currentYear} My Company.`);
    const ids = warnings.map(w => w.id);
    assert.ok(!ids.includes('copyright_year'));
  });

  it('detects price mentions', async () => {
    const warnings = await runPrecheck('Premium version available for $9.99 per month.');
    const ids = warnings.map(w => w.id);
    assert.ok(ids.includes('price_mention'));
  });

  it('returns multiple warnings for problematic text', async () => {
    const warnings = await runPrecheck('Coming soon on Android! This costs $5 and Apple sucks.');
    assert.ok(warnings.length >= 4);
  });

  it('handles empty string', async () => {
    const warnings = await runPrecheck('');
    assert.equal(warnings.length, 0);
  });
});
