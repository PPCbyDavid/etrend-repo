/**
 * Heti Étrend-tervező — Google Sheet write gateway (Apps Script Web App).
 *
 * Appends new ingredients / recipes coming from the app into the bound Sheet.
 * The app (server.ts) POSTs JSON here; reads still happen via the public gviz CSV.
 *
 * SETUP
 * 1. Open the Google Sheet → Extensions → Apps Script.
 * 2. Paste this file's content into Code.gs (replace everything).
 * 3. Change SECRET below to a long random string and save.
 * 4. Deploy → New deployment → type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Copy the deployment URL (ends with /exec).
 * 5. In the Vercel dashboard → Project → Settings → Environment Variables, add:
 *      APPS_SCRIPT_URL    = <the /exec URL>
 *      APPS_SCRIPT_SECRET = <the same SECRET string>
 *    Then redeploy the Vercel project.
 *
 * Column order matches the live sheet tabs (verified):
 *   Alapanyagok:      ID, Név, kcal, Fehérje, Szénhidrát, Zsír, Kiszerelés, Kiszerelés(g), Bolt, Forrás
 *   Recept összesítő: Recept ID, Név, Étkezéstípus, Címkék, kcal, Fehérje, Szénhidrát, Zsír
 *   Receptek:         Recept ID, Név, Étkezéstípus, Címkék, Alapanyag ID, Alapanyag (info), Mennyiség (g)
 */

var SECRET = 'CHANGE_ME_to_a_long_random_string';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) {
      return json({ error: 'Unauthorized' });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'addIngredient') {
      var i = body.ingredient || {};
      ss.getSheetByName('Alapanyagok').appendRow([
        i.id, i.name,
        i.kcalPer100g, i.proteinPer100g, i.carbPer100g, i.fatPer100g,
        i.packaging || '',
        (i.packagingGram === null || i.packagingGram === undefined) ? '' : i.packagingGram,
        i.store || 'Bármely',
        i.source || 'App'
      ]);
      return json({ success: true });
    }

    if (body.action === 'addRecipe') {
      var r = body.recipe || {};
      var tags = Array.isArray(r.tags) ? r.tags.join('; ') : (r.tags || '');

      ss.getSheetByName('Recept összesítő').appendRow([
        r.id, r.name, r.mealType, tags, r.kcal, r.protein, r.carb, r.fat
      ]);

      var ings = body.ingredients || [];
      if (ings.length) {
        var sheet = ss.getSheetByName('Receptek');
        for (var k = 0; k < ings.length; k++) {
          var ri = ings[k];
          sheet.appendRow([
            r.id, r.name, r.mealType, tags, ri.id, ri.name || '', ri.amountGram
          ]);
        }
      }
      return json({ success: true });
    }

    return json({ error: 'Unknown action: ' + body.action });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
