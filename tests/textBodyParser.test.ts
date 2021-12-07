import request from 'supertest';
import {bodyParser, Request, Response, ParserConfiguration, ParserConfigurations, ParserError, DefaultOptions} from '../src';
import * as http from 'http';
import {MediaType} from '../src/mediaTypes';
import base62str from 'base62str';
import {BufferEncoder} from '../src/bufferEncoding';
import {Decompressors} from '../src/decompressStream';
// @ts-ignore
import LZWDecoder from 'lzw-stream/decoder';
import {Buffer} from 'buffer';


describe('bodyParser.text()', function () {
  it('should parse text/plain', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'text/plain')
      .send('user is tobi')
      .expect(200, '"user is tobi"', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const textParser = bodyParser(undefined, 'text/plain');
    const server = createServer(function (req: any, res: any, next: any) {
      req.headers['content-length'] = '20'; // bad length
      textParser(req, res, next);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'text/plain')
      .send('user')
      .expect(400, /content length/, done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(createServer({ defaultLimit: '1kb' }))
      .post('/')
      .set('Content-Type', 'text/plain')
      .set('Content-Length', '0')
      .expect(200, '""', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer({ defaultLimit: '1kb' }))
      .post('/')
      .set('Content-Type', 'text/plain')
      .set('Transfer-Encoding', 'chunked')
      .send('')
      .expect(200, '""', done);
  });

  it('should handle duplicated middleware', function (done) {
    const textParser = bodyParser(undefined, 'text/plain');
    const server = createServer(function (req: any, res: any, next: any) {
      textParser(req, res, function (err) {
        if (err) return next(err);
        textParser(req, res, next);
      });
    });

    request(server)
      .post('/')
      .set('Content-Type', 'text/plain')
      .send('user is tobi')
      .expect(200, '"user is tobi"', done);
  });

  describe('with defaultCharset option', function () {
    const parserConfiguration = {
      defaultEncoding: 'latin1',
      encodings: true,
      matcher: 'text/plain',
    };
    it('should change default charset', function (done) {
      const server = createServer(undefined, parserConfiguration);
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain');
      // test.write(Buffer.from('6e616d6520697320cec5d4', 'hex'));
      test.write(Buffer.from('6e616d6520697320426af8726e', 'hex'));
      test.expect(200, '"name is Bjørn"', done);
    });

    it('should honor content-type charset', function (done) {
      const server = createServer(undefined, parserConfiguration);
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain; charset=utf-8');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(200, '"name is 论"', done);
    });
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1028, '.');
      request(createServer({ defaultLimit: '1kb' }))
        .post('/')
        .set('Content-Type', 'text/plain')
        .set('Content-Length', '1028')
        .send(buf.toString())
        .expect(413, done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const server = createServer({ defaultLimit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain');
      test.set('Transfer-Encoding', 'chunked');
      test.write(buf.toString());
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1028, '.');
      request(createServer({ defaultLimit: 1024 }))
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(buf.toString())
        .expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const options = { defaultLimit: '1kb' };
      const server = createServer(options);

      options.defaultLimit = '100kb';

      request(server)
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(buf.toString())
        .expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf = Buffer.alloc(10240, '.');
      const server = createServer({ defaultLimit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain');
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
        test.set('Content-Type', 'text/plain');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex'));
        test.expect(415, `Specified 'Content-Encoding: gzip' is not available on this server.`, done);
      });
    });

    describe('when true', function () {
      it('should accept content-encoding', function (done) {
        const test = request(createServer({inflate: true})).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'text/plain');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex'));
        test.expect(200, '"name is 论"', done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "text/html"', function () {
      const parserConfiguration = {
        defaultEncoding: 'utf-8',
        encodings: true,
        matcher: 'text/html',
      };
      it('should parse for custom type', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'text/html')
          .send('<b>tobi</b>')
          .expect(200, '"<b>tobi</b>"', done);
      });

      it('should ignore standard type', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'text/plain')
          .send('user is tobi')
          .expect(415, 'Unsupported Media Type', done);
      });
    });

    describe('when ["text/html", "text/plain"]', function () {
      const parserConfiguration = {
        defaultEncoding: 'utf-8',
        encodings: true,
        matcher: ['text/html', 'text/plain'],
      };

      it('should parse "text/html"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'text/html')
          .send('<b>tobi</b>')
          .expect(200, '"<b>tobi</b>"', done);
      });

      it('should parse "text/plain"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'text/plain')
          .send('tobi')
          .expect(200, '"tobi"', done);
      });

      it('should ignore "text/xml"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'text/xml')
          .send('<user>tobi</user>')
          .expect(415, 'Unsupported Media Type', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const parserConfiguration = {
          defaultEncoding: 'utf-8',
          encodings: true,
          matcher: (mediaType: MediaType) => mediaType[0] === 'text' && mediaType[1] === 'vnd.something',
        };

        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'text/vnd.something')
          .send('user is tobi')
          .expect(200, '"user is tobi"', done);
      });

      it('should not work without content-type', function (done) {
        const server = createServer();
        const test = request(server).post('/');
        test.write('{"user":"tobi"}');
        test.expect(400, 'content-type header is missing from object: undefined', done);
      });
      it('should work without content-type and option defaultContentType', function (done) {
        const server = createServer({ defaultContentType: 'text/plain' });
        const test = request(server).post('/');
        test.write('user is tobi');
        test.expect(200, '"user is tobi"', done);
      });
      it('should not invoke without a body', function (done) {
        const parserConfiguration = {
          defaultEncoding: 'utf-8',
          encodings: true,
          matcher: (mediaType: MediaType) => {throw new Error('oops!'); },
        };

        request(createServer(undefined, parserConfiguration))
          .get('/')
          .expect(200, done);
      });
    });
  });

  describe('with verify option', function () {
    const parserConfiguration = {
      matcher: 'text/plain',
      verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
        if (buffer[0] === 0x20) throw new Error('no leading space');
      },
    };

    it('should error from verify', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(' user is tobi')
        .expect(403, 'Verify function did not match: no leading space', done);
    });

    it('should allow custom codes', function (done) {
      const parserConfiguration = {
        matcher: 'text/plain',
        verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
          if (buffer[0] !== 0x20) return;
          const err = <ParserError>new Error('no leading space');
          err.status = 400;
          throw err;
        },
      };

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(' user is tobi')
        .expect(400, 'Verify function did not match: no leading space', done);
    });

    it('should allow pass-through', function (done) {

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'text/plain')
        .send('user is tobi')
        .expect(200, '"user is tobi"', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const parserConfiguration = {
        matcher: 'text/plain',
        verify: (req: Request<any, any>, res: Response, buffer: Buffer) => {
          throw new Error('unexpected verify call');
        },
      };

      const test = request(createServer(undefined, parserConfiguration)).post('/');
      test.set('Content-Type', 'text/plain; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex'));
      test.expect(415, `Specified 'charset=x-bogus' is not available on this server.`, done);
    });
  });

  describe('charset', function () {
    it('should parse utf-8', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'text/plain; charset=utf-8');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should parse codepage charsets', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'text/plain; charset=latin1');
      test.write(Buffer.from('6e616d6520697320426af8726e', 'hex'));
      test.expect(200, '"name is Bjørn"', done);
    });

    it('should parse when content-length != char length', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'text/plain; charset=utf-8');
      test.set('Content-Length', '11');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should default to utf-8', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should 415 on unknown charset', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'text/plain; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex'));
      test.expect(415, `Specified 'charset=x-bogus' is not available on this server.`, done);
    });
    it('should allow to add custom buffer encoder', (done) => {
      const decoder = base62str.createInstance();
      const bufferEncodings = [{
        transform: (buffer: Buffer) => decoder.decodeStr(buffer.toString()),
        encodings: ['base62', 'base-62'],
      }];
      const parseConfiguration = <ParserConfiguration<any, any>>{
        matcher: 'text/plain',
        defaultEncoding: 'base62',
        encodings: true,
      };
      const test = request(createServer(undefined, parseConfiguration, bufferEncodings)).post('/');
      test.set('Content-Type', 'text/plain; charset=base-62');
      test.write(Buffer.from('T8dgcjRGkZ3aysdN'));
      test.expect(200, '"Hello World!"', done);
    });
  });

  describe('encoding', function () {
    it('should parse without encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should reject identity encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: ['gzip', 'deflate']})).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(415, 'Decompression failed: server does not allow uncompressed requests.', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: ['identity', 'gzip', 'deflate']})).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('789ccb4bcc4d55c82c5678b16e17001a6f050e', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: 'gzip'})).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex'));
      test.expect(200, '"name is 论"', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('000000000000', 'hex'));
      test.expect(415, `Specified 'Content-Encoding: nulls' is not available on this server.`, done);
    });
    it('allows to add own stream decompressors', (done) => {
      const decompressors = {
        'lzw': () => new LZWDecoder,
      };
      const test = request(createServer({inflate: true}, undefined, undefined, decompressors)).post('/');
      test.set('Content-Encoding', 'lzw');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('00dd84695306449a3920d0b9d2a5', 'hex'));
      test.expect(200, '"name is 论"', done);
    });
  });
});

// eslint-disable-next-line @typescript-eslint/ban-types
function createServer (opts: DefaultOptions | Function = {}, parserConfigurations?: ParserConfigurations<any, any>, bufferEncodings?: BufferEncoder<unknown, any>[], decompressors?: Decompressors) {
  const _bodyParser = typeof opts !== 'function'
    ? bodyParser(opts, parserConfigurations ? parserConfigurations : 'text/plain', bufferEncodings, decompressors)
    : opts;

  return http.createServer(function (req, res) {
    _bodyParser(req, res, function (err: any) {
      res.statusCode = err ? (err.status || 500) : 200;
      res.end(err ? err.message : JSON.stringify((<any>req).body));
    });
  });
}
