/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { MealPlanDay, RecipeIngredient, Ingredient, ShoppingItem } from '../types';
import { CheckSquare, Square, ShoppingBag, Store, Users, User } from 'lucide-react';

interface ShoppingListProps {
  davidPlan: MealPlanDay[];
  dorinaPlan: MealPlanDay[];
  ingredients: Ingredient[];
  recipes: any[];
  recipeIngredients: RecipeIngredient[];
}

export default function ShoppingList({
  davidPlan,
  dorinaPlan,
  ingredients,
  recipeIngredients
}: ShoppingListProps) {
  // Modes: 'combined' (David + Dorina), 'david' (David only), 'dorina' (Dorina only)
  const [listMode, setListMode] = useState<'combined' | 'david' | 'dorina'>('combined');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Generate flat list of requirements
  const shoppingItems = useMemo(() => {
    const plansToConsolidate: { user: string; dayPlan: MealPlanDay }[] = [];
    
    if (listMode === 'combined' || listMode === 'david') {
      davidPlan.forEach(dp => plansToConsolidate.push({ user: 'David', dayPlan: dp }));
    }
    if (listMode === 'combined' || listMode === 'dorina') {
      dorinaPlan.forEach(dp => plansToConsolidate.push({ user: 'Dorina', dayPlan: dp }));
    }

    // Accumulate weights of ingredients required
    const ingredientWeights: Record<string, number> = {};

    plansToConsolidate.forEach(({ dayPlan }) => {
      Object.keys(dayPlan.meals).forEach(mealKey => {
        const r = dayPlan.meals[mealKey as any];
        if (!r) return;

        // Find recipe ingredient amounts, scaled by the meal's portion factor
        // (shared household meals can be served at e.g. 0.75 portion).
        const portion = r.portion ?? 1;
        const rIngs = recipeIngredients.filter(ri => ri.recipeId === r.id);
        rIngs.forEach(ri => {
          ingredientWeights[ri.ingredientId] = (ingredientWeights[ri.ingredientId] || 0) + ri.amountGram * portion;
        });
      });
    });

    // Build ShoppingItem array
    const list: ShoppingItem[] = [];

    Object.keys(ingredientWeights).forEach(ingId => {
      const ing = ingredients.find(i => i.id === ingId);
      if (!ing) return;

      const requiredAmountGram = ingredientWeights[ingId];
      let unitsToBuy = 1;

      // Calculate rounded up packaging units
      if (ing.packagingGram && ing.packagingGram > 0) {
        unitsToBuy = Math.ceil(requiredAmountGram / ing.packagingGram);
      } else {
        // If no packaging size grams, try to infer package weight or default to raw
        const match = ing.packaging.match(/~(\d+)g/);
        if (match) {
          const size = parseInt(match[1]);
          unitsToBuy = Math.ceil(requiredAmountGram / size);
        } else {
          unitsToBuy = 1;
        }
      }

      list.push({
        ingredientId: ingId,
        ingredientName: ing.name,
        requiredAmountGram,
        packaging: ing.packaging,
        packagingGram: ing.packagingGram,
        store: ing.store,
        unitsToBuy,
        purchased: !!checkedItems[`${listMode}-${ingId}`]
      });
    });

    return list;
  }, [listMode, davidPlan, dorinaPlan, ingredients, recipeIngredients, checkedItems]);

  // Grouped by store
  const itemsByStore = useMemo(() => {
    const grouped: Record<string, ShoppingItem[]> = {};
    shoppingItems.forEach(item => {
      const storeName = item.store || 'Bármely';
      if (!grouped[storeName]) {
        grouped[storeName] = [];
      }
      grouped[storeName].push(item);
    });
    return grouped;
  }, [shoppingItems]);

  const toggleChecked = (ingId: string) => {
    const key = `${listMode}-${ingId}`;
    setCheckedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getCleanPackagingLabel = (item: ShoppingItem) => {
    if (!item.packaging) return `${Math.round(item.requiredAmountGram)}g`;

    const baseLabel = item.packaging.toLowerCase();
    let unitLabel = 'db';

    if (baseLabel.includes('pohár')) unitLabel = 'pohár';
    else if (baseLabel.includes('cipó') || baseLabel.includes('kenyér')) unitLabel = 'cipó';
    else if (baseLabel.includes('zacskó') || baseLabel.includes('zacsko')) unitLabel = 'zacskó';
    else if (baseLabel.includes('doboz')) unitLabel = 'doboz';
    else if (baseLabel.includes('csomag')) unitLabel = 'csomag';
    else if (baseLabel.includes('konzerv')) unitLabel = 'konzerv';
    else if (baseLabel.includes('tasak')) unitLabel = 'tasak';
    else if (baseLabel.includes('tálca')) unitLabel = 'tálca';
    else if (baseLabel.includes('adag')) unitLabel = 'adag';
    else if (baseLabel.includes('db')) unitLabel = 'db';

    const roundedGram = item.packagingGram ? item.unitsToBuy * item.packagingGram : null;
    const details = roundedGram ? ` (igény: ${Math.round(item.requiredAmountGram)}g / megvásárlandó: ${roundedGram}g)` : ` (igény: ${Math.round(item.requiredAmountGram)}g)`;

    return `${item.unitsToBuy} ${unitLabel}${details}`;
  };

  return (
    <div id="shopping-list-container" className="space-y-6">
      {/* Title block */}
      <div className="bg-[#5A5A40] text-white p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-[#E6E2D3] shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">🛒 Közös Bevásárlólista</h2>
          <p className="text-xs text-[#F5F3ED] mt-1 font-medium">Az étrendhez szükséges alapanyagok, kiszerelésre kerekítve és üzletenként csoportosítva.</p>
        </div>

        {/* Mode switcher switches */}
        <div className="flex gap-1 bg-white/20 p-1 rounded-full w-full md:w-auto">
          <button
            onClick={() => setListMode('combined')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              listMode === 'combined' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Mindketten (Közös)
          </button>
          <button
            onClick={() => setListMode('david')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              listMode === 'david' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-white hover:bg-white/10'
            }`}
          >
            <User className="w-3.5 h-3.5" /> David
          </button>
          <button
            onClick={() => setListMode('dorina')}
            className={`flex-1 md:flex-initial px-4 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              listMode === 'dorina' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-white hover:bg-white/10'
            }`}
          >
            <User className="w-3.5 h-3.5" /> Dorina
          </button>
        </div>
      </div>

      {shoppingItems.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-[#E6E2D3] space-y-4 shadow-sm max-w-md mx-auto">
          <ShoppingBag className="w-12 h-12 text-[#9A9483] mx-auto" />
          <div className="space-y-1">
            <h3 className="font-bold text-[#1A1C19] text-sm">Üres a bevásárlólistád</h3>
            <p className="text-xs text-[#9A9483] max-w-sm mx-auto leading-relaxed">Az aktív heti étrended még nem tartalmaz recepteket vagy üres étrendek vannak kiválasztva. Fuss neki a generálásnak!</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto">
          {Object.keys(itemsByStore).sort().map(storeName => {
            const items = itemsByStore[storeName];
            return (
              <div key={storeName} className="bg-white rounded-xl border border-[#E6E2D3] shadow-sm overflow-hidden">
                {/* Store Header */}
                <div className="bg-[#F5F3ED] px-4 py-3 border-b border-[#E6E2D3] flex items-center gap-2 font-bold text-[#1A1C19]">
                  <Store className="w-4 h-4 text-[#5A5A40]" />
                  <span className="text-sm tracking-tight capitalize">{storeName}</span>
                  <span className="text-[10px] bg-[#E6E2D3] text-[#5A5A40] font-extrabold px-2.5 py-1 rounded-full ml-auto">
                    {items.length} tétel
                  </span>
                </div>

                {/* Items */}
                <div className="divide-y divide-[#E6E2D3]">
                  {items.map(item => (
                    <div
                      key={item.ingredientId}
                      onClick={() => toggleChecked(item.ingredientId)}
                      className={`flex items-start justify-between p-4 cursor-pointer hover:bg-[#F5F3ED]/20 transition-colors select-none ${
                        item.purchased ? 'bg-[#F2EFE8]/40 opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button className="shrink-0 mt-0.5 text-slate-400 hover:text-slate-600">
                          {item.purchased ? (
                            <CheckSquare className="w-5 h-5 text-[#5A5A40]" />
                          ) : (
                            <Square className="w-5 h-5 text-[#E6E2D3]" />
                          )}
                        </button>
                        <div className="space-y-0.5">
                          <h4 className={`text-[#1A1C19] font-bold text-sm ${item.purchased ? 'line-through text-[#9A9483]' : ''}`}>
                            {item.ingredientName}
                          </h4>
                          <p className="text-xs text-[#5A5A40] font-mono">
                            {getCleanPackagingLabel(item)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
