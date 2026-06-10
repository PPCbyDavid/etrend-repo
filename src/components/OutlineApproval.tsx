/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Flame, Brain, Sparkles, AlertCircle, CheckCircle, RefreshCcw, Search, X } from 'lucide-react';
import { RecipeSummary } from '../types';

interface OutlineDay {
  dayName: string;
  description: string;
  meals: {
    'Reggeli': string;
    'Pre-workout': string;
    'Ebéd': string;
    'Snack': string;
    'Vacsora': string;
  };
}

interface OutlineApprovalProps {
  user: string;
  outline: {
    days: OutlineDay[];
    dietitianNotes: string;
  } | null;
  loading: boolean;
  costInfo: {
    accumulatedCost: number;
    budgetLimit: number;
    limitReached: boolean;
  } | null;
  recipes: RecipeSummary[];
  onGenerateOutline: () => void;
  onApproveAndSolve: () => void;
  onCancel: () => void;
  onOutlineChange?: (newOutline: any) => void;
}

export default function OutlineApproval({
  user,
  outline,
  loading,
  costInfo,
  recipes,
  onGenerateOutline,
  onApproveAndSolve,
  onCancel,
  onOutlineChange
}: OutlineApprovalProps) {
  const [selectedSlot, setSelectedSlot] = useState<{ dayIndex: number; mealType: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleRecipeSelect = (recipe: RecipeSummary) => {
    if (!selectedSlot || !outline || !outline.days) return;
    
    // Clone outline
    const newOutline = {
      ...outline,
      days: outline.days.map((day, idx) => {
        if (idx === selectedSlot.dayIndex) {
          return {
            ...day,
            meals: {
              ...day.meals,
              [selectedSlot.mealType]: recipe.name
            }
          };
        }
        return day;
      })
    };

    if (onOutlineChange) {
      onOutlineChange(newOutline);
    }
    setSelectedSlot(null);
    setSearchQuery('');
  };

  
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#E6E2D3] p-8 text-center space-y-4 shadow-sm max-w-sm mx-auto">
        <div className="relative w-12 h-12 mx-auto">
          <div className="absolute inset-0 border-4 border-[#E6E2D3] rounded-full"></div>
          <div className="absolute inset-0 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="space-y-1">
          <p className="font-bold text-[#5A5A40] text-sm">Vázlatos heti terv összeállítása...</p>
          <p className="text-xs text-[#9A9483]">A dietetikus mesterséges intelligencia (Gemini) épp elemzi a recept-poolt és a makróidat.</p>
        </div>
      </div>
    );
  }

  // Budget Lockout Screen
  if (costInfo?.limitReached) {
    return (
      <div className="bg-[#D48166]/10 border border-[#D48166]/20 p-6 rounded-2xl text-center space-y-4 max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-[#D48166] mx-auto" />
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="font-bold text-[#D48166] text-base">Havi AI Költségplafon elérve!</h3>
          <p className="text-xs text-[#373A40] leading-relaxed">Az erőforrások megkímélése érdekében az étrend generátor leállt, mivel elérte a havi költségplafont.</p>
          <div className="bg-white p-3.5 rounded-xl border border-[#E6E2D3] mt-2 text-xs font-mono">
            <div>Aktuális havi rátád: <strong className="text-[#1A1C19]">${costInfo.accumulatedCost.toFixed(6)}</strong> / ${costInfo.budgetLimit.toFixed(2)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!outline) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-[#E6E2D3] text-center space-y-4 shadow-sm max-w-sm mx-auto">
        <Sparkles className="w-10 h-10 text-[#D48166] mx-auto animate-pulse" />
        <div className="space-y-1 max-w-sm mx-auto">
          <h3 className="font-bold text-[#1A1C19] text-sm">Hiányzik a jövő heti étrended?</h3>
          <p className="text-xs text-[#9A9483] leading-relaxed">Generálj egy kétlépcsős, makró-optimalizált új étrendet a receptekből a Gemini segítségével!</p>
        </div>
        <button
          onClick={onGenerateOutline}
          className="bg-[#5A5A40] hover:bg-[#4a4a34] text-white font-bold text-xs px-5 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm transition-all hover:scale-102 cursor-pointer"
        >
          <Brain className="w-4 h-4" /> Generálj jövő hetet (Vázlat)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dietitian Notes Header */}
      <div className="bg-[#5A5A40] text-white p-5 rounded-2xl space-y-2 relative overflow-hidden shadow-sm border border-[#E6E2D3]">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Sparkles className="w-24 h-24" />
        </div>
        <span className="text-[10px] uppercase font-bold tracking-widest text-[#F5F3ED] bg-white/10 px-2.5 py-0.5 rounded-full inline-block font-mono">
          Dietetikus Heti Terv Váz (approved flow)
        </span>
        <h3 className="text-lg font-extrabold tracking-tight">{user} jövő heti étrend koncepciója</h3>
        <p className="text-xs text-[#F5F3ED] max-w-2xl italic leading-relaxed">
          &ldquo;{outline.dietitianNotes}&rdquo;
        </p>

        {costInfo && (
          <div className="text-[10px] text-[#E6E2D3] font-mono pt-1">
            Generálási tranzakciós költség becslése: <strong className="text-white">${costInfo.accumulatedCost.toFixed(6)}</strong> / $10 limit
          </div>
        )}
      </div>

      {/* Days Outline Previews */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {outline.days.map((day, dayIndex) => (
          <div key={day.dayName} className="bg-white border border-[#E6E2D3] rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm">
            <div className="border-b border-[#E6E2D3] pb-2">
              <h4 className="font-extrabold text-[#1A1C19] text-sm">{day.dayName}</h4>
              <p className="text-[11px] text-[#D48166] font-bold">{day.description}</p>
            </div>

            <div className="space-y-1 text-xs text-[#373A40] flex-1">
                          {(['Reggeli', 'Pre-workout', 'Ebéd', 'Snack', 'Vacsora'] as const).map(mealType => (
                <div
                  key={mealType}
                  onClick={() => setSelectedSlot({ dayIndex, mealType })}
                  className={`flex items-start p-2 rounded-lg border transition-colors cursor-pointer border-transparent hover:border-[#E6E2D3] hover:bg-[#F5F3ED]/80`}
                  title="Kattints az étkezés cseréjéhez!"
                >
                  <span className="font-bold text-[#5A5A40] text-[10px] uppercase w-20 shrink-0 mt-0.5">{mealType}:</span>
                  <span className="text-[#1A1C19] font-medium leading-snug line-clamp-3">{day.meals[mealType]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation and solve action calls */}
      <div className="bg-[#F5F3ED] border border-[#E6E2D3] p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="text-xs text-[#373A40] font-medium">
          👉 <strong className="font-bold">Megfelel a vázlatos felépítés?</strong> Koppints a narancssárga gombra a vázlat feltöltéséhez konkrét, makró-optimalizált receptekkel a recept-poolból!
        </div>

        <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
          <button
            onClick={onGenerateOutline}
            className="px-4 py-2 border border-[#E6E2D3] text-[#5A5A40] rounded-xl text-xs bg-white font-bold flex items-center gap-1 hover:bg-[#F5F3ED] transition-all cursor-pointer"
          >
            <RefreshCcw className="w-3.5 h-3.5 animate-spin-hover" /> Új vázlat
          </button>
          <button
            onClick={onApproveAndSolve}
            className="px-5 py-2 bg-[#D48166] hover:bg-[#c37359] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md active:translate-y-0 hover:scale-102 transition-all cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" /> Váz elfogadása és számolás
          </button>
        </div>
      </div>
      
      {/* Recipe Selection Modal overlay */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex pt-[10vh] px-4 justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-[#E6E2D3] shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E6E2D3] bg-[#FDFBF7] flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-[#9A9483] tracking-widest uppercase">
                  {outline?.days[selectedSlot.dayIndex].dayName}
                </span>
                <h3 className="font-bold text-[#1A1C19] leading-tight">
                  <span className="text-[#D48166]">{selectedSlot.mealType}</span> cseréje
                </h3>
              </div>
              <button onClick={() => setSelectedSlot(null)} className="text-[#9A9483] hover:text-[#1A1C19] p-1 bg-white border border-[#E6E2D3] rounded-lg shadow-2xs">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 border-b border-[#E6E2D3] bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A9483]" />
                <input
                  type="text"
                  placeholder="Keresés a receptek között..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-[#E6E2D3] rounded-xl text-sm font-medium text-[#1A1C19] placeholder-[#9A9483] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20 focus:border-[#5A5A40]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#F5F3ED]/30">
              {recipes
                .filter(r => (r.mealType.includes(selectedSlot.mealType) || selectedSlot.mealType === 'Pre-workout'))
                .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(recipe => (
                  <div
                    key={recipe.id}
                    onClick={() => handleRecipeSelect(recipe)}
                    className="p-3 border border-[#E6E2D3] rounded-xl hover:border-[#5A5A40]/40 hover:bg-white cursor-pointer transition-all bg-[#FDFBF7]"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-[#1A1C19] text-sm leading-tight">{recipe.name}</h4>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-[#D48166]">{recipe.mealType}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-[#5A5A40] font-mono mt-2 bg-[#F5F3ED] py-1 px-2 rounded-lg w-max">
                      <span className="text-[#1A1C19] font-bold">{recipe.kcal} kcal</span>
                      <span>P: {recipe.protein}g</span>
                      <span>C: {recipe.carb}g</span>
                      <span>F: {recipe.fat}g</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
