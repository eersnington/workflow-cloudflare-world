import { defineNitroConfig } from 'nitro/config';

export default defineNitroConfig({
  compatibilityDate: '2024-09-19',
  srcDir: 'server',
  imports: false,
  modules: ['workflow/nitro'],
});
