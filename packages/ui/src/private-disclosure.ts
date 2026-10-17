export type SessionBoundRead = (
  path: string,
  signal?: AbortSignal,
) => Promise<{
  data: unknown;
  isCurrent: () => boolean;
}>;
export type PrivateDisclosure<T> = Readonly<{ value: T; isCurrent: () => boolean }>;

/** Keep the initiating session check with the validated review or disclosure. */
export async function preparePrivateDisclosure<T>(
  read: SessionBoundRead,
  path: string,
  validate: (raw: unknown) => T,
): Promise<PrivateDisclosure<T>> {
  const response = await read(path);
  if (!response.isCurrent()) throw Error('The session changed before private review.');
  const value = validate(response.data);
  return Object.freeze({ value, isCurrent: response.isCurrent });
}

/** Check again at the synchronous review, file or print boundary, without another await. */
export function disclosePrivate<T, R>(
  disclosure: PrivateDisclosure<T>,
  disclose: (value: T) => R,
): R {
  if (!disclosure.isCurrent()) throw Error('The session changed before private disclosure.');
  return disclose(disclosure.value);
}
