// Replaces pruebas/t84_barra_flyers_favorito.cjs.
import { type Cloud } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const MAIN_TAB: Readonly<Record<number, string>> = {
  2: "Flyer",
  3: "Flyer sin cashback",
  4: "Flyer Sueldo",
  5: "Combustible YPF",
  6: "Súper zona norte",
  7: "Día de la madre",
  8: "Rubros Córdoba",
  10: "Prueba Martín",
  11: "Verano 2027",
  12: "Hot Sale",
};
const RUBROS_TAB: Readonly<Record<number, string>> = {
  13: "Rubros Combustible",
  14: "Rubros Súper",
};
const FIRST_MAIN_OPTION = 2;
const OTHER_THAN_FIXED = 8;
const FAVORITE_OPTION = 5;
const FAVORITE_NAME = "Combustible YPF";
const PHONE = { width: 375, height: 760 };

function addOptions(cloud: Cloud, names: Readonly<Record<number, string>>, tab: string): number[] {
  const added = Object.entries(names).map(([key, name]) => {
    const option = Number(key);
    cloud.addFlyerOption({
      option,
      name,
      tab,
      image: `flyer_t${String(option % 10)}.jpg?v=1`,
      legal: `Legal ${key}`,
    });
    return option;
  });
  return added;
}

function setUpManyFlyers(cloud: Cloud): void {
  cloud.bucketJson["_opciones.json"].opts = [];
  const options = [
    ...addOptions(cloud, MAIN_TAB, "flyer"),
    ...addOptions(cloud, RUBROS_TAB, "rubros"),
  ];
  cloud.bucketJson["_facultades.json"] = {
    roles: {
      asesor: {
        opcion_1: false,
        opcion_9: false,
        promos_buscar: true,
        ...Object.fromEntries(options.map((option) => [`opcion_${String(option)}`, true])),
      },
    },
  };
}

test.describe("the flyer bar with many flyers", () => {
  test(
    "two fixed, a favorite and the rest under Otros",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      setUpManyFlyers(cloud);
      const accountId = cloud.users.asesor?.id ?? "";
      const opened = await openApp({ startOption: FIRST_MAIN_OPTION });
      const app = opened.flyerEditor;
      await app.waitForOthersButton();

      const start = await app.optionBar();
      expect
        .soft(start.tabs, "the first two of the order are fixed")
        .toEqual(["Flyer", "Flyer sin cashback"]);
      expect.soft(start.hasEmptyFavorite, 'no favorite: the dotted "Tu favorito" place').toBe(true);
      expect.soft(start.othersLabel, 'the button says "Otros"').toBe("Otros");
      expect.soft(start.others, '"Otros" keeps the rest').toHaveLength(OTHER_THAN_FIXED);

      // Opening "Otros": the list with its eight, with a search box because there are more than six
      await app.openOtherFlyers();
      const list = await app.otherFlyers();
      expect.soft(list.open, "the list opens").toBe(true);
      expect.soft(list.items, "the list shows the eight").toHaveLength(OTHER_THAN_FIXED);
      expect.soft(list.items[0], "in the order of the bar").toBe("Flyer Sueldo");
      expect.soft(list.hasSearchBox, "more than six: there is a search box").toBe(true);
      expect.soft(list.searchBoxFocused, "ready to type in it").toBe(true);

      await app.searchOtherFlyers("super");
      expect
        .soft((await app.otherFlyers()).items, "the search ignores accents and capitals")
        .toEqual(["Súper zona norte"]);

      // Choosing one from the list: "Otros" takes its name and stays marked
      await opened.page.keyboard.press("Enter");
      await app.waitForOptionSelected(6);
      const chosen = await app.optionBar();
      expect.soft(chosen.othersSelected, "Enter chooses: Otros stays marked").toBe(true);
      expect.soft(chosen.othersLabel, "Otros shows its name").toBe("Súper zona norte");
      expect.soft((await app.otherFlyers()).open, "and the list closes").toBe(false);

      // The star: it stays as favorite, in sight, and is saved in the account
      await app.openOtherFlyers();
      await app.toggleFavorite(FAVORITE_OPTION);
      const starred = await app.optionBar();
      expect.soft(starred.favorite, "the star leaves it third, in sight").toBe(FAVORITE_NAME);
      expect.soft(starred.hasEmptyFavorite, "the dotted place is gone").toBe(false);
      expect.soft(starred.buttons, "four buttons in the bar").toBe(4);
      expect.soft(starred.others, '"Otros" goes down to seven').toHaveLength(OTHER_THAN_FIXED - 1);
      const stillOpen = await app.otherFlyers();
      expect.soft(stillOpen.open, "the list stays open").toBe(true);
      expect.soft(stillOpen.starred, "with its star marked").toEqual([FAVORITE_OPTION]);
      expect
        .soft(cloud.favorites[accountId], "it was saved in the account")
        .toEqual([FAVORITE_OPTION]);

      await opened.page.keyboard.press("Escape");
      expect.soft((await app.otherFlyers()).open, "Escape closes the list").toBe(false);

      await app.chooseFavorite();
      await app.waitForOptionSelected(FAVORITE_OPTION);
      const onFavorite = await app.optionBar();
      expect.soft(onFavorite.favoriteSelected, "touching the favorite chooses it").toBe(true);
      expect.soft(onFavorite.othersLabel, 'and Otros says "Otros" again').toBe("Otros");

      // A draft open over the favorite: its tab can be read
      await app.addDraftTab({ id: "t84b", option: FAVORITE_OPTION, name: "Borrador 1" });
      const draftTab = await app.draftTabLayout("t84b");
      expect.soft(draftTab.width, "the tab of a draft is not squashed").toBeGreaterThanOrEqual(96);
      expect.soft(draftTab.barFits, "and the bar still fits").toBe(true);
      await app.removeDraftTab("t84b");

      await app.openOtherFlyers();
      await opened.page.mouse.click(5, 700);
      expect.soft((await app.otherFlyers()).open, "touching outside closes the list").toBe(false);
      expect.soft(opened.pageErrors(), "no JavaScript errors").toEqual([]);
      await opened.close();

      // Another computer or a reload: the favorite comes back from the account, on a phone
      const phone = await openApp({ startOption: FIRST_MAIN_OPTION, viewport: PHONE, touch: true });
      const phoneBar = phone.flyerEditor;
      await phoneBar.waitForOthersButton();
      const again = await phoneBar.optionBar();
      expect
        .soft(again.favorite, "entering again, the favorite is still there")
        .toBe(FAVORITE_NAME);
      expect.soft(again.fitsItsWidth, "on a phone the bar fits its width").toBe(true);
      expect.soft(again.height, "in a single line").toBeLessThan(60);

      await phoneBar.openOtherFlyers();
      await phoneBar.toggleFavorite(FAVORITE_OPTION);
      expect
        .soft(
          (await phoneBar.optionBar()).hasEmptyFavorite,
          'the star again: back to "Tu favorito"',
        )
        .toBe(true);
      expect.soft(cloud.favorites[accountId], "and it is saved empty").toEqual([]);

      // A favorite that is no longer enabled does not count; four flyers or fewer stay in sight
      expect
        .soft(
          await phoneBar.barSplit([99], [2, 3, 4, 5, 6]),
          "a favorite not enabled takes no place",
        )
        .toEqual({ favorite: null, others: 3 });
      expect
        .soft(await phoneBar.barSplit([99], [2, 3, 4, 5]), "four or fewer: the bar stays as always")
        .toBeNull();

      // Separate tabs: the list of Flyer has none of Rubros, and each tab has its own favorite
      const favorites = await phoneBar.favoritesAfterStarring([FAVORITE_OPTION], 13);
      expect
        .soft(await phoneBar.optionsOfTab("flyer"), "the flyers of Rubros are not in the Flyer tab")
        .not.toContain(13);
      expect.soft(await phoneBar.optionsOfTab("rubros"), "Rubros has its own").toEqual([13, 14]);
      const { others } = await phoneBar.optionBar();
      expect.soft(others, "they are not under Otros in Flyer").not.toContain(13);
      expect.soft(others, "neither of them").not.toContain(14);
      expect
        .soft(favorites, "starring one of Rubros does not take away the one of Flyer")
        .toEqual([FAVORITE_OPTION, 13]);
      expect.soft(phone.pageErrors(), "no JavaScript errors on the phone").toEqual([]);
    },
  );

  test(
    "a favorite that is no longer enabled takes no place, and another one can be chosen",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      setUpManyFlyers(cloud);
      cloud.favorites[cloud.users.asesor?.id ?? ""] = [FAVORITE_OPTION];
      cloud.setPermissions("asesor", { [`opcion_${String(FAVORITE_OPTION)}`]: false });
      const { flyerEditor: app } = await openApp({ startOption: FIRST_MAIN_OPTION });
      await app.waitForOthersButton();

      const bar = await app.optionBar();
      expect.soft(bar.favorite, "it does not count").toBeNull();
      expect.soft(bar.hasEmptyFavorite, "and the dotted place is there").toBe(true);
      expect.soft(bar.others, "it is not under Otros either").not.toContain(FAVORITE_OPTION);
    },
  );

  test(
    "if the account does not take the star, the favorite goes back and it says so",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      setUpManyFlyers(cloud);
      const opened = await openApp({
        startOption: FIRST_MAIN_OPTION,
        beforeNavigation: async (page) => {
          await page.route("**/rest/v1/profiles*", (route) =>
            route.request().method() === "PATCH"
              ? route.fulfill({ status: 500, json: { message: "No" } })
              : route.fallback(),
          );
        },
      });
      const app = opened.flyerEditor;
      await app.waitForOthersButton();
      await app.openOtherFlyers();

      await app.toggleFavorite(FAVORITE_OPTION);

      await expect.poll(() => app.latestNotice()).toMatch(/No se pudo guardar tu favorito/);
      expect.soft((await app.optionBar()).favorite, "it goes back").toBeNull();
    },
  );
});

test.describe("the flyer bar in the hands of an administrator", () => {
  test(
    "four presses rename a flyer, and holding and dragging it changes the order, for everybody",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.bucketJson["_opciones.json"].opts = [
        { n: 1, nombre: "Uno", solapa: "flyer", orden: 0 },
        {
          n: 3,
          nombre: "Dos",
          solapa: "flyer",
          orden: 1,
          rubro: "combustible",
          reemplaza: 4,
        },
        { n: 4, nombre: "Tres", solapa: "flyer", orden: 2, sinCB: 1 },
        { n: 8, nombre: "De Rubros", solapa: "rubros", orden: 3 },
      ];
      cloud.bucketJson["_active.json"] = cloud.bucketJson["_active9.json"];
      for (const option of [3, 4, 8]) {
        cloud.bucketJson[`_active${String(option)}.json`] = cloud.bucketJson["_active9.json"];
        cloud.bucketJson[`_legal${String(option)}.json`] = { text: "Legal" };
      }
      const { flyerEditor: app } = await openApp({ user: "admin", startOption: 1 });
      expect.soft(await app.flyerTabNames()).toEqual(["Uno", "Dos", "Tres"]);

      await app.renameFlyerTab(3, "Dos nuevo");
      await expect
        .poll(() => app.flyerTabNames(), "the new name")
        .toEqual(["Uno", "Dos nuevo", "Tres"]);
      await expect.poll(() => app.latestNotice()).toBe("Opción renombrada: Dos nuevo");
      const names = () =>
        cloud.bucketJson["_opciones.json"].opts.map(({ nombre }: { nombre: string }) => nombre);
      expect.soft(names(), "it is saved for everybody").toContain("Dos nuevo");
      // As in the current app, and it is an error: saving from the bar loses these three of all.
      const links = () =>
        cloud.bucketJson["_opciones.json"].opts.map(
          ({ rubro, reemplaza, sinCB }: Record<string, unknown>) => [rubro, reemplaza, sinCB],
        );
      expect.soft(links()).toEqual(Array.from({ length: 4 }, () => ["", 0, undefined]));

      await app.dragFlyerTab(1, 4);
      await expect
        .poll(() => app.flyerTabNames(), "the new order")
        .toEqual(["Dos nuevo", "Tres", "Uno"]);
      await expect.poll(() => app.latestNotice()).toBe("Orden de las opciones guardado");
      expect
        .soft(names(), "the flyers of the other tabs stay where they were")
        .toEqual(["Dos nuevo", "Tres", "Uno", "De Rubros"]);
    },
  );

  test(
    "whoever is not an administrator cannot rename or move them",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      cloud.bucketJson["_opciones.json"].opts = [
        { n: 2, nombre: "Uno", solapa: "flyer", orden: 0 },
        { n: 3, nombre: "Dos", solapa: "flyer", orden: 1 },
      ];
      cloud.setPermissions("asesor", { opcion_2: true, opcion_3: true });
      for (const option of [2, 3]) {
        cloud.bucketJson[`_active${String(option)}.json`] = cloud.bucketJson["_active9.json"];
        cloud.bucketJson[`_legal${String(option)}.json`] = { text: "Legal" };
      }
      const { flyerEditor: app } = await openApp({ startOption: 2 });

      await app.dragFlyerTab(2, 3);

      expect.soft(await app.flyerTabNames(), "nothing moved").toEqual(["Uno", "Dos"]);
      expect.soft(cloud.lastJsonUpload, "and nothing was saved").toBeNull();
    },
  );
});
