import {getMediaTypeMatchers, matchType, matchAnyType, MediaTypeTemplate, MediaType, MediaTypeMatchers} from '../src/mediaTypes';

describe('Gets Media Type Matchers', () => {
  it('Gets gets an matcher from a string', () => {
    const mediaTypeIdentifier = 'application/json';
    expect(getMediaTypeMatchers(mediaTypeIdentifier)).toEqual([['application', 'json']]);
  });
  it('Gets gets an matcher from a string with asterisk', () => {
    const mediaTypeIdentifier = 'application/*';
    expect(getMediaTypeMatchers(mediaTypeIdentifier)).toEqual([['application', null]]);
  });
  it('Gets an matcher from a matching function', () => {
    const mediaTypeIdentifier = (mediaType: MediaType) => true;
    expect(getMediaTypeMatchers(mediaTypeIdentifier).toString()).toBe('(mediaType) => true');
  });
  it('Gets matcher from an array with matchers', () => {
    const mediatTypeIdentifier = [
      '*/*',
      (mediaType: MediaType) => Math.random() < 0.5,
    ];
    expect(getMediaTypeMatchers(mediatTypeIdentifier).map(res => Array.isArray(res) ? res : res.toString()))
      .toEqual([[null, null], '(mediaType) => Math.random() < 0.5']);
  });
  it('Throws if matcher is invalid', () => {
    expect(() => getMediaTypeMatchers('application')).toThrow();
    expect(() => getMediaTypeMatchers('application/json/xml')).toThrow();
  });
});

describe('Matches media types', () => {
  it('Matches media types exactly', () => {
    const mediaTypeIdentifier = 'application/json';
    const mediaType = 'application/json';
    expect(matchType(<MediaTypeTemplate>getMediaTypeMatchers(mediaTypeIdentifier)[0], <[string, string]>mediaType.split('/')))
      .toBeTruthy();
  });
  it('Matches media types with asterix', () => {
    const mediaTypeIdentifier = '*/json';
    const mediaType = 'application/json';
    expect(matchType(<MediaTypeTemplate>getMediaTypeMatchers(mediaTypeIdentifier)[0], <[string, string]>mediaType.split('/')))
      .toBeTruthy();
  });
  it('Does not match media types with asterix', () => {
    const mediaTypeIdentifier = '*/json';
    const mediaType = 'text/plain';
    expect(matchType(<MediaTypeTemplate>getMediaTypeMatchers(mediaTypeIdentifier)[0], <[string, string]>mediaType.split('/')))
      .toBeFalsy();
  });
});

describe('Matches from MediaTypeMatchers', () => {
  it('Matches different media types', () => {
    const mediatypeMatchers: MediaTypeMatchers = [['application', 'json'], ['text', 'plain'], (mediaType: MediaType) => mediaType[1] === 'octet-stream'];
    expect(matchAnyType(mediatypeMatchers, ['application', 'json'])).toBeTruthy();
    expect(matchAnyType(mediatypeMatchers, ['text', 'plain'])).toBeTruthy();
    expect(matchAnyType(mediatypeMatchers, ['application', 'octet-stream'])).toBeTruthy();
    expect(matchAnyType(mediatypeMatchers, ['application', 'stream'])).toBeFalsy();
  });
});
