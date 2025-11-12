// import { start } from "workflow/api";
// import { calc } from "../../../../workflows/example";
// import { json, type RequestHandler } from "@sveltejs/kit";

// export const POST: RequestHandler = async ({
//   request,
// }: {
//   request: Request;
// }) => {
//   const { num } = await request.json();

//   const numberTyped = Number(num);

//   if (Number.isNaN(numberTyped)) {
//     return json({ error: "Invalid number" }, { status: 400 });
//   }

//   // Executes asynchronously and doesn't block your app
//   await start(calc, [numberTyped]);

//   return json({ message: "User signup workflow started" });
// };
