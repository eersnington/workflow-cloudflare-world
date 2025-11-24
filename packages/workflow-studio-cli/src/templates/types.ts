import type { CodemodId } from '../codemods/index.js';

export type TemplateContext = {
  projectName: string;
};

export type TemplateFileFactory = Record<
  string,
  (ctx: TemplateContext) => string
>;

export type TemplateExample = {
  label: string;
  description: string;
  files?: TemplateFileFactory;
  placeholders?: TemplateFileFactory;
  codemods?: CodemodId[];
};

export type TemplateDefinition = {
  label: string;
  handlebars?: string;
  examples: Record<string, TemplateExample>;
};
