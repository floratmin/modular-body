import querystring from 'querystring';
import {Buffer} from 'buffer';
import {getMediaTypeMatchers, MediaTypeIdentifier, MediaTypeMatchers} from './mediaTypes.js';
import bytes from 'bytes';
import {StringDecoder} from 'string_decoder';
import {Request, Response, ParsedBody, ParserError} from './bodyParser';

export const nodeBufferEncodings: BufferEncoding[] = ['utf-8', 'utf8', 'ucs-2', 'ucs2', 'utf16le', 'latin1', 'ascii', 'base64', 'base64url', 'hex', 'binary'];

/**
 * @typedef ChunkedBufferEncoder
 * @property onData function to transform the buffer in data event of stream
 * @property onEnd function to run when end event of stream is emitted
 * @property reduce function to reduce the array containing the elements of the transformed array
 * @property encodings Array<string> names of valid encodings for this function
 */
export type ChunkedBufferEncoder<T, U> = {
  onData: (buffer: Buffer) => T;
  onEnd: () => T;
  reduce: (array: T[]) => U;
  encodings: string[];
};

/**
 * @typedef UnchunkedBufferEncoder
 * @property transform function to transform the joined buffer pieces
 * @property encodings Array<string> names of valid encodings for this function
 */
export type UnchunkedBufferEncoder<U> = {
  transform: (buffer: Buffer) => U;
  encodings: string[];
};

export type BufferEncoder<T, U> = ChunkedBufferEncoder<T, U> | UnchunkedBufferEncoder<U>;

/**
 * Matches the encoding available in the parser definition with the encoding specified in the request
 * @param charsetEncodings The charsetEncodings defined in the parser definition.
 * @param charset The charset from the request
 * @param availableBufferEncodingNames All available encodings to use when charsetEncodings is true
 * @param defaultEncoding The default encoding defined in the parser
 */
export function matchCharsetEncoding(
  charsetEncodings: string[] | true | undefined,
  charset: string | false,
  availableBufferEncodingNames: string[],
  defaultEncoding: string | undefined
) {
  const defaultCharset = charset || defaultEncoding;
  if (!charsetEncodings && !defaultCharset) return true;
  if (!charsetEncodings || !defaultCharset) return false;
  if (charsetEncodings === true) {
    return availableBufferEncodingNames.includes(defaultCharset);
  }
  return charsetEncodings.includes(defaultCharset);
}

/**
 * Function to generate the record containing alternative encoding names to each encoding
 * @param bufferEncodings Additional or altered encodings
 */
export function getEncodingVariations<T, U>(bufferEncodings?: BufferEncoder<T, U>[]) {
  const encodingVariations: Record<string, string[]> = {
    'utf8': ['utf-8', 'utf8'],
    'utf-8': ['utf-8', 'utf8'],
    'ucs2': ['ucs-2', 'ucs2'],
    'ucs-2': ['ucs-2', 'ucs2'],
  };
  const encodingVariationNames = Object.keys(encodingVariations);
  let nodeEncodingVariations: string[] = Object.keys(encodingVariations);
  if (bufferEncodings) {
    const addedBufferEncodings = bufferEncodings.flatMap(({encodings}) => encodings);
    if (addedBufferEncodings.length > [...new Set(addedBufferEncodings)].length) {
      throw new Error(`Same encoding is supplied more than one time in BufferEncoding object.`);
    }
    addedBufferEncodings.filter((addedBufferEncoding) => encodingVariationNames.includes(addedBufferEncoding)).forEach((encoding) => {
      delete encodingVariations[encoding];
      Object.entries(encodingVariations).forEach(([key, variations]) => {
        if (variations.includes(encoding)) {
          encodingVariations[key] = variations.filter((variation) => variation !== encoding);
        }
      });
    });
    nodeEncodingVariations = [
      ...new Set(nodeEncodingVariations.filter((nodeEncodingVariation) => !addedBufferEncodings.includes(nodeEncodingVariation)))
    ];
    const singleNodeEncodingVariations = nodeEncodingVariations
      .map((nodeEncodingVariation) => nodeEncodingVariation.replace('-', ''));
    nodeEncodingVariations = nodeEncodingVariations.filter((nodeEncodingVariation) => !singleNodeEncodingVariations.includes(nodeEncodingVariation));
    bufferEncodings.forEach(({encodings}) => {
      if (encodings.length > 1) {
        encodings.forEach((encoding) => {
          encodingVariations[encoding] = encodings;
        });
      }
    });
    Object.entries(encodingVariations).forEach(([key, variations]) => {
      if (variations.length < 2) {
        delete encodingVariations[key];
      }
    });
  } else {
    nodeEncodingVariations = [
      ...new Set(nodeEncodingVariations.map((nodeEncodingVariation) => nodeEncodingVariation.replace('-', '')))
    ];
  }
  return { encodingVariations, nodeEncodingVariations };
}

/**
 * Gets all available encodings and tests if for each encoding defined in a parser there is an encoding available
 * @param parsers The available parsers
 * @param encodingVariations The object containing all equivalent encoding names for each encoding
 * @param nodeEncodingVariations The object containing variations to filter out of the nodeBufferEncodings array to avoid duplicated definitions
 * @param bufferEncodings Additional bufferEncodings
 */
export function getAvailableBufferEncodings<T, U, V>(
  parsers: PatchedParser<U, V>[],
  encodingVariations: Record<string, string[]>,
  nodeEncodingVariations: string[],
  bufferEncodings?: BufferEncoder<T, U>[]
) {
  const suppliedBufferEncodings = bufferEncodings
    ? bufferEncodings.flatMap((bufferEncoding) => bufferEncoding.encodings).map((encoding) => encoding.toLowerCase())
    : [];
  if (suppliedBufferEncodings.length !== [...new Set(suppliedBufferEncodings)].length) {
    const multipleBufferEncodings = [
      ...new Set(suppliedBufferEncodings.filter((encoding) => suppliedBufferEncodings.lastIndexOf(encoding) > suppliedBufferEncodings.indexOf(encoding)))
    ];
    throw new Error(`The encodings ${multipleBufferEncodings.join(', ')} are defined in multiple BufferEncodings`);
  }
  const nativeNodeEncodings = nodeBufferEncodings
    .filter((nodeEncoding) => !suppliedBufferEncodings.includes(nodeEncoding) && !nodeEncodingVariations.includes(nodeEncoding));
  const availableBufferEncodingsArray = [
    ...<BufferEncoder<string, string> []>nativeNodeEncodings.map((nodeEncoding) => {
      const decoder = new StringDecoder(nodeEncoding);
      return {
        encodings: normalizeEncodings(nodeEncoding, encodingVariations),
        onData: (buffer: Buffer) => decoder.write(buffer),
        onEnd: () => decoder.end(),
        reduce: (array: string[]) => array.join(''),
      };
    }),
    ...(bufferEncodings ? bufferEncodings : <BufferEncoder<T, U> []>[]),
  ];
  const suppliedEncodingNames = [...new Set(Object.values(parsers)
    .filter((parser) => parser.encodings !== undefined || parser.defaultEncoding !== undefined)
    .flatMap((parser) => Array.isArray(parser.encodings)
      ? parser.defaultEncoding
        ? [parser.defaultEncoding, ...parser.encodings]
        : parser.encodings
      : parser.defaultEncoding
        ? [parser.defaultEncoding, ...nodeBufferEncodings]
        : nodeBufferEncodings)
    .flatMap((encoding) => encodingVariations[encoding] ? encodingVariations[encoding] : [encoding]),
  )];
  const availableBufferEncodingNames = [...new Set(
    availableBufferEncodingsArray.flatMap((bufferEncoding) => bufferEncoding.encodings)
  )].filter((encoding) => suppliedEncodingNames.includes(encoding));
  const notAvailableEncodings = suppliedEncodingNames.filter((suppliedEncodingName) => !availableBufferEncodingNames.includes(suppliedEncodingName)).join(', ');
  if (notAvailableEncodings !== '') {
    throw new Error(`The following decompressors in the parse configuration are not supplied: ${notAvailableEncodings}`);
  }
  const availableBufferEncodings = Object.fromEntries(
    availableBufferEncodingNames
      .map((encoding) => <[string, (BufferEncoder<T, U> | BufferEncoder<string, string>)]>[
        encoding,
        availableBufferEncodingsArray.find(({encodings}) => encodings.includes(encoding))
      ]));
  return {availableBufferEncodings, availableBufferEncodingNames};
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @typedef DefaultParser
 * @property parser A parser to convert the data to the desired object.
 * @property defaultEncoding The encoding to convert the buffer to the data.
 */
type DefaultParser<U, V> = {
  parser: (payload: U) => V;
  defaultEncoding: string;
  emptyResponse?: any;
} | {
  parser: (payload: Buffer) => V;
  emptyResponse?: any;
} | {
  defaultEncoding: string;
  emptyResponse?: any;
} | {
  emptyResponse?: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * @typedef ParserConfiguration
 * @property inflate Allows the data to be unzipped/deflated before further processing when set to true
 * @property limit The limit for the max size of the payload as a bytes string e.g. '1kB' or a number for the number of bytes
 * @property requireContentLength When true then the header 'Content-Length' has to be set on the request
 * @property parser A parser to convert the buffer or the decoded string to the desired object
 * @property matcher A matcher or array of matchers to match the desired media types
 * @property encodings A string or array of strings defining the allowed charsets, false to remove encodings from default parsers or
 * a string or array of strings to define allowed encodings for which we have to supply a decoder function which should be able to decode each of these
 * encodings true to allow all encodings defined in the encodings object
 * @property emptyResponse Set what the body parser should parse when body is empty and content-length is 0
 * @property defaultEncoding When set then this encoding will be set by default when 'charset' is missing on 'Content-Encoding' header of request. When not set
 * and no charset is specified, then the encoder will return a Buffer
 * @property verify A function which has access to the whole data and which should throw an error if the data can not be verified
 */
export type ParserConfiguration<U, V> = {
  inflate?: true | string | string[];
  limit?: string | number;
  requireContentLength?: boolean;
  parser?:
    | ((payload: Buffer | U) => V)
    | null;
  // parser?: ((payload: string) => any) | ((payload: Buffer) => any) | ((payload: U) => any) | null;
  matcher: MediaTypeIdentifier | MediaTypeIdentifier[];
  encodings?: string | string[] | boolean | null;
  defaultEncoding?: string;
  emptyResponse?: U | V;
  verify?:
    ((req: Request<U, V>, res: Response, buffer: Buffer | U | V, body?: ParsedBody<U, V>, encoding?: string | false) => void);
};

/**
 * @typedef PatchedParser
 * @property inflate Allows the data to be unzipped/deflated before further processing when set to true
 * @property limit The limit for the max size of the payload in bytes
 * @property requireContentLength When true then the header 'Content-Length' has to be set on the request
 * @property encodings An array of allowed encodings for this media type
 * @property defaultEncoding When set then this encoding will be set by default when 'charset' is missing on 'Content-Encoding' header of request. When not set
 * and no charset is specified, then the encoder will return a Buffer
 * @property emptyResponse Set what the body parser should parse when body is empty and content-length is 0
 * @property parser A parser to convert the buffer or the decoded string to the desired object
 * @property matcher An array of matchers to match the desired media types
 * @property verify A function which has access to the whole data and which should throw an error if the data can not be verified
 */
export type PatchedParser<U, V> = {
  inflate: true | string[];
  limit: number | null;
  requireContentLength: boolean;
  encodings?: string[] | true;
  defaultEncoding?: string;
  emptyResponse?: U | V;
  parser?: ((payload: Buffer | U) => V) | null;
  matcher: MediaTypeMatchers;
  verify?:
    ((req: Request<U, V>, res: Response, buffer: Buffer | U | V, body?: ParsedBody<U, V>, encoding?: string | false) => void);
};

/**
 * @typedef DefaultMediaType
 * The media types used in the defaultMediaTypeParsers object
 */
export type DefaultMediaType = 'application/x-www-form-urlencoded' | 'application/json' | 'text/plain' | 'application/octet-stream';

/**
 * @typedef ParserConfigurations
 * ParserConfigurations or DefaultMediaTypes or array consisting of any of these to check the body of the request.
 */
export type ParserConfigurations<U, V> = ParserConfiguration<U, V> | DefaultMediaType | (ParserConfiguration<U, V> | DefaultMediaType)[];

/**
 * @const defaultMediaTypeParsers
 * The default parsers for the most common media-types with node native implementations. The missing properties of type PatchedParser will be completed
 * with the supplied options object or the default settings as defined in the function bodyParser
 */
export const defaultMediaTypeParsers: Record<DefaultMediaType, DefaultParser<string, unknown>> = {
  'application/x-www-form-urlencoded': {
    parser:  getQuerystringParser(), // maxKeys is default 1000
    defaultEncoding: 'utf-8',
    emptyResponse: {},
  },
  'application/json': {
    parser: (payload: string) => {
      const raw = JSON.parse(payload);
      // Prevent prototype pollution of first level by forbidding to add any keys to '__proto__'
      // For speed considerations we do not search for '__proto__' keys in nested objects, which
      // is not necessary if we are careful not to use Object.assign on nested child objects.
      // For a nested implementation please look at the README file.
      if (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw.__proto__).length > 0) {
        throw new Error('__proto__ key not allowed in JSON body on main level');
      }
      return raw;
    },
    defaultEncoding: 'utf-8',
    emptyResponse: {},
  },
  'text/plain': {
    defaultEncoding: 'utf-8',
    emptyResponse: '',
  },
  'application/octet-stream': {
    emptyResponse: Buffer.from(''),
  },
};

export function getQuerystringParser(maxKeys = 1000) {
  if (maxKeys < 0) {
    throw new Error('maxKeys can not be smaller than 0');
  }
  maxKeys = maxKeys === Infinity ? 0 : maxKeys;
  return (payload: string) => {
    if (parameterCount(payload, maxKeys) !== undefined) {
      return querystring.parse(payload, undefined, undefined, {maxKeys});
    }
    const err = <ParserError>new Error('too many parameters');
    err.status = 413;
    err.type = 'parameters.too.many';
    throw err;
  };
}

export function parameterCount(body: string, limit: number) {
  let count = 0;
  let index = 0;
  while((index = body.indexOf('&', index)) !== -1) {
    count++;
    index++;
    if (count === limit) {
      return undefined;
    }
  }
  return count;
}

/**
 * Convert array of encodings to lower case and add the variant 'utf8' / 'utf-8' or 'ucs2' / 'ucs-2' if one of these are missing.
 * @param encodings The array of encodings
 * @param encodingVariations The object containing all equivalent encoding names for each encoding
 */
export function normalizeEncodings(encodings: string | string[], encodingVariations: Record<string, string[]>) {
  const normalizedEncodings = (Array.isArray(encodings) ? encodings : [encodings]).map((encoding) => encoding.toLowerCase());
  return [...new Set(normalizedEncodings.flatMap((encoding) => encodingVariations[encoding] ? encodingVariations[encoding] : [encoding]))];
}

/**
 * Function to set the defaultEncoding and the encodings depending on the defaultMediaTypes and parser configurations
 * @param parser The parser configuration
 * @param encodingVariations The object containing all equivalent encoding names for each encoding
 * @param defaultMediaTypeDefaultEncoding The default encoding defined by the defaultMediaType. This is only supplied if a defaultMediaType is altered
 */
export function getEncodings<T, U>(parser: ParserConfiguration<T, U>, encodingVariations: Record<string, string[]>, defaultMediaTypeDefaultEncoding?: string) {
  const defaultEncoding = 'defaultEncoding' in parser && parser.defaultEncoding ? {defaultEncoding: parser.defaultEncoding} : {};
  if (parser.encodings === true) {
    return {
      ...defaultEncoding,
      encodings: true,
    };
  }
  if (!parser.encodings) {
    if ('defaultEncoding' in parser && parser.defaultEncoding && !defaultMediaTypeDefaultEncoding) {
      if (parser.encodings === false || parser.encodings === null) {
        throw new Error('Parser Configuration Error: When defaultEncoding is set, encoding can not be false or null.');
      }
      return {
        ...defaultEncoding,
        encodings: normalizeEncodings([parser.defaultEncoding], encodingVariations),
      };
    }
    if (defaultMediaTypeDefaultEncoding && parser.encodings === undefined) {
      return {
        defaultEncoding: defaultMediaTypeDefaultEncoding,
        encodings: true, //normalizeEncodings([defaultMediaTypeDefaultEncoding], encodingVariations),
      };
    }
    return {};
  }

  return {
    ...defaultEncoding,
    encodings:
      normalizeEncodings([
        ...new Set([
          ...('defaultEncoding' in parser && parser.defaultEncoding ? [parser.defaultEncoding] : []),
          ...(Array.isArray(parser.encodings) ? parser.encodings : [parser.encodings]),
        ]),
      ], encodingVariations),
  };
}

/**
 * Function to standardize the inflate of the parserConfiguration
 * @param inflate The inflate setting of the parserConfiguration
 */
export function getInflate(inflate: true | string | string[]) {
  return typeof inflate === 'string' ? [inflate] : inflate;
}

/**
 * Function to convert the supplied ParserConfigurations together with the optional defaultLimit and deflate options to a PatchedParser array which can then be
 * used to create the body.
 * @param parserConfigurations A ParserConfiguration, DefaultMediaType or an array of any of these to create the array of patched parsers. For the conversion
 * we have the following three cases:
 * 1. We have a DefaultMediaType:
 *    We get the settings of the corresponding defaultMediaTypeMatcher and create the MediaTypeMatcher and include the defaultLimit and inflate options
 * 2. We have a setting with a matcher equal to a DefaultMediaType:
 *    Settings in the matcher overwrite default settings from the function or the corresponding defaultMediaTypeMatcher. If we want to remove an encoding or a
 *    parser defined in the defaultMediaTypeMatcher we have to supply the value 'null' for any of these.
 * 3. We have a matcher which is not equal to a DefaultMediaType:
 *    Settings of the matcher overwrite default settings from the function.
 * @param defaultLimit The default limit for all media types. Can be overwritten in the ParserConfiguration. Default is 20 kB. Can be defined as a bytes string
 * o as a number for bytes.
 * @param inflate Option if it is allowed to deflate or gunzip data. Default is true.
 * @param encodingVariations The object containing all equivalent encoding names for each encoding
 * @param requireContentLength The default setting for requiring the header 'Content-Length' to be set
 */
export function joinParserConfigurations<U, V>(
  parserConfigurations: ParserConfigurations<U, V> = ['application/x-www-form-urlencoded', 'application/json', 'text/plain', 'application/octet-stream'],
  defaultLimit: string | number,
  inflate: true | string | string[],
  encodingVariations: Record<string, string[]>,
  requireContentLength: boolean,
): PatchedParser<U, V>[] {
  const limit = typeof defaultLimit === 'string' ? bytes(defaultLimit) : defaultLimit;
  return <PatchedParser<U, V> []><unknown>(Array.isArray(parserConfigurations) ? parserConfigurations : [parserConfigurations]).map((parser) => {
    if (typeof parser === 'string') {
      const defaultMediaTypeParser = defaultMediaTypeParsers[parser];
      return {
        matcher: getMediaTypeMatchers(parser),
        ...getEncodings(
          <ParserConfiguration<U, V>>defaultMediaTypeParser,
          encodingVariations,
          (<{defaultEncoding?: string}>defaultMediaTypeParser).defaultEncoding
        ),
        ...('parser' in defaultMediaTypeParser ? {parser: defaultMediaTypeParser.parser} : {}),
        ...('emptyResponse' in defaultMediaTypeParser ? {emptyResponse: defaultMediaTypeParser.emptyResponse} : {}),
        limit,
        inflate: getInflate(inflate),
        requireContentLength,
      };
    } else {
      const defaultParser = typeof parser.matcher === 'string' && defaultMediaTypeParsers[<DefaultMediaType>parser.matcher];
      if (defaultParser) {
        return {
          matcher: getMediaTypeMatchers(parser.matcher),
          ...getEncodings(parser, encodingVariations, (<{defaultEncoding?: string}>defaultParser).defaultEncoding),
          ...(parser.parser ? {parser: parser.parser} : parser.parser === null ? {} : 'parser' in defaultParser ? {parser: defaultParser.parser} : {}),
          ...('emptyResponse' in parser && parser.emptyResponse !== null
            ? {emptyResponse: parser.emptyResponse}
            : parser.emptyResponse === null
              ? {}
              : 'emptyResponse' in defaultParser
                ? {emptyResponse: defaultParser.emptyResponse}
                : {}
          ),
          limit: parser.limit ? typeof parser.limit === 'string' ? bytes(parser.limit) : parser.limit : limit,
          inflate: getInflate('inflate' in parser ? <true | string | string[]>parser.inflate : inflate),
          ...(parser.verify ? {verify: parser.verify} : {}),
          requireContentLength: parser.requireContentLength !== undefined ? parser.requireContentLength : requireContentLength,
        };
      }
      return {
        ...getEncodings(parser, encodingVariations),
        limit,
        requireContentLength,
        inflate: getInflate(inflate),
        ...Object.fromEntries(Object.entries(parser)
          .filter(([key, value]) => value !== null && value !== false && key !== 'encodings' && key !== 'defaultEncoding')
          .map(([key, value]) => {
            if (key === 'limit' && typeof value === 'string') {
              return [key, bytes(value)];
            } else if (key === 'matcher') {
              return [key, getMediaTypeMatchers(<MediaTypeIdentifier | MediaTypeIdentifier[]>value)];
            } else if (key === 'inflate') {
              return [key, getInflate(<true | string | string[]>value)];
            }
            return [key, value];
          }),
        ),
      };
    }
  });
}
