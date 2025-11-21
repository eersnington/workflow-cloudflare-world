# @workbench/fastify-vite

This project serves as a functional example demonstrating the integration of Workflow DevKit with Fastify and Vite.

## How it works

-   **Vite Configuration:** `vite.config.js` utilizes `@workflow/fastify` to enable workflow transformations and generate runtime bundles for the Workflow DevKit.
    ```javascript
    // vite.config.js
    import workflowPlugin from '@workflow/fastify';
    // ...
    plugins: [
      workflowPlugin(),
      // ...
    ],
    ```

-   **Fastify Server:** `src/server.ts` sets up a Fastify server that registers the `@workflow/fastify/server` plugin, which automatically exposes the necessary Workflow DevKit HTTP endpoints.
    ```typescript
    // src/server.ts
    import workflowFastify from '@workflow/fastify/server';
    // ...
    await server.register(workflowFastify);
    ```
