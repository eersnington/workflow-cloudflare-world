import { honoTemplates } from './hono.js';
import { nitroTemplates } from './nitro.js';
import { nextTemplates } from './next.js';
import { expressTemplates } from './express.js';
import { nuxtTemplates } from './nuxt.js';
import { viteTemplates } from './vite.js';
import { svelteTemplates } from './svelte.js';

export type { TemplateContext } from './types.js';
export type { TemplateDefinition, TemplateExample } from './types.js';

export const templates = {
  express: expressTemplates,
  hono: honoTemplates,
  nitro: nitroTemplates,
  nextjs: nextTemplates,
  nuxt: nuxtTemplates,
  sveltekit: svelteTemplates,
  vite: viteTemplates,
} as const;

export type TemplateName = keyof typeof templates;
