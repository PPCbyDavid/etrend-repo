/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Ingredient, MealType } from '../types';
import { Plus, Trash2, Calculator, Check, Apple } from 'lucide-react';

interface AddMealOrIngredientProps {
  ingredients: Ingredient[];
  onAddIngredient: (ing: any) => Promise<boolean>;
  onAddRecipe: (rec: any) => Promise<boolean>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export default function AddMealOrIngredient({
  ingredients,
  onAddIngredient,
  onAddRecipe,
  onSuccess,
  onError
}: AddMealOrIngredientProps) {
  // Tabs: 'recipe' or 'ingredient'
  const [activeTab, setActiveTab] = useState<'recipe' | 'ingredient'>('recipe');

  // Ingredient Form States
  const [ingName, setIngName] = useState('');
  const [ingKcal, setIngKcal] = useState('');
  const [ingProtein, setIngProtein] = useState('');
  const [ingCarb, setIngCarb] = useState('');
  const [ingFat, setIngFat] = useState('');
  const [ingPackagingText, setIngPackagingText] = useState('');
  const [ingPackagingGram, setIngPackagingGram] = useState('');
  const [ingStore, setIngStore] = useState('Lidl');
  const [ingSource, setIngSource] = useState('');

  // Recipe Form States
  const [recName, setRecName] = useState('');
  const [recMealType, setRecMealType] = useState<MealType>('Ebéd');
  const [recTagInput, setRecTagInput] = useState('');
  const [recIngredients, setRecIngredients] = useState<Array<{ id: string; amountGram: number }>>([]);
  const [tempId, setTempId] = useState('');
  const [tempAmount, setTempAmount] = useState('');

  // Recipe macro source: computed from ingredients, or entered manually
  // (e.g. a yogurt with label macros, no ingredient breakdown).
  const [recMode, setRecMode] = useState<'fromIngredients' | 'manual'>('fromIngredients');
  const [recManKcal, setRecManKcal] = useState('');
  const [recManProtein, setRecManProtein] = useState('');
  const [recManCarb, setRecManCarb] = useState('');
  const [recManFat, setRecManFat] = useState('');

  // Dynamically calculate recipe summary macros from ingredient selection
  const liveMacros = useMemo(() => {
    let kcal = 0;
    let protein = 0;
    let carb = 0;
    let fat = 0;

    recIngredients.forEach(ri => {
      const dbIng = ingredients.find(i => i.id === ri.id);
      if (dbIng) {
        kcal += (dbIng.kcalPer100g / 100) * ri.amountGram;
        protein += (dbIng.proteinPer100g / 100) * ri.amountGram;
        carb += (dbIng.carbPer100g / 100) * ri.amountGram;
        fat += (dbIng.fatPer100g / 100) * ri.amountGram;
      }
    });

    return {
      kcal: Math.round(kcal),
      protein: Math.round(protein * 10) / 10,
      carb: Math.round(carb * 10) / 10,
      fat: Math.round(fat * 10) / 10
    };
  }, [recIngredients, ingredients]);

  // Submit new ingredient
  const handleIngredientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName || !ingKcal) {
      onError('Kérlek töltsd ki az Alapanyag nevét és Kalória értékét!');
      return;
    }

    // Generate unique numerical ID
    const nextNum = ingredients.filter(i => i.id.startsWith('ING')).length + 1;
    const paddingNum = String(nextNum).padStart(2, '0');
    const newId = `ING${paddingNum}`;

    const newIng = {
      id: newId,
      name: ingName,
      kcalPer100g: Number(ingKcal),
      proteinPer100g: Number(ingProtein) || 0,
      carbPer100g: Number(ingCarb) || 0,
      fatPer100g: Number(ingFat) || 0,
      packaging: ingPackagingText || 'doboz',
      packagingGram: ingPackagingGram ? Number(ingPackagingGram) : null,
      store: ingStore,
      source: ingSource || 'Kézi bevitel'
    };

    const success = await onAddIngredient(newIng);
    if (success) {
      onSuccess(`"${ingName}" alapanyag sikeresen elmentve ${newId} azonosítóval!`);
      // Reset
      setIngName('');
      setIngKcal('');
      setIngProtein('');
      setIngCarb('');
      setIngFat('');
      setIngPackagingText('');
      setIngPackagingGram('');
      setIngSource('');
    }
  };

  // Add ingredient sub-item into recipe editor draft
  const handleAddIngToRecipe = () => {
    if (!tempId || !tempAmount) return;
    const amount = Number(tempAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Check if item already exists in the list
    const exists = recIngredients.find(ri => ri.id === tempId);
    if (exists) {
      setRecIngredients(prev =>
        prev.map(ri => (ri.id === tempId ? { ...ri, amountGram: ri.amountGram + amount } : ri))
      );
    } else {
      setRecIngredients(prev => [...prev, { id: tempId, amountGram: amount }]);
    }

    setTempAmount('');
  };

  const handleRemoveIngFromRecipe = (id: string) => {
    setRecIngredients(prev => prev.filter(ri => ri.id !== id));
  };

  // Submit complete recipe
  const handleRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recName) {
      onError('Kérlek add meg a Recept nevét!');
      return;
    }

    let macros: { kcal: number; protein: number; carb: number; fat: number };
    let ingredientsPayload: Array<{ id: string; name: string; amountGram: number }> = [];

    if (recMode === 'manual') {
      if (!recManKcal) {
        onError('Kézi makró módban add meg legalább a kalóriát!');
        return;
      }
      macros = {
        kcal: Math.round(Number(recManKcal)) || 0,
        protein: Math.round(Number(recManProtein)) || 0,
        carb: Math.round(Number(recManCarb)) || 0,
        fat: Math.round(Number(recManFat)) || 0
      };
    } else {
      if (recIngredients.length === 0) {
        onError('Adj hozzá legalább egy alapanyagot a recepthez, hogy kiszámolhassuk a tápértéket!');
        return;
      }
      macros = {
        kcal: liveMacros.kcal,
        protein: Math.round(liveMacros.protein),
        carb: Math.round(liveMacros.carb),
        fat: Math.round(liveMacros.fat)
      };
      ingredientsPayload = recIngredients.map(ri => {
        const dbIng = ingredients.find(i => i.id === ri.id);
        return { id: ri.id, name: dbIng?.name || '', amountGram: ri.amountGram };
      });
    }

    // Generate unique recipe ID based on meal category prefix
    let prefix = 'R';
    if (recMealType === 'Pre-workout') prefix = 'PW';
    else if (recMealType === 'Ebéd') prefix = 'E';
    else if (recMealType === 'Snack') prefix = 'S';
    else if (recMealType === 'Vacsora') prefix = 'V';

    const nextId = `${prefix}${Math.floor(Math.random() * 900) + 100}`;

    const newRecipe = {
      id: nextId,
      name: recName,
      mealType: recMealType,
      tags: recTagInput ? recTagInput.split(';').map(t => t.trim()).filter(Boolean) : [],
      ...macros,
      ingredients: ingredientsPayload
    };

    const success = await onAddRecipe(newRecipe);
    if (success) {
      onSuccess(`"${recName}" recept elmentve ${nextId} azonosítóval!`);
      // Reset
      setRecName('');
      setRecTagInput('');
      setRecIngredients([]);
      setTempId('');
      setTempAmount('');
      setRecManKcal('');
      setRecManProtein('');
      setRecManCarb('');
      setRecManFat('');
    }
  };

  return (
    <div id="add-meal-ingredient-root" className="space-y-6">
      <div className="flex gap-2 p-1 bg-[#E6E2D3] rounded-full max-w-sm mx-auto shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab('recipe')}
          className={`flex-1 py-2 px-4 rounded-full text-xs font-bold text-center transition-all ${
            activeTab === 'recipe' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-slate-500 hover:text-[#5A5A40]'
          }`}
        >
          🍳 Új Recept tervezése
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ingredient')}
          className={`flex-1 py-2 px-4 rounded-full text-xs font-bold text-center transition-all ${
            activeTab === 'ingredient' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-slate-500 hover:text-[#5A5A40]'
          }`}
        >
          🥦 Új Alapanyag felvétele
        </button>
      </div>

      {activeTab === 'ingredient' ? (
        <form onSubmit={handleIngredientSubmit} className="bg-white rounded-2xl border border-[#E6E2D3] p-5 space-y-4 shadow-sm max-w-xl mx-auto">
          <div className="border-b border-[#E6E2D3] pb-3 flex items-center gap-2">
            <Apple className="w-5 h-5 text-[#5A5A40]" />
            <h3 className="font-bold text-[#1A1C19] text-base">Alapanyag felvitele a táblázatba</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#5A5A40]">Alapanyag neve *</label>
              <input
                type="text"
                placeholder="Pl. Milbona natúr skyr"
                value={ingName}
                onChange={e => setIngName(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] rounded-lg p-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-[#5A5A40]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#5A5A40]">Élelmiszerbolt *</label>
              <select
                value={ingStore}
                onChange={e => setIngStore(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] rounded-lg p-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-[#5A5A40]"
              >
                <option value="Lidl">Lidl</option>
                <option value="Spar">Spar</option>
                <option value="Tesco">Tesco</option>
                <option value="Aldi">Aldi</option>
                <option value="Bármely">Bármely</option>
                <option value="Házi / Kistermelői">Házi / Kistermelői</option>
              </select>
            </div>

            <div className="grid grid-cols-4 gap-2 md:col-span-2 bg-[#FDFBF7] p-3 rounded-lg border border-[#E6E2D3]">
              <div className="space-y-1 col-span-1">
                <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Kcal / 100g</label>
                <input
                  type="number"
                  placeholder="kcal"
                  value={ingKcal}
                  onChange={e => setIngKcal(e.target.value)}
                  className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                  required
                />
              </div>
              <div className="space-y-1 col-span-1">
                <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Fehérje</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="g"
                  value={ingProtein}
                  onChange={e => setIngProtein(e.target.value)}
                  className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                />
              </div>
              <div className="space-y-1 col-span-1">
                <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Szénhidrát</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="g"
                  value={ingCarb}
                  onChange={e => setIngCarb(e.target.value)}
                  className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                />
              </div>
              <div className="space-y-1 col-span-1">
                <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Zsír</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="g"
                  value={ingFat}
                  onChange={e => setIngFat(e.target.value)}
                  className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#5A5A40]">Kiszerelés szövege</label>
              <input
                type="text"
                placeholder="Pl. 250g pohár, 10 db-os doboz"
                value={ingPackagingText}
                onChange={e => setIngPackagingText(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-[#5A5A40]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#5A5A40]">Nettó tömeg (gramm)</label>
              <input
                type="number"
                placeholder="Pl. 250"
                value={ingPackagingGram}
                onChange={e => setIngPackagingGram(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2.5 outline-none font-mono focus:ring-1 focus:ring-[#5A5A40]"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-bold text-[#5A5A40]">Megjegyzés / Forrás</label>
              <input
                type="text"
                placeholder="Pl. Tesco polcról fotózva"
                value={ingSource}
                onChange={e => setIngSource(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-[#5A5A40]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 bg-[#5A5A40] hover:bg-[#4a4a34] text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all active:scale-98"
            >
              <Check className="w-4 h-4" /> Alapanyag mentése
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRecipeSubmit} className="bg-white rounded-2xl border border-[#E6E2D3] p-5 space-y-5 shadow-sm max-w-xl mx-auto">
          <div className="border-b border-[#E6E2D3] pb-3 flex justify-between items-center bg-[#F5F3ED] p-3 -mx-5 -mt-5 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#5A5A40]" />
              <h3 className="font-bold text-[#1A1C19] text-base">Új recept makró-kalkulációval</h3>
            </div>
          </div>

          {/* Core Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-bold text-[#5A5A40]">Recept megnevezése *</label>
              <input
                type="text"
                placeholder="Pl. Skyr lángos házi fokhagymával"
                value={recName}
                onChange={e => setRecName(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-[#5A5A40]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#5A5A40]">Étkezéstípus *</label>
              <select
                value={recMealType}
                onChange={e => setRecMealType(e.target.value as MealType)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-[#5A5A40]"
              >
                <option value="Reggeli">Reggeli</option>
                <option value="Pre-workout">Pre-workout</option>
                <option value="Ebéd">Ebéd</option>
                <option value="Snack">Snack</option>
                <option value="Vacsora">Vacsora</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-bold text-[#5A5A40]">Címkék (pontosvesszővel elválasztva)</label>
              <input
                type="text"
                placeholder="Pl. fix; magas fehérje; zabos; húsmentes"
                value={recTagInput}
                onChange={e => setRecTagInput(e.target.value)}
                className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2.5 outline-none focus:ring-1 focus:ring-[#5A5A40]"
              />
            </div>
          </div>

          {/* Macro source toggle: compute from ingredients, or enter manually */}
          <div className="flex gap-2 p-1 bg-[#E6E2D3] rounded-full max-w-md mx-auto shadow-inner">
            <button
              type="button"
              onClick={() => setRecMode('fromIngredients')}
              className={`flex-1 py-2 px-3 rounded-full text-xs font-bold transition-all ${
                recMode === 'fromIngredients' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-slate-500 hover:text-[#5A5A40]'
              }`}
            >
              🧮 Hozzávalókból számolt
            </button>
            <button
              type="button"
              onClick={() => setRecMode('manual')}
              className={`flex-1 py-2 px-3 rounded-full text-xs font-bold transition-all ${
                recMode === 'manual' ? 'bg-white text-[#5A5A40] shadow-sm' : 'text-slate-500 hover:text-[#5A5A40]'
              }`}
            >
              ✍️ Kézi makró megadás
            </button>
          </div>

          {recMode === 'fromIngredients' && (
          <>
          {/* Composites Component Maker */}
          <div className="bg-[#F5F3ED]/60 p-4 border border-[#E6E2D3] rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-[#5A5A40] tracking-wider uppercase mb-1">1. Hozzávalók kimérése</h4>
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="flex-1 space-y-1 w-full">
                <label className="text-[10px] font-bold text-[#9A9483] uppercase">Válassz alapanyagot</label>
                <select
                  value={tempId}
                  onChange={e => setTempId(e.target.value)}
                  className="w-full text-xs bg-white border border-[#E6E2D3] rounded-lg p-2 outline-none focus:ring-1 focus:ring-[#5A5A40]"
                >
                  <option value="">-- Válassz a listából --</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.kcalPer100g} kcal | F:{i.proteinPer100g}g)
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-32 space-y-1">
                <label className="text-[10px] font-bold text-[#9A9483] uppercase text-center block">Mennyiség (g)</label>
                <input
                  type="number"
                  placeholder="gramm"
                  value={tempAmount}
                  onChange={e => setTempAmount(e.target.value)}
                  className="w-full text-xs bg-white border border-[#E6E2D3] rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                />
              </div>

              <button
                type="button"
                onClick={handleAddIngToRecipe}
                className="w-full sm:w-auto bg-[#5A5A40] hover:bg-[#4a4a34] text-white font-bold text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Hozzáad
              </button>
            </div>

            {/* Selected Ingredient Lists Table */}
            {recIngredients.length > 0 && (
              <div className="border border-[#E6E2D3] bg-white rounded-xl overflow-hidden mt-3 max-h-48 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F5F3ED] text-[10px] font-bold text-[#5A5A40] border-b border-[#E6E2D3]">
                      <th className="p-2.5">Alapanyag</th>
                      <th className="p-2.5 text-center">Tömeg</th>
                      <th className="p-2.5 text-right">Rész-kcal</th>
                      <th className="p-2.5 text-center">Kezelés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E2D3] font-medium text-[#373A40]">
                    {recIngredients.map(ri => {
                      const dbIng = ingredients.find(i => i.id === ri.id);
                      if (!dbIng) return null;
                      const partialCal = Math.round((dbIng.kcalPer100g / 100) * ri.amountGram);

                      return (
                        <tr key={ri.id} className="hover:bg-[#F5F3ED]/30">
                          <td className="p-2.5">{dbIng.name}</td>
                          <td className="p-2.5 text-center font-mono">{ri.amountGram}g</td>
                          <td className="p-2.5 text-right font-mono text-[#9A9483]">{partialCal} kcal</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveIngFromRecipe(ri.id)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Dynamic Macro Calculator Card Live preview */}
          <div className="bg-[#5A5A40] text-white p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm shadow-[#5A5A40]/10">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#E6E2D3]">2. Számolt Recept Tápérték</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight font-mono text-[#FDFBF7]">{liveMacros.kcal} kcal</span>
                <span className="text-xs text-[#E6E2D3]">összesen</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-l border-white/20 pl-0 sm:pl-6 w-full sm:w-auto text-xs font-mono">
              <div>
                <div className="text-[10px] font-bold text-[#E6E2D3] uppercase">Fehérje</div>
                <div className="font-bold text-sm text-[#FDFBF7]">{liveMacros.protein}g</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#E6E2D3] uppercase">Szénhidrát</div>
                <div className="font-bold text-sm text-[#FDFBF7]">{liveMacros.carb}g</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#E6E2D3] uppercase">Zsír</div>
                <div className="font-bold text-sm text-[#FDFBF7]">{liveMacros.fat}g</div>
              </div>
            </div>
          </div>
          </>
          )}

          {recMode === 'manual' && (
            <div className="bg-[#FDFBF7] p-4 border border-[#E6E2D3] rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-[#5A5A40] tracking-wider uppercase">Makrók (kész értékek, teljes adagra)</h4>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Kcal *</label>
                  <input
                    type="number"
                    placeholder="kcal"
                    value={recManKcal}
                    onChange={e => setRecManKcal(e.target.value)}
                    className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Fehérje</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="g"
                    value={recManProtein}
                    onChange={e => setRecManProtein(e.target.value)}
                    className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Szénhidrát</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="g"
                    value={recManCarb}
                    onChange={e => setRecManCarb(e.target.value)}
                    className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#9A9483] uppercase tracking-tight block text-center">Zsír</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="g"
                    value={recManFat}
                    onChange={e => setRecManFat(e.target.value)}
                    className="w-full text-xs bg-[#F5F3ED] border border-[#E6E2D3] focus:bg-white rounded-lg p-2 outline-none font-mono text-center focus:ring-1 focus:ring-[#5A5A40]"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#9A9483]">Pl. egy joghurt a címkén lévő makrókkal — a teljes adagra vonatkozó értékeket add meg, hozzávaló-bontás nélkül.</p>
            </div>
          )}

          <div className="pt-1 flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all bg-[#D48166] hover:bg-[#c37359] text-white"
            >
              <Check className="w-4 h-4" /> Recept mentése
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
