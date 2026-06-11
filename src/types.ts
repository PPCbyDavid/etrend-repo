/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Ingredient {
  id: string;
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbPer100g: number;
  fatPer100g: number;
  packaging: string;
  packagingGram: number | null;
  store: string;
  source: string;
}

export type MealType = 'Reggeli' | 'Pre-workout' | 'Ebéd' | 'Snack' | 'Vacsora';

export interface RecipeSummary {
  id: string;
  name: string;
  mealType: MealType;
  tags: string[];
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  // Optional portion multiplier (e.g. 0.75 = three-quarter serving). Absent or 1
  // means a full serving. Used by the household generator to scale a shared meal
  // for each person so their calorie/protein targets are met. The kcal/protein/
  // carb/fat above are already the scaled values; `portion` lets the shopping
  // list scale ingredient grams accordingly.
  portion?: number;
}

export interface RecipeIngredient {
  recipeId: string;
  recipeName: string;
  mealType: MealType;
  tags: string[];
  ingredientId: string;
  amountGram: number;
}

export interface UserSettings {
  user: string;
  targetKcal: number;
  minProtein: number;
  maxProtein: number;
  note: string;
}

export interface MealPlanDay {
  dayName: string; // e.g. "Hétfő", "Kedd", ...
  meals: Record<MealType, RecipeSummary | null>;
}

export interface WeeklyPlan {
  user: string; // "David" or "Dorina"
  days: MealPlanDay[];
}

export interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  requiredAmountGram: number;
  packaging: string;
  packagingGram: number | null;
  store: string;
  unitsToBuy: number; // calculated rounded up units
  purchased: boolean;
}

export interface RecipeDetails {
  recipeId: string;
  steps: string;
  portions: number;
  prepTime: string;
  videoLink: string;
  note: string;
}

export interface AppState {
  ingredients: Ingredient[];
  recipes: RecipeSummary[];
  recipeIngredients: RecipeIngredient[];
  settings: Record<string, UserSettings>;
  currentPlans: Record<string, WeeklyPlan>; // plans for Users (David, Dorina)
  costSpent: number; // accumulated AI generator cost tracking
}
