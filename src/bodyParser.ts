import createError from 'http-errors';
import {
  BufferEncoder, ChunkedBufferEncoder,
  getAvailableBufferEncodings,
  getEncodingVariations,
  joinParserConfigurations, matchCharsetEncoding,
  ParserConfigurations,
  PatchedParser, UnchunkedBufferEncoder,
} from './bufferEncoding.js';
import {Stream, Transform} from 'stream';
import {Decompressors, getAvailableDecompressors, matchContentEncoding} from './decompressStream.js';
import contentType, {ParsedMediaType} from 'content-type';
import {matchAnyType, MediaType} from './mediaTypes.js';
import onFinished from 'on-finished';
import {IncomingMessage} from 'http';

/**
 * @typedef Next
 * Type for the next function
 */
export type Next = (err?: string | Error) => void;

export type ParsedBody<U, V> = U | V | Buffer;

export interface Done<U, V> {
  (err: Error): void;
  (err: null, body?: ParsedBody<U, V>): void;
}

export interface ParserError extends Error {
  status: number;
  type: string;
}

export interface Request<U, V> extends contentType.RequestLike, Stream {
  pause: () => void;
  resume: () => void;
  body: ParsedBody<U, V>;
  unpipe: () => void;
  method: string;
}

export type DefaultOptions = {
  defaultLimit?: number | string;
  inflate?: true | string | string[];
  requireContentLength?: boolean,
  defaultContentType?: string,
};

type StandardParserOptions<M> = Omit<DefaultOptions, 'defaultContentType'> & {defaultContentType?: M | boolean};

export type Response = unknown;

/**
 * Main function for setting up the body parser middleware
 * @param parserConfigurations The parser configurations, defaults to the default parsers when undefined
 * @param bufferEncodings The buffer encodings, defaults to node BufferEncodings when undefined
 * @param decompressors The decompressors, the node native zlib decompressors are available when undefined
 * @param options The default options for the parser configurations.
 * @param <T> The type after transforming the stream in the onData Events
 * @param <U> The type after transforming type T in the reduce function or for transforming the buffer in the transform function
 * @param <V> The type after transforming the type U with the parser function
 */
export function bodyParser<T, U, V> (
  options: DefaultOptions = {},
  parserConfigurations?: ParserConfigurations<U, V>,
  bufferEncodings?: BufferEncoder<T, U>[],
  decompressors?: Decompressors,
){
  const {defaultLimit, inflate, requireContentLength} = {...{defaultLimit: '20kb', inflate: 'identity', requireContentLength: false}, ...options};
  const defaultContentType = <MediaType | undefined>options.defaultContentType?.split('/');
  const {encodingVariations, nodeEncodingVariations} = getEncodingVariations<T, U>(bufferEncodings);
  const parsers = joinParserConfigurations(parserConfigurations, defaultLimit, inflate, encodingVariations, requireContentLength);
  const {availableDecompressors, availableDecompressorNames} = getAvailableDecompressors(parsers, decompressors);
  const {availableBufferEncodings, availableBufferEncodingNames} = getAvailableBufferEncodings(
    parsers, encodingVariations, nodeEncodingVariations, bufferEncodings
  );
  let defaultContentTypeEncoding: string | false = false;
  if (defaultContentType) {
    const defaultParser = parsers.find(({matcher}) => matchAnyType(matcher, defaultContentType));
    if (!defaultParser) {
      if ((<string []>defaultContentType).length === 2) {
        throw new Error(`The specified default content type '${defaultContentType.join('/')}' does not match any parser configuration`);
      }
      throw new Error(`The specified default content type '${defaultContentType.join('/')}' is invalid.`);
    }
    defaultContentTypeEncoding = (<PatchedParser<U, V>>defaultParser).defaultEncoding || false;
  }
  return function getBody(req: Request<U, V>, res: Response, next: Next) {
    if ((<{_body?: boolean}>req)._body) {
      next();
    }
    const readStream = mediaTypeParser(
      parsers,
      availableDecompressors,
      availableDecompressorNames,
      availableBufferEncodings,
      availableBufferEncodingNames,
      requireContentLength,
      defaultContentTypeEncoding,
      defaultContentType,
    );

    readStream(req, res, readStreamCallback(next, req));
  };
}

type DefaultStringContentType = 'application/json' | 'application/x-www-form-urlencoded' | 'text/plain';

function getStandardParser<M extends DefaultStringContentType>(
  parserConfigurations?: DefaultStringContentType,
) {
  return (
    options: StandardParserOptions<M> = {},
    bufferEncodings?: BufferEncoder<string, string>[],
    decompressors?: Decompressors,
  ) => {
    const defaultContentType = options.defaultContentType === true ? parserConfigurations : options.defaultContentType;
    delete options.defaultContentType;
    return bodyParser(
      {...<Omit<DefaultOptions, 'defaultContentType'>>options, ...(defaultContentType ? {defaultContentType: defaultContentType} : {})},
      parserConfigurations,
      bufferEncodings,
      decompressors
    );
  };
}

bodyParser.raw = (
  options: StandardParserOptions<'application/octet-stream'>= {},
  decompressors?: Decompressors,
) => {
  const defaultContentType = options.defaultContentType === true ? 'application/octet-stream' : options.defaultContentType;
  delete options.defaultContentType;
  return bodyParser(
    {...<Omit<DefaultOptions, 'defaultContentType'>>options, ...(defaultContentType ? {defaultContentType: defaultContentType} : {})},
    'application/octet-stream',
    undefined, decompressors
  );
};

bodyParser.json = getStandardParser<'application/json'>('application/json');
bodyParser.urlencoded = getStandardParser<'application/x-www-form-urlencoded'>('application/x-www-form-urlencoded');
bodyParser.text = getStandardParser<'text/plain'>('text/plain');

/**
 * The callback to release the socket when there is an error
 * @param <U> The type after transforming type T in the reduce function or for transforming the buffer in the transform function
 * @param <V> The type after transforming the type U with the parser function
 * @param next The express style next function
 * @param req The Request object
 */
export function readStreamCallback<U, V>(next: Next, req: Request<U, V>) {
  return function cb(error: Error | null, body?: ParsedBody<U, V>) {
    if (error) {
      req.resume();
      onFinished(<IncomingMessage><unknown>req, () => {
        next(createError(400, error));
      });
      return;
    }
    if (body !== undefined) {
      req.body = <ParsedBody<U, V>>body;
    }
    next();
  };
}

/**
 * Function to check if the requirements of the request header are fulfilled by a parser configuration
 * @param parsers The parser configurations
 * @param availableDecompressors The available decompressor functions
 * @param availableDecompressorNames The names of the available decompressor functions
 * @param availableBufferEncodings The available buffer encodings (charsets)
 * @param availableBufferEncodingNames The names of the available buffer encodings
 * @param requireContentLength Specifies if the header 'Content-Length' has to be set in the request
 * @param defaultContentTypeEncoding
 * @param defaultContentType
 */
export function mediaTypeParser<T, U, V>(
  parsers: PatchedParser<U, V>[],
  availableDecompressors: Record<string, () => Transform>,
  availableDecompressorNames: string[],
  availableBufferEncodings: {[p: string]: BufferEncoder<string, string> | BufferEncoder<T, U>},
  availableBufferEncodingNames: string[],
  requireContentLength: boolean,
  defaultContentTypeEncoding: string | false,
  defaultContentType?: MediaType,
){
  return function readStream(req: Request<U, V>, res: Response, callback: Done<U, V>) {


    (<{_body?: boolean}>req)._body = true;

    /* istanbul ignore if */
    if (!req.headers) {
      callback(createError(400, 'Request Headers not set'));
      return;
    }

    const contentEncoding = (<string>(req.headers['content-encoding']) || '').toLowerCase() || 'identity';
    const contentLength = parseInt(<string>(req.headers['content-length'])) || null;
    const transferEncoding = <string | undefined>req.headers['transfer-encoding'];

    /* istanbul ignore if */
    if (contentLength === null && requireContentLength) {
      callback(createError(411, `Header 'Content-Length' not specified but required by configuration.`, {
        type: 'contentLength.missing'
      }));
      return;
    }

    let parsedMediaType: ParsedMediaType | undefined;
    try {
      parsedMediaType = req.headers['Content-Type'] || !defaultContentType ? contentType.parse(req) : undefined;
    } catch(err: unknown) {
      if (['GET', 'DELETE'].includes(req.method)) {
        callback(null);
        return;
      }
      callback(createError(400, `${(<{message: string}>err).message}: ${req.headers['content-type']}`, {
        mediaType: req.headers['media-type'],
        type: 'mediaType.invalid',
      }));
      return;
    }

    const mediaType = parsedMediaType ? <[string, string]>parsedMediaType.type.split('/') : defaultContentType ? defaultContentType : undefined;

    /* istanbul ignore if */
    if (!mediaType) { // should be unreachable because contentType.parse should throw
      throw new Error(`Header 'Content-Type' has to be specified`);
    }

    const allowedMediaTypeParsers = parsers.filter(({matcher}) => matchAnyType(matcher, mediaType));
    if (allowedMediaTypeParsers.length === 0) {
      callback(createError(415, `Unsupported Media Type`, {
        mediaType,
        type: 'mediaType.unsupported',
      }));
      return;
    }

    const encoding = parsedMediaType
      ? 'parameters' in parsedMediaType && 'charset' in parsedMediaType.parameters && parsedMediaType.parameters.charset.toLowerCase()
      : defaultContentTypeEncoding;
    const allowedCharsetParsers = allowedMediaTypeParsers
      .filter(({encodings, defaultEncoding}) => matchCharsetEncoding(encodings, encoding, availableBufferEncodingNames, defaultEncoding));
    if (allowedCharsetParsers.length === 0) {
      if (!encoding) {
        callback(createError(415, `Default charset is not set for this 'Media-Type'. Please provide the 'charset' for this 'Media-Type'`, {
          charset: encoding,
          type: 'charset.unsupported',
        }));
      } else if (availableBufferEncodingNames.includes(encoding)) {
        callback(createError(415, createErrorString(`charset=${encoding}`, ['Media-Type']), {
          charset: encoding,
          type: 'charset.unsupported',
        }));
      } else {
        callback(createError(415, createErrorString(`charset=${encoding}`), {
          charset: encoding,
          type: 'charset.unsupported',
        }));
      }
      return;
    }
    const parseConfiguration = allowedCharsetParsers.find(({inflate}) => matchContentEncoding(contentEncoding, inflate, availableDecompressorNames));
    if ((transferEncoding === undefined && contentLength === null) || ['GET', 'DELETE'].includes(req.method)) {
      callback(null, parseConfiguration?.emptyResponse);
      return;
    }
    if (!parseConfiguration) {
      const contentEncodingString = `Content-Encoding: ${contentEncoding}`;
      if (availableDecompressorNames.includes(contentEncoding)) {
        callback(createError(415, createErrorString(contentEncodingString, ['Media-Type', 'charset']), {
          contentEncoding,
          type: 'encoding.unsupported',
        }));
      } else {
        callback(createError(415, createErrorString(contentEncodingString), {
          contentEncoding,
          type: 'encoding.unsupported',
        }));
      }
      return;
    }

    const defaultEncoding = encoding || parseConfiguration.defaultEncoding || false;
    const limit = parseConfiguration.limit;
    const bufferEncoding = defaultEncoding !== false && availableBufferEncodings[defaultEncoding];
    const bufferEncodingIsStreamDecoder = bufferEncoding !== false && 'onData' in bufferEncoding;


    rawBodyParser(
      req,
      res,
      callback,
      availableDecompressors,
      availableDecompressorNames,
      parseConfiguration,
      contentLength,
      contentEncoding,
      defaultEncoding,
      limit,
      bufferEncoding,
      bufferEncodingIsStreamDecoder
    );

    //-------------------------------------------------
    function createErrorString(type: string, preTypes?: string[]) {
      return `Specified '${type}' is not available${
        preTypes && preTypes.length > 0 ? ` for this ${preTypes.map((preType) => `'${preType}'`).join(' and ')}` : ''
      } on this server.`;
    }
  };
}

/**
 * The function to convert the stream in the request to the required body
 * @param req The Request object
 * @param res The Response object
 * @param callback The callback function
 * @param availableDecompressors The available decompressors
 * @param availableDecompressorNames
 * @param parseConfiguration The parse configuration of the request
 * @param contentLength The content length of the request when set
 * @param contentEncoding The content encoding
 * @param defaultEncoding The buffer encoding name (charset)
 * @param limit The limit for the request, no limit when null
 * @param bufferEncoding The buffer encoding, false when buffer should not be decoded
 * @param bufferEncodingIsStreamDecoder true if buffer should be decoded in the data event, false when concatenated buffer should be decoded at the end event.
 */
export function rawBodyParser<T, U, V>(
  req: Request<U, V>,
  res: Response,
  callback: Done<U, V>,
  availableDecompressors: Record<string, () => Transform>,
  availableDecompressorNames: string[],
  parseConfiguration: PatchedParser<U, V>,
  contentLength: number | null,
  contentEncoding: string,
  defaultEncoding: string | false,
  limit: number | null,
  bufferEncoding: false | BufferEncoder<string, string> | BufferEncoder<T, U>,
  bufferEncodingIsStreamDecoder: boolean,
) {
  let complete = false;
  let sync = true;
  let received = 0;
  const chunks: (Buffer | T)[] = [];
  const verifyBuffer: Buffer[] = [];

  let stream: Request<U, V>;
  try {
    stream = <Request<U, V>>decompressStream(req);
  } catch(err: unknown) {
    stream = req;
    done(createError((<ParserError>err).status || 415, `Decompression failed: ${(<ParserError>err).message}`, {
      contentEncoding,
      type: (<ParserError>err).type || 'decompression.failed'
    }));
    return;
  }
  stream.on('aborted', onAborted);
  stream.on('data', onData);
  stream.on('end', onEnd);
  stream.on('error', onEnd);
  stream.on('close', cleanup);
  sync = false;

  //----------------------------------------------------------------------------------
  function done(err: Error): void;
  function done(err: null, result?: ParsedBody<U, V>): void;
  function done(err: Error | null, result?: ParsedBody<U, V>) {
    complete = true;
    sync ? process.nextTick(invokeCallback) : invokeCallback();

    // -----------------------------------------
    function invokeCallback() {
      if (err) {
        stream.unpipe();
        if (typeof stream.pause === 'function') {
          stream.pause();
        }
        callback(err);
      } else {
        callback(null, <ParsedBody<U, V>>result);
      }
    }
  }

  /* istanbul ignore next */
  function onAborted() {
    if (complete) return;
    done(createError(400, 'request aborted', {
      code: 'ECONNABORTED',
      type: 'request.aborted',
    }));
  }

  function onData(chunk: Buffer) {
    if (complete) return;
    received += chunk.length;

    if (limit !== null && received > limit) {
      done(createError(413, 'request entity too large', {
        limit,
        received,
        type: 'entity.too.large',
      }));
    }
    chunks.push(bufferEncodingIsStreamDecoder ? (<ChunkedBufferEncoder<T, U>>bufferEncoding).onData(chunk) : chunk);
    if (parseConfiguration.verify && bufferEncodingIsStreamDecoder) verifyBuffer.push(chunk);
  }

  function onEnd(err: Error & {code?: string}) {
    if (complete) return;
    if (err?.code === 'Z_DATA_ERROR') return done(createError(400, 'incorrect header check', {
      limit,
      received,
      type: 'header.check',
    }));
    if (err?.code === 'Z_BUF_ERROR') return done(createError(400, 'unexpected end of file', {
      limit,
      received,
      type: 'end.of.file',
    }));
    if (err) return done(err);
    if (contentLength !== null && received !== contentLength && contentEncoding === 'identity') {
      done(createError(400, 'request size did not match content length', {
        expected: contentLength,
        length: contentLength,
        received,
        type: 'request.size.invalid',
      }));
    } else {
      bufferEncodingIsStreamDecoder && chunks.push((<ChunkedBufferEncoder<T, U>>bufferEncoding).onEnd());
      if (received === 0) {
        done(null, parseConfiguration.emptyResponse);
        return;
      }
      const buffer = <Buffer | U>(bufferEncodingIsStreamDecoder
        ? (<ChunkedBufferEncoder<T, U>>bufferEncoding).reduce(<(string & T) []>chunks)
        : Buffer.concat(<Buffer []>chunks));
      const decoded = parseConfiguration?.encodings && !bufferEncodingIsStreamDecoder && bufferEncoding !== false
        ? (<UnchunkedBufferEncoder<U>>bufferEncoding).transform(<Buffer>buffer)
        : buffer;
      let body: U | V | Buffer;
      try {
        body = parseConfiguration?.parser ? parseConfiguration.parser(decoded) : decoded;
      } catch (err: unknown) {
        done(createError((<ParserError>err).status || 400, `Parse error: ${(<ParserError>err).message}`, {
          body: decoded,
          type: (<ParserError>err).type || 'entity.parse.failed',
        }));
        return;
      }
      if (parseConfiguration?.verify) {
        try {
          parseConfiguration.verify(req, res, bufferEncodingIsStreamDecoder ? Buffer.concat(verifyBuffer) : buffer, body, defaultEncoding);
          verifyBuffer.length = 0;
        } catch(err: unknown) {
          done(createError((<ParserError><unknown>err).status || 403, `Verify function did not match: ${(<ParserError>err).message}`, {
            body: typeof body === 'string' ? body : JSON.stringify(body),
            type: (<ParserError><unknown>err).type || 'entity.verify.failed',
          }));
          return;
        }
      }
      done(null, body);
    }
  }
  function cleanup() {
    chunks.length = 0;
    stream.removeListener('aborted', onAborted);
    stream.removeListener('data', onData);
    stream.removeListener('end', onEnd);
    stream.removeListener('error', onEnd);
    stream.removeListener('close', cleanup);
  }

  function decompressStream(req: Request<U, V>) {
    if (contentEncoding === 'identity' && availableDecompressorNames.includes('identity')) {
      return req;
    } else if (contentEncoding !== 'identity') {
      const stream = <Transform>availableDecompressors[contentEncoding]();
      req.pipe(stream);
      return <Request<U, V>><unknown>stream;
    }
    const error = <ParserError>new Error('server does not allow uncompressed requests.');
    error.type = 'unsupported.content.encoding';
    throw error;
  }

}
