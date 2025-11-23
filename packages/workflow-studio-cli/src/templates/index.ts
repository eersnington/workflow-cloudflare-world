import { honoTemplates } from './hono.js';
import { nitroTemplates } from './nitro.js';
import { nextTemplates } from './next.js';
import { svelteTemplates } from './svelte.js';

export type { TemplateContext } from './types.js';
export type { TemplateDefinition, TemplateExample } from './types.js';

export const templates = {
  hono: honoTemplates,
  nitro: nitroTemplates,
  nextjs: nextTemplates,
  sveltekit: svelteTemplates,
} as const;

export type TemplateName = keyof typeof templates;
