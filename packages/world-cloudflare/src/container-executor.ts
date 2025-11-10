/**
 * Entry point for the WorkflowExecutorContainer
 * This runs inside the container environment
 */

import { WorkflowExecutorContainer } from './container.js';

// Export the container class for the Durable Object system
export { WorkflowExecutorContainer };

// Container-specific initialization if needed
console.log('Workflow Executor Container initialized');
