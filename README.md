#Lightweight and extendable body-parser for express style web frameworks

### Installation

npm install modular-body

### Basic usage:

```ts
import express from 'express';
import {bodyParser} from 'modular-body';

const app = express();
app.use(bodyParser()); // createse parsers for 'application/json', 'text/plain', 'application/octet-stream' and 'application/x-www-form-urlencoded'
app.listen(3000, () => console.log('Server running on port 3000'));
```

```ts
import express from 'express';
import {bodyParser} from 'modular-body';

const app = express();
app.use(bodyParser.json()); // createse parser only for 'application/json'
app.listen(3000, () => console.log('Server running on port 3000'));
```

### Extended usage:

```ts
import express from 'express';
import {
  bodyParser,
  ParserConfigurations,
} from 'modular-body';
import {Buffer} from 'buffer';
import {MediaType} from './mediaTypes';

const parserConfigurations: ParserConfigurations = [
  'text/plain', // use default configuration
  { // change default configuration, not specified fields will be used from options keys or from default configuration
    inflate: ['identity', 'gzip', 'br'],
    limit: '20Mb', // use custom limit
    defaultEncoding: 'ucs-2', // this encoding will be used when charset is not specified
    encodings: ['latin1'], // add additional encodings
    matcher: 'application/json',
    parser: (payload: string) => JSON.stringify(payload, null, 2),
  }, {
    inflate: true, // allow 'identity', 'inflate', 'gzip' and 'br'
    matcher: 'application/octet-stream',
  }, { // create individual parser configuration
    inflate: 'identity', // allow no compression
    limit: 1000000,
    matcher: ['image/jpeg', 'image/png', 'mpeg/*', (mediaType: MediaType) => mediaType[0] === 'image' && mediaType[1].match(/+xml$/)],
    parser: (payload: Buffer) => 'Creating image...',
  },
];

const app = express();
app.use(bodyParser({defaultLimit: '100kb', inflate: ['identity', 'br']}, parserConfigurations));

app.listen(3000, () => console.log('Server running on port 3000'));

```

### Extending for special requirements
For extending to match configurations of the npm package `body-parser` see the tests in `rawBodyParser.test.ts`, `textBodyParser.test.ts`, `jsonBodyParser.test.ts`
and `urlencodedBodyParser.test.ts`.

```ts
import express from 'express';
import {
  bodyParser,
  BufferEncodings,
  ParserConfigurations
} from 'modular-body';
import base62str from 'base62str';
import LZWDecoder from 'lzw-stream/decoder';
import {Buffer} from 'buffer';

const bufferEncodings = [
  {
    encodings: ['base62', 'base-62'],
    transform: (buffer: Buffer) => base62str.decodeStr(buffer.toString()),
  }
];

const decompressors = {
  'lzw': () => new LZWDecoder,
};

const app = express();

app.use(bodyParser({inflate: true}, undefined, bufferEncodings, decompressors));

app.listen(3000, () => console.log('Server running on port 3000'));
```

### Type `DefaultOptions`

#### Properties
| **Name** | **Type** | **Details** |
|------|------|---------|
| defaultLimit | number &vert; string | The default limit which should be set on the parser configurations, default is 20kb. |
| inflate | true &vert; string &vert; string[] | When true allows all available decompressors, otherwise only specified decompressors. Default is 'identity'. |
| requireContentLength | boolean | Set if the 'Content-Length' header has to be set, default is 'false'. |

### Type `ParserConfiguration<U, V>`

#### Properties
| **Name** | **Type** | **Details** |
|------|------|---------|
| inflate | boolean &vert; string &vert; string[] | Add the allowed extractor(s) as string or array, add all with true, remove/prevent with false from default config, prevent with undefined |
| limit | string &vert; number | Specify the maximum allowed body size as a number in bytes or as a 'byte' string |
| requireContentLength | boolean | Specify if the header 'Content-Length' has to be set on the request |
| parser | ((payload: Buffer &vert; U) => V) &vert; null | A function to parse the payload from the buffer or after encoding |
| matcher | MediaTypeIdentifier &vert; MediaTypeIdentifier[] | The matchers for the allowed mime types as a matching function or mime type where '*' is allowed on either side of the slash to allow all matches. |
| encodings | string &vert; string[] &vert; boolean &vert; null | Allow the specified encoding(s), allow all with true, remove/prevent with false or null from default config, no encoding with undefined |
| defaultEncoding | string | The encoding which should be used when 'charset' is not set on the 'Content-Type' header |
| verify | (req: Request<U, V>, res: Response, buffer: Buffer &vert; U &vert; V, body?: Body<U, V>, encoding: string &vert; false) => void | Function to verify the body, it should throw when verify fails |

For more details please consult the type documentation in the *doc* folder after building with `npm run docs`.

### Type `BufferEncoder<T, U>` = `ChunkedBufferEncoder<T, U>` | `UnchunkedBufferEncoder<U>`;

### Type `ChunkedBufferEncoder<T, U>`

#### Properties
| **Name** | **Type** | **Details** |
|------|------|---------|
| onData | (buffer: Buffer) => T | Transform function for the chunk from the 'onData' event |
| onEnd | () => T | Transform function for the 'onEnd' event |
| reduce | (array: T[]) => U | Reduce function to join the array with the transformed chunks |
| encodings | string[] | Array with charset names for which this encoder should be used |

### Type `UnchunkedBufferEncoder<U>`;

#### Properties
| **Name** | **Type** | **Details** |
|------|------|---------|
| transform | (buffer: Buffer) => U | The transform function to encode the joined buffer. |
| encodings | string[] | Array with charset names for which this encoder should be used |

### Type `Decompressors` = Record<string, () => Transform>;
Keys are the names for the decompressors, values are functions resolving to stream transformers.

### Function `bodyParser<T, U, V>`

#### Parameters
| **Name** | **Type** | **Details** |
|------|------|---------|
| options | DefaultOptions | Default options for the parserConfiguration |
| parserConfigurations<U, V> | ParserConfigurations | An array of objects of type ParserConfiguration and/or DefaultMediaType or a single of these |
| bufferEncodings | BufferEncoder<T, U>[] | An object where we can add/replace buffer encodings |
| decompressors | Decompressors | An object where we can add/replace stream decompressors |

### Method `bodyParser.json`

#### Parameters
| **Name** | **Type** | **Details** |
|------|------|---------|
| options | DefaultOptions | Default options for the parserConfiguration |
| bufferEncodings | BufferEncoder<string, string>[] | An object where we can add/replace buffer encodings |
| decompressors | Decompressors | An object where we can add/replace stream decompressors |

### Method `bodyParser.raw`

#### Parameters
| **Name** | **Type** | **Details** |
|------|------|---------|
| options | DefaultOptions | Default options for the parserConfiguration |
| decompressors | Decompressors | An object where we can add/replace stream decompressors |

### Method `bodyParser.urlencoded`

#### Parameters
| **Name** | **Type** | **Details** |
|------|------|---------|
| options | DefaultOptions | Default options for the parserConfiguration |
| bufferEncodings | BufferEncoder<string, string>[] | An object where we can add/replace buffer encodings |
| decompressors | Decompressors | An object where we can add/replace stream decompressors |

### Method `bodyParser.text`

#### Parameters
| **Name** | **Type** | **Details** |
|------|------|---------|
| options | DefaultOptions | Default options for the parserConfiguration |
| bufferEncodings | BufferEncoder<string, string>[] | An object where we can add/replace buffer encodings |
| decompressors | Decompressors | An object where we can add/replace stream decompressors |
