/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import WeeklyGrid from './components/WeeklyGrid';
import ShoppingList from './components/ShoppingList';
import AddMealOrIngredient from './components/AddMealOrIngredient';
import OutlineApproval from './components/OutlineApproval';
import RecipeDetailsModal from './components/RecipeDetailsModal';
import { MealPlanDay, RecipeSummary, RecipeIngredient, Ingredient, UserSettings, WeeklyPlan, RecipeDetails } from './types';
import { Sparkles, Calendar, ShoppingCart, PlusCircle, Settings, AlertCircle, HelpCircle, Check, Flame, RefreshCcw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping' | 'add' | 'settings'>('calendar');
  
  // Data State
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [recipeDetails, setRecipeDetails] = useState<RecipeDetails[]>([]);
  const [userSettings, setUserSettings] = useState<Record<string, UserSettings>>({});
  
  // Plans State (Hétfőtől Vasárnapig)
  const [davidPlan, setDavidPlan] = useState<MealPlanDay[]>([]);
  const [dorinaPlan, setDorinaPlan] = useState<MealPlanDay[]>([]);
  
  // App & Generation States
  const [activeUser, setActiveUser] = useState<string>('David');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Gemini Outline State
  const [aiOutline, setAiOutline] = useState<any>(null);
  const [generatingOutline, setGeneratingOutline] = useState<boolean>(false);
  const [showOutlineModal, setShowOutlineModal] = useState<boolean>(false);

  // Cost status
  const [costStatus, setCostStatus] = useState<{
    accumulatedCost: number;
    budgetLimit: number;
    limitReached: boolean;
  } | null>(null);

  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Load spreadsheet and initialized saved plans
  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch sheet data
      const dataRes = await fetch('/api/sheet-data');
      if (!dataRes.ok) {
        throw new Error('Nem sikerült betölteni az adatokat az Express szerverről.');
      }
      const data = await dataRes.json();
      setIngredients(data.ingredients);
      setRecipes(data.recipes);
      setRecipeIngredients(data.recipeIngredients || []);
      setRecipeDetails(data.recipeDetails || []);
      setUserSettings(data.settings);
      setIsDemoMode(!!data.isDemoMode);

      // 2. Fetch locally saved plans
      const plansRes = await fetch('/api/plans');
      const savedPlans = plansRes.ok ? await plansRes.json() : {};

      // Initialize empty plans if not found
      const defaultDays = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
      const initPlan = (user: string): MealPlanDay[] => {
        // 1. Try local storage first (persists across container restarts)
        try {
          const localStr = localStorage.getItem(`mealPlan_${user}`);
          if (localStr) {
            return JSON.parse(localStr);
          }
        } catch (e) {
          console.warn('Failed to parse localStorage plan', e);
        }

        // 2. Fall back to server saved plans
        if (savedPlans[user]?.days) {
          return savedPlans[user].days;
        }

        // 3. Fall back to empty default
        return defaultDays.map(dayName => ({
          dayName,
          meals: {
            'Reggeli': null,
            'Pre-workout': null,
            'Ebéd': null,
            'Snack': null,
            'Vacsora': null
          }
        }));
      };

      setDavidPlan(initPlan('David'));
      setDorinaPlan(initPlan('Dorina'));

      // Fetch cost info
      const costRes = await fetch('/api/cost');
      if (costRes.ok) {
        setCostStatus(await costRes.json());
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Hiba történt az adatok letöltésekor. Kérlek ellenőrizd az internet és a szerver állapotát.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Show a top success/error notification that fades out
  const triggerToast = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 5000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 7000);
    }
  };

  // Switch meal in active user's plan
  const handleMealChange = async (dayName: string, mealType: string, newRecipe: RecipeSummary | null) => {
    const isDavid = activeUser === 'David';
    const planToUpdate = isDavid ? [...davidPlan] : [...dorinaPlan];
    
    const updated = planToUpdate.map(day => {
      if (day.dayName === dayName) {
        return {
          ...day,
          meals: {
            ...day.meals,
            [mealType]: newRecipe
          }
        };
      }
      return day;
    });

    if (isDavid) {
      setDavidPlan(updated);
      try {
        localStorage.setItem('mealPlan_David', JSON.stringify(updated));
      } catch (e) {
        console.warn('localStorage not available', e);
      }
    } else {
      setDorinaPlan(updated);
      try {
        localStorage.setItem('mealPlan_Dorina', JSON.stringify(updated));
      } catch (e) {
        console.warn('localStorage not available', e);
      }
    }

    // Save back to local backend state
    try {
      await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: activeUser,
          plan: { user: activeUser, days: updated }
        })
      });
    } catch (e) {
      console.error('Failed to save plan to backend:', e);
    }
  };

  // Step 1 of Generator: Call Gemini API from Express to draft outline
  const handleGenerateOutline = async () => {
    setGeneratingOutline(true);
    setAiOutline(null);
    setShowOutlineModal(true);
    try {
      const activeSettings = userSettings[activeUser] || {
        user: activeUser,
        targetKcal: 2000,
        minProtein: 130,
        maxProtein: 180,
        note: ''
      };

      const res = await fetch('/api/generate-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: activeUser,
          settings: activeSettings,
          recipes: recipes
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Sikertelen outline generáció.');
      }

      const outcome = await res.json();
      setAiOutline(outcome);

      // Refresh cost status
      const costRes = await fetch('/api/cost');
      if (costRes.ok) {
        setCostStatus(await costRes.json());
      }
    } catch (e: any) {
      triggerToast('error', e.message || 'Nem sikerült legenerálni az étrend vázat.');
      setShowOutlineModal(false);
    } finally {
      setGeneratingOutline(false);
    }
  };

  // Step 2 of Generator: Approve and run Solver algorithm to assign precise, valid macros
  const handleApproveAndSolve = async () => {
    if (!aiOutline) return;
    setLoading(true);
    setShowOutlineModal(false);

    try {
      const activeSettings = userSettings[activeUser] || {
        user: activeUser,
        targetKcal: 2000,
        minProtein: 135,
        maxProtein: 185,
        note: ''
      };

      const res = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: activeUser,
          settings: activeSettings,
          recipes: recipes,
          ingredients: ingredients,
          recipeIngredients: recipeIngredients
        })
      });

      if (!res.ok) {
        throw new Error('Kiértékelési hiba történt az étrend számolása közben.');
      }

      const { plan, warning } = await res.json();

      if (activeUser === 'David') {
        setDavidPlan(plan.days);
        try {
          localStorage.setItem('mealPlan_David', JSON.stringify(plan.days));
        } catch (e) {
          console.warn('localStorage not available', e);
        }
      } else {
        setDorinaPlan(plan.days);
        try {
          localStorage.setItem('mealPlan_Dorina', JSON.stringify(plan.days));
        } catch (e) {
          console.warn('localStorage not available', e);
        }
      }

      // Save plan instantly to backend
      await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: activeUser,
          plan: { user: activeUser, days: plan.days }
        })
      });

      if (warning) {
        triggerToast('success', `${activeUser} étrendje sikeresen elkészült! Figyelmeztetés: ${warning}`);
      } else {
        triggerToast('success', `Gratulálunk! ${activeUser} heti étrendje a makró-célokhoz (±5% kalória, fehérje-sáv) tökéletesen illeszkedve elkészült!`);
      }
    } catch (e: any) {
      triggerToast('error', e.message || 'Hiba történt az étrend pontos számolása közben.');
    } finally {
      setLoading(false);
      setAiOutline(null);
    }
  };

  // Backend handler to create custom ingredients
  const handleAddNewIngredient = async (newIngData: any) => {
    try {
      const res = await fetch('/api/add-ingredient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIngData)
      });
      if (res.ok) {
        await loadData();
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  // Backend handler to create custom recipes
  const handleAddNewRecipe = async (newRecData: any) => {
    try {
      const res = await fetch('/api/add-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecData)
      });
      if (res.ok) {
        await loadData();
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans select-none pb-12 antialiased text-[#373A40]">
      {/* Top Banner toast messages */}
      {successMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#5A5A40] border border-[#E6E2D3] text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#D48166] border border-[#E6E2D3] text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-white shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main navigation header */}
      <header className="bg-[#FDFBF7] text-[#1A1C19] border-b border-[#E6E2D3] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#5A5A40] w-10 h-10 rounded-xl text-white font-bold flex items-center justify-center shadow-inner text-lg">
              🥦
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight block leading-tight text-[#1A1C19]">Heti Étrend-tervező</span>
              <span className="text-[10px] text-[#9A9483] font-mono font-medium tracking-wider uppercase">Háztartás okos makró-menedzsere</span>
            </div>
          </div>

          {/* Action Generator launch button */}
          <button
            onClick={handleGenerateOutline}
            className="bg-[#D48166] hover:bg-[#c37359] text-white font-extrabold text-xs px-5 py-2.5 rounded-full flex items-center gap-1.5 transition-all shadow-md shadow-[#D48166]/20 hover:scale-102 active:translate-y-px"
          >
            <Sparkles className="w-3.5 h-3.5 fill-white" /> Generálj jövő hetet
          </button>
        </div>
      </header>

      {isDemoMode && (
        <div className="bg-[#F5F3ED] border-b border-[#E6E2D3] py-2.5 px-4 text-center text-xs font-semibold text-[#5A5A40] flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#D48166] fill-[#D48166]/25 shrink-0" />
          <span>💡 Bemutató mód aktív: Google Táblázat bejelentkezés nélkül betöltve, offline adatokkal.</span>
        </div>
      )}

      {/* Navigation tab strip */}
      <div className="bg-white border-b border-[#E6E2D3] sticky top-16 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 sm:gap-2">
          <button
            onClick={() => { setActiveTab('calendar'); setShowOutlineModal(false); }}
            className={`py-3.5 px-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition-all outline-none ${
              activeTab === 'calendar'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#9A9483] hover:text-[#5A5A40]'
            }`}
          >
            <Calendar className="w-4 h-4" /> 📅 Heti Étrend
          </button>
          
          <button
            onClick={() => { setActiveTab('shopping'); setShowOutlineModal(false); }}
            className={`py-3.5 px-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition-all outline-none ${
              activeTab === 'shopping'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#9A9483] hover:text-[#5A5A40]'
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> 🛒 Bevásárlólista
          </button>

          <button
            onClick={() => { setActiveTab('add'); setShowOutlineModal(false); }}
            className={`py-3.5 px-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition-all outline-none ${
              activeTab === 'add'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#9A9483] hover:text-[#5A5A40]'
            }`}
          >
            <PlusCircle className="w-4 h-4" /> 🍳 Új Étel / Alapanyag
          </button>

          <button
            onClick={() => { setActiveTab('settings'); setShowOutlineModal(false); }}
            className={`py-3.5 px-3 border-b-2 font-bold text-xs flex items-center gap-1.5 transition-all outline-none ml-auto ${
              activeTab === 'settings'
                ? 'border-[#5A5A40] text-[#5A5A40]'
                : 'border-transparent text-[#9A9483] hover:text-[#5A5A40]'
            }`}
          >
            <Settings className="w-4 h-4" /> Beállítások
          </button>
        </div>
      </div>

      {/* Main container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 flex-1 w-full">
        {loading ? (
          <div className="bg-white rounded-2xl border border-[#E6E2D3] p-12 text-center space-y-4 shadow-sm max-w-sm mx-auto mt-12 animate-pulse">
            <div className="w-8 h-8 border-4 border-[#5A5A40] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="font-bold text-[#5A5A40] text-xs">Google Táblázat adatainak feldolgozása...</p>
          </div>
        ) : (
          <div>
            {/* Show Outline Modal layout if currently generating / or previewing outline */}
            {showOutlineModal && (
              <div className="mb-6">
                <OutlineApproval
                  user={activeUser}
                  outline={aiOutline}
                  loading={generatingOutline}
                  costInfo={costStatus}
                  recipes={recipes}
                  onGenerateOutline={handleGenerateOutline}
                  onApproveAndSolve={handleApproveAndSolve}
                  onCancel={() => setShowOutlineModal(false)}
                  onOutlineChange={setAiOutline}
                />
              </div>
            )}

            {!showOutlineModal && (
              <div>
                {activeTab === 'calendar' && (
                  <WeeklyGrid
                    user={activeUser}
                    onUserChange={setActiveUser}
                    plan={activeUser === 'David' ? davidPlan : dorinaPlan}
                    onMealChange={handleMealChange}
                    recipes={recipes}
                    recipeDetails={recipeDetails}
                    recipeIngredients={recipeIngredients}
                    allIngredients={ingredients}
                    settings={userSettings[activeUser] || {
                      user: activeUser,
                      targetKcal: 2000,
                      minProtein: 140,
                      maxProtein: 190,
                      note: ''
                    }}
                  />
                )}

                {activeTab === 'shopping' && (
                  <ShoppingList
                    davidPlan={davidPlan}
                    dorinaPlan={dorinaPlan}
                    ingredients={ingredients}
                    recipes={recipes}
                    recipeIngredients={recipeIngredients}
                  />
                )}

                {activeTab === 'add' && (
                  <AddMealOrIngredient
                    ingredients={ingredients}
                    onAddIngredient={handleAddNewIngredient}
                    onAddRecipe={handleAddNewRecipe}
                    onSuccess={(msg) => triggerToast('success', msg)}
                    onError={(msg) => triggerToast('error', msg)}
                  />
                )}

                {activeTab === 'settings' && (
                   <div className="bg-white rounded-2xl border border-[#E6E2D3] p-6 space-y-6 max-w-xl mx-auto shadow-sm">
                    <div className="border-b border-[#E6E2D3] pb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-[#1A1C19] text-base">Rendszer Beállítások</h3>
                        {isDemoMode ? (
                          <span className="bg-[#D48166]/15 text-[#D48166] text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase border border-[#D48166]/20">Bemutató</span>
                        ) : (
                          <span className="bg-emerald-500/15 text-emerald-700 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase border border-emerald-500/20">Google Táblázat Aktív</span>
                        )}
                      </div>
                      <button onClick={loadData} className="text-[#5A5A40] hover:text-[#1A1C19] p-1.5 rounded-lg border border-[#E6E2D3] hover:bg-[#F5F3ED] text-[10px] font-bold inline-flex items-center gap-1">
                        <RefreshCcw className="w-3 h-3" /> Újratöltés
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-[#F5F3ED] p-4 border border-[#E6E2D3] rounded-xl space-y-2">
                        <h4 className="text-xs font-bold text-[#5A5A40] tracking-wider uppercase mb-1">Adatbázis Forrás</h4>
                        <p className="text-xs text-[#373A40] text-justify leading-relaxed">
                          Ez az alkalmazás az adatokat a Google Táblázatodból és a helyi konténer-memóriából olvassa be. 
                        </p>
                        <div className="text-[10px] text-[#9A9483] font-mono mt-1 break-all">
                          Aktív Spreadsheet ID:{' '}
                          <a
                            href={`https://docs.google.com/spreadsheets/d/1fhU-3_IGvXO1ELh04KLNy1g_nVvM5Ww1EYU7s8YyOuo/edit`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#D48166] font-semibold underline"
                          >
                            1fhU-3_IGvXO1ELh04KLNy1g_nVvM5Ww1EYU7s8YyOuo
                          </a>
                        </div>
                      </div>

                      {/* ZIP Download Section */}
                      <div className="bg-[#5A5A40]/5 p-4 border border-dashed border-[#5A5A40]/30 rounded-xl space-y-2">
                        <h4 className="text-xs font-bold text-[#5A5A40] tracking-wider uppercase mb-1">
                          Kód és Projekt Letöltése (ZIP)
                        </h4>
                        <p className="text-xs text-[#373A40] text-justify leading-relaxed">
                          Ha a GitHub funkció vagy bejelentkezési sütik korlátozása miatt nem sikerül az exportálás, innen egyetlen gombnyomással letöltheted a teljes projektet ZIP fájlként. Mindent tartalmaz a futtatáshoz és szerkesztéshez!
                        </p>
                        <a
                          href="/api/download-zip"
                          download="diet-planner.zip"
                          className="mt-2 inline-flex items-center gap-2 bg-[#5A5A40] hover:bg-[#4d4d36] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                        >
                          📥 Projekt forráskód letöltése .zip-ként
                        </a>
                      </div>

                      {/* AI Budget budget warning status tracker */}
                      {costStatus && (
                        <div className="p-4 rounded-xl border border-dashed border-[#D48166]/40 bg-[#D48166]/5 space-y-2.5">
                          <h4 className="text-xs font-bold text-[#D48166] tracking-wider uppercase">Mesterséges Intelligencia Költségkeret</h4>
                          <p className="text-[11px] text-[#373A40] leading-relaxed">
                            A havi költségplafon segít kordában tartani a Gemini API hívásokat, hogy elkerüld a váratlan túlkiadásokat. A limit elérésekor a rendszer leállítja a generálást.
                          </p>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-[#373A40] font-mono">
                              <span>Felhasznált összeg:</span>
                              <strong className="font-bold text-[#1A1C19]">${costStatus.accumulatedCost.toFixed(6)}</strong>
                            </div>
                            <div className="flex justify-between text-xs text-[#373A40] font-mono">
                              <span>Havi költségplafon:</span>
                              <strong className="text-[#1A1C19]">${costStatus.budgetLimit.toFixed(2)}</strong>
                            </div>
                            <div className="w-full bg-[#E6E2D3] h-2.5 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full ${costStatus.limitReached ? 'bg-red-500 animate-pulse' : 'bg-[#D48166]'}`}
                                style={{ width: `${Math.min(100, (costStatus.accumulatedCost / costStatus.budgetLimit) * 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
