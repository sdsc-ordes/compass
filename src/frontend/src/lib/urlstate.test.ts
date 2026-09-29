import { describe, expect, it } from 'vitest';
import { decodeFilters, decodePin, encodeFilters, encodePin } from './urlstate';

const ns = 'http://example.org/onto#';
const dims = [
  {
    id: 'workArea',
    options: [{ value: `${ns}AdvocacyWork` }, { value: `${ns}RescueActivities` }],
  },
  {
    id: 'species',
    options: [{ value: 'http://a.org/x/Whale' }, { value: 'http://b.org/Whale' }],
  },
];
const filters = {
  workArea: [`${ns}AdvocacyWork`, `${ns}RescueActivities`],
  species: ['http://b.org/Whale'],
};

const toParams = (f: Record<string, string[]>) =>
  new URLSearchParams(Object.entries(f).flatMap(([k, vs]) => vs.map((v) => [k, v])));

describe('url filters', () => {
  it('writes local names, full IRIs only where names clash', () => {
    expect(encodeFilters(filters, dims)).toEqual({
      workArea: ['AdvocacyWork', 'RescueActivities'],
      species: ['http://b.org/Whale'],
    });
  });

  it('round-trips back to full IRIs', () => {
    expect(decodeFilters(toParams(encodeFilters(filters, dims)), dims)).toEqual(filters);
  });

  it('accepts old full-IRI links and drops unknown values', () => {
    const params = toParams({ workArea: [`${ns}AdvocacyWork`, 'Nope'], other: ['x'] });
    expect(decodeFilters(params, dims)).toEqual({ workArea: [`${ns}AdvocacyWork`] });
  });
});

describe('url pin', () => {
  const ids = ['http://e.org/a/Reef', 'http://e.org/a/Bay', 'http://e.org/b/Bay'];

  it('round-trips via local names, full IRIs where names clash', () => {
    expect(ids.map((id) => encodePin(id, ids))).toEqual(['Reef', ids[1], ids[2]]);
    ids.forEach((id) => expect(decodePin(encodePin(id, ids), ids)).toBe(id));
  });

  it('drops unknown or ambiguous pins', () => {
    expect(decodePin('Nope', ids)).toBeNull();
    expect(decodePin('Bay', ids)).toBeNull();
  });
});
