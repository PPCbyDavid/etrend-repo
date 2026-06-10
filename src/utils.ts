/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ingredient, RecipeSummary, RecipeIngredient, UserSettings, RecipeDetails } from './types';

export function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = '';

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentVal.trim());
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
         lines.push(row);
      }
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    if (row.some(cell => cell !== '')) {
      lines.push(row);
    }
  }
  return lines;
}

export function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  // Handle Hungarian formatting e.g. "1,5" -> 1.5, or removal of characters
  const sanitized = val.replace(',', '.').replace(/[^0-9.]/g, '');
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
}

export function parseIngredientsSheet(csvText: string): Ingredient[] {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  // Skip header
  const ingredients: Ingredient[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Check if ID starts with ING
    if (!row[0] || !row[0].startsWith('ING')) continue;

    ingredients.push({
      id: row[0],
      name: row[1] || '',
      kcalPer100g: parseNumber(row[2]),
      proteinPer100g: parseNumber(row[3]),
      carbPer100g: parseNumber(row[4]),
      fatPer100g: parseNumber(row[5]),
      packaging: row[6] || '',
      packagingGram: row[7] ? parseNumber(row[7]) : null,
      store: row[8] || 'Bármely',
      source: row[9] || ''
    });
  }
  return ingredients;
}

export function parseSettingsSheet(csvText: string): Record<string, UserSettings> {
  const rows = parseCSV(csvText);
  const settings: Record<string, UserSettings> = {};
  if (rows.length < 2) return settings;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const user = row[0];
    if (!user) continue;

    settings[user] = {
      user: user,
      targetKcal: parseNumber(row[1]) || 2000,
      minProtein: parseNumber(row[2]) || 130,
      maxProtein: parseNumber(row[3]) || 180,
      note: row[4] || ''
    };
  }
  return settings;
}

export function parseRecipeSummaries(csvText: string): RecipeSummary[] {
  const rows = parseCSV(csvText);
  const recipes: RecipeSummary[] = [];
  if (rows.length < 2) return [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    // Must be a valid recipe ID like R1, PW1, E1, S1, V1
    if (!id || (!id.startsWith('R') && !id.startsWith('PW') && !id.startsWith('E') && !id.startsWith('S') && !id.startsWith('V'))) continue;

    recipes.push({
      id: id,
      name: row[1] || '',
      mealType: (row[2] || 'Ebéd') as any,
      tags: row[3] ? row[3].split(';').map(t => t.trim()).filter(Boolean) : [],
      kcal: Math.round(parseNumber(row[4])),
      protein: Math.round(parseNumber(row[5])),
      carb: Math.round(parseNumber(row[6])),
      fat: Math.round(parseNumber(row[7]))
    });
  }
  return recipes;
}

export function parseRecipeDetails(csvText: string): RecipeDetails[] {
  const rows = parseCSV(csvText);
  const details: RecipeDetails[] = [];
  if (rows.length < 2) return [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const recipeId = row[0];
    if (!recipeId) continue;

    details.push({
      recipeId: recipeId,
      steps: row[4] || '',
      portions: Math.max(1, parseNumber(row[2]) || 1),
      prepTime: row[3] || '',
      videoLink: row[5] || '',
      note: row[6] || ''
    });
  }
  return details;
}
export function parseRecipeIngredients(csvText: string): RecipeIngredient[] {
  const rows = parseCSV(csvText);
  const recipeIngredients: RecipeIngredient[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const recipeId = row[0];
    if (!recipeId) continue;
    // Format: Recept ID | Recept neve | Étkezéstípus | Címkék | Alapanyag ID | Alapanyag (info) | Mennyiség (g)
    const ingredientId = row[4];
    if (!ingredientId || !ingredientId.startsWith('ING')) continue;

    recipeIngredients.push({
      recipeId: recipeId,
      recipeName: row[1] || '',
      mealType: (row[2] || 'Ebéd') as any,
      tags: row[3] ? row[3].split(';').map(t => t.trim()).filter(Boolean) : [],
      ingredientId: ingredientId,
      amountGram: parseNumber(row[6])
    });
  }
  return recipeIngredients;
}
