import { onRequest as handleInfo } from "./info.js";

export async function onRequest(context) {
  return handleInfo(context);
}
