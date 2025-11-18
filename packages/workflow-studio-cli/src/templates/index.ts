import { nextTemplates } from './next.js';
import { svelteTemplates } from './svelte.js';

export type { TemplateContext } from './types.js';
export type { TemplateDefinition, TemplateExample } from './types.js';

export const templates = {
  nextjs: nextTemplates,
  sveltekit: svelteTemplates,
} as const;

export type TemplateName = keyof typeof templates;
