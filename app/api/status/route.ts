import { connection } from "next/server";

import { publicStatus, readConfig } from "@/lib/config";
import { rateLimitResponse } from "@/lib/security/http";

export async function GET(request: Request) {
  await connection();
  const limited = rateLimitResponse(request, "status", 120, 10 * 60_000);
  if (limited) return limited;
  return Response.json(publicStatus(readConfig()));
}
