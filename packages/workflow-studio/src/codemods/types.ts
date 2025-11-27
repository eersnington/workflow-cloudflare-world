export type CodemodTransform = (
  source: string,
  filePath: string
) => string | null | Promise<string | null>;

export type CodemodDefinition = {
  globs: string[];
  transform: CodemodTransform;
};
