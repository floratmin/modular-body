/**
 * @typedef MediaTypeType
 * Tuple of splitted media type.
 */
export type MediaType = [string, string];

/**
 * @typedef MediaTypeTemplate
 * Tuple of splitted media type templates. Null value has the meaning of '*'
 */
export type MediaTypeTemplate = [string | null, string | null];

/**
 * @typedef MediaTypeFunction
 * @param mediaType The media type to be evaluated
 * @returns True if media type matches, false otherwise
 */
export type MediaTypeFunction = (mediaType: MediaType) => boolean;

/**
 * @typedef MediaTypeIdentifier
 * String defining a media type template or a media type function
 */
export type MediaTypeIdentifier = string | MediaTypeFunction;

/**
 * @typedef MediaTypeMatchers
 * Array of parsed media type identifiers after splitting or media type functions
 */
export type MediaTypeMatchers = (MediaTypeTemplate | MediaTypeFunction)[];

/**
 * Function to convert MediaTypeIdentifiers to an array of MediaTypeMatchers
 * @param mediaTypeIdentifier A MediaTypeIdentifier or an array of these.
 */
export function getMediaTypeMatchers(mediaTypeIdentifier: MediaTypeIdentifier | MediaTypeIdentifier[]): MediaTypeMatchers {
  const mediaTypeIdentifiers = Array.isArray(mediaTypeIdentifier) ? mediaTypeIdentifier : [mediaTypeIdentifier];
  return mediaTypeIdentifiers
    .map((identifier) => typeof identifier === 'string' ? getMediaTypeIdentifier(identifier) : identifier);
}

/**
 * Function to create the MediaTypeMatcher from a string
 * @param mediaTypeIdentifier
 */
function getMediaTypeIdentifier(mediaTypeIdentifier: string) {
  const mediaTypeMatcher = <MediaTypeTemplate>mediaTypeIdentifier.split('/').map((part) => part === '*' ? null : part);
  if (mediaTypeMatcher.length !== 2) {
    throw new Error(`Media type identifier '${mediaTypeIdentifier}' is invalid.`);
  }
  return mediaTypeMatcher;
}

/**
 * Function to determine if a MediaType matches a MediaTypeTemplate
 * @param mediaTypeTemplate The MediaTypeTemplate which should be matched
 * @param mediaType The MediaType to match the MediaTypeTemplate
 */
export function matchType(mediaTypeTemplate: MediaTypeTemplate, mediaType: MediaType) {
  return (!mediaTypeTemplate[0] || mediaTypeTemplate[0] === mediaType[0]) && (!mediaTypeTemplate[1] || mediaTypeTemplate[1] === mediaType[1]);
}

/**
 * Function to determine if a MediaType is matched by any of the MediaTypeTemplates or MediaTypeFunctions defined in the MediaTypeMatchers array.
 * @param mediaTypeMatchers Matchers to match the mediaType to
 * @param mediaType The mediaType to be matched
 */
export function matchAnyType(mediaTypeMatchers: MediaTypeMatchers, mediaType: MediaType) {
  return mediaTypeMatchers.some((mediaTypeMatcher) => Array.isArray(mediaTypeMatcher)
    ? matchType(mediaTypeMatcher, mediaType)
    : mediaTypeMatcher(mediaType)
  );
}
