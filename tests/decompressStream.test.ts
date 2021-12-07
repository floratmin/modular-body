import {deleteMissingKeys, matchContentEncoding} from '../src/decompressStream';
import {getAvailableDecompressors} from '../src/decompressStream';
import {PatchedParser} from '../src/bufferEncoding';
import {Transform} from 'stream';

describe('Matches content encoding', () => {
  it('Returns true when content is encoded and the decoder is allowed trough the parser definition', () => {
    expect(matchContentEncoding('identity', ['gzip', 'br'], ['gzip', 'inflate', 'br'])).toBeTruthy();
  });
  it('Returns true when content is encoded and the decoder is allowed trough the parser definition', () => {
    expect(matchContentEncoding('br', ['gzip', 'br'], ['gzip', 'inflate', 'br'])).toBeTruthy();
  });
  it('Returns false when content is encoded and the decoder is not allowed trough the parser definition', () => {
    expect(matchContentEncoding('inflate', ['gzip', 'br'], ['gzip', 'inflate', 'br'])).toBeFalsy();
  });
  it('Returns true when content is encoded, inflate is true, but encoding specified in availableDecompressorNames', () => {
    expect(matchContentEncoding('br', true, ['gzip', 'br'])).toBeTruthy();
  });
  it('Returns true when content is encoded, inflate is true and encoding not specified in availableDecompressorNames', () => {
    expect(matchContentEncoding('inflate', true, ['gzip', 'br'])).toBeFalsy();
  });
});

describe('Deletes missing keys from objects', () => {
  it('Removes missing keys from obj', () => {
    const obj = {
      foo: 1,
      bar: 'Bar',
    };
    const neededKeys = ['foo'];
    deleteMissingKeys(obj, neededKeys);
    expect(obj).toEqual({
      foo: 1,
    });
  });
  it('Does nothing if obj is undefined', () => {
    const obj = undefined;
    deleteMissingKeys(obj, []);
    expect(obj).toBeUndefined();
  });
});

describe('Getting available decompressors', () => {
  it('Gets standard decompressors', () => {
    const parsers = <PatchedParser<any, any> []>[{
      inflate: ['deflate', 'gzip', 'br'],
    }];
    const {availableDecompressors, availableDecompressorNames} = getAvailableDecompressors(parsers);
    expect(availableDecompressors).toEqual({
      deflate: expect.any(Function),
      gzip: expect.any(Function),
      br: expect.any(Function),
    });
    expect(availableDecompressors.br().constructor.toString()).toBe(
      `function BrotliDecompress(opts) {
  if (!(this instanceof BrotliDecompress))
    return new BrotliDecompress(opts);
  ReflectApply(Brotli, this, [opts, BROTLI_DECODE]);
}`
    );
    expect(availableDecompressorNames).toEqual(['deflate', 'gzip', 'br']);
  });
  it('Removes unused decompressors', () => {
    const parsers = <PatchedParser<any, any> []>[{
      inflate: ['br'],
    }];
    const {availableDecompressors, availableDecompressorNames} = getAvailableDecompressors(parsers);
    expect(availableDecompressors).toEqual({
      br: expect.any(Function),
    });
    expect(availableDecompressorNames).toEqual(['br']);
  });
  it('Replaces decompressors', () => {
    const parsers = <PatchedParser<any, any> []>[{
      inflate: ['br'],
    }];
    const decompressors = {
      br: function myBrotliDecompress(opts: any) { return 'decompressed with brotli'; }
    };
    const {availableDecompressors, availableDecompressorNames} = getAvailableDecompressors(parsers, <Record<string, () => Transform>><unknown>decompressors);
    expect(availableDecompressors).toEqual({
      br: expect.any(Function),
    });
    expect(availableDecompressors.br.toString()).toBe('function myBrotliDecompress(opts) { return \'decompressed with brotli\'; }');
    expect(availableDecompressorNames).toEqual(['br']);
  });
  it('Adds decompressors', () => {
    const parsers = <PatchedParser<any, any> []>[{
      inflate: ['br'],
    },{
      inflate: ['foo'],
    }];
    const decompressors = {
      foo: function myFooDecompress(opts: any) { return 'decompressed with foo'; }
    };
    const {availableDecompressors, availableDecompressorNames} = getAvailableDecompressors(parsers, <Record<string, () => Transform>><unknown>decompressors);
    expect(availableDecompressors).toEqual({
      br: expect.any(Function),
      foo: expect.any(Function),
    });
    expect(availableDecompressors.foo.toString()).toBe('function myFooDecompress(opts) { return \'decompressed with foo\'; }');
    expect(availableDecompressorNames).toEqual(['br', 'foo']);
  });
  it('Throws when decompressor is not available', () => {
    const parsers =<PatchedParser<any, any >[]>[{
      inflate: ['foo'],
    }];
    expect(() => getAvailableDecompressors(parsers)).toThrow('The following decompressors in the parse configuration are not supplied: foo');
  });
});
