import {
  normalizeEncodings,
  joinParserConfigurations,
  ParserConfigurations,
  ParserConfiguration,
  getEncodingVariations,
  matchCharsetEncoding,
  BufferEncoder,
  PatchedParser, getAvailableBufferEncodings, getEncodings, getInflate, getQuerystringParser
} from '../src/bufferEncoding';
import { MediaType } from '../src/mediaTypes';
import {Buffer} from 'buffer';

describe('Function matchCharsetEncoding', () => {
  it('Returns true when there is no charsetEncoding, no charset and no defaultEncoding', () => {
    expect(matchCharsetEncoding(undefined, false, ['utf8', 'utf-8'], undefined)).toBeTruthy();
  });
  it('Returns false when there is a charsetEncoding, no charset and no defaultEncoding', () => {
    expect(matchCharsetEncoding(['utf8', 'utf-8'], false, ['utf8', 'utf-8'], undefined)).toBeFalsy();
    expect(matchCharsetEncoding(true, false, ['utf8', 'utf-8'], undefined)).toBeFalsy();
  });
  it('Returns false when there is no charsetEncoding, a charset and no defaultEncoding', () => {
    expect(matchCharsetEncoding(undefined, 'utf-8', ['utf8', 'utf-8'], undefined)).toBeFalsy();
  });
  it('Returns true when there is no charsetEncoding, no charset and a defaultEncoding', () => {
    expect(matchCharsetEncoding(['utf-8'], false, [], 'utf-8')).toBeTruthy();
    expect(matchCharsetEncoding(true, false, ['utf8', 'utf-8'], 'utf-8')).toBeTruthy();
  });
  it('Returns false when there is a charsetEncoding and an unavailable charset', () => {
    expect(matchCharsetEncoding(true, 'utf-8', ['ucs2', 'ucs-2'], undefined)).toBeFalsy();
    expect(matchCharsetEncoding(true, 'utf-8', ['ucs2', 'ucs-2'], 'ucs-2')).toBeFalsy();
    expect(matchCharsetEncoding(['ucs2', 'ucs-2'], 'utf-8', ['utf8', 'utf-8', 'ucs2', 'ucs-2'], undefined)).toBeFalsy();
    expect(matchCharsetEncoding(['ucs2', 'ucs-2'], 'utf-8', ['utf8', 'utf-8', 'ucs2', 'ucs-2'], 'ucs-2')).toBeFalsy();
  });
  it('Returns true when there is a charsetEncoding and an available charset', () => {
    expect(matchCharsetEncoding(true, 'utf-8', ['utf8', 'utf-8'], undefined)).toBeTruthy();
    expect(matchCharsetEncoding(true, 'utf-8', ['utf8', 'utf-8'], 'utf-8')).toBeTruthy();
    expect(matchCharsetEncoding(['utf-8', 'utf8'], 'utf-8', ['utf8', 'utf-8'], undefined)).toBeTruthy();
    expect(matchCharsetEncoding(['utf-8', 'utf8'], 'utf-8', ['utf8', 'utf-8'], 'utf-8')).toBeTruthy();
  });
});

describe('Get encoding name variations object', () => {
  it('Creates standard variations object', () => {
    const {encodingVariations, nodeEncodingVariations} = getEncodingVariations();
    expect(encodingVariations).toEqual({
      'utf8': ['utf-8', 'utf8'],
      'utf-8': ['utf-8', 'utf8'],
      'ucs2': ['ucs-2', 'ucs2'],
      'ucs-2': ['ucs-2', 'ucs2'],
    });
    expect(nodeEncodingVariations).toEqual(['utf8', 'ucs2']);
  });
  it('Overwrites standard variations object', () => {
    const bufferEncodings = [{
      transform: (buffer: Buffer) => true,
      encodings: ['utf-8', 'utf8', 'utf'],
    }];
    const {encodingVariations, nodeEncodingVariations} = getEncodingVariations(bufferEncodings);
    expect(encodingVariations).toEqual({
      'utf': ['utf-8', 'utf8', 'utf'],
      'utf8': ['utf-8', 'utf8', 'utf'],
      'utf-8': ['utf-8', 'utf8', 'utf'],
      'ucs2': ['ucs-2', 'ucs2'],
      'ucs-2': ['ucs-2', 'ucs2'],
    });
    expect(nodeEncodingVariations).toEqual(['ucs-2']);
  });
  it('Adds variations', () => {
    const bufferEncodings: BufferEncoder<true, boolean | number>[] = [
      {
        onData: (buffer: Buffer) => true,
        onEnd: () => true,
        reduce: (array: true[]) => array.every((bool) => bool),
        encodings: ['windows-1252', 'latin1'],
      }, {
        transform: (buffer: Buffer) => 1,
        encodings: ['foo', 'bar'],
      },
    ];
    const {encodingVariations, nodeEncodingVariations} = getEncodingVariations(bufferEncodings);
    expect(encodingVariations).toEqual({
      'utf8': ['utf-8', 'utf8'],
      'utf-8': ['utf-8', 'utf8'],
      'ucs2': ['ucs-2', 'ucs2'],
      'ucs-2': ['ucs-2', 'ucs2'],
      'windows-1252': ['windows-1252', 'latin1'],
      'latin1': ['windows-1252', 'latin1'],
      'foo': ['foo', 'bar'],
      'bar': ['foo', 'bar'],
    });
    expect(nodeEncodingVariations).toEqual(['utf-8', 'ucs-2']);
  });
  it('Throws when same encoding in multiple variation', () => {
    const bufferEncodings: BufferEncoder<true, boolean | number>[] = [
      {
        onData: (buffer: Buffer) => true,
        onEnd: () => true,
        reduce: (array: true[]) => array.every((bool) => bool),
        encodings: ['windows-1252', 'latin1'],
      }, {
        transform: (buffer: Buffer) => 1,
        encodings: ['utf-8', 'latin1'],
      },
    ];
    expect(() => getEncodingVariations(bufferEncodings)).toThrow('Same encoding is supplied more than one time in BufferEncoding object.');
  });
});

describe('Gets all available buffer encodings', () => {
  it('Gets the node native buffer encodings', () => {
    const parsers = <PatchedParser<any, any> []>[
      {
        encodings: ['utf-8', 'utf8'],
      }, {
        encodings: ['latin1', 'hex'],
      },
    ];
    const encodingVariations = {
      'utf8': ['utf-8', 'utf8'],
      'utf-8': ['utf-8', 'utf8'],
      'ucs2': ['ucs-2', 'ucs2'],
      'ucs-2': ['ucs-2', 'ucs2'],
    };
    const nodeEncodingVariations = ['utf8', 'ucs2'];
    const {availableBufferEncodings, availableBufferEncodingNames} = getAvailableBufferEncodings(parsers, encodingVariations, nodeEncodingVariations);
    expect(availableBufferEncodings).toEqual({
      'utf-8': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['utf-8', 'utf8'],
      },
      'utf8': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['utf-8', 'utf8'],
      },
      'latin1': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['latin1'],
      },
      'hex': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['hex'],
      },
    });
    expect(availableBufferEncodingNames).toEqual(['utf-8', 'utf8', 'latin1', 'hex']);
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['utf8']).onData)
      .toBe((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['utf-8']).onData);
  });
  it('Overwrites native encodings', () => {
    const bufferEncodings = <BufferEncoder<number, number | number[]> []>[
      {
        onData: (buffer: Buffer) => 1,
        onEnd: () => 1,
        reduce: (array: number[]) => array.reduce((acc, e) => acc + e, 0),
        encodings: ['utf-8'],
      },
      {
        transform: (buffer: Buffer) => [parseInt(buffer.toString(), 16)],
        encodings: ['hex'],
      },
      {
        transform: (buffer: Buffer) => 'ucs2',
        encodings: ['ucs-2', 'ucs2'],
      }
    ];
    const {encodingVariations, nodeEncodingVariations} = getEncodingVariations(bufferEncodings);
    const parsers = <PatchedParser<any, any> []>[
      {
        encodings: ['utf-8', 'utf8'],
      }, {
        encodings: ['latin1', 'hex', 'ucs2', 'ucs-2'],
      },
    ];
    const {availableBufferEncodings, availableBufferEncodingNames} = getAvailableBufferEncodings(parsers, encodingVariations, nodeEncodingVariations, bufferEncodings);
    expect(encodingVariations).toEqual({
      'ucs2': ['ucs-2', 'ucs2'],
      'ucs-2': ['ucs-2', 'ucs2'],
    });
    expect(availableBufferEncodingNames).toEqual(['utf8', 'latin1', 'utf-8', 'hex', 'ucs-2', 'ucs2']);
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['utf-8']).onData.toString()).toBe('(buffer) => 1');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['utf8']).onData.toString()).toMatch('decoder.write(buffer)');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['latin1']).onData.toString()).toMatch('decoder.write(buffer)');
    expect((<{transform: (buffer: Buffer) => any}>availableBufferEncodings['hex']).transform.toString()).toBe('(buffer) => [parseInt(buffer.toString(), 16)]');
    expect((<{transform: (buffer: Buffer) => any}>availableBufferEncodings['ucs-2']).transform.toString()).toBe('(buffer) => \'ucs2\'');
    expect((<{transform: (buffer: Buffer) => any}>availableBufferEncodings['ucs2']).transform.toString()).toBe('(buffer) => \'ucs2\'');
    expect(availableBufferEncodings['utf8']).not.toBe(availableBufferEncodings['latin1']);
    expect(availableBufferEncodings).toEqual({
      'utf-8': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['utf-8'],
      },
      'utf8': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['utf8'],
      },
      'ucs-2': {
        transform: expect.any(Function),
        encodings: ['ucs-2', 'ucs2'],
      },
      'ucs2': {
        transform: expect.any(Function),
        encodings: ['ucs-2', 'ucs2'],
      },
      'latin1': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['latin1'],
      },
      'hex': {
        transform: expect.any(Function),
        encodings: ['hex'],
      },
    });
  });
  it('Creates new encodings', () => {
    const bufferEncodings = <BufferEncoder<number, number | string> []>[
      {
        onData: (buffer: Buffer) => 1,
        onEnd: () => 1,
        reduce: (array: number[]) => array.reduce((acc, e) => acc + e, 0),
        encodings: ['windows-1252', 'latin1'],
      },
      {
        transform: (buffer: Buffer) => 'שלום עולם',
        encodings: ['iso-8859-8', 'hebrew'],
      },
      {
        transform: (buffer: Buffer) => 'latin2',
        encodings: ['iso-8859-2'],
      },
    ];
    const {encodingVariations, nodeEncodingVariations} = getEncodingVariations(bufferEncodings);
    const parsers = <PatchedParser<any, any> []>[
      {
        encodings: ['utf-8', 'iso-8859-8', 'iso-8859-2'],
      }, {
        encodings: ['latin1', 'hex', 'ucs2'],
      },
    ];
    const {availableBufferEncodings, availableBufferEncodingNames} = getAvailableBufferEncodings(parsers, encodingVariations, nodeEncodingVariations, bufferEncodings);
    expect(encodingVariations).toEqual({
      'utf-8': ['utf-8', 'utf8'],
      'utf8': ['utf-8', 'utf8'],
      'ucs2': ['ucs-2', 'ucs2'],
      'ucs-2': ['ucs-2', 'ucs2'],
      'windows-1252': ['windows-1252', 'latin1'],
      'latin1': ['windows-1252', 'latin1'],
      'iso-8859-8': ['iso-8859-8', 'hebrew'],
      'hebrew': ['iso-8859-8', 'hebrew'],
    });
    expect(availableBufferEncodingNames).toEqual(['utf-8', 'utf8', 'ucs-2', 'ucs2', 'hex', 'windows-1252', 'latin1', 'iso-8859-8', 'hebrew', 'iso-8859-2']);
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['windows-1252']).onData.toString()).toBe('(buffer) => 1');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['latin1']).onData.toString()).toBe('(buffer) => 1');
    expect((<{transform: (buffer: Buffer) => any}>availableBufferEncodings['iso-8859-8']).transform.toString()).toBe('(buffer) => \'שלום עולם\'');
    expect((<{transform: (buffer: Buffer) => any}>availableBufferEncodings['hebrew']).transform.toString()).toBe('(buffer) => \'שלום עולם\'');
    expect((<{transform: (buffer: Buffer) => any}>availableBufferEncodings['iso-8859-2']).transform.toString()).toBe('(buffer) => \'latin2\'');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['utf-8']).onData.toString()).toMatch('decoder.write(buffer)');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['utf8']).onData.toString()).toMatch('decoder.write(buffer)');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['ucs-2']).onData.toString()).toMatch('decoder.write(buffer)');
    expect((<{onData: (buffer: Buffer) => any}>availableBufferEncodings['ucs2']).onData.toString()).toMatch('decoder.write(buffer)');
    expect(availableBufferEncodings['windows-1252']).toBe(availableBufferEncodings['latin1']);
    expect(availableBufferEncodings['iso-8859-8']).toBe(availableBufferEncodings['hebrew']);
    expect(availableBufferEncodings['utf-8']).toBe(availableBufferEncodings['utf8']);
    expect(availableBufferEncodings['ucs-2']).toBe(availableBufferEncodings['ucs2']);
    expect(availableBufferEncodings['ucs-2']).not.toBe(availableBufferEncodings['hex']);
    expect(availableBufferEncodings).toEqual({
      'utf-8': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['utf-8', 'utf8'],
      },
      'utf8': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['utf-8', 'utf8'],
      },
      'ucs-2': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['ucs-2', 'ucs2'],
      },
      'ucs2': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['ucs-2', 'ucs2'],
      },
      'hex': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['hex'],
      },
      'windows-1252': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['windows-1252', 'latin1'],
      },
      'latin1': {
        onData: expect.any(Function),
        onEnd: expect.any(Function),
        reduce: expect.any(Function),
        encodings: ['windows-1252', 'latin1'],
      },
      'iso-8859-8': {
        transform: expect.any(Function),
        encodings: ['iso-8859-8', 'hebrew'],
      },
      'hebrew': {
        transform: expect.any(Function),
        encodings: ['iso-8859-8', 'hebrew'],
      },
      'iso-8859-2': {
        transform: expect.any(Function),
        encodings: ['iso-8859-2'],
      },
    });
  });
  it('Throws when encoding in multiple buffer encodings', () => {
    const bufferEncodings: BufferEncoder<true, boolean | number>[] = [
      {
        onData: (buffer: Buffer) => true,
        onEnd: () => true,
        reduce: (array: true[]) => array.every((bool) => bool),
        encodings: ['windows-1252', 'latin1'],
      }, {
        transform: (buffer: Buffer) => 1,
        encodings: ['utf-8', 'latin1'],
      },
    ];
    expect(() => getAvailableBufferEncodings([], {}, [], bufferEncodings)).toThrow('The encodings latin1 are defined in multiple BufferEncodings');
  });
  it('Throws when encoding not available as buffer encoder', () => {
    const { encodingVariations, nodeEncodingVariations } = getEncodingVariations();
    const parserConfigurations = <PatchedParser<any, any> []>[
      {
        matcher: [['text','plain']],
        encodings: ['windows-1252'],
        inflate: true,
        limit: 1000,
        requireContentLength: false,
      },
    ];
    expect(() => getAvailableBufferEncodings(parserConfigurations, encodingVariations, nodeEncodingVariations)).toThrow('The following decompressors in the parse configuration are not supplied: windows-1252');
  });
});

describe('Normalizing encodings', () => {
  it('Converts all encodings to lower case', () => {
    const encodings = [
      ['UTF8', 'uTf-8'],
      ['UTF8'],
      ['uCs-2'],
    ];
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(encodings.map(encoding => normalizeEncodings(encoding, encodingVariations))).toEqual([
      ['utf-8', 'utf8'],
      ['utf-8', 'utf8'],
      ['ucs-2', 'ucs2'],
    ]);
  });
  it('Adds equivalent encodings', () => {
    const encodings = [
      ['utf8', 'ucs-2', 'hex'],
      ['utf-8', 'ucs2', 'ucs-2'],
      ['latin2'],
      ['windows-1252'],
    ];
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ],
      'iso-8859-2': ['iso-8859-2', 'latin2'],
      'latin2': ['iso-8859-2', 'latin2'],
    };
    expect(encodings.map(encoding => normalizeEncodings(encoding, encodingVariations))).toEqual([
      ['utf-8', 'utf8', 'ucs-2', 'ucs2', 'hex'],
      ['utf-8', 'utf8', 'ucs-2', 'ucs2',],
      ['iso-8859-2', 'latin2'],
      ['windows-1252'],
    ]);
  });
});

describe('Getting the encoding from the parser', () => {
  it('Gets the encodings for true', () => {
    const parser = {
      defaultEncoding: 'utf-8',
      encodings: true,
      matcher: 'application/json',
    };
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(getEncodings(parser, encodingVariations)).toEqual({
      defaultEncoding: 'utf-8',
      encodings: true,
    });
  });
  it('Throws if \'defaultEncoding\' is set but \'encodings\' is unset on the parser', () => {
    const parser1 = {
      defaultEncoding: 'utf-8',
      encodings: false,
      matcher: 'application/json',
    };
    const parser2 = {
      defaultEncoding: 'utf-8',
      encodings: null,
      matcher: 'application/json',
    };
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(() => getEncodings(parser1, encodingVariations)).toThrow('Parser Configuration Error: When defaultEncoding is set, encoding can not be false or null.');
    expect(() => getEncodings(parser2, encodingVariations)).toThrow('Parser Configuration Error: When defaultEncoding is set, encoding can not be false or null.');
  });
  it('Returns encodings when \'defaultEncoding\' is set but \'encodings\' is undefined', () => {
    const parser1 = {
      defaultEncoding: 'utf-8',
      matcher: 'application/json',
    };
    const parser2 = {
      defaultEncoding: 'hex',
      matcher: 'application/json',
    };
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(getEncodings(parser1, encodingVariations)).toEqual({
      defaultEncoding: 'utf-8',
      encodings: ['utf-8', 'utf8'],
    });
    expect(getEncodings(parser2, encodingVariations)).toEqual({
      defaultEncoding: 'hex',
      encodings: ['hex'],
    });
  });
  it('Returns encodings when \'defaultEncoding\' is not set, \'encodings\' is not set, but \'defaultMediaTypeDefaultEncoding\' is supplied to function', () => {
    const parser = {
      matcher: 'application/json',
    };
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(getEncodings(parser, encodingVariations, 'utf8')).toEqual({
      defaultEncoding: 'utf8',
      encodings: true,
    });
  });
  it('Returns an empty object if  \'defaultEncoding\' is not set, \'encodings\' is not set or unset.', () => {
    const parser1 = {
      matcher: 'application/json',
    };
    const parser2 = {
      encodings: null,
      matcher: 'application/json',
    };
    const parser3 = {
      encodings: false,
      matcher: 'application/json',
    };
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(getEncodings(parser1, encodingVariations)).toEqual({});
    expect(getEncodings(parser2, encodingVariations)).toEqual({});
    expect(getEncodings(parser3, encodingVariations)).toEqual({});
  });
  it('Returns encodings when \'defaultEncoding\' is set and \'encodings\' is set', () => {
    const parser1 = {
      defaultEncoding: 'utf-8',
      encodings: ['utf-8', 'ucs2', 'hex'],
      matcher: 'application/json',
    };
    const parser2 = {
      defaultEncoding: 'utf-8',
      encodings: ['ucs2', 'hex'],
      matcher: 'application/json',
    };
    const encodingVariations = {
      'utf8': [ 'utf-8', 'utf8' ],
      'utf-8': [ 'utf-8', 'utf8' ],
      'ucs2': [ 'ucs-2', 'ucs2' ],
      'ucs-2': [ 'ucs-2', 'ucs2' ]
    };
    expect(getEncodings(parser1, encodingVariations)).toEqual({
      defaultEncoding: 'utf-8',
      encodings: ['utf-8', 'utf8', 'ucs-2', 'ucs2', 'hex']
    });
    expect(getEncodings(parser2, encodingVariations)).toEqual({
      defaultEncoding: 'utf-8',
      encodings: ['utf-8', 'utf8', 'ucs-2', 'ucs2', 'hex']
    });
  });
});

describe('Standardize the inflate property', () => {
  it('Returns true when true', () => {
    expect(getInflate(true)).toBeTruthy();
  });
  it ('Returns array for not boolean', () => {
    expect(getInflate('br')).toEqual(['br']);
    expect(getInflate(['br', 'gzip'])).toEqual(['br', 'gzip']);
  });
});

describe('Joining parser configurations', () => {
  it('Creates default parser configurations', () => {
    expect(joinParserConfigurations(undefined, '20kb', 'inflate', getEncodingVariations().encodingVariations, true)).toEqual([
      {
        matcher: [['application', 'x-www-form-urlencoded']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: {},
        parser: expect.any(Function),
        limit: 20480,
        inflate: ['inflate'],
        requireContentLength: true,
      }, {
        matcher: [['application', 'json']],
        defaultEncoding: 'utf-8',
        encodings: true,
        parser: expect.any(Function),
        emptyResponse: {},
        limit: 20480,
        inflate: ['inflate'],
        requireContentLength: true,
      }, {
        matcher: [['text', 'plain']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: '',
        limit: 20480,
        inflate: ['inflate'],
        requireContentLength: true,
      }, {
        matcher: [['application', 'octet-stream']],
        limit: 20480,
        inflate: ['inflate'],
        requireContentLength: true,
        emptyResponse: Buffer.from(''),
      },
    ]);
  });
  it('Creates default parser configurations with custom options', () => {
    expect(joinParserConfigurations(undefined, '1MB', ['inflate', 'gzip', 'br'], getEncodingVariations().encodingVariations, false)).toEqual([
      {
        matcher: [['application', 'x-www-form-urlencoded']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: {},
        parser: expect.any(Function),
        limit: 1048576,
        inflate: ['inflate', 'gzip', 'br'],
        requireContentLength: false,
      }, {
        matcher: [['application', 'json']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: {},
        parser: expect.any(Function),
        limit: 1048576,
        inflate: ['inflate', 'gzip', 'br'],
        requireContentLength: false,
      }, {
        matcher: [['text', 'plain']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: '',
        limit: 1048576,
        inflate: ['inflate', 'gzip', 'br'],
        requireContentLength: false,
      }, {
        matcher: [['application', 'octet-stream']],
        emptyResponse: Buffer.from(''),
        limit: 1048576,
        inflate: ['inflate', 'gzip', 'br'],
        requireContentLength: false,
      },
    ]);
  });
  describe('Creates custom default parser configurations with overwriting standard settings', () => {
    it('Overwrites standard encodings', () => {
      const parserConfigurations = [
        {
          matcher: 'application/json',
          defaultEncoding: 'ucs-2',
          encodings: true,
        }, {
          matcher: 'application/x-www-form-urlencoded',
          defaultEncoding: undefined,
          encodings: true,
        }, {
          matcher: 'text/plain',
          defaultEncoding: 'utf8',
          encodings: ['ucs2'],
        }, {
          matcher: 'application/octet-stream',
          defaultEncoding: 'utf8',
        }
      ];
      expect(joinParserConfigurations(parserConfigurations, 1000000, 'inflate', getEncodingVariations().encodingVariations, false)).toEqual([
        {
          matcher: [['application', 'json']],
          parser: expect.any(Function),
          defaultEncoding: 'ucs-2',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          parser: expect.any(Function),
          defaultEncoding: undefined,
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        }, {
          matcher: [['text', 'plain']],
          defaultEncoding: 'utf8',
          encodings: [ 'utf-8','utf8', 'ucs-2', 'ucs2'],
          emptyResponse: '',
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        }, {
          matcher: [['application', 'octet-stream']],
          defaultEncoding: 'utf8',
          encodings: [ 'utf-8','utf8'],
          emptyResponse: Buffer.from(''),
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        },
      ]);
    });
    it('overwrites standard parsers', () => {
      const parserConfigurations = [
        <ParserConfiguration<string | Buffer, any>>{
          matcher: 'application/json',
          parser: (string: string) => {
            return {
              fromJSON: JSON.stringify(string),
            };
          }
        }, {
          matcher: 'application/x-www-form-urlencoded',
          parser: null, // remove standard parser
        }, <ParserConfiguration<string | Buffer , any>>{
          matcher: 'application/octet-stream',
          parser: (buffer: Buffer) => {
            return buffer;
          }
        }
      ];

      expect(joinParserConfigurations(parserConfigurations, 1000000, 'inflate', getEncodingVariations().encodingVariations, false)).toEqual([
        {
          matcher: [['application', 'json']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        }, {
          matcher: [['application', 'octet-stream']],
          parser: expect.any(Function),
          emptyResponse: Buffer.from(''),
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        },
      ]);
      expect(
        joinParserConfigurations(parserConfigurations, 1000000, 'inflate', getEncodingVariations().encodingVariations, false)
          [0].parser?.toString().replace(/\s/g, '')).toBe(`(string)=>{return{fromJSON:JSON.stringify(string),};}`);
    });
    it('Overwrites empty response', () => {
      const parserConfigurations = [
        {
          matcher: 'application/json',
          emptyResponse: {fromJSON: ''}
        }, {
          matcher: 'application/x-www-form-urlencoded',
          emptyResponse: null,
        }
      ];
      expect(joinParserConfigurations(parserConfigurations, 1000000, 'inflate', getEncodingVariations().encodingVariations, false)).toEqual([
        {
          matcher: [['application', 'json']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {fromJSON: ''},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        },
      ]);
    });
    it('Overwrites default inflate', () => {
      const parserConfigurations = [
        {
          matcher: 'application/json',
          inflate: true,
        }, {
          matcher: 'application/x-www-form-urlencoded',
          inflate: 'identity',
        }, {
          matcher: 'text/plain',
          inflate: ['identity', 'gzip'],
        }, {
          matcher: 'application/octet-stream',
        }
      ];
      expect(joinParserConfigurations(parserConfigurations, 1000, ['inflate', 'gzip'], getEncodingVariations().encodingVariations, true)).toEqual([
        {
          matcher: [['application', 'json']],
          defaultEncoding: 'utf-8',
          encodings: true,
          parser: expect.any(Function),
          emptyResponse: {},
          limit: 1000,
          inflate: true,
          requireContentLength: true,
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          parser: expect.any(Function),
          limit: 1000,
          inflate: ['identity'],
          requireContentLength: true,
        }, {
          matcher: [['text', 'plain']],
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: '',
          limit: 1000,
          inflate: ['identity', 'gzip'],
          requireContentLength: true,
        }, {
          matcher: [['application', 'octet-stream']],
          limit: 1000,
          inflate: ['inflate', 'gzip'],
          requireContentLength: true,
          emptyResponse: Buffer.from(''),
        },
      ]);
    });
    it('Overwrites default limit', () => {
      const parserConfigurations = [
        {
          matcher: 'application/json',
          limit: 1000,
        }, {
          matcher: 'application/x-www-form-urlencoded',
          limit: '10kb',
        }, {
          matcher: 'text/plain',
          limit: Infinity,
        }, {
          matcher: 'application/octet-stream',
        }
      ];
      expect(joinParserConfigurations(parserConfigurations, '20kb', 'inflate', getEncodingVariations().encodingVariations, true)).toEqual([
        {
          matcher: [['application', 'json']],
          defaultEncoding: 'utf-8',
          encodings: true,
          parser: expect.any(Function),
          emptyResponse: {},
          limit: 1000,
          inflate: ['inflate'],
          requireContentLength: true,
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          parser: expect.any(Function),
          limit: 10240,
          inflate: ['inflate'],
          requireContentLength: true,
        }, {
          matcher: [['text', 'plain']],
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: '',
          limit: Infinity,
          inflate: ['inflate'],
          requireContentLength: true,
        }, {
          matcher: [['application', 'octet-stream']],
          limit: 20480,
          inflate: ['inflate'],
          requireContentLength: true,
          emptyResponse: Buffer.from(''),
        },
      ]);
    });
    it('Creates verify function', () => {
      const parserConfigurations = [
        {
          matcher: 'application/json',
          verify: (req: any, res: any, buf: Buffer) => true,
        }, {
          matcher: 'application/x-www-form-urlencoded',
        }
      ];
      expect(joinParserConfigurations(parserConfigurations, 1000000, 'inflate', getEncodingVariations().encodingVariations, false)).toEqual([
        {
          matcher: [['application', 'json']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
          verify: expect.any(Function),
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        },
      ]);
    });
    it('Overwrites require content length', () => {
      const parserConfigurations = [
        {
          matcher: 'application/json',
          requireContentLength: true,
        }, {
          matcher: 'application/x-www-form-urlencoded',
        }
      ];
      expect(joinParserConfigurations(parserConfigurations, 1000000, 'inflate', getEncodingVariations().encodingVariations, false)).toEqual([
        {
          matcher: [['application', 'json']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: true,
        }, {
          matcher: [['application', 'x-www-form-urlencoded']],
          parser: expect.any(Function),
          defaultEncoding: 'utf-8',
          encodings: true,
          emptyResponse: {},
          limit: 1000000,
          inflate: ['inflate'],
          requireContentLength: false,
        },
      ]);
    });
  });
  it('Creates parser configurations', () => {
    const parserConfigurations: ParserConfigurations<string | number | boolean, string> = [
      'text/plain',
      {
        matcher: 'application/json',
        limit: 1000,
        verify: (req: any, res: any, buffer: string | number | boolean | Buffer, body: any, encoding: string | false | undefined) => undefined,
      }, <ParserConfiguration<string | number | boolean, string>>{
        matcher: ['application/*', '*/html', (mediaType: MediaType) => mediaType.join('/') !== 'application/html'],
        defaultEncoding: 'windows-1252',
        encodings: ['ucs-2'],
        emptyResponse: undefined,
        parser: (payload: string) => payload === 'windows' ? 'Windows European Characters' : 'Universal Characters',
        inflate: ['gzip', 'br'],
      }, <ParserConfiguration<string | number | boolean, string>>{
        matcher: 'application/xml',
        limit: '10mb',
        emptyResponse: '<xml></xml>',
        encodings: ['latin1'],
        parser: (payload: number | boolean) => payload == 0 ? 'Windows European Characters' : 'Universal Characters',
        inflate: 'identity',
      }, <ParserConfiguration<string | number | boolean, string>>{
        matcher: 'application/*',
      },
    ];
    const bufferEncodings = [{
      transform: (buffer: Buffer) => '',
      encodings: ['iso-8859-1', 'iso_8859-1', 'latin1', 'windows-1252'],
    }];

    expect(joinParserConfigurations(parserConfigurations, '1GB', true, getEncodingVariations(bufferEncodings).encodingVariations, true)).toEqual([
      {
        matcher: [['text', 'plain']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: '',
        limit: 1073741824,
        inflate: true,
        requireContentLength: true,
      }, {
        matcher: [['application', 'json']],
        defaultEncoding: 'utf-8',
        encodings: true,
        emptyResponse: {},
        parser: expect.any(Function),
        limit: 1000,
        inflate: true,
        requireContentLength: true,
        verify: expect.any(Function),
      }, {
        matcher: [
          ['application', null],
          [null, 'html'],
          expect.any(Function),
        ],
        defaultEncoding: 'windows-1252',
        emptyResponse: undefined,
        encodings: ['iso-8859-1', 'iso_8859-1', 'latin1', 'windows-1252', 'ucs-2', 'ucs2'],
        parser: expect.any(Function),
        limit: 1073741824,
        inflate: ['gzip', 'br'],
        requireContentLength: true,
      }, {
        matcher: [['application', 'xml']],
        encodings: ['iso-8859-1', 'iso_8859-1', 'latin1', 'windows-1252'],
        emptyResponse: '<xml></xml>',
        parser: expect.any(Function),
        limit: 10485760,
        inflate: ['identity'],
        requireContentLength: true,
      }, {
        matcher: [['application', null]],
        limit: 1073741824,
        inflate: true,
        requireContentLength: true,
      }
    ]);
  });
});

describe('Test querystring parser', () => {
  it('throws when maxKeys < 0', () => {
    expect(() => getQuerystringParser(-1)).toThrow('maxKeys can not be smaller than 0');
  });
});
