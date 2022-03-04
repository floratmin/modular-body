import request from 'supertest';
import {bodyParser, Request, Response, ParsedBody, ParserConfiguration, ParserConfigurations, ParserError, DefaultOptions} from '../src';
import zlib from 'zlib';
import * as http from 'http';
import {MediaType} from '../src/mediaTypes';
import base62str from 'base62str';
import {BufferEncoder} from '../src/bufferEncoding';
import {Decompressors} from '../src/decompressStream';
// @ts-ignore
import LZWDecoder from 'lzw-stream/decoder';
import {Buffer} from 'buffer';

describe('handles application/json', () => {
  it('shuold parse JSON', (done) => {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi"}')
      .expect(200, '{"user":"tobi"}', done);
  });
  it('should handle Content-Length: 0', (done) => {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Content-Length', '0')
      .expect(200, '{}', done);
  });
  it('should handle empty message-body', (done) => {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Transfer-Encoding', 'chunked')
      .expect(200, '{}', done);
  });
  it('should handle no message-body', (done) => {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .unset('Transfer-Encoding')
      .expect(200, '{}', done);
  });
  it('should 400 when invalid content-length', function (done) {
    const jsonParser = bodyParser.json();
    const server = createServer((req: any, res: any, next: any) => {
      req.headers['content-length'] = '20'; // bad length
      jsonParser(req, res, next);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"str":')
      .expect(400, `request size did not match content length`, done);
  });
  it('should handle duplicated middleware', (done) => {
    const jsonParser = bodyParser.json();
    const server = createServer((req: any, res: any, next: any) => {
      jsonParser(req, res, (err) => {
        if (err) return next(err);
        jsonParser(req, res, next);
      });
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi"}')
      .expect(200, '{"user":"tobi"}', done);
  });
  it('should handle compression', (done) => {
    zlib.gzip('{"user":"tobi"}', (err, buffer) => {
      const zlibRequest = request(createServer({inflate: true}))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip');
      zlibRequest.write(buffer);
      zlibRequest.expect(200, '{"user":"tobi"}', done);
    });
  });
});

describe('when JSON is invalid', () => {
  it('should 400 for bad token', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{:')
      .expect(400, `Parse error: ${parseError('{:')}`, done);
  });
  it('should 400 for incomplete', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user"')
      .expect(400, `Parse error: ${parseError('{"user"')}`, done);
  });
  it('should error with type = "entity.parse.failed"', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .set('X-Error-Property', 'type')
      .send('{"user"')
      // .then(r => console.log(r));
      .expect(400, 'entity.parse.failed', done);
  });
  it('should include original body on error object', (done) => {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .set('X-Error-Property', 'body')
      .send(' {"user"')
      .expect(400, ' {"user"', done);
  });
});
describe('with limit option', () => {
  it('should 413 when over limit with Content-Length', (done) => {
    const buf = Buffer.alloc(1024, '.');
    request(createServer({ defaultLimit: '1kb' }))
      .post('/')
      .set('Content-Type', 'application/json')
      .set('Content-Length', '1034')
      .send(JSON.stringify({ str: buf.toString() }))
      .expect(413, done);
  });
  it('should error with type = "entity.too.large"', function (done) {
    const buf = Buffer.alloc(1024, '.');
    request(createServer({ defaultLimit: '1kb' }))
      .post('/')
      .set('Content-Type', 'application/json')
      .set('Content-Length', '1034')
      .set('X-Error-Property', 'type')
      .send(JSON.stringify({ str: buf.toString() }))
      .expect(413, 'entity.too.large', done);
  });

  it('should 413 when over limit with chunked encoding', function (done) {
    const buf = Buffer.alloc(1024, '.');
    const server = createServer({ defaultLimit: '1kb' });
    const test = request(server).post('/');
    test.set('Content-Type', 'application/json');
    test.set('Transfer-Encoding', 'chunked');
    test.write('{"str":');
    test.write('"' + buf.toString() + '"}');
    test.expect(413, done);
  });

  it('should accept number of bytes', function (done) {
    const buf = Buffer.alloc(1024, '.');
    request(createServer({ defaultLimit: 1024 }))
      .post('/')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ str: buf.toString() }))
      .expect(413, done);
  });

  it('should not change when options altered', function (done) {
    const buf = Buffer.alloc(1024, '.');
    const options = { defaultLimit: '1kb' };
    const server = createServer(options);

    options.defaultLimit = '100kb';

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ str: buf.toString() }))
      .expect(413, done);
  });

  it('should not hang response', function (done) {
    const buf = Buffer.alloc(10240, '.');
    const server = createServer({ defaultLimit: '8kb' });
    const test = request(server).post('/');
    test.set('Content-Type', 'application/json');
    test.write(buf);
    test.write(buf);
    test.write(buf);
    test.expect(413, done);
  });
});

describe('with inflate option', function () {
  describe('when false', function () {
    it('should not accept content-encoding', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex'));
      test.expect(415, `Specified 'Content-Encoding: gzip' is not available on this server.`, done);
    });
  });

  describe('when true', function () {
    it('should accept content-encoding', function (done) {
      const test = request(createServer({inflate: true})).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });
  });
});

describe('Should error when problem with media type', () => {
  it('Should error', (done) => {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application+json')
      .send('{"user":"tobi"}')
      .expect(400, 'invalid media type: application+json', done);
  });
});

describe('creates parser with strict option', () => {
  const parserConfiguration: ParserConfiguration<any, any> = {
    parser: (payload) => {
      const first = /^[\x20\x09\x0a\x0d]*(.)/.exec(<string>payload);
      if (first && first[1] !== '{' && first[1] !== '[') {
        throw new Error('only strict JSON allowed');
      }
      return JSON.parse(<string>payload);
    },
    matcher: 'application/json',
  };
  it('should throw when JSON is primitive', (done) => {
    request(createServer(undefined, parserConfiguration))
      .post('/')
      .set('Content-Type', 'application/json')
      .send('true')
      .expect(400, 'Parse error: only strict JSON allowed', done);
  });
  it('should not parse primitives with leading whitespaces', function (done) {
    request(createServer(undefined, parserConfiguration))
      .post('/')
      .set('Content-Type', 'application/json')
      .send('    true')
      .expect(400, 'Parse error: only strict JSON allowed', done);
  });

  it('should allow leading whitespaces in JSON', function (done) {
    request(createServer(undefined, parserConfiguration))
      .post('/')
      .set('Content-Type', 'application/json')
      .send('   { "user": "tobi" }')
      .expect(200, '{"user":"tobi"}', done);
  });

  it('should error with type = "entity.parse.failed"', function (done) {
    request(createServer(undefined, parserConfiguration))
      .post('/')
      .set('Content-Type', 'application/json')
      .set('X-Error-Property', 'type')
      .send('true')
      .expect(400, 'entity.parse.failed', done);
  });

  it('should include correct message in stack trace', function (done) {
    request(createServer(undefined, parserConfiguration))
      .post('/')
      .set('Content-Type', 'application/json')
      .set('X-Error-Property', 'stack')
      .send('true')
      .expect(400, /Parse error: only strict JSON allowed/, done);
  });
});
describe('Creating custom mime types', () => {
  describe('when "application/vnd.api+json"', () => {
    const parserConfiguration = {
      parser: (payload: string) => JSON.parse(payload),
      defaultEncoding: 'utf-8',
      encodings: true,
      matcher: 'application/vnd.api+json',
    };
    it('should parse JSON for custom type', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/vnd.api+json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should ignore standard type', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(415, 'Unsupported Media Type', done);
    });
  });
  describe('when ["application/json", "application/vnd.api+json"]', function () {
    const parserConfiguration = {
      parser: (payload: string) => JSON.parse(payload),
      defaultEncoding: 'utf-8',
      encodings: true,
      matcher: ['application/json', 'application/vnd.api+json'],
    };

    it('should parse JSON for "application/json"', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should parse JSON for "application/vnd.api+json"', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/vnd.api+json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should ignore "application/x-json"', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/x-json')
        .send('{"user":"tobi"}')
        .expect(415, 'Unsupported Media Type', done);
    });
  });

  describe('when a function', function () {
    const parserConfiguration = {
      parser: (payload: string) => JSON.parse(payload),
      defaultEncoding: 'utf-8',
      encodings: true,
      matcher: (mediaType: MediaType) => mediaType[0] === 'application' && mediaType[1] === 'vnd.api+json',
    };

    it('should parse when truthy value returned', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/vnd.api+json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });
    it('should not parse when falsy value returned', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(415, 'Unsupported Media Type', done);
    });
    it('should not work without content-type', function (done) {
      const server = createServer();
      const test = request(server).post('/');
      test.write('{"user":"tobi"}');
      test.expect(400, 'content-type header is missing from object: undefined', done);
    });
    it('should throw without content-type and not supported defaultContentType', function () {
      expect(() => createServer({ defaultContentType: 'text/plain' })).toThrow(`The specified default content type 'text/plain' does not match any parser configuration`);
    });
    it('should throw without content-type and not supported defaultContentType', function () {
      expect(() => createServer({ defaultContentType: 'textplain' })).toThrow(`The specified default content type 'textplain' is invalid.`);
    });
    it('should work without content-type and option defaultContentType', function (done) {
      const server = createServer({ defaultContentType: 'application/json' });
      const test = request(server).post('/');
      test.write('{"user":"tobi"}');
      test.expect(200, '{"user":"tobi"}', done);
    });
    it('should not invoke without a body', function (done) {
      const parserConfiguration = {
        parser: (payload: string) => JSON.parse(payload),
        defaultEncoding: 'utf-8',
        encodings: true,
        matcher: (mediaType: MediaType) => {throw new Error('oops!'); },
      };

      request(createServer(undefined, parserConfiguration))
        .get('/')
        .expect(200, done);
    });
  });

  describe('with verify option', function () {
    const parserConfiguration = {
      matcher: 'application/json',
      verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
        if (buffer[0] === 0x5b) throw new Error('no arrays');
      },
    };
    it('should error from verify', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(403, 'Verify function did not match: no arrays', done);
    });

    it('should error with type = "entity.verify.failed"', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'type')
        .send('["tobi"]')
        .expect(403, 'entity.verify.failed', done);
    });

    it('should allow custom codes', function (done) {
      const parserConfiguration = {
        matcher: 'application/json',
        verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
          if (buffer[0] === 0x5b) {
            const err = <ParserError>new Error('no arrays');
            err.status = 400;
            throw err;
          }
        },
      };

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(400, 'Verify function did not match: no arrays', done);
    });

    it('should allow custom type', function (done) {
      const parserConfiguration = {
        matcher: 'application/json',
        verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
          if (buffer[0] === 0x5b) {
            const err = <ParserError>new Error('no arrays');
            err.type = 'foo.bar';
            throw err;
          }
        },
      };

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'type')
        .send('["tobi"]')
        .expect(403, 'foo.bar', done);
    });

    it('should include original body on error object', function (done) {

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'body')
        .send('["tobi"]')
        .expect(403, '["tobi"]', done);
    });

    it('should allow pass-through', function (done) {

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should work with different charsets', function (done) {

      const test = request(createServer(undefined, parserConfiguration)).post('/');
      test.set('Content-Type', 'application/json; charset=utf16le');
      test.write(Buffer.from('7b0022006e0061006d00650022003a002200ba8b22007d00', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const parserConfiguration = {
        matcher: 'application/json',
        verify: (req: Request<any, any>, res: Response, body: ParsedBody<any, any>, buffer: Buffer) => {
          throw new Error('unexpected verify call');
        },
      };

      const test = request(createServer(undefined, parserConfiguration)).post('/');
      test.set('Content-Type', 'application/json; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex'));
      test.expect(415, `Specified 'charset=x-bogus' is not available on this server.`, done);
    });
  });

});
describe('charset', function () {

  it('should parse utf-8', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json; charset=utf-8');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should parse utf-16', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json; charset=utf16le');
    test.write(Buffer.from('7b0022006e0061006d00650022003a002200ba8b22007d00', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should parse when content-length != char length', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json; charset=utf-8');
    test.set('Content-Length', '13');
    test.write(Buffer.from('7b2274657374223a22c3a5227d', 'hex'));
    test.expect(200, '{"test":"å"}', done);
  });

  it('should default to utf-8', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should fail on unknown charset', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json; charset=koi8-r');
    test.write(Buffer.from('7b226e616d65223a22cec5d4227d', 'hex'));
    test.expect(415, `Specified 'charset=koi8-r' is not available on this server.`, done);
  });

  it('should fail when no default charset is specified for the media type, and no is specified on the request', (done) => {
    const parserConfiguration = {
      encodings: true,
      defaultEncoding: undefined,
      matcher: 'application/json'
    };
    const test = request(createServer(undefined, parserConfiguration)).post('/');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(415, `Default charset is not set for this 'Media-Type'. Please provide the 'charset' for this 'Media-Type'`, done);
  });

  it('should fail when charset is available but not supported by this media type', (done) => {
    const parserConfiguration = [
      {
        defaultEncoding: 'latin1',
        encodings: false,
        matcher: 'application/json'
      },{
        encodings: true,
        matcher: 'application/content',
      }
    ];
    const test = request(createServer(undefined, parserConfiguration)).post('/');
    test.set('Content-Type', 'application/json; charset=utf-8');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(415, `Specified 'charset=utf-8' is not available for this 'Media-Type' on this server.`, done);
  });

  it('should error with type = "charset.unsupported"', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json; charset=koi8-r');
    test.set('X-Error-Property', 'type');
    test.write(Buffer.from('7b226e616d65223a22cec5d4227d', 'hex'));
    test.expect(415, 'charset.unsupported', done);
  });
  it('should allow to add custom buffer encoder', (done) => {
    const decoder = base62str.createInstance();
    const bufferEncodings = [{
      transform: (buffer: Buffer) => decoder.decodeStr(buffer.toString()),
      encodings: ['base62', 'base-62'],
    }];
    const parseConfiguration = <ParserConfiguration<any, any>>{
      matcher: 'application/base62',
      defaultEncoding: 'base62',
      encodings: true,
    };
    const test = request(createServer(undefined, parseConfiguration, bufferEncodings)).post('/');
    test.set('Content-Type', 'application/base62; charset=base-62');
    test.write(Buffer.from('T8dgcjRGkZ3aysdN'));
    test.expect(200, '"Hello World!"', done);
  });
});

describe('encoding', function () {

  it('should parse without encoding', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should support identity encoding', function (done) {
    const test = request(createServer()).post('/');
    test.set('Content-Encoding', 'identity');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should reject identity encoding', function (done) {
    const test = request(createServer({defaultLimit: '10kb', inflate: ['gzip', 'deflate']})).post('/');
    test.set('Content-Encoding', 'identity');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
    test.expect(415, 'Decompression failed: server does not allow uncompressed requests.', done);
  });

  it('should support gzip encoding', function (done) {
    const test = request(createServer({inflate: true})).post('/');
    test.set('Content-Encoding', 'gzip');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should support brotli encoding', function (done) {
    const test = request(createServer({inflate: ['gzip', 'br']})).post('/');
    test.set('Content-Encoding', 'br');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('iwaAeyJuYW1lIjoi6K66In0D', 'base64'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should support deflate encoding', function (done) {
    const test = request(createServer({inflate: ['identity', 'gzip', 'deflate']})).post('/');
    test.set('Content-Encoding', 'deflate');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('789cab56ca4bcc4d55b2527ab16e97522d00274505ac', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should be case-insensitive', function (done) {
    const test = request(createServer({inflate: 'gzip'})).post('/');
    test.set('Content-Encoding', 'GZIP');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });

  it('should 415 on unknown encoding', function (done) {
    const test = request(createServer({inflate: true})).post('/');
    test.set('Content-Encoding', 'nulls');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('000000000000', 'hex'));
    test.expect(415, `Specified 'Content-Encoding: nulls' is not available on this server.`, done);
  });

  it('should 415 on brotli encoding when omitted', function (done) {
    const test = request(createServer({inflate: ['gzip', 'identity']})).post('/');
    test.set('Content-Encoding', 'br');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('iwaAeyJuYW1lIjoi6K66In0D', 'base64'));
    test.expect(415, `Specified 'Content-Encoding: br' is not available on this server.`, done);
  });

  it('should 415 on brotli encoding when omitted, but brotli available for other parser configurations', function (done) {
    const parserConfigurations = [
      {
        matcher: 'application/json',
        inflate: ['identity', 'gzip'],
      },{
        matcher: 'application/br',
        inflate: 'br',
      }];
    const test = request(createServer({inflate: true}, parserConfigurations)).post('/');
    test.set('Content-Encoding', 'br');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('iwaAeyJuYW1lIjoi6K66In0D', 'base64'));
    test.expect(415, `Specified 'Content-Encoding: br' is not available for this 'Media-Type' and 'charset' on this server.`, done);
  });

  it('should error with type = "encoding.unsupported"', function (done) {
    const test = request(createServer({inflate: true})).post('/');
    test.set('Content-Encoding', 'nulls');
    test.set('Content-Type', 'application/json');
    test.set('X-Error-Property', 'type');
    test.write(Buffer.from('000000000000', 'hex'));
    test.expect(415, 'encoding.unsupported', done);
  });

  it('should 400 when wrong content length', function (done) {
    const test = request(createServer({inflate: true})).post('/');
    test.set('Content-Encoding', 'gzip');
    test.set('Content-Type', 'application/json');
    test.set('Content-Length', '1');
    test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex'));
    test.expect(400, 'unexpected end of file', done);
  });

  it('should 400 on malformed encoding', function (done) {
    const test = request(createServer({inflate: true})).post('/');
    test.set('Content-Encoding', 'gzip');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('1f8b080000000000000bab56cc4d55b2527ab16e97522d00515be1cc0e000000', 'hex'));
    test.expect(400, 'incorrect header check', done);
  });

  it('should 413 when inflated value exceeds limit', function (done) {
    // gzip'd data exceeds 1kb, but deflated below 1kb
    const test = request(createServer({inflate: true, defaultLimit: '1kb'})).post('/');
    test.set('Content-Encoding', 'gzip');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('1f8b080000000000000bedc1010d000000c2a0f74f6d0f071400000000000000', 'hex'));
    test.write(Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'));
    test.write(Buffer.from('0000000000000000004f0625b3b71650c30000', 'hex'));
    test.expect(413, 'request entity too large', done);
  });
  it('allows to add own stream decompressors', (done) => {
    const decompressors = {
      'lzw': () => new LZWDecoder,
    };
    const test = request(createServer({inflate: true}, undefined, undefined, decompressors)).post('/');
    test.set('Content-Encoding', 'lzw');
    test.set('Content-Type', 'application/json');
    test.write(Buffer.from('00f7887013a64d19113a44a073a54b441f050101', 'hex'));
    test.expect(200, '{"name":"论"}', done);
  });
});

describe('Test disallow "__proto__" key on object level 1', () => {
  it('Should throw when "__proto__" key found on object', (done) => {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi","__proto__":"poison"}')
      .expect(400, `Parse error: __proto__ key not allowed in JSON body on main level`, done);
  });
  it('Should not throw when "__proto__" used in text', (done) => {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi","other":"When using \\"__proto__\\": in a value it should not throw"}')
      .expect(200, '{"user":"tobi","other":"When using \\"__proto__\\": in a value it should not throw"}', done);
  });
  it('Should throw when "__proto__" key is used in nested object', (done) => {
    type JSONValue =
      | string
      | number
      | boolean
      | { [x: string]: JSONValue }
      | Array<JSONValue>;

    /**
     * Adapted from https://stackoverflow.com/questions/8085004/iterate-through-nested-javascript-objects
     * @param jsonValue The object from the parsed JSON string
     * @param key The key which should be found in the object
     */
    function keyExistsInNestedObject(jsonValue: JSONValue, key: string) {
      const allLists: (null | JSONValue[])[] = [];
      const allArray: (null | JSONValue[])[] = [];
      if (typeof jsonValue !== 'object' || jsonValue === null) {
        return false;
      }
      if (Array.isArray(jsonValue)) {
        allArray.push(jsonValue);
      } else {
        if (Object.keys(jsonValue).includes(key)) {
          return true;
        }
        allLists.push(Object.values(jsonValue));
      }
      let allListsSize = allLists.length;
      let allArraySize = allArray.length;
      let indexLists = 0;
      let indexArray = 0;

      do {
        for (; indexArray < allArraySize; indexArray = indexArray + 1) {
          const currentArray = allArray[indexArray];
          const currentLength = (<JSONValue []>currentArray).length;
          for (let i = 0; i < currentLength; i += 1) {
            const arrayItemInner = (<JSONValue []>currentArray)[i];
            if (typeof arrayItemInner === 'object' && arrayItemInner !== null) {
              if (Array.isArray(arrayItemInner)) {
                allArraySize = allArray.push(arrayItemInner);
              } else {
                if (Object.keys(arrayItemInner).includes(key)) {
                  return true;
                }
                allListsSize = allLists.push(Object.values(arrayItemInner));
              }
            }
          }
          allArray[indexArray] = null;
        }
        for (; indexLists < allListsSize; indexLists = indexLists + 1) {
          const currentList = allLists[indexLists];
          const currentLength = (<JSONValue []>currentList).length;
          for (let i = 0; i < currentLength; i += 1) {
            const listItemInner = (<JSONValue []>currentList)[i];
            if (typeof listItemInner === 'object' && listItemInner !== null) {
              if (Array.isArray(listItemInner)) {
                allArraySize = allArray.push(listItemInner);
              } else {
                if (Object.keys(listItemInner).includes(key)) {
                  return true;
                }
                allListsSize = allLists.push(Object.values(listItemInner));
              }
            }
          }
          allLists[indexLists] = null;
        }
      } while (indexLists < allListsSize || indexArray < allArraySize);
      return false;
    }

    const parserConfiguration = <ParserConfigurations<string, JSONValue>>{
      matcher: 'application/json',
      parser: (payload: string) => {
        const jsonObject: JSONValue = JSON.parse(payload);
        if (typeof jsonObject === 'object' && payload.includes('"__proto__":') && keyExistsInNestedObject(jsonObject, '__proto__')) {
          throw new Error('Using "__proto__" as JSON key is not allowed.');
        }
        return jsonObject;
      },
      defaultEncoding: 'utf-8',
      emptyResponse: {},
    };
    request(createServer(undefined, parserConfiguration))
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi","nested":[1, {"a":[{"b":null,"__proto__":true}]}]}')
      .expect(400, `Parse error: Using "__proto__" as JSON key is not allowed.`, done);
  });
});

// eslint-disable-next-line @typescript-eslint/ban-types
function createServer (opts: DefaultOptions | Function = {}, parserConfigurations?: ParserConfigurations<any, any>, bufferEncodings?: BufferEncoder<unknown, any>[], decompressors?: Decompressors) {
  const _bodyParser = typeof opts !== 'function'
    ? bodyParser(opts, parserConfigurations ? parserConfigurations : 'application/json', bufferEncodings, decompressors)
    : opts;

  return http.createServer(function (req, res) {
    _bodyParser(req, res, function (err: any) {
      if (err) {
        res.statusCode = err.status || 500;
        // @ts-ignore
        res.end(err[req.headers['x-error-property'] || 'message']);
      } else {
        res.statusCode = 200;
        // @ts-ignore
        res.end(JSON.stringify(req.body));
      }
    });
  });
}

function parseError (str: string) {
  try {
    JSON.parse(str);
    throw new SyntaxError('strict violation');
  } catch (e: any) {
    return e.message;
  }
}
