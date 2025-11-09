# Import Resolution Follow-Ups

## Bundling Project-Local Helpers by Default
- **Problem**: Workflow DevKit still externalizes every import unless it is a discovered workflow entry. Helpers that live outside `workflows/` only run if the runtime can execute their raw `.ts` files.
- **Proposal**: Flip the default to match Next.js — bundle anything that resolves outside `node_modules`, and let integrations provide an `externalPackages` list for platform-specific or heavy dependencies.
- **Open Questions**:
  - How do we guard against accidentally bundling massive SDKs (Prisma, sharp, etc.) without a per-framework opt-out?
  - Should we ship a default blocklist similar to Next.js's `serverExternalPackages` to cover the usual suspects?

## `serverExternalPackages`-Style Escape Hatch
- **Problem**: Frameworks need a supported way to keep select dependencies external even if we start bundling project-local helpers by default.
- **Proposal**: Add a `workflow.externalPackages` (name TBD) config that mirrors Next.js' [`serverExternalPackages`](https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages). Each integration can populate it with known-problematic packages, and users can append their own.
- **Questions for maintainers**:
  - Should this live at the framework integration level (e.g., Nuxt/Nitro module options) or inside `workflow.config` so it is shared across integrations?
  - Do we also want a `workflow.externalPatterns` escape hatch for wildcard matching (e.g., `@aws-sdk/*`)?
