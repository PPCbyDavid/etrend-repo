/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RecipeSummary, RecipeIngredient, Ingredient, UserSettings, WeeklyPlan, MealPlanDay, MealType } from './types';
import fs from 'fs';
import path from 'path';

// Cost tracker helper.
// On Vercel the working directory is read-only, so writes must go to /tmp
// (which is ephemeral and cleared on cold start).
const isVercel = !!process.env.VERCEL;
const COST_FILE = isVercel
  ? path.join('/tmp', 'cost_tracker.json')
  : path.join(process.cwd(), 'cost_tracker.json');

export function getAccumulatedCost(): number {
  try {
    if (fs.existsSync(COST_FILE)) {
      const data = JSON.parse(fs.readFileSync(COST_FILE, 'utf-8'));
      return data.cost || 0;
    }
  } catch (e) {
    console.error('Error reading cost file:', e);
  }
  return 0;
}

export function addCost(amount: number): number {
  try {
    const current = getAccumulatedCost();
    const updated = current + amount;
    fs.writeFileSync(COST_FILE, JSON.stringify({ cost: updated }), 'utf-8');
    return updated;
  } catch (e) {
    console.error('Error writing cost file:', e);
  }
  return getAccumulatedCost();
}

/**
 * Solve weekly plan programmatically adhering to hard rules and soft targets.
 */
export function solveWeeklyPlan(
  recipes: RecipeSummary[],
  recipeIngredients: RecipeIngredient[],
  ingredients: Ingredient[],
  settings: UserSettings,
  user: string
): { plan: WeeklyPlan; warning?: string } {
  const daysOfWeek = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

  // Categorize recipes by meal type
  const recipesMap: Record<MealType, RecipeSummary[]> = {
    'Reggeli': recipes.filter(r => r.mealType === 'Reggeli'),
    'Pre-workout': recipes.filter(r => r.mealType === 'Pre-workout'),
    'Ebéd': recipes.filter(r => r.mealType === 'Ebéd'),
    'Snack': recipes.filter(r => r.mealType === 'Snack'),
    'Vacsora': recipes.filter(r => r.mealType === 'Vacsora')
  };

  const targetKcal = settings.targetKcal;
  const minProtein = settings.minProtein;
  const maxProtein = settings.maxProtein;

  const minKcal = targetKcal * 0.95;
  const maxKcal = targetKcal * 1.05;

  // Find all valid daily meal combinations that satisfy the hard macro constraints
  const validDailyCombinations: Array<Record<MealType, RecipeSummary>> = [];

  // If there are missing types, let's use what is available
  const breakfasts = recipesMap['Reggeli'];
  const preWorkouts = recipesMap['Pre-workout'].length > 0 ? recipesMap['Pre-workout'] : [null];
  const lunches = recipesMap['Ebéd'];
  const snacks = recipesMap['Snack'];
  const dinners = recipesMap['Vacsora'];

  for (const b of breakfasts) {
    for (const pw of preWorkouts) {
      for (const l of lunches) {
        for (const s of snacks) {
          for (const d of dinners) {
            const sumKcal = b.kcal + (pw ? pw.kcal : 0) + l.kcal + s.kcal + d.kcal;
            const sumProtein = b.protein + (pw ? pw.protein : 0) + l.protein + s.protein + d.protein;

            if (sumKcal >= minKcal && sumKcal <= maxKcal && sumProtein >= minProtein && sumProtein <= maxProtein) {
              const comb: any = {
                'Reggeli': b,
                'Ebéd': l,
                'Snack': s,
                'Vacsora': d
              };
              if (pw) {
                comb['Pre-workout'] = pw;
              }
              validDailyCombinations.push(comb);
            }
          }
        }
      }
    }
  }

  // If no combination satisfies the hard constraints, let's try with looser constraints or return a best-effort
  let adjustedCombinations = validDailyCombinations;
  let isBestEffort = false;

  if (validDailyCombinations.length === 0) {
    isBestEffort = true;
    // Fallback: relax constraints (kcal ±15%, protein ±15g)
    const looserMinKcal = targetKcal * 0.85;
    const looserMaxKcal = targetKcal * 1.15;
    const looserMinProtein = Math.max(0, minProtein - 15);
    const looserMaxProtein = maxProtein + 15;

    for (const b of breakfasts) {
      for (const pw of preWorkouts) {
        for (const l of lunches) {
          for (const s of snacks) {
            for (const d of dinners) {
              const sumKcal = b.kcal + (pw ? pw.kcal : 0) + l.kcal + s.kcal + d.kcal;
              const sumProtein = b.protein + (pw ? pw.protein : 0) + l.protein + s.protein + d.protein;

              if (sumKcal >= looserMinKcal && sumKcal <= looserMaxKcal && sumProtein >= looserMinProtein && sumProtein <= looserMaxProtein) {
                const comb: any = {
                  'Reggeli': b,
                  'Ebéd': l,
                  'Snack': s,
                  'Vacsora': d
                };
                if (pw) {
                  comb['Pre-workout'] = pw;
                }
                adjustedCombinations.push(comb);
              }
            }
          }
        }
      }
    }
  }

  // If still empty, just generate any combination and we'll scale or warn
  if (adjustedCombinations.length === 0) {
    const fallbackComb: any = {
      'Reggeli': breakfasts[0],
      'Pre-workout': preWorkouts[0],
      'Ebéd': lunches[0],
      'Snack': snacks[0],
      'Vacsora': dinners[0]
    };
    adjustedCombinations = [fallbackComb];
    isBestEffort = true;
  }

  // Let's select 7 days of meal combinations using a scoring heuristic
  // Scoring criteria:
  // 1. Prefer edamame snacks (S1 "Lidl edamame bab")
  // 2. Limit salmon dinners/lunches to <= 2 per week (tags "lazac")
  // 3. Minimize unique recipe repeats (variety) - don't repeat same recipe too closely, especially Ebéd
  // 4. Boost reuse of packaging ingredients (Sourdough bread: ING06, Skyr: ING01, Edamame fagyasztott: ING07)
  
  // To evaluate soft targets, let's write a selection loop
  let bestPlanDays: MealPlanDay[] = [];
  let bestScore = -999999;

  // Since it's quick, we can run a randomized heuristic search over 30 iterations and pick the best scored week
  const iterations = 50;
  for (let iter = 0; iter < iterations; iter++) {
    const selectedDays: MealPlanDay[] = [];
    const recipeCounts: Record<string, number> = {};
    const ingredientIdsUsed = new Set<string>();

    let salmonCount = 0;
    let consecutivenessPenalty = 0;
    let edamameCount = 0;

    for (let dIdx = 0; dIdx < 7; dIdx++) {
      const dayName = daysOfWeek[dIdx];
      // Pick a random combination from the valid pool
      const candIdx = Math.floor(Math.random() * adjustedCombinations.length);
      const cand = adjustedCombinations[candIdx];

      // Score this choice
      const dayMeals: Record<MealType, RecipeSummary | null> = {
        'Reggeli': cand['Reggeli'] || null,
        'Pre-workout': cand['Pre-workout'] || null,
        'Ebéd': cand['Ebéd'] || null,
        'Snack': cand['Snack'] || null,
        'Vacsora': cand['Vacsora'] || null
      };

      selectedDays.push({
        dayName,
        meals: dayMeals
      });

      // Update counters
      for (const type of Object.keys(dayMeals) as MealType[]) {
        const r = dayMeals[type];
        if (!r) continue;

        recipeCounts[r.id] = (recipeCounts[r.id] || 0) + 1;

        // Check if salmon (lazac)
        if (r.tags.includes('lazac') && (type === 'Ebéd' || type === 'Vacsora')) {
          salmonCount++;
        }

        // Check if edamame
        if (r.id === 'S1') {
          edamameCount++;
        }

        // Collect ingredients inside this recipe
        const rIngs = recipeIngredients.filter(ri => ri.recipeId === r.id);
        for (const ri of rIngs) {
          ingredientIdsUsed.add(ri.ingredientId);
        }

        // Penalty if same recipe as yesterday for the same meal type
        if (dIdx > 0) {
          const prevDay = selectedDays[dIdx - 1];
          const prevR = prevDay.meals[type];
          if (prevR && prevR.id === r.id) {
            consecutivenessPenalty += 50; // high penalty
          }
        }
      }
    }

    // Heuristic Score Calculation
    let score = 0;

    // 1. Salmon limit check (Target: Max 2 salmon meals per week)
    if (salmonCount <= 2) {
      score += 150;
    } else {
      score -= (salmonCount - 2) * 200; // heavy penalty for more than 2 salmon
    }

    // 2. Edamame preference snack check (prefer edamame snack S1)
    score += edamameCount * 40; // reward edamame snacks

    // 3. Repeat recipe variety penalty (we don't want the same lunch or dinner repeated more than 2-3 times)
    for (const rId of Object.keys(recipeCounts)) {
      const count = recipeCounts[rId];
      if (count > 2) {
        score -= (count - 2) * 40; // penalize too many repetitions
      }
    }

    // 4. Consecutive days penalty
    score -= consecutivenessPenalty;

    // 5. Simplicity / Uniformity of ingredients (soft target: minimize different ingredient items)
    // Low count of different ingredients is preferred
    score -= ingredientIdsUsed.size * 10; // penalize high count of different ingredients

    // 6. Give bonus if we use bulk items like kovászos kenyér (ING06), Milbona skyr (ING01), Edamame bab (ING07) in multiple days
    const keyIngredients = ['ING01', 'ING06', 'ING07'];
    for (const keyIng of keyIngredients) {
      if (ingredientIdsUsed.has(keyIng)) {
        score += 50; // reward using them
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPlanDays = selectedDays;
    }
  }

  return {
    plan: {
      user: user,
      days: bestPlanDays
    },
    warning: isBestEffort ? 'A generátor nem talált a megadott makró-sávnak (±5% kcal) tökéletesen megfelelő étrendet, ezért a legközelebbi változatot jelenítettük meg.' : undefined
  };
}
