/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { RecipeSummary, MealPlanDay, MealType, UserSettings, RecipeDetails, RecipeIngredient, Ingredient } from '../types';
import { Search, RotateCw, Plus, Check, HelpCircle } from 'lucide-react';
import RecipeDetailsModal from './RecipeDetailsModal';

interface WeeklyGridProps {
  user: string;
  onUserChange: (newUser: string) => void;
  plan: MealPlanDay[];
  onMealChange: (dayName: string, mealType: MealType, newRecipe: RecipeSummary | null) => void;
  recipes: RecipeSummary[];
  recipeDetails: RecipeDetails[];
  recipeIngredients: RecipeIngredient[];
  allIngredients: Ingredient[];
  settings: UserSettings;
}

export default function WeeklyGrid({
  user,
  onUserChange,
  plan,
  onMealChange,
  recipes,
  recipeDetails,
  recipeIngredients,
  allIngredients,
  settings
}: WeeklyGridProps) {
  const [selectedCell, setSelectedCell] = useState<{ dayName: string; mealType: MealType } | null>(null);
  const [selectedRecipeDetails, setSelectedRecipeDetails] = useState<{ dayName: string; mealType: MealType; recipe: RecipeSummary } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMobileDay, setActiveMobileDay] = useState<string>('Hétfő');

  const daysOfWeek = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
  const mealTypes: MealType[] = ['Reggeli', 'Pre-workout', 'Ebéd', 'Snack', 'Vacsora'];

  // Calculate daily totals for a given plan day
  const calculateDailyTotals = (day: MealPlanDay) => {
    let kcal = 0;
    let protein = 0;
    let carb = 0;
    let fat = 0;

    Object.values(day.meals).forEach(r => {
      if (r) {
        kcal += r.kcal;
        protein += r.protein;
        carb += r.carb;
        fat += r.fat;
      }
    });

    return { kcal, protein, carb, fat };
  };

  // Determine health color-code for a day's calories and protein
  const getDailyStatusColor = (totals: { kcal: number; protein: number }) => {
    const targetKcal = settings.targetKcal;
    const minProtein = settings.minProtein;
    const maxProtein = settings.maxProtein;

    const minKcal = targetKcal * 0.95;
    const maxKcal = targetKcal * 1.05;

    const isKcalIn = totals.kcal >= minKcal && totals.kcal <= maxKcal;
    const isProteinIn = totals.protein >= minProtein && totals.protein <= maxProtein;

    if (isKcalIn && isProteinIn) {
      return {
        bg: 'bg-[#5A5A40]/10 text-[#5A5A40] border-[#5A5A40]/20',
        dot: 'bg-[#5A5A40]',
        text: 'Optimális (Célban van)',
        badge: 'Célban'
      };
    }

    // Yellow/Terracotta warning: within 10%
    const yellowMinKcal = targetKcal * 0.90;
    const yellowMaxKcal = targetKcal * 1.10;
    const isKcalNear = totals.kcal >= yellowMinKcal && totals.kcal <= yellowMaxKcal;
    const isProteinNear = totals.protein >= (minProtein - 10) && totals.protein <= (maxProtein + 10);

    if (isKcalNear && isProteinNear) {
      return {
        bg: 'bg-[#D48166]/10 text-[#D48166] border-[#D48166]/20',
        dot: 'bg-[#D48166]',
        text: 'Némi eltérés (Határértéken ±10%)',
        badge: 'Határon'
      };
    }

    return {
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      dot: 'bg-rose-500',
      text: 'Korrekció szükséges (Kicsúszott)',
      badge: 'Piros'
    };
  };

  // Find candidate recipes for current cell that would respect user macros
  const getSubstitutesAndScores = (dayName: string, mealType: MealType) => {
    const day = plan.find(d => d.dayName === dayName);
    if (!day) return [];

    const otherMealsSum = Object.keys(day.meals).reduce(
      (acc, key) => {
        if (key === mealType) return acc;
        const r = day.meals[key as MealType];
        if (!r) return acc;
        return {
          kcal: acc.kcal + r.kcal,
          protein: acc.protein + r.protein
        };
      },
      { kcal: 0, protein: 0 }
    );

    const candidates = recipes.filter(r => r.mealType === mealType);

    return candidates.map(cand => {
      const finalKcal = otherMealsSum.kcal + cand.kcal;
      const finalProtein = otherMealsSum.protein + cand.protein;

      // Check if this substitute keeps day in macro range
      const inKcal = finalKcal >= settings.targetKcal * 0.95 && finalKcal <= settings.targetKcal * 1.05;
      const inProtein = finalProtein >= settings.minProtein && finalProtein <= settings.maxProtein;

      let score = 0;
      if (inKcal && inProtein) score += 100;
      // Pre-selection bias (e.g. Edamame for Snack is favored)
      if (mealType === 'Snack' && cand.id === 'S1') score += 10;

      return {
        recipe: cand,
        finalKcal,
        finalProtein,
        isOptimal: inKcal && inProtein,
        score
      };
    }).sort((a, b) => b.score - a.score);
  };

  return (
    <div id="weekly-grid-container" className="space-y-6">
      {/* Header and User Switches */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#E6E2D3] shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[#9A9483]">Aktív profil:</span>
          <div className="flex bg-[#E6E2D3] p-1 rounded-full">
            {['David', 'Dorina'].map(pUser => (
              <button
                key={pUser}
                onClick={() => onUserChange(pUser)}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  user === pUser
                    ? 'bg-white shadow-sm text-[#5A5A40]'
                    : 'text-slate-500 hover:text-[#5A5A40]'
                }`}
              >
                {pUser}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#5A5A40]"></span>
            <span className="text-[#5A5A40] font-medium">Optimalizált (Célban ±5%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#D48166]"></span>
            <span className="text-[#D48166] font-medium">Határértéken (±10%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500"></span>
            <span className="text-slate-600 font-medium">Korrekció szükséges</span>
          </div>
        </div>
      </div>

      {/* Target specs callout banner */}
      <div className="bg-[#F5F3ED] border border-[#E6E2D3] p-4 rounded-xl flex flex-wrap justify-between items-center gap-4">
        <div>
          <span className="text-xs uppercase tracking-wider font-bold text-[#9A9483]">Makró Célok</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-mono text-xl font-bold text-[#1A1C19]">{settings.targetKcal} kcal</span>
            <span className="text-sm text-[#E6E2D3] font-medium">|</span>
            <span className="font-mono text-sm font-bold text-[#5A5A40]">Fehérje: {settings.minProtein} - {settings.maxProtein}g</span>
          </div>
        </div>
        {settings.note && (
          <div className="text-xs text-[#373A40] bg-white px-3 py-2 rounded-lg border border-[#E6E2D3] max-w-sm leading-relaxed">
            💡 <strong className="text-[#1A1C19] font-bold">Megjegyzés:</strong> {settings.note}
          </div>
        )}
      </div>

      {/* Mobile Day Tabs (visible only on small screen) */}
      <div className="flex md:hidden gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {daysOfWeek.map(dayName => {
          const dayPlan = plan.find(d => d.dayName === dayName);
          const totals = dayPlan ? calculateDailyTotals(dayPlan) : { kcal: 0, protein: 0, carb: 0, fat: 0 };
          const status = getDailyStatusColor(totals);
          return (
            <button
              key={dayName}
              onClick={() => setActiveMobileDay(dayName)}
              className={`flex-1 min-w-[70px] py-3 px-1 text-center rounded-lg border text-xs font-bold flex flex-col gap-1 transition-all ${
                activeMobileDay === dayName
                  ? 'border-[#5A5A40] bg-[#5A5A40] text-white shadow-xs'
                  : 'border-[#E6E2D3] bg-white text-slate-600'
              }`}
            >
              <span>{dayName.slice(0, 3)}</span>
              <span className={`w-1.5 h-1.5 rounded-full mx-auto ${status.dot}`}></span>
            </button>
          );
        })}
      </div>

      {/* Desktop Grid Layout */}
      <div className="hidden md:grid grid-cols-7 gap-3 xl:gap-4">
        {daysOfWeek.map(dayName => {
          const dayPlan = plan.find(d => d.dayName === dayName);
          const totals = dayPlan ? calculateDailyTotals(dayPlan) : { kcal: 0, protein: 0, carb: 0, fat: 0 };
          const status = getDailyStatusColor(totals);

          return (
            <div key={dayName} className="bg-white rounded-xl border border-[#E6E2D3] flex flex-col shadow-xs overflow-hidden">
              <div className="bg-[#F5F3ED] border-b border-[#E6E2D3] py-2.5 px-3 flex justify-between items-center">
                <span className="font-bold text-[#1A1C19] tracking-tight text-sm">{dayName}</span>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full border ${status.bg}`}>
                  {status.badge}
                </span>
              </div>

              {/* Meals list */}
              <div className="p-2.5 space-y-2.5 flex-1 select-none">
                {mealTypes.map(type => {
                  const r = dayPlan?.meals[type] || null;
                  return (
                    <div
                      key={type}
                      onClick={() => {
                        if (r) {
                          setSelectedRecipeDetails({ dayName, mealType: type, recipe: r });
                        } else {
                          setSelectedCell({ dayName, mealType: type });
                        }
                      }}
                      className={`group border cursor-pointer rounded-lg p-2.5 transition-all hover:shadow-xs text-xs flex flex-col h-24 justify-between ${
                        r
                          ? 'bg-white border-[#E6E2D3] hover:border-[#5A5A40]/40'
                          : 'bg-[#F5F3ED] border-dashed border-[#9A9483]/40 hover:bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-[#5A5A40] tracking-wider uppercase">{type}</span>
                        {r && (
                          <span className="font-mono text-[9px] text-[#5A5A40] bg-[#F5F3ED] border border-[#E6E2D3] rounded px-1 group-hover:bg-[#E6E2D3]">
                            F:{r.protein}g
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-[#373A40] line-clamp-2 mt-1 leading-snug group-hover:text-[#1A1C19] group-hover:underline">
                        {r ? r.name : <span className="text-[#9A9483] italic">Üres - Válassz ételt</span>}
                      </div>
                      <div className="font-mono text-[10px] font-bold text-[#9A9483] mt-1 flex justify-between">
                        <span>{r ? `${r.kcal} kcal` : '-'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Day Bottom Totals */}
              <div className={`p-2.5 border-t border-[#E6E2D3] text-xs font-semibold flex flex-col gap-1.5 ${status.bg}`}>
                <div className="flex justify-between font-bold text-[#1A1C19]">
                  <span>Összeg:</span>
                  <span className="font-mono">{totals.kcal} kcal</span>
                </div>
                <div className="grid grid-cols-3 font-mono text-[9.5px] text-[#373A40] font-medium">
                  <div>🔥 F: <strong className="font-bold">{totals.protein}g</strong></div>
                  <div>🌾 Sz: {totals.carb}g</div>
                  <div>🥑 Zs: {totals.fat}g</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Detailed List for active day */}
      <div className="block md:hidden">
        {daysOfWeek.map(dayName => {
          if (dayName !== activeMobileDay) return null;

          const dayPlan = plan.find(d => d.dayName === dayName);
          const totals = dayPlan ? calculateDailyTotals(dayPlan) : { kcal: 0, protein: 0, carb: 0, fat: 0 };
          const status = getDailyStatusColor(totals);

          return (
            <div key={dayName} className="bg-white rounded-xl border border-[#E6E2D3] shadow-sm overflow-hidden space-y-4">
              <div className="bg-[#F5F3ED] p-4 border-b border-[#E6E2D3] flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-[#1A1C19] text-base">{dayName}i Étrend</h3>
                  <p className="text-xs text-[#9A9483]">Koppints a cellákra a módosításhoz</p>
                </div>
                <span className={`text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-full border ${status.bg}`}>
                  {status.badge}
                </span>
              </div>

              {/* Meals list */}
              <div className="p-4 space-y-3">
                {mealTypes.map(type => {
                  const r = dayPlan?.meals[type] || null;
                  return (
                    <div
                      key={type}
                      onClick={() => {
                        if (r) {
                          setSelectedRecipeDetails({ dayName, mealType: type, recipe: r });
                        } else {
                          setSelectedCell({ dayName, mealType: type });
                        }
                      }}
                      className={`flex items-center justify-between p-3.5 border rounded-xl cursor-pointer hover:bg-[#F5F3ED]/40 transition-all ${
                        r ? 'border-[#E6E2D3] bg-[#F5F3ED]/20' : 'border-dashed border-[#9A9483]/60 bg-[#F5F3ED]/40'
                      }`}
                    >
                      <div className="space-y-1 pr-4 max-w-[70%]">
                        <span className="text-[10px] font-bold text-[#5A5A40] tracking-wider uppercase">{type}</span>
                        <h4 className="font-bold text-[#1A1C19] text-sm leading-snug line-clamp-1">
                          {r ? r.name : <em className="text-[#9A9483] font-normal">Nincs kiválasztva étel</em>}
                        </h4>
                        {r?.tags && r.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.tags.map(t => (
                              <span key={t} className="text-[9px] bg-[#E6E2D3] text-[#5A5A40] px-1 py-0.5 rounded font-medium">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {r ? (
                        <div className="text-right flex flex-col justify-center shrink-0">
                          <span className="font-mono text-sm font-bold text-[#1A1C19]">{r.kcal} kcal</span>
                          <span className="font-mono text-[11px] text-[#9A9483]">Fehérje: {r.protein}g</span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[#D48166] bg-[#D48166]/10 border border-[#D48166]/20 rounded-lg px-2.5 py-1 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> Hozzáadás
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mobile bottom calculation status */}
              <div className={`p-4 border-t border-[#E6E2D3] space-y-2 ${status.bg}`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-[#1A1C19]">Összesített napi tápérték:</span>
                  <span className="font-mono text-base font-bold text-[#1A1C19]">{totals.kcal} kcal</span>
                </div>
                <div className="grid grid-cols-3 gap-3 font-mono text-xs text-[#373A40] mt-1">
                  <div className="bg-white/75 p-2 rounded-lg border border-[#E6E2D3]">
                    <div className="text-[#9A9483]">🔥 Fehérje</div>
                    <div className="text-sm font-bold text-[#1A1C19]">{totals.protein}g / {settings.minProtein}-{settings.maxProtein}g</div>
                  </div>
                  <div className="bg-white/75 p-2 rounded-lg border border-[#E6E2D3]">
                    <div className="text-[#9A9483]">🌾 Szénhidrát</div>
                    <div className="text-sm font-bold text-[#1A1C19]">{totals.carb}g</div>
                  </div>
                  <div className="bg-white/75 p-2 rounded-lg border border-[#E6E2D3]">
                    <div className="text-[#9A9483]">🥑 Zsír</div>
                    <div className="text-sm font-bold text-[#1A1C19]">{totals.fat}g</div>
                  </div>
                </div>
                <p className="text-[11px] mt-2 text-center text-[#5A5A40]">
                  Státusz: <strong className="font-bold">{status.text}</strong>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pop-up modal selector */}
      {selectedCell && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#E6E2D3] shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E6E2D3] flex justify-between items-center bg-[#F5F3ED]">
              <div>
                <span className="text-xs font-bold text-[#9A9483] uppercase tracking-widest">{selectedCell.dayName}</span>
                <h3 className="font-bold text-[#1A1C19] text-base">{selectedCell.mealType} kiválasztása</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedCell(null);
                  setSearchQuery('');
                }}
                className="text-[#9A9483] hover:text-[#1A1C19] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Quick Filter Search */}
            <div className="p-3 border-b border-[#E6E2D3] flex items-center gap-2 bg-white">
              <Search className="w-4 h-4 text-[#9A9483] shrink-0" />
              <input
                type="text"
                placeholder="Keresés ételek között..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] focus:bg-white border border-[#E6E2D3] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5A5A40]"
              />
            </div>

            {/* Substitution Smart Advisor header */}
            <div className="px-4 py-2 bg-[#F5F3ED]/60 text-[11px] text-[#5A5A40] font-semibold flex items-center justify-between border-b border-[#E6E2D3]">
              <span>💡 Makró-optimalizáció alapján javasolt alternatívák</span>
              <HelpCircle className="w-3.5 h-3.5 text-[#9A9483]" />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#FDFBF7]">
              {/* Reset option */}
              <div
                onClick={() => {
                  onMealChange(selectedCell.dayName, selectedCell.mealType, null);
                  setSelectedCell(null);
                  setSearchQuery('');
                }}
                className="p-3 border border-dashed rounded-xl flex items-center justify-center text-xs font-bold text-[#D48166] bg-[#D48166]/10 hover:bg-[#D48166]/20 hover:border-[#D48166] cursor-pointer text-center"
              >
                ✕ Étkezés törlése erről a celláról
              </div>

              {/* Filtered suggestions list */}
              {getSubstitutesAndScores(selectedCell.dayName, selectedCell.mealType)
                .filter(item => item.recipe.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(({ recipe, isOptimal, finalKcal, finalProtein }) => {
                  const day = plan.find(d => d.dayName === selectedCell.dayName);
                  const isCurrent = day?.meals[selectedCell.mealType]?.id === recipe.id;

                  return (
                    <div
                      key={recipe.id}
                      onClick={() => {
                        onMealChange(selectedCell.dayName, selectedCell.mealType, recipe);
                        setSelectedCell(null);
                        setSearchQuery('');
                      }}
                      className={`p-3 border rounded-xl hover:border-[#5A5A40]/40 hover:bg-white cursor-pointer flex justify-between items-center transition-all ${
                        isCurrent
                          ? 'border-[#5A5A40] bg-[#5A5A40]/10'
                          : isOptimal
                          ? 'border-[#5A5A40]/30 bg-[#5A5A40]/5'
                          : 'border-[#E6E2D3] bg-white'
                      }`}
                    >
                      <div className="space-y-1 select-none flex-1 pr-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-[#1A1C19] text-sm">{recipe.name}</h4>
                          {isCurrent && (
                            <span className="bg-[#5A5A40] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Jelenlegi
                            </span>
                          )}
                          {isOptimal && (
                            <span className="bg-[#D48166] text-white text-[9px] uppercase font-bold px-1.5 py-0.5 rounded">
                              Makró-Oké
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#373A40] font-mono">
                          🔥 {recipe.kcal} kcal | F: {recipe.protein}g | Sz: {recipe.carb}g | Zs: {recipe.fat}g
                        </p>
                        {/* Simulation values */}
                        <p className="text-[10px] text-[#9A9483] font-medium">
                          Napi végeredmény ha ezt választod:{' '}
                          <span className={`font-semibold font-mono ${isOptimal ? 'text-[#5A5A40]' : 'text-slate-500'}`}>
                            {finalKcal} kcal / {finalProtein}g fehérje
                          </span>
                        </p>
                      </div>

                      <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E6E2D3] text-[#5A5A40] bg-white shadow-3xs group-hover:bg-[#F5F3ED]">
                        Választ
                      </button>
                    </div>
                  );
                })}
            </div>
            
            <div className="p-3 border-t border-[#E6E2D3] bg-[#F5F3ED] flex justify-end">
              <button
                onClick={() => {
                  setSelectedCell(null);
                  setSearchQuery('');
                }}
                className="text-xs font-semibold px-4 py-1.5 border border-[#E6E2D3] rounded-lg text-[#5A5A40] bg-white hover:bg-[#FDFBF7]"
              >
                Mégse
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedRecipeDetails && (
        <RecipeDetailsModal
          recipeSummary={selectedRecipeDetails.recipe}
          recipeDetails={recipeDetails.find(d => d.recipeId === selectedRecipeDetails.recipe.id) || null}
          recipeIngredients={recipeIngredients.filter(ri => ri.recipeId === selectedRecipeDetails.recipe.id)}
          allIngredients={allIngredients}
          onClose={() => setSelectedRecipeDetails(null)}
          onChangeMeal={() => {
            const { dayName, mealType } = selectedRecipeDetails;
            onMealChange(dayName, mealType, null); // Clear current
            setSelectedRecipeDetails(null);
            setTimeout(() => {
              setSelectedCell({ dayName, mealType }); // Open selector immediately
            }, 50);
          }}
        />
      )}
    </div>
  );
}
