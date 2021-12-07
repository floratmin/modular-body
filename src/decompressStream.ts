import zlib from 'zlib';
import {PatchedParser} from './bufferEncoding.js';
import {Transform} from 'stream';

export type Decompressors = Record<string, () => Transform>;
/**
 * Matches the contentEncoding with the allowed decompressors.
 * @param contentEncoding The contentEncoding of the request
 * @param inflate The setting in the parser
 * @param globalDecompressorNames All available decompressors if inflate is set to true
 * @returns boolean contentEncoding is allowed when true
 */
export function matchContentEncoding(contentEncoding: string, inflate: true | string[], globalDecompressorNames: string[]) {
  if (contentEncoding === 'identity') return true;
  const decompressors = inflate === true ? globalDecompressorNames : inflate;
  return decompressors.includes(contentEncoding);
}

/**
 * Deletes all keys in obj which are not in the array neededKeys
 * This function has side effects.
 * @param obj
 * @param neededKeys
 */
export function deleteMissingKeys(obj: Record<string, unknown> | undefined, neededKeys: string[]): void {
  if (obj) {
    Object.keys(obj).forEach((key) => {
      if (!neededKeys.includes(key)) {
        delete obj[key];
      }
    });
  }
}

/**
 * Checks if all decompressors in the parse configurations are available. Returns the node native decompressors and the supplied decompressors
 * @param parsers - The patched parser configuration
 * @param decompressors - Additional decompressors
 */
export function getAvailableDecompressors<U, V>(parsers: PatchedParser<U, V>[], decompressors?: Record<string, () => Transform>) {
  const standardDecompressors = {
    deflate: zlib.createInflate,
    gzip: zlib.createGunzip,
    br: zlib.createBrotliDecompress,
  };
  const allowsAllDecompressors = Object.values(parsers).some(({inflate}) => inflate === true);
  const suppliedDecompressorNames = [...new Set(
    (<string []>Object.values(parsers)
      .flatMap(({inflate}) => <string[]>(Array.isArray(inflate) ? inflate : []))))];
  if (!allowsAllDecompressors) {
    deleteMissingKeys(standardDecompressors, suppliedDecompressorNames);
    deleteMissingKeys(decompressors, suppliedDecompressorNames);
  }
  const availableDecompressors = <Record<string, () => Transform>><unknown>{...standardDecompressors, ...decompressors};
  const availableDecompressorNames = [
    ...(allowsAllDecompressors || suppliedDecompressorNames.includes('identity') ? ['identity'] : []),
    ...Object.keys(availableDecompressors),
  ];
  const notAvailableDecompressors = suppliedDecompressorNames
    .filter((suppliedDecompressorName) => !availableDecompressorNames.includes(suppliedDecompressorName)).join(', ');
  if (notAvailableDecompressors !== '') {
    throw new Error(`The following decompressors in the parse configuration are not supplied: ${notAvailableDecompressors}`);
  }
  return {availableDecompressors, availableDecompressorNames};
}
