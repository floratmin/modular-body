import request from 'supertest';
import {bodyParser, ParserConfiguration, ParserConfigurations, ParserError, DefaultOptions} from '../src';
import * as http from 'http';
import * as assert from 'assert';
import {MediaType} from '../src/mediaTypes';
import base62str from 'base62str';
import {BufferEncoder, getQuerystringParser} from '../src/bufferEncoding';
import {Decompressors} from '../src/decompressStream';
// @ts-ignore
import LZWDecoder from 'lzw-stream/decoder';
import qs from 'qs';
import {Buffer} from 'buffer';


describe('bodyParser.urlencoded()', function () {

  it('should parse x-www-form-urlencoded', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user=tobi')
      .expect(200, '{"user":"tobi"}', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const urlencodedParser = bodyParser(undefined, 'application/x-www-form-urlencoded');
    const server = createServer(function (req: any, res: any, next: any) {
      req.headers['content-length'] = '20'; // bad length
      urlencodedParser(req, res, next);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('str=')
      .expect(400, /content length/, done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Content-Length', '0')
      .send('')
      .expect(200, '{}', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer({ defaultLimit: '1kb' }))
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Transfer-Encoding', 'chunked')
      .send('')
      .expect(200, '{}', done);
  });

  it('should handle duplicated middleware', function (done) {
    const urlencodedParser = bodyParser(undefined, 'application/x-www-form-urlencoded');
    const server = createServer(function (req: any, res: any, next: any) {
      urlencodedParser(req, res, function (err) {
        if (err) return next(err);
        urlencodedParser(req, res, next);
      });
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user=tobi')
      .expect(200, '{"user":"tobi"}', done);
  });

  describe('with extended option', function () {
    describe('when false', function () {

      it('should not parse extended syntax', function (done) {
        request(createServer())
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user[name][first]=Tobi')
          .expect(200, '{"user[name][first]":"Tobi"}', done);
      });

      it('should parse multiple key instances', function (done) {
        request(createServer())
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=Tobi&user=Loki')
          .expect(200, '{"user":["Tobi","Loki"]}', done);
      });
    });

    describe('when true', function () {
      const parserConfiguration: ParserConfiguration<any, any> = {
        parser: (payload) => {
          return qs.parse(<string>payload);
        },
        matcher: 'application/x-www-form-urlencoded',
      };

      it('should parse multiple key instances', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=Tobi&user=Loki')
          .expect(200, '{"user":["Tobi","Loki"]}', done);
      });

      it('should parse extended syntax', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user[name][first]=Tobi')
          .expect(200, '{"user":{"name":{"first":"Tobi"}}}', done);
      });

      it('should parse parameters with dots', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user.name=Tobi')
          .expect(200, '{"user.name":"Tobi"}', done);
      });

      it('should parse fully-encoded extended syntax', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user%5Bname%5D%5Bfirst%5D=Tobi')
          .expect(200, '{"user":{"name":{"first":"Tobi"}}}', done);
      });

      it('should parse array index notation', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('foo[0]=bar&foo[1]=baz')
          .expect(200, '{"foo":["bar","baz"]}', done);
      });

      it('should parse array index notation with large array', function (done) {
        let str = 'f[0]=0';

        for (let i = 1; i < 500; i++) {
          str += '&f[' + i + ']=' + i.toString(16);
        }

        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(str)
          .expect(function (res) {
            const obj = JSON.parse(res.text);
            assert.strictEqual(Object.keys(obj).length, 1);
            assert.strictEqual(Array.isArray(obj.f), true);
            assert.strictEqual(obj.f.length, 500);
          })
          .expect(200, done);
      });

      it('should parse array of objects syntax', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('foo[0][bar]=baz&foo[0][fizz]=buzz&foo[]=done!')
          .expect(200, '{"foo":[{"bar":"baz","fizz":"buzz"},"done!"]}', done);
      });

      it('should parse deep object', function (done) {
        let str = 'foo';

        for (let i = 0; i < 500; i++) {
          str += '[p]';
        }

        str += '=bar';

        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(str)
          .expect(function (res) {
            const obj = JSON.parse(res.text);
            assert.strictEqual(Object.keys(obj).length, 1);
            assert.strictEqual(typeof obj.foo, 'object');

            let depth = 0;
            let ref = obj.foo;
            while ((ref = ref.p)) {
              depth++;
            }
            assert.strictEqual(depth, 500);
          })
          .expect(200, done);
      });
    });
  });

  describe('with inflate option', function () {
    describe('when false', function () {
      it('should not accept content-encoding', function (done) {
        const test = request(createServer()).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/x-www-form-urlencoded');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
        test.expect(415, `Specified 'Content-Encoding: gzip' is not available on this server.`, done);
      });
    });

    describe('when true', function () {
      it('should accept content-encoding', function (done) {
        const test = request(createServer({inflate: true})).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/x-www-form-urlencoded');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
        test.expect(200, '{"name":"论"}', done);
      });
    });
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({defaultLimit: '1bk'}))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('Content-Length', '1028')
        .send('str=' + buf.toString())
        .expect(413, done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const server = createServer({ defaultLimit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.set('Transfer-Encoding', 'chunked');
      test.write('str=');
      test.write(buf.toString());
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ defaultLimit: 1024 }))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('str=' + buf.toString())
        .expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const options = { defaultLimit: '1kb' };
      const server = createServer(options);

      options.defaultLimit = '100kb';

      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('str=' + buf.toString())
        .expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf = Buffer.alloc(10240, '.');
      const server = createServer({ defaultLimit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(413, done);
    });
  });

  describe('with parameterLimit option', function () {
    describe('with extended: false', function () {
      const parserConfiguration = {
        parser: getQuerystringParser(10),
        matcher: 'application/x-www-form-urlencoded',
      };
      it('should 413 if over limit', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(11))
          .expect(413, /too many parameters/, done);
      });

      it('should error with type = "parameters.too.many"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .set('X-Error-Property', 'type')
          .send(createManyParams(11))
          .expect(413, 'parameters.too.many', done);
      });

      it('should work when at the limit', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10))
          .expect(expectKeyCount(10))
          .expect(200, done);
      });

      it('should work with large limit', function (done) {
        const parserConfiguration = {
          parser: getQuerystringParser(5000),
          matcher: 'application/x-www-form-urlencoded',
        };
        request(createServer({defaultLimit: Infinity}, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(5000))
          .expect(expectKeyCount(5000))
          .expect(200, done);
      });

      it('should work with Infinity limit', function (done) {
        const parserConfiguration = {
          parser: getQuerystringParser(Infinity),
          matcher: 'application/x-www-form-urlencoded',
        };
        request(createServer({defaultLimit: Infinity}, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10000))
          .expect(expectKeyCount(10000))
          .expect(200, done);
      });
    });

    describe('with extended: true', function () {
      const parserConfiguration = {
        parser:  (payload: string) => {
          if (parameterCount(payload, 10) !== undefined) {
            return qs.parse(payload);
          }
          const err = <ParserError>new Error('too many parameters');
          err.status = 413;
          err.type = 'parameters.too.many';
          throw err;
        },
        matcher: 'application/x-www-form-urlencoded',
      };

      it('should 413 if over limit', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(11))
          .expect(413, /too many parameters/, done);
      });

      it('should error with type = "parameters.too.many"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .set('X-Error-Property', 'type')
          .send(createManyParams(11))
          .expect(413, 'parameters.too.many', done);
      });

      it('should work when at the limit', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10))
          .expect(expectKeyCount(10))
          .expect(200, done);
      });

      it('should work with large limit', function (done) {
        const parserConfiguration = {
          parser: (payload: string) => {
            if (parameterCount(payload, 5000) !== undefined) {
              return qs.parse(payload);
            }
            const err = <ParserError>new Error('too many parameters');
            err.status = 413;
            err.type = 'parameters.too.many';
            throw err;
          },
          matcher: 'application/x-www-form-urlencoded',
        };
        request(createServer({defaultLimit: Infinity}, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(5000))
          .expect(expectKeyCount(5000))
          .expect(200, done);
      });

      it('should work with Infinity limit', function (done) {
        const parserConfiguration = {
          parser: (payload: string) => qs.parse(payload),
          matcher: 'application/x-www-form-urlencoded',
        };
        request(createServer({defaultLimit: Infinity}, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10000))
          .expect(expectKeyCount(10000))
          .expect(200, done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "application/vnd.x-www-form-urlencoded"', function () {
      const parserConfiguration = {
        parser: getQuerystringParser(),
        matcher: 'application/vnd.x-www-form-urlencoded',
        defaultEncoding: 'utf-8',
      };

      it('should parse for custom type', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/vnd.x-www-form-urlencoded')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore standard type', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=tobi')
          .expect(415, 'Unsupported Media Type', done);
      });
    });

    describe('when ["urlencoded", "application/x-pairs"]', function () {
      const parserConfiguration = {
        parser: getQuerystringParser(),
        matcher: ['application/x-www-form-urlencoded', 'application/x-pairs'],
        defaultEncoding: 'utf-8',
        encodings: true,
      };

      it('should parse "application/x-www-form-urlencoded"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should parse "application/x-pairs"', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-pairs')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore application/x-foo', function (done) {
        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/x-foo')
          .send('user=tobi')
          .expect(415, 'Unsupported Media Type', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const parserConfiguration = {
          parser: getQuerystringParser(),
          matcher: (mediaType: MediaType) => mediaType[0] === 'application' && mediaType[1] === 'vnd.something',
          defaultEncoding: 'utf-8',
          encodings: true,
        };

        request(createServer(undefined, parserConfiguration))
          .post('/')
          .set('Content-Type', 'application/vnd.something')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });
      it('should not work without content-type', function (done) {
        const server = createServer();
        const test = request(server).post('/');
        test.write('user=tobi');
        test.expect(400, 'content-type header is missing from object: undefined', done);
      });
      it('should work without content-type and option defaultContentType', function (done) {
        const server = createServer({ defaultContentType: 'application/x-www-form-urlencoded' });
        const test = request(server).post('/');
        test.write('user=tobi');
        test.expect(200, '{"user":"tobi"}', done);
      });

      it('should not invoke without a body', function (done) {
        const parserConfiguration = {
          parser: getQuerystringParser(),
          matcher: (mediaType: MediaType) => {throw new Error('oops!');},
          defaultEncoding: 'utf-8',
          encodings: true,
        };

        request(createServer(undefined, parserConfiguration))
          .get('/')
          .expect(200, done);
      });
    });
  });

  describe('with verify option', function () {
    const parserConfiguration = {
      matcher: 'application/x-www-form-urlencoded',
      verify: (req: any, res: any, buf: any) => {
        if (buf[0] === 0x20) throw new Error('no leading space');
      },
    };
    it('should error from verify', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(' user=tobi')
        .expect(403, 'Verify function did not match: no leading space', done);
    });

    it('should error with type = "entity.verify.failed"', function (done) {
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('X-Error-Property', 'type')
        .send(' user=tobi')
        .expect(403, 'entity.verify.failed', done);
    });

    it('should allow custom codes', function (done) {
      const parserConfiguration = {
        matcher: 'application/x-www-form-urlencoded',
        verify: (req: any, res: any, buf: any) => {
          if (buf[0] !== 0x20) return;
          const err = <ParserError>new Error('no leading space');
          err.status = 400;
          throw err;
        },
      };

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(' user=tobi')
        .expect(400, 'Verify function did not match: no leading space', done);
    });

    it('should allow custom type', function (done) {
      const parserConfiguration = {
        matcher: 'application/x-www-form-urlencoded',
        verify: (req: any, res: any, buf: any) => {
          if (buf[0] !== 0x20) return;
          const err = <ParserError>new Error('no leading space');
          err.type = 'foo.bar';
          throw err;
        },
      };

      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('X-Error-Property', 'type')
        .send(' user=tobi')
        .expect(403, 'foo.bar', done);
    });

    it('should allow pass-through', function (done) {
      const parserConfiguration = {
        matcher: 'application/x-www-form-urlencoded',
        verify: (req: any, res: any, body: any, buf: any) => {
          if (buf[0] === 0x5b) throw new Error('no leading space');
        },
      };
      request(createServer(undefined, parserConfiguration))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('user=tobi')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const parserConfiguration = {
        matcher: 'application/x-www-form-urlencoded',
        verify: (req: any, res: any, buf: any) => {
          throw new Error('unexpected verify call');
        },
      };

      const test = request(createServer(undefined, parserConfiguration)).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex'));
      test.expect(415, `Specified 'charset=x-bogus' is not available on this server.`, done);
    });
  });

  describe('charset', function () {

    it('should parse utf-8', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should parse when content-length != char length', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
      test.set('Content-Length', '7');
      test.write(Buffer.from('746573743dc3a5', 'hex'));
      test.expect(200, '{"test":"å"}', done);
    });

    it('should default to utf-8', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should fail on unknown charset', function (done) {
      const test = request(createServer()).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=koi8-r');
      test.write(Buffer.from('6e616d653dcec5d4', 'hex'));
      test.expect(415, `Specified 'charset=koi8-r' is not available on this server.`, done);
    });
  });

  describe('encoding', function () {
    it('should parse without encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should reject identity encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: ['gzip', 'deflate']})).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex'));
      test.expect(415, 'Decompression failed: server does not allow uncompressed requests.', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: ['identity', 'gzip', 'deflate']})).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('789ccb4bcc4db57db16e17001068042f', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: 'gzip'})).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(createServer({defaultLimit: '10kb', inflate: true})).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('000000000000', 'hex'));
      test.expect(415, `Specified 'Content-Encoding: nulls' is not available on this server.`, done);
    });
  });
});

function createManyParams (count: number) {
  let str = '';

  if (count === 0) {
    return str;
  }

  str += '0=0';

  for (let i = 1; i < count; i++) {
    const n = i.toString(36);
    str += '&' + n + '=' + n;
  }

  return str;
}
// eslint-disable-next-line @typescript-eslint/ban-types
function createServer (opts: DefaultOptions | Function = {}, parserConfigurations?: ParserConfigurations<any, any>, bufferEncodings?: BufferEncoder<unknown, any>[], decompressors?: Decompressors) {
  const _bodyParser = typeof opts !== 'function'
    ? bodyParser(opts, parserConfigurations ? parserConfigurations : 'application/x-www-form-urlencoded', bufferEncodings, decompressors)
    : opts;

  return http.createServer(function (req, res) {
    _bodyParser(req, res, function (err: any) {
      if (err) {
        res.statusCode = err.status || 500;
        res.end(err[(<any>req).headers['x-error-property'] || 'message']);
      } else {
        res.statusCode = 200;
        res.end(JSON.stringify((<any>req).body));
      }
    });
  });
}

function expectKeyCount (count: number) {
  return function (res: any) {
    assert.strictEqual(Object.keys(JSON.parse(res.text)).length, count);
  };
}
function parameterCount(body: string, limit: number) {
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
