import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth";

export async function GET() {
  const token = await getSessionToken();
  return NextResponse.json({ token });
}
