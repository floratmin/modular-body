import request from 'supertest';
import {bodyParser, Request, Response, ParserConfigurations, ParserError, DefaultOptions} from '../src';
import * as http from 'http';
import {MediaType} from '../src/mediaTypes';
import {BufferEncoder} from '../src/bufferEncoding';
import {Decompressors} from '../src/decompressStream';
import {Buffer} from 'buffer';
// @ts-ignore
import LZWDecoder from 'lzw-stream/decoder';

describe('bodyParser.raw()', function () {

  it('should parse application/octet-stream', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .send('the user is tobi')
      .expect(200, 'buf:746865207573657220697320746f6269', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const rawParser = bodyParser.raw();
    const server = createServer(function (req: any, res: any, next: any) {
      req.headers['content-length'] = '20'; // bad length
      rawParser(req, res, next);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .send('stuff')
      .expect(400, /content length/, done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Length', '0')
      .expect(200, 'buf:', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .set('Transfer-Encoding', 'chunked')
      .send('')
      .expect(200, 'buf:', done);
  });

  it('should handle duplicated middleware', function (done) {
    const rawParser = bodyParser.raw();
    const server = createServer(function (req: any, res: any, next: any) {
      rawParser(req, res, function (err) {
        if (err) return next(err);
        rawParser(req, res, next);
      });
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .send('the user is tobi')
      .expect(200, 'buf:746865207573657220697320746f6269', done);
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const server = createServer({ defaultLimit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.set('Content-Length', '1028');
      test.write(buf);
      test.expect(413, done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const server = createServer({ defaultLimit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.set('Transfer-Encoding', 'chunked');
      test.write(buf);
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const server = createServer({ defaultLimit: 1024 });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(buf);
      test.expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const options = { defaultLimit: '1kb' };
      const server = createServer(options);

      options.defaultLimit = '100kb';

      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(buf);
      test.expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf = Buffer.alloc(10240, '.');
      const server = createServer({ defaultLimit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
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
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
        test.expect(415, 'Specified \'Content-Encoding: gzip\' is not available on this server.', done);
      });
    });

    describe('when true', function () {
      it('should accept content-encoding', function (done) {
        const test = request(createServer({ inflate: true })).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
        test.expect(200, 'buf:6e616d653de8aeba', done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "application/vnd+octets"', function () {
      const parserConfiguration = {
        matcher: 'application/vnd+octets',
      };

      it('should parse for custom type', function (done) {
        const test = request(createServer(undefined, parserConfiguration)).post('/');
        test.set('Content-Type', 'application/vnd+octets');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(200, 'buf:000102', done);
      });

      it('should ignore standard type', function (done) {
        const test = request(createServer(undefined, parserConfiguration)).post('/');
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(415, 'Unsupported Media Type', done);
      });
    });

    describe('when ["application/octet-stream", "application/vnd+octets"]', function () {
      const parserConfiguration = {
        matcher: ['application/octet-stream', 'application/vnd+octets'],
      };

      it('should parse "application/octet-stream"', function (done) {
        const test = request(createServer(undefined, parserConfiguration)).post('/');
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(200, 'buf:000102', done);
      });

      it('should parse "application/vnd+octets"', function (done) {
        const test = request(createServer(undefined, parserConfiguration)).post('/');
        test.set('Content-Type', 'application/vnd+octets');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(200, 'buf:000102', done);
      });

      it('should ignore "application/x-foo"', function (done) {
        const test = request(createServer(undefined, parserConfiguration)).post('/');
        test.set('Content-Type', 'application/x-foo');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(415, 'Unsupported Media Type', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const parserConfiguration = {
          matcher: (mediaType: MediaType) => mediaType[0] === 'application' && mediaType[1] === 'vnd.octet',
        };

        const server = createServer(undefined, parserConfiguration);
        const test = request(server).post('/');
        test.set('Content-Type', 'application/vnd.octet');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(200, 'buf:000102', done);
      });
      it('should error when falsy value returned', function (done) {
        const parserConfiguration = {
          matcher: (mediaType: MediaType) => mediaType[0] === 'application' && mediaType[1] === 'vnd.octet',
        };

        const server = createServer(undefined, parserConfiguration);
        const test = request(server).post('/');
        test.set('Content-Type', 'application/vnd.octets');
        test.write(Buffer.from('000102', 'hex'));
        test.expect(415, 'Unsupported Media Type', done);
      });
      it('should not work without content-type', function (done) {
        const server = createServer();
        const test = request(server).post('/');
        test.write('{"user":"tobi"}');
        test.expect(400, 'content-type header is missing from object: undefined', done);
      });
      it('should work without content-type and option defaultContentType', function (done) {
        const server = createServer({ defaultContentType: 'application/octet-stream' });
        const test = request(server).post('/');
        test.write('{"user":"tobi"}');
        test.expect(200, 'buf:7b2275736572223a22746f6269227d', done);
      });
      it('should not invoke without a body', function (done) {
        const parserConfiguration = {
          matcher: (mediaType: MediaType) => {throw new Error('oops!'); },
        };

        const server = createServer(undefined, parserConfiguration);
        request(server)
          .get('/')
          .expect(200, done);
      });
    });
  });

  describe('with verify option', function () {
    const parserConfiguration = {
      matcher: 'application/octet-stream',
      verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
        if (buffer[0] === 0x00) throw new Error('no leading null');
      },
    };

    it('should error from verify', function (done) {
      const server = createServer(undefined, parserConfiguration);
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('000102', 'hex'));
      test.expect(403, 'Verify function did not match: no leading null', done);
    });

    it('should allow custom codes', function (done) {
      const parserConfiguration = {
        matcher: 'application/octet-stream',
        verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
          if (buffer[0] !== 0x00) return;
          const err = <ParserError>new Error('no leading null');
          err.status = 400;
          throw err;
        },
      };
      const server = createServer(undefined, parserConfiguration);

      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('000102', 'hex'));
      test.expect(400, 'Verify function did not match: no leading null', done);
    });

    it('should allow pass-through', function (done) {
      const server = createServer(undefined, parserConfiguration);
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('0102', 'hex'));
      test.expect(200, 'buf:0102', done);
    });
  });

  describe('charset', function () {

    it('should error with charset', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'application/octet-stream; charset=utf-8');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(415, `Specified 'charset=utf-8' is not available on this server.`, done);
    });
  });

  describe('encoding', function () {

    it('should parse without encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should reject identity encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: ['gzip', 'deflate']})).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(415, 'Decompression failed: server does not allow uncompressed requests.', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: ['identity', 'gzip', 'deflate']})).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('789ccb4bcc4db57db16e17001068042f', 'hex'));
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: 'gzip'})).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('000000000000', 'hex'));
      test.expect(415, `Specified 'Content-Encoding: nulls' is not available on this server.`, done);
    });
    it('allows to add own stream decompressors', (done) => {
      const decompressors = {
        'lzw': () => new LZWDecoder,
      };
      const test = request(createServer({inflate: true}, undefined, undefined, decompressors)).post('/');
      test.set('Content-Encoding', 'lzw');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('00f7887013a64d19113a44a073a54b441f050101', 'hex'));
      test.expect(200, 'buf:7b226e616d65223a22e8aeba227d0a', done);
    });
  });
});

// eslint-disable-next-line @typescript-eslint/ban-types
function createServer (opts: DefaultOptions | Function = {}, parserConfigurations?: ParserConfigurations<any, any>, bufferEncodings?: BufferEncoder<unknown, any>[], decompressors?: Decompressors) {
  const _bodyParser = typeof opts !== 'function'
    ? bodyParser(opts, parserConfigurations ? parserConfigurations : 'application/octet-stream', bufferEncodings, decompressors)
    : opts;

  return http.createServer(function (req, res) {
    _bodyParser(req, res, function (err: any) {
      // @ts-ignore
      if (err) {
        res.statusCode = err.status || 500;
        // @ts-ignore
        res.end(err.message);
        return;
      } else {
        if (Buffer.isBuffer((<any>req).body)) {
          res.statusCode = 200;
          res.end(`buf:${(<any>req).body.toString('hex')}`);
          return;
        }
        res.end(JSON.stringify((<any>req).body));
      }
    });
  });
}
