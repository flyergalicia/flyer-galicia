// Replaces pruebas/t48_admin_uso.cjs.
import { expect, test } from "../../support/test.ts";

const DAY_MS = 86_400_000;
const HUNTER_ID = "00000000-0000-4000-8000-0000000000b0";
const PHONE = { width: 390, height: 844 };

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function flyerType(option: number): string {
  return JSON.stringify({ opcion: option });
}

test(
  "Uso counts flyers by flyer, by profile and by period",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const advisorId = cloud.users.asesor?.id;
    cloud.profiles = [
      {
        id: advisorId,
        full_name: "Asesor Prueba",
        email_asesor: "asesor.prueba@bancogalicia.com.ar",
        role: "asesor",
      },
      {
        id: HUNTER_ID,
        full_name: "Hunter Prueba",
        email_asesor: "hunter.prueba@bancogalicia.com.ar",
        role: "hunter",
      },
      {
        id: cloud.users.admin?.id,
        full_name: "Admin Prueba",
        email_asesor: "admin.prueba@bancogalicia.com.ar",
        role: "admin",
      },
    ];
    cloud.flyerLogs = [
      {
        user_id: advisorId,
        is_bulk: false,
        bulk_count: 0,
        flyer_type: flyerType(9),
        created_at: daysAgo(2),
      },
      {
        user_id: advisorId,
        is_bulk: false,
        bulk_count: 0,
        flyer_type: flyerType(9),
        created_at: daysAgo(3),
      },
      {
        user_id: advisorId,
        is_bulk: true,
        bulk_count: 10,
        flyer_type: flyerType(9),
        created_at: daysAgo(10),
      },
      {
        user_id: HUNTER_ID,
        is_bulk: false,
        bulk_count: 0,
        flyer_type: flyerType(1),
        created_at: daysAgo(4),
      },
      // Outside the 30 days the board starts with.
      {
        user_id: HUNTER_ID,
        is_bulk: false,
        bulk_count: 0,
        flyer_type: flyerType(9),
        created_at: daysAgo(60),
      },
    ];

    const app = await openApp({ user: "admin" });
    await app.admin.openPanel();
    await app.admin.openUsage();

    const board = await app.admin.usageBoard();
    expect.soft(board.totals[0], "30 days: 13 flyers (2 + 10 of a batch + 1)").toBe("13");
    expect.soft(board.totals[1], "30 days: from 2 users").toBe("2");

    const section = (title: string) =>
      board.sections.find((candidate) => candidate.title === title);
    expect
      .soft(section("Por flyer")?.rows[0], "by flyer: Combustible 12")
      .toEqual({ label: "Combustible", count: "12" });
    expect.soft(section("Por perfil")?.rows, "by profile: Asesor 12, Hunter 1").toEqual([
      { label: "Asesor", count: "12" },
      { label: "Hunter", count: "1" },
    ]);

    await app.admin.selectUsagePeriod(90);
    expect
      .soft((await app.admin.usageBoard()).totals[0], "90 days: adds the one from 60 days ago")
      .toBe("14");

    await app.page.setViewportSize(PHONE);
    expect
      .soft(await app.admin.usageOverflowsSideways(), "no sideways scroll on a phone")
      .toBe(false);
  },
);
