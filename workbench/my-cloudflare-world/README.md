# my-cloudflare-world

This project contains a standalone Cloudflare Workflow Runtime, scaffolded by the `workflow-cloudflare-world` CLI.

## 🚀 Deployment

1.  **Install Dependencies**
    ```bash
    pnpm install
    ```

2.  **Create Cloudflare Resources**
    Follow the prompts from the CLI wizard. You will need to create the D1 database and other resources for the first time.

    ```bash
    # Example:
    wrangler d1 create <your-db-name>
    ```

3.  **Apply Database Migrations**
    ```bash
    wrangler d1 migrations apply <your-db-name>
    ```

4.  **Deploy**
    ```bash
    wrangler deploy
    ```

Once deployed, this service will listen for jobs on its configured Cloudflare Queues. Your separate application workers can connect to this runtime using the service binding you configured.