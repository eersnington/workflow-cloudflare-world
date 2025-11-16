// biome-ignore-all lint: generated file
/* eslint-disable */
import { workflowEntrypoint } from 'workflow/runtime';

const workflowCode = `var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// workflows/example.js
var example_exports = {};
__export(example_exports, {
  handleGreeting: () => handleGreeting
});
async function handleGreeting(name) {
  return \`Hello \${name}\`;
}
__name(handleGreeting, "handleGreeting");
handleGreeting.workflowId = "workflow//workflows/example.js//handleGreeting";

// virtual-entry.js
globalThis.__private_workflows = /* @__PURE__ */ new Map();
Object.values(example_exports).map((item) => item?.workflowId && globalThis.__private_workflows.set(item.workflowId, item));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsid29ya2Zsb3dzL2V4YW1wbGUuanMiLCAidmlydHVhbC1lbnRyeS5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqX19pbnRlcm5hbF93b3JrZmxvd3N7XCJ3b3JrZmxvd3NcIjp7XCJ3b3JrZmxvd3MvZXhhbXBsZS5qc1wiOntcImhhbmRsZUdyZWV0aW5nXCI6e1wid29ya2Zsb3dJZFwiOlwid29ya2Zsb3cvL3dvcmtmbG93cy9leGFtcGxlLmpzLy9oYW5kbGVHcmVldGluZ1wifX19fSovO1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUdyZWV0aW5nKG5hbWUpIHtcbiAgICByZXR1cm4gYEhlbGxvICR7bmFtZX1gO1xufVxuaGFuZGxlR3JlZXRpbmcud29ya2Zsb3dJZCA9IFwid29ya2Zsb3cvL3dvcmtmbG93cy9leGFtcGxlLmpzLy9oYW5kbGVHcmVldGluZ1wiO1xuIiwgImdsb2JhbFRoaXMuX19wcml2YXRlX3dvcmtmbG93cyA9IG5ldyBNYXAoKTtcbmltcG9ydCAqIGFzIHdvcmtmbG93RmlsZTAgZnJvbSAnLi93b3JrZmxvd3MvZXhhbXBsZS5qcyc7XG4gICAgICAgICAgICBPYmplY3QudmFsdWVzKHdvcmtmbG93RmlsZTApLm1hcChpdGVtID0+IGl0ZW0/LndvcmtmbG93SWQgJiYgZ2xvYmFsVGhpcy5fX3ByaXZhdGVfd29ya2Zsb3dzLnNldChpdGVtLndvcmtmbG93SWQsIGl0ZW0pKSJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDQSxlQUFzQixlQUFlLE1BQU07QUFDdkMsU0FBTyxTQUFTLElBQUk7QUFDeEI7QUFGc0I7QUFHdEIsZUFBZSxhQUFhOzs7QUNKNUIsV0FBVyxzQkFBc0Isb0JBQUksSUFBSTtBQUU3QixPQUFPLE9BQU8sZUFBYSxFQUFFLElBQUksVUFBUSxNQUFNLGNBQWMsV0FBVyxvQkFBb0IsSUFBSSxLQUFLLFlBQVksSUFBSSxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
`;

export const POST = workflowEntrypoint(workflowCode);