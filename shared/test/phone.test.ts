import { describe, expect, it } from 'vitest';
import { whatsappHref } from '../src/phone';

describe('whatsappHref', () => {
  it('keeps international numbers', () => {
    expect(whatsappHref('+961 70 100 201')).toBe('https://wa.me/96170100201');
    expect(whatsappHref('+44 7700 900123')).toBe('https://wa.me/447700900123');
  });
  it('handles 00 prefixes', () => {
    expect(whatsappHref('00961 3 100 205')).toBe('https://wa.me/9613100205');
  });
  it('adds the Lebanese country code to local numbers', () => {
    expect(whatsappHref('03 100 205')).toBe('https://wa.me/9613100205');
    expect(whatsappHref('70 100 201')).toBe('https://wa.me/96170100201');
    expect(whatsappHref('96170100201')).toBe('https://wa.me/96170100201');
  });
});
