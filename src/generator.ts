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

// ---------------------------------------------------------------------------
// Household planner: David and Dorina share the same lunch (Ebéd) and dinner
// (Vacsora) every day, but each person gets their own breakfast / pre-workout /
// snack, and the shared meals are portion-scaled per person so both hit their
// own calorie & protein targets.
// ---------------------------------------------------------------------------

// Allowed portion multipliers for the shared lunch/dinner, per person.
const PORTION_FACTORS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5];

// Format a portion factor for display, e.g. 0.75 -> "0,75", 1.5 -> "1,5".
function formatPortion(f: number): string {
  return f.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}

// Return a copy of a recipe scaled to the given portion. A factor of 1 returns
// the recipe unchanged (no portion field, no name suffix).
function scaleRecipe(r: RecipeSummary, f: number): RecipeSummary {
  if (f === 1) return r;
  return {
    ...r,
    kcal: Math.round(r.kcal * f),
    protein: Math.round(r.protein * f),
    carb: Math.round(r.carb * f),
    fat: Math.round(r.fat * f),
    portion: f,
    name: `${r.name} (${formatPortion(f)}× adag)`
  };
}

interface PersonalFit {
  breakfast: RecipeSummary;
  preWorkout: RecipeSummary | null;
  snack: RecipeSummary;
  factor: number; // portion factor applied to the shared lunch + dinner
}

// Given a fixed shared lunch + dinner, find the best personal breakfast /
// pre-workout / snack and a shared-meal portion factor so this person's daily
// totals land inside their macro band. Returns null if nothing fits.
function findPersonalFit(
  settings: UserSettings,
  breakfasts: RecipeSummary[],
  preWorkouts: (RecipeSummary | null)[],
  snacks: RecipeSummary[],
  sharedKcal: number,
  sharedProtein: number,
  minKcal: number,
  maxKcal: number,
  minProtein: number,
  maxProtein: number
): PersonalFit | null {
  let best: PersonalFit | null = null;
  let bestScore = Infinity;

  for (const b of breakfasts) {
    for (const pw of preWorkouts) {
      for (const s of snacks) {
        const baseKcal = b.kcal + (pw ? pw.kcal : 0) + s.kcal;
        const baseProtein = b.protein + (pw ? pw.protein : 0) + s.protein;
        for (const f of PORTION_FACTORS) {
          const kcal = baseKcal + f * sharedKcal;
          const protein = baseProtein + f * sharedProtein;
          if (kcal < minKcal || kcal > maxKcal) continue;
          if (protein < minProtein || protein > maxProtein) continue;
          // Prefer totals near the calorie target and portions near a full
          // serving (avoid odd portions when a normal one works).
          const score = Math.abs(kcal - settings.targetKcal) + Math.abs(f - 1) * 250;
          if (score < bestScore) {
            bestScore = score;
            best = { breakfast: b, preWorkout: pw, snack: s, factor: f };
          }
        }
      }
    }
  }

  return best;
}

interface HouseholdTemplate {
  lunch: RecipeSummary;
  dinner: RecipeSummary;
  fits: Record<string, PersonalFit>; // keyed by user name
}

/**
 * Build a week where both people share the same lunch and dinner each day,
 * with personalized breakfast/pre-workout/snack and per-person portions on the
 * shared meals so each person's calorie & protein targets are met.
 */
export function solveHouseholdPlan(
  recipes: RecipeSummary[],
  recipeIngredients: RecipeIngredient[],
  ingredients: Ingredient[],
  usersSettings: UserSettings[]
): { plans: Record<string, WeeklyPlan>; warning?: string } {
  const daysOfWeek = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];

  const breakfasts = recipes.filter(r => r.mealType === 'Reggeli');
  const preWorkoutsRaw = recipes.filter(r => r.mealType === 'Pre-workout');
  const preWorkouts: (RecipeSummary | null)[] = preWorkoutsRaw.length > 0 ? preWorkoutsRaw : [null];
  const lunches = recipes.filter(r => r.mealType === 'Ebéd');
  const snacks = recipes.filter(r => r.mealType === 'Snack');
  const dinners = recipes.filter(r => r.mealType === 'Vacsora');

  // Build the list of shared (lunch, dinner) templates that BOTH people can be
  // made to fit. Try the strict ±5% band first, then a relaxed band.
  function buildTemplates(strict: boolean): HouseholdTemplate[] {
    const result: HouseholdTemplate[] = [];
    for (const l of lunches) {
      for (const d of dinners) {
        const sharedKcal = l.kcal + d.kcal;
        const sharedProtein = l.protein + d.protein;
        const fits: Record<string, PersonalFit> = {};
        let allFit = true;
        for (const s of usersSettings) {
          const minKcal = s.targetKcal * (strict ? 0.95 : 0.85);
          const maxKcal = s.targetKcal * (strict ? 1.05 : 1.15);
          const minProtein = strict ? s.minProtein : Math.max(0, s.minProtein - 15);
          const maxProtein = strict ? s.maxProtein : s.maxProtein + 15;
          const fit = findPersonalFit(
            s, breakfasts, preWorkouts, snacks,
            sharedKcal, sharedProtein, minKcal, maxKcal, minProtein, maxProtein
          );
          if (!fit) { allFit = false; break; }
          fits[s.user] = fit;
        }
        if (allFit) result.push({ lunch: l, dinner: d, fits });
      }
    }
    return result;
  }

  let templates = buildTemplates(true);
  let isBestEffort = false;
  if (templates.length === 0) {
    isBestEffort = true;
    templates = buildTemplates(false);
  }

  // Absolute fallback: if still nothing fits, just pair the first lunch/dinner
  // at full portion with the closest personal meals we can find (unconstrained).
  if (templates.length === 0 && lunches.length > 0 && dinners.length > 0) {
    const l = lunches[0];
    const d = dinners[0];
    const sharedKcal = l.kcal + d.kcal;
    const sharedProtein = l.protein + d.protein;
    const fits: Record<string, PersonalFit> = {};
    for (const s of usersSettings) {
      const fit =
        findPersonalFit(s, breakfasts, preWorkouts, snacks, sharedKcal, sharedProtein, 0, Infinity, 0, Infinity) ||
        { breakfast: breakfasts[0], preWorkout: preWorkouts[0], snack: snacks[0], factor: 1 };
      fits[s.user] = fit;
    }
    templates = [{ lunch: l, dinner: d, fits }];
  }

  // Randomized weekly selection optimizing variety and the salmon limit.
  let bestSelection: HouseholdTemplate[] = [];
  let bestScore = -Infinity;
  const iterations = 60;

  for (let iter = 0; iter < iterations; iter++) {
    const selected: HouseholdTemplate[] = [];
    const lunchCounts: Record<string, number> = {};
    const dinnerCounts: Record<string, number> = {};
    let salmonDays = 0;
    let consecutivePenalty = 0;

    for (let dIdx = 0; dIdx < 7; dIdx++) {
      const t = templates[Math.floor(Math.random() * templates.length)];
      selected.push(t);

      lunchCounts[t.lunch.id] = (lunchCounts[t.lunch.id] || 0) + 1;
      dinnerCounts[t.dinner.id] = (dinnerCounts[t.dinner.id] || 0) + 1;
      if (t.lunch.tags.includes('lazac') || t.dinner.tags.includes('lazac')) salmonDays++;

      if (dIdx > 0) {
        const prev = selected[dIdx - 1];
        if (prev.lunch.id === t.lunch.id) consecutivePenalty += 50;
        if (prev.dinner.id === t.dinner.id) consecutivePenalty += 50;
      }
    }

    let score = 0;
    // Salmon limit: at most 2 salmon days per week.
    if (salmonDays <= 2) score += 150;
    else score -= (salmonDays - 2) * 200;
    // Variety: penalize repeating the same lunch/dinner too often.
    for (const id of Object.keys(lunchCounts)) {
      if (lunchCounts[id] > 2) score -= (lunchCounts[id] - 2) * 40;
    }
    for (const id of Object.keys(dinnerCounts)) {
      if (dinnerCounts[id] > 2) score -= (dinnerCounts[id] - 2) * 40;
    }
    score -= consecutivePenalty;

    if (score > bestScore) {
      bestScore = score;
      bestSelection = selected;
    }
  }

  // Materialize a WeeklyPlan per person from the chosen templates.
  const plans: Record<string, WeeklyPlan> = {};
  for (const s of usersSettings) {
    const days: MealPlanDay[] = bestSelection.map((t, dIdx) => {
      const fit = t.fits[s.user];
      const meals: Record<MealType, RecipeSummary | null> = {
        'Reggeli': fit.breakfast,
        'Pre-workout': fit.preWorkout,
        'Ebéd': scaleRecipe(t.lunch, fit.factor),
        'Snack': fit.snack,
        'Vacsora': scaleRecipe(t.dinner, fit.factor)
      };
      return { dayName: daysOfWeek[dIdx], meals };
    });
    plans[s.user] = { user: s.user, days };
  }

  return {
    plans,
    warning: isBestEffort
      ? 'A generátor nem talált a megadott makró-sávnak (±5% kcal) tökéletesen megfelelő közös étrendet, ezért a legközelebbi változatot állítottuk össze.'
      : undefined
  };
}
