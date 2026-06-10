import React, { useState } from 'react';
import { RecipeSummary, RecipeDetails, RecipeIngredient, Ingredient } from '../types';
import { FileText, Clock, Users, PlayCircle, Info, RefreshCw, X } from 'lucide-react';

interface RecipeDetailsModalProps {
  recipeSummary: RecipeSummary;
  recipeDetails: RecipeDetails | null;
  recipeIngredients: RecipeIngredient[];
  allIngredients: Ingredient[];
  onClose: () => void;
  onChangeMeal: () => void;
}

export default function RecipeDetailsModal({
  recipeSummary,
  recipeDetails,
  recipeIngredients,
  allIngredients,
  onClose,
  onChangeMeal
}: RecipeDetailsModalProps) {
  const [multiplier, setMultiplier] = useState(1);

  const getIngredientDetails = (ingId: string) => {
    return allIngredients.find(i => i.id === ingId);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-2xl border border-[#E6E2D3] shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#E6E2D3] flex justify-between items-start bg-[#F5F3ED]">
          <div>
            <span className="text-[10px] font-bold text-[#5A5A40] tracking-widest uppercase bg-[#E6E2D3] px-2 py-0.5 rounded-full mb-2 inline-block">
              {recipeSummary.mealType}
            </span>
            <h2 className="font-bold text-[#1A1C19] text-xl leading-tight">
              {recipeSummary.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#9A9483] hover:text-[#1A1C19] p-1 bg-white border border-[#E6E2D3] rounded-lg shadow-2xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Macro Highlight Bar */}
        <div className="flex bg-[#5A5A40] text-white">
          <div className="flex-1 p-3 text-center border-r border-[#9A9483]/30">
            <span className="block text-[10px] uppercase font-bold text-[#D48166]">Kalória</span>
            <span className="font-mono text-lg font-bold">{recipeSummary.kcal * multiplier} kcal</span>
          </div>
          <div className="flex-1 p-3 text-center border-r border-[#9A9483]/30">
            <span className="block text-[10px] uppercase font-bold text-[#9A9483]">🔥 Fehérje</span>
            <span className="font-mono text-lg font-bold">{recipeSummary.protein * multiplier}g</span>
          </div>
          <div className="flex-1 p-3 text-center border-r border-[#9A9483]/30">
            <span className="block text-[10px] uppercase font-bold text-[#9A9483]">🌾 Szénhidrát</span>
            <span className="font-mono text-lg font-bold">{recipeSummary.carb * multiplier}g</span>
          </div>
          <div className="flex-1 p-3 text-center">
            <span className="block text-[10px] uppercase font-bold text-[#9A9483]">🥑 Zsír</span>
            <span className="font-mono text-lg font-bold">{recipeSummary.fat * multiplier}g</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#FDFBF7] space-y-6">
          
          {/* Prep Info & Multiplier */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#E6E2D3]">
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#373A40]">
                <Clock className="w-4 h-4 text-[#D48166]" />
                {recipeDetails?.prepTime || 'Nincs megadva'}
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#373A40]">
                <Users className="w-4 h-4 text-[#5A5A40]" />
                Alapdózis: {recipeDetails?.portions || 1} fő
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#9A9483] uppercase">Adag szorzó:</span>
              <div className="flex items-center bg-[#F5F3ED] border border-[#E6E2D3] rounded-lg p-0.5">
                {[1, 2, 3, 4].map(num => (
                  <button
                    key={num}
                    onClick={() => setMultiplier(num)}
                    className={`px-3 py-1 font-bold rounded-md text-xs transition-colors ${multiplier === num ? 'bg-white shadow text-[#1A1C19] border border-[#E6E2D3]' : 'text-[#5A5A40] hover:text-[#1A1C19]'}`}
                  >
                    {num}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Links and Notes */}
          {(recipeDetails?.videoLink || recipeDetails?.note) && (
            <div className="space-y-3">
              {recipeDetails.videoLink && (
                <a href={recipeDetails.videoLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 bg-blue-50/50 p-3 rounded-xl border border-blue-100 transition-colors inline-block w-full">
                  <PlayCircle className="w-5 h-5 shrink-0" /> Megnézem videón az elkészítést
                </a>
              )}
              {recipeDetails.note && (
                <div className="flex gap-2 text-sm text-[#5A5A40] bg-[#F5F3ED] p-3 rounded-xl border border-[#E6E2D3]">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-snug"><strong>Megjegyzés: </strong>{recipeDetails.note}</p>
                </div>
              )}
            </div>
          )}

          {/* Ingredients list */}
          <div>
            <h3 className="font-bold text-[#1A1C19] mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#5A5A40]" />
              Hozzávalók a főzéshez (Recept alapján)
            </h3>
            <ul className="space-y-2">
              {recipeIngredients.map((ri, idx) => {
                const ing = getIngredientDetails(ri.ingredientId);
                const val = ri.amountGram * multiplier;
                return (
                  <li key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl border border-[#E6E2D3] shadow-3xs">
                    <span className="font-bold text-[#1A1C19]">{ing?.name || 'Ismeretlen alapanyag'}</span>
                    <div className="flex flex-col text-right">
                      <span className="text-[#D48166] font-mono font-bold text-base bg-[#D48166]/10 px-2 rounded">{val} g</span>
                      {ing && (
                        <span className="text-[10px] text-[#9A9483] font-mono mt-1">
                          ~ {Math.round(ing.kcalPer100g * val / 100)} kcal
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              {recipeIngredients.length === 0 && (
                <p className="text-sm text-[#9A9483] italic">Ehhez a recepthez nincsenek részletes hozzávalók bekötve.</p>
              )}
            </ul>
          </div>

          {/* Steps */}
          {recipeDetails?.steps && (
            <div>
              <h3 className="font-bold text-[#1A1C19] mb-3">Elkészítés menete</h3>
              <div className="bg-white p-4 rounded-xl border border-[#E6E2D3] shadow-3xs">
                {recipeDetails.steps.split('\n').map((step, i) => (
                  <p key={i} className="text-sm text-[#373A40] leading-relaxed mb-2 last:mb-0">
                    {step}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E6E2D3] bg-[#F5F3ED] flex justify-between items-center">
          <button
            onClick={onChangeMeal}
            className="flex items-center gap-1.5 text-xs font-bold text-[#D48166] hover:bg-[#D48166]/10 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-[#D48166]/20"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Recept cseréje
          </button>
          
          <button
            onClick={onClose}
            className="text-sm font-semibold px-6 py-2 bg-[#5A5A40] text-white rounded-lg shadow hover:bg-[#1A1C19] transition-colors"
          >
            Kész, bezárás
          </button>
        </div>
      </div>
    </div>
  );
}
