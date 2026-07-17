import { NextResponse } from "next/server";
import { fetchSheetsData } from "@/lib/server-sheets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await fetchSheetsData(searchParams.get("gid") || undefined);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить данные Google Sheets" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
