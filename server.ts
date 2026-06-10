/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { GoogleGenAI, Type } from '@google/genai';
import { parseIngredientsSheet, parseRecipeSummaries, parseSettingsSheet, parseRecipeIngredients, parseRecipeDetails, parseCSV, parseNumber } from './src/utils';

const DEFAULT_RECIPE_DETAILS_CSV = `"Recept ID","Recept neve","Adag (fő)","Elkészítési idő","Elkészítés (lépések)","Videó-link","Megjegyzés"
"R1","Skyr-gyümi-fehérje","1","5 p","Összekeverjük a skyr-t, Obstpause-t, gyümölcsöt. Turmixba is mehet.","","Gyors reggeli"`;

import { solveWeeklyPlan, getAccumulatedCost, addCost } from './src/generator';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const SPREADSHEET_ID = '1fhU-3_IGvXO1ELh04KLNy1g_nVvM5Ww1EYU7s8YyOuo';

app.use(express.json());

// Initialize Gemini SDK with telemetry User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Local state for newly created recipes and ingredients in container
const isVercel = !!process.env.VERCEL;

const LOCAL_INGREDIENTS_FILE = isVercel 
  ? path.join('/tmp', 'local_ingredients.json')
  : path.join(process.cwd(), 'local_ingredients.json');
const LOCAL_RECIPES_FILE = isVercel 
  ? path.join('/tmp', 'local_recipes.json')
  : path.join(process.cwd(), 'local_recipes.json');
const LOCAL_PLANS_FILE = isVercel 
  ? path.join('/tmp', 'local_plans.json')
  : path.join(process.cwd(), 'local_plans.json');

function readLocalData<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading local data file:', file, e);
  }
  return fallback;
}

function writeLocalData<T>(file: string, data: T) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing local data file:', file, e);
  }
}

// Ensure local files exist
if (isVercel) {
  const srcIngredients = path.join(process.cwd(), 'local_ingredients.json');
  const srcRecipes = path.join(process.cwd(), 'local_recipes.json');
  const srcPlans = path.join(process.cwd(), 'local_plans.json');

  if (!fs.existsSync(LOCAL_INGREDIENTS_FILE) && fs.existsSync(srcIngredients)) {
    try { fs.copyFileSync(srcIngredients, LOCAL_INGREDIENTS_FILE); } catch (e) {
      console.error('Error copying ingredients to /tmp:', e);
    }
  }
  if (!fs.existsSync(LOCAL_RECIPES_FILE) && fs.existsSync(srcRecipes)) {
    try { fs.copyFileSync(srcRecipes, LOCAL_RECIPES_FILE); } catch (e) {
      console.error('Error copying recipes to /tmp:', e);
    }
  }
  if (!fs.existsSync(LOCAL_PLANS_FILE) && fs.existsSync(srcPlans)) {
    try { fs.copyFileSync(srcPlans, LOCAL_PLANS_FILE); } catch (e) {
      console.error('Error copying plans to /tmp:', e);
    }
  }
}

if (!fs.existsSync(LOCAL_INGREDIENTS_FILE)) writeLocalData(LOCAL_INGREDIENTS_FILE, []);
if (!fs.existsSync(LOCAL_RECIPES_FILE)) writeLocalData(LOCAL_RECIPES_FILE, []);
if (!fs.existsSync(LOCAL_PLANS_FILE)) writeLocalData(LOCAL_PLANS_FILE, {});

// Helper to fetch CSV from Public Google Sheets url
async function fetchSheetCSV(sheetName: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept': 'text/csv,text/plain,*/*'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet ${sheetName}: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (text.includes('<html')) {
    throw new Error(`Google Sheets returned HTML instead of CSV for ${sheetName}. It might be blocked or require login.`);
  }
  return text;
}

// API Routes

// Endpoint to bundle the user's workspace as a ZIP file on the fly and download it.
// This provides a robust alternative if Google Studio's built-in export or GitHub integrations fail.
app.get('/api/download-zip', (req, res) => {
  try {
    const zip = new AdmZip();
    const projectDir = process.cwd();
    
    const filesAndFolders = fs.readdirSync(projectDir);
    for (const item of filesAndFolders) {
      if (item === 'node_modules' || item === 'dist' || item === '.git' || item === '.cache') {
        continue;
      }
      const fullPath = path.join(projectDir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(fullPath, item);
      } else {
        zip.addLocalFile(fullPath);
      }
    }
    
    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=diet-planner-codebase.zip');
    res.send(zipBuffer);
  } catch (err: any) {
    console.error('ZIP generation error:', err);
    res.status(500).send('Hiba történt a ZIP összeállítása közben: ' + err.message);
  }
});

// Get accumulated AI cost & budget status
app.get('/api/cost', (req, res) => {
  const cost = getAccumulatedCost();
  res.json({
    accumulatedCost: cost,
    budgetLimit: 10.0, // $10 USD limit
    limitReached: cost >= 10.0
  });
});

const FALLBACK_RECIPE_INGREDIENTS = [
  // R1
  { recipeId: 'R1', recipeName: 'Skyr-gyümi-fehérje + Obstpause + protein kávé', mealType: 'Reggeli', tags: ['fix', 'magas fehérje'], ingredientId: 'ING01', amountGram: 250 },
  { recipeId: 'R1', recipeName: 'Skyr-gyümi-fehérje + Obstpause + protein kávé', mealType: 'Reggeli', tags: ['fix', 'magas fehérje'], ingredientId: 'ING14', amountGram: 100 },
  { recipeId: 'R1', recipeName: 'Skyr-gyümi-fehérje + Obstpause + protein kávé', mealType: 'Reggeli', tags: ['fix', 'magas fehérje'], ingredientId: 'ING02', amountGram: 30 },
  { recipeId: 'R1', recipeName: 'Skyr-gyümi-fehérje + Obstpause + protein kávé', mealType: 'Reggeli', tags: ['fix', 'magas fehérje'], ingredientId: 'ING15', amountGram: 100 },
  { recipeId: 'R1', recipeName: 'Skyr-gyümi-fehérje + Obstpause + protein kávé', mealType: 'Reggeli', tags: ['fix', 'magas fehérje'], ingredientId: 'ING33', amountGram: 20 },
  
  // R2
  { recipeId: 'R2', recipeName: 'Tojásrántotta + kovászos pirítós + protein kávé', mealType: 'Reggeli', tags: ['fix', 'tojásos'], ingredientId: 'ING08', amountGram: 120 },
  { recipeId: 'R2', recipeName: 'Tojásrántotta + kovászos pirítós + protein kávé', mealType: 'Reggeli', tags: ['fix', 'tojásos'], ingredientId: 'ING06', amountGram: 100 },
  { recipeId: 'R2', recipeName: 'Tojásrántotta + kovászos pirítós + protein kávé', mealType: 'Reggeli', tags: ['fix', 'tojásos'], ingredientId: 'ING33', amountGram: 20 },
  { recipeId: 'R2', recipeName: 'Tojásrántotta + kovászos pirítós + protein kávé', mealType: 'Reggeli', tags: ['fix', 'tojásos'], ingredientId: 'ING31', amountGram: 5 },

  // R3
  { recipeId: 'R3', recipeName: 'Kovászos + sonka + sajt + protein kávé', mealType: 'Reggeli', tags: ['fix'], ingredientId: 'ING06', amountGram: 100 },
  { recipeId: 'R3', recipeName: 'Kovászos + sonka + sajt + protein kávé', mealType: 'Reggeli', tags: ['fix'], ingredientId: 'ING09', amountGram: 80 },
  { recipeId: 'R3', recipeName: 'Kovászos + sonka + sajt + protein kávé', mealType: 'Reggeli', tags: ['fix'], ingredientId: 'ING10', amountGram: 30 },
  { recipeId: 'R3', recipeName: 'Kovászos + sonka + sajt + protein kávé', mealType: 'Reggeli', tags: ['fix'], ingredientId: 'ING33', amountGram: 20 },

  // R4
  { recipeId: 'R4', recipeName: 'Túrós-zabos tál + protein kávé', mealType: 'Reggeli', tags: ['magas fehérje'], ingredientId: 'ING11', amountGram: 150 },
  { recipeId: 'R4', recipeName: 'Túrós-zabos tál + protein kávé', mealType: 'Reggeli', tags: ['magas fehérje'], ingredientId: 'ING12', amountGram: 60 },
  { recipeId: 'R4', recipeName: 'Túrós-zabos tál + protein kávé', mealType: 'Reggeli', tags: ['magas fehérje'], ingredientId: 'ING13', amountGram: 120 },
  { recipeId: 'R4', recipeName: 'Túrós-zabos tál + protein kávé', mealType: 'Reggeli', tags: ['magas fehérje'], ingredientId: 'ING33', amountGram: 20 },

  // PW1
  { recipeId: 'PW1', recipeName: 'Pre-workout bogyós gyümölcs', mealType: 'Pre-workout', tags: ['carb', 'édes'], ingredientId: 'ING14', amountGram: 150 },
  { recipeId: 'PW1', recipeName: 'Pre-workout bogyós gyümölcs', mealType: 'Pre-workout', tags: ['carb', 'édes'], ingredientId: 'ING12', amountGram: 20 },

  // E1
  { recipeId: 'E1', recipeName: 'Sült lazac + rizs + brokkoli', mealType: 'Ebéd', tags: ['lazac'], ingredientId: 'ING03', amountGram: 150 },
  { recipeId: 'E1', recipeName: 'Sült lazac + rizs + brokkoli', mealType: 'Ebéd', tags: ['lazac'], ingredientId: 'ING16', amountGram: 80 },
  { recipeId: 'E1', recipeName: 'Sült lazac + rizs + brokkoli', mealType: 'Ebéd', tags: ['lazac'], ingredientId: 'ING19', amountGram: 150 },

  // E2
  { recipeId: 'E2', recipeName: 'Lazacos teljes kiőrlésű tészta skyr-szósszal', mealType: 'Ebéd', tags: ['lazac'], ingredientId: 'ING03', amountGram: 100 },
  { recipeId: 'E2', recipeName: 'Lazacos teljes kiőrlésű tészta skyr-szósszal', mealType: 'Ebéd', tags: ['lazac'], ingredientId: 'ING17', amountGram: 80 },
  { recipeId: 'E2', recipeName: 'Lazacos teljes kiőrlésű tészta skyr-szósszal', mealType: 'Ebéd', tags: ['lazac'], ingredientId: 'ING01', amountGram: 100 },

  // E3
  { recipeId: 'E3', recipeName: 'Csirkemell + édesburgonya + saláta', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING05', amountGram: 150 },
  { recipeId: 'E3', recipeName: 'Csirkemell + édesburgonya + saláta', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING18', amountGram: 200 },
  { recipeId: 'E3', recipeName: 'Csirkemell + édesburgonya + saláta', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING35', amountGram: 100 },

  // E4
  { recipeId: 'E4', recipeName: 'Csirkés rizstál wokzöldséggel', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING05', amountGram: 150 },
  { recipeId: 'E4', recipeName: 'Csirkés rizstál wokzöldséggel', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING16', amountGram: 80 },
  { recipeId: 'E4', recipeName: 'Csirkés rizstál wokzöldséggel', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING34', amountGram: 150 },

  // E5
  { recipeId: 'E5', recipeName: 'Csirkés tortilla wrap', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING05', amountGram: 120 },
  { recipeId: 'E5', recipeName: 'Csirkés tortilla wrap', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING20', amountGram: 60 },
  { recipeId: 'E5', recipeName: 'Csirkés tortilla wrap', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING35', amountGram: 80 },
  { recipeId: 'E5', recipeName: 'Csirkés tortilla wrap', mealType: 'Ebéd', tags: ['csirke'], ingredientId: 'ING21', amountGram: 50 },

  // E6
  { recipeId: 'E6', recipeName: 'Csicseriborsó-curry rizzsel', mealType: 'Ebéd', tags: ['húsmentes'], ingredientId: 'ING22', amountGram: 150 },
  { recipeId: 'E6', recipeName: 'Csicseriborsó-curry rizzsel', mealType: 'Ebéd', tags: ['húsmentes'], ingredientId: 'ING23', amountGram: 100 },
  { recipeId: 'E6', recipeName: 'Csicseriborsó-curry rizzsel', mealType: 'Ebéd', tags: ['húsmentes'], ingredientId: 'ING16', amountGram: 80 },

  // E7
  { recipeId: 'E7', recipeName: 'Ground turkey bowl', mealType: 'Ebéd', tags: ['darált pulyka'], ingredientId: 'ING04', amountGram: 150 },
  { recipeId: 'E7', recipeName: 'Ground turkey bowl', mealType: 'Ebéd', tags: ['darált pulyka'], ingredientId: 'ING16', amountGram: 80 },
  { recipeId: 'E7', recipeName: 'Ground turkey bowl', mealType: 'Ebéd', tags: ['darált pulyka'], ingredientId: 'ING25', amountGram: 50 },

  // S1
  { recipeId: 'S1', recipeName: 'Lidl edamame bab', mealType: 'Snack', tags: ['fix', 'preferált'], ingredientId: 'ING07', amountGram: 150 },

  // S2
  { recipeId: 'S2', recipeName: 'Skyr + dió', mealType: 'Snack', tags: ['magas fehérje'], ingredientId: 'ING01', amountGram: 200 },
  { recipeId: 'S2', recipeName: 'Skyr + dió', mealType: 'Snack', tags: ['magas fehérje'], ingredientId: 'ING26', amountGram: 15 },

  // S3
  { recipeId: 'S3', recipeName: 'Túró rudi / protein szelet', mealType: 'Snack', tags: ['édes', 'címke ellenőrzendő'], ingredientId: 'ING11', amountGram: 100 },
  { recipeId: 'S3', recipeName: 'Túró rudi / protein szelet', mealType: 'Snack', tags: ['édes', 'címke ellenőrzendő'], ingredientId: 'ING02', amountGram: 10 },

  // S4
  { recipeId: 'S4', recipeName: 'Pirítós + cottage cheese + paradicsom', mealType: 'Snack', tags: [], ingredientId: 'ING06', amountGram: 50 },
  { recipeId: 'S4', recipeName: 'Pirítós + cottage cheese + paradicsom', mealType: 'Snack', tags: [], ingredientId: 'ING27', amountGram: 100 },
  { recipeId: 'S4', recipeName: 'Pirítós + cottage cheese + paradicsom', mealType: 'Snack', tags: [], ingredientId: 'ING35', amountGram: 50 },

  // S5
  { recipeId: 'S5', recipeName: 'Sonkás-sajtos tortilla tekercs', mealType: 'Snack', tags: [], ingredientId: 'ING20', amountGram: 60 },
  { recipeId: 'S5', recipeName: 'Sonkás-sajtos tortilla tekercs', mealType: 'Snack', tags: [], ingredientId: 'ING09', amountGram: 40 },
  { recipeId: 'S5', recipeName: 'Sonkás-sajtos tortilla tekercs', mealType: 'Snack', tags: [], ingredientId: 'ING10', amountGram: 20 },

  // V1
  { recipeId: 'V1', recipeName: 'Skyr lángos', mealType: 'Vacsora', tags: ['fix'], ingredientId: 'ING01', amountGram: 150 },
  { recipeId: 'V1', recipeName: 'Skyr lángos', mealType: 'Vacsora', tags: ['fix'], ingredientId: 'ING29', amountGram: 100 },
  { recipeId: 'V1', recipeName: 'Skyr lángos', mealType: 'Vacsora', tags: ['fix'], ingredientId: 'ING31', amountGram: 5 },

  // V2
  { recipeId: 'V2', recipeName: 'Túrós-fehérjés palacsinta', mealType: 'Vacsora', tags: ['magas fehérje'], ingredientId: 'ING11', amountGram: 120 },
  { recipeId: 'V2', recipeName: 'Túrós-fehérjés palacsinta', mealType: 'Vacsora', tags: ['magas fehérje'], ingredientId: 'ING30', amountGram: 50 },
  { recipeId: 'V2', recipeName: 'Túrós-fehérjés palacsinta', mealType: 'Vacsora', tags: ['magas fehérje'], ingredientId: 'ING02', amountGram: 20 },
  { recipeId: 'V2', recipeName: 'Túrós-fehérjés palacsinta', mealType: 'Vacsora', tags: ['magas fehérje'], ingredientId: 'ING08', amountGram: 58 },

  // V4
  { recipeId: 'V4', recipeName: 'Rántotta + kovászos', mealType: 'Vacsora', tags: ['tojásos'], ingredientId: 'ING08', amountGram: 116 },
  { recipeId: 'V4', recipeName: 'Rántotta + kovászos', mealType: 'Vacsora', tags: ['tojásos'], ingredientId: 'ING06', amountGram: 50 },
  { recipeId: 'V4', recipeName: 'Rántotta + kovászos', mealType: 'Vacsora', tags: ['tojásos'], ingredientId: 'ING31', amountGram: 5 }
];

// Offline Mock CSV Datasets when live fetches fail
const DEFAULT_INGREDIENTS_CSV = `"ID","Megnevezés","Érték / 100g","Fehérje / 100g","Szénhidrát / 100g","Zsír / 100g","Kiszerelés","Nettó tömeg (g)","Üzlet","Forrás"
"ING01","Milbona Natúr Skyr",65,11,4,0.2,"250g pohár",250,"Lidl","Kézi"
"ING02","Myprotein Impact Whey (fehérjepor)",390,82,6,7,"2500g zacskó",2500,"Bármely","Kézi"
"ING03","Sült lazacfilé",200,22,0,13,"raw",100,"Spar","Kézi"
"ING04","Darált pulykamell 7%",140,20,0,7,"500g tálca",500,"Lidl","Kézi"
"ING05","Csirkemell filé",110,23,0,1.5,"1000g tálca",1000,"Lidl","Kézi"
"ING06","Kovászos kenyér",250,8,50,1.5,"500g cipó",500,"Aldi","Kézi"
"ING07","Edamame bab (Lidl zöldség)",130,11,8,5.5,"400g csomag",400,"Lidl","Kézi"
"ING08","Friss tojás M-es",140,12.5,0.7,10,"10 db-os",580,"Lidl","Kézi"
"ING09","Pikok Selyemsonka",95,19,1,1.5,"150g csomag",150,"Lidl","Kézi"
"ING10","Lidl Light Mozzarella",165,19,1.5,9,"125g tasak",125,"Lidl","Kézi"
"ING11","Zsírszegény tehéntúró",85,14,3.5,0.5,"250g doboz",250,"Aldi","Kézi"
"ING12","Milbona Zabpehely",370,13,60,7,"500g zacskó",500,"Lidl","Kézi"
"ING13","Bogyós gyümölcs keverék (fagyasztott)",50,1,10,0.5,"750g zacskó",750,"Lidl","Kézi"
"ING14","Milbona Obstpause almapüré",60,0.4,13,0.1,"100g tasak",100,"Lidl","Kézi"
"ING15","Bellarom Protein Kávé",50,5,6,1.5,"250g doboz",250,"Lidl","Kézi"
"ING16","Párolt brokkoli",35,3,4,0.4,"raw",100,"Bármely","Kézi"
"ING17","Konyhakész rizs (főtt)",130,2.5,28,0.3,"raw",100,"Bármely","Kézi"
"ING18","Édesburgonya",86,1.6,20,0.1,"raw",100,"Bármely","Kézi"
"ING19","Sült lazac (főtt)",200,22,0,13,"raw",100,"Spar","Kézi"
"ING20","Teljes kiőrlésű tortilla",300,9,48,7,"6 db-os",370,"Lidl","Kézi"
"ING21","Lidl görög joghurt 10%",120,4,3.5,10,"400g doboz",400,"Lidl","Kézi"
"ING22","Konzerv csicseriborsó",120,6,18,2,"400g konzerv",400,"Lidl","Kézi"
"ING23","Lidl kókusztej light",60,0.5,1.5,6,"400ml konzerv",400,"Lidl","Kézi"
"ING25","Sárgarépa",40,1,8,0.2,"raw",100,"Bármely","Kézi"
"ING26","Dióbél",650,15,14,60,"200g csomag",200,"Lidl","Kézi"
"ING27","Cottage cheese light",85,12,3,3,"200g doboz",200,"Lidl","Kézi"
"ING29","Teljes kiőrlésű liszt",340,13,65,2,"1000g csomag",1000,"Lidl","Kézi"
"ING30","Tehéntej 1.5%",45,3.2,4.7,1.5,"1000ml doboz",1000,"Lidl","Kézi"
"ING31","Extra szűz olívaolaj",820,0,0,91,"750ml üveg",750,"Lidl","Kézi"
"ING33","Nescafe Gold kávépor",10,0.5,1,0.1,"200g doboz",200,"Tesco","Kézi"
"ING34","Wok zöldségkeverék fagyasztott",45,1.8,7,0.5,"450g csomag",450,"Lidl","Kézi"
"ING35","Paradicsom / Jégsaláta",18,0.9,3.5,0.2,"raw",100,"Bármely","Kézi"`;

const DEFAULT_SETTINGS_CSV = `"Név","Napi Kcal cél","Min Fehérje (g)","Max Fehérje (g)","Megjegyzés"
"David",1950,135,175,"Dávid szálkásító étrendje"
"Dorina",1450,90,120,"Dorina szálkásító étrendje"`;

const DEFAULT_RECIPE_SUMMARIES_CSV = `"ID","Megnevezés","Étkezéstípus","Címkék","Kalória (kcal)","Fehérje (g)","Szénhidrát (g)","Zsír (g)"
"R1","Skyr-gyümi-fehérje + Obstpause + protein kávé","Reggeli","fix; magas fehérje",360,38,42,4
"R2","Tojásrántotta + kovászos pirítós + protein kávé","Reggeli","fix; tojásos",480,28,52,15
"R3","Kovászos + sonka + sajt + protein kávé","Reggeli","fix",400,28,56,8
"R4","Túrós-zabos tál + protein kávé","Reggeli","magas fehérje",450,35,62,5
"PW1","Pre-workout bogyós gyümölcs","Pre-workout","carb; édes",150,2,32,1
"E1","Sült lazac + rizs + brokkoli","Ebéd","lazac",520,38,55,18
"E2","Lazacos teljes kiőrlésű tészta skyr-szósszal","Ebéd","lazac",490,36,54,16
"E3","Csirkemell + édesburgonya + saláta","Ebéd","csirke",480,41,58,4
"E4","Csirkés rizstál wokzöldséggel","Ebéd","csirke",460,39,60,3
"E5","Csirkés tortilla wrap","Ebéd","csirke",510,40,64,8
"E6","Csicseriborsó-curry rizzsel","Ebéd","húsmentes",450,22,68,9
"E7","Ground turkey bowl","Ebéd","darált pulyka",480,36,58,10
"S1","Lidl edamame bab","Snack","fix; preferált",195,16,12,8
"S2","Skyr + dió","Snack","magas fehérje",230,24,11,10
"S3","Túró rudi / protein szelet","Snack","édes; címke ellenőrzendő",180,12,22,4
"S4","Pirítós + cottage cheese + paradicsom","Snack","",210,14,32,4
"S5","Sonkás-sajtos tortilla tekercs","Snack","",300,18,36,8
"V1","Skyr lángos","Vacsora","fix",450,32,68,5
"V2","Túrós-fehérjés palacsinta","Vacsora","magas fehérje",440,36,52,8
"V4","Rántotta + kovászos","Vacsora","tojásos",380,22,46,12`;

const DEFAULT_RECIPE_INGREDIENTS_CSV = `"Recept ID","Recept neve","Étkezéstípus","Címkék","Alapanyag ID","Alapanyag (info)","Mennyiség (g)"
"R1","Skyr-gyümi-fehérje + Obstpause + protein kávé","Reggeli","fix; magas fehérje","ING01","Info",250
"R1","Skyr-gyümi-fehérje + Obstpause + protein kávé","Reggeli","fix; magas fehérje","ING14","Info",100
"R1","Skyr-gyümi-fehérje + Obstpause + protein kávé","Reggeli","fix; magas fehérje","ING02","Info",30
"R1","Skyr-gyümi-fehérje + Obstpause + protein kávé","Reggeli","fix; magas fehérje","ING15","Info",100
"R1","Skyr-gyümi-fehérje + Obstpause + protein kávé","Reggeli","fix; magas fehérje","ING33","Info",20
"R2","Tojásrántotta + kovászos pirítós + protein kávé","Reggeli","fix; tojásos","ING08",120
"R2","Tojásrántotta + kovászos pirítós + protein kávé","Reggeli","fix; tojásos","ING06",100
"R2","Tojásrántotta + kovászos pirítós + protein kávé","Reggeli","fix; tojásos","ING33",20
"R2","Tojásrántotta + kovászos pirítós + protein kávé","Reggeli","fix; tojásos","ING31",5
"R3","Kovászos + sonka + sajt + protein kávé","Reggeli","fix","ING06",100
"R3","Kovászos + sonka + sajt + protein kávé","Reggeli","fix","ING09",40
"R3","Kovászos + sonka + sajt + protein kávé","Reggeli","fix","ING10",20
"R3","Kovászos + sonka + sajt + protein kávé","Reggeli","fix","ING33",20
"R4","Túrós-zabos tál + protein kávé","Reggeli","magas fehérje","ING11",150
"R4","Túrós-zabos tál + protein kávé","Reggeli","magas fehérje","ING12",60
"R4","Túrós-zabos tál + protein kávé","Reggeli","magas fehérje","ING13",120
"R4","Túrós-zabos tál + protein kávé","Reggeli","magas fehérje","ING33",20
"PW1","Pre-workout bogyós gyümölcs","Pre-workout","carb; édes","ING14",150
"PW1","Pre-workout bogyós gyümölcs","Pre-workout","carb; édes","ING12",20
"E1","Sült lazac + rizs + brokkoli","Ebéd","lazac","ING03",150
"E1","Sült lazac + rizs + brokkoli","Ebéd","lazac","ING16",80
"E1","Sült lazac + rizs + brokkoli","Ebéd","lazac","ING19",150
"E2","Lazacos teljes kiőrlésű tészta skyr-szósszal","Ebéd","lazac","ING03",100
"E2","Lazacos teljes kiőrlésű tészta skyr-szósszal","Ebéd","lazac","ING17",80
"E2","Lazacos teljes kiőrlésű tészta skyr-szósszal","Ebéd","lazac","ING01",100
"E3","Csirkemell + édesburgonya + saláta","Ebéd","csirke","ING05",150
"E3","Csirkemell + édesburgonya + saláta","Ebéd","csirke","ING18",200
"E3","Csirkemell + édesburgonya + saláta","Ebéd","csirke","ING35",100
"E4","Csirkés rizstál wokzöldséggel","Ebéd","csirke","ING05",150
"E4","Csirkés rizstál wokzöldséggel","Ebéd","csirke","ING16",80
"E4","Csirkés rizstál wokzöldséggel","Ebéd","csirke","ING34",150
"E5","Csirkés tortilla wrap","Ebéd","csirke","ING05",120
"E5","Csirkés tortilla wrap","Ebéd","csirke","ING20",60
"E5","Csirkés tortilla wrap","Ebéd","csirke","ING35",80
"E5","Csirkés tortilla wrap","Ebéd","csirke","ING21",50
"E6","Csicseriborsó-curry rizzsel","Ebéd","húsmentes","ING22",150
"E6","Csicseriborsó-curry rizzsel","Ebéd","húsmentes","ING23",100
"E6","Csicseriborsó-curry rizzsel","Ebéd","húsmentes","ING16",80
"E7","Ground turkey bowl","Ebéd","darált pulyka","ING04",150
"E7","Ground turkey bowl","Ebéd","darált pulyka","ING16",80
"E7","Ground turkey bowl","Ebéd","darált pulyka","ING25",50
"S1","Lidl edamame bab","Snack","fix; preferált","ING07",150
"S2","Skyr + dió","Snack","magas fehérje","ING01",200
"S2","Skyr + dió","Snack","magas fehérje","ING26",15
"S3","Túró rudi / protein szelet","Snack","édes; címke ellenőrzendő","ING11",100
"S3","Túró rudi / protein szelet","Snack","édes; címke ellenőrzendő","ING02",10
"S4","Pirítós + cottage cheese + paradicsom","Snack","","ING06",50
"S4","Pirítós + cottage cheese + paradicsom","Snack","","ING27",100
"S4","Pirítós + cottage cheese + paradicsom","Snack","","ING35",50
"S5","Sonkás-sajtos tortilla tekercs","Snack","","ING20",60
"S5","Sonkás-sajtos tortilla tekercs","Snack","","ING09",40
"S5","Sonkás-sajtos tortilla tekercs","Snack","","ING10",20
"V1","Skyr lángos","Vacsora","fix","ING01",150
"V1","Skyr lángos","Vacsora","fix","ING29",100
"V1","Skyr lángos","Vacsora","fix","ING31",5
"V2","Túrós-fehérjés palacsinta","Vacsora","magas fehérje","ING11",120
"V2","Túrós-fehérjés palacsinta","Vacsora","magas fehérje","ING30",50
"V2","Túrós-fehérjés palacsinta","Vacsora","magas fehérje","ING02",20
"V2","Túrós-fehérjés palacsinta","Vacsora","magas fehérje","ING08",58
"V4","Rántotta + kovászos","Vacsora","tojásos","ING08",116
"V4","Rántotta + kovászos","Vacsora","tojásos","ING06",50
"V4","Rántotta + kovászos","Vacsora","tojásos","ING31",5"`;

// Load all ingredients, recipes, and settings
app.get('/api/sheet-data', async (req, res) => {
  let isDemoMode = false;
  let ingredientsCSV = '';
  let settingsCSV = '';
  let recipesCSV = '';
  let sheetRecipeIngredients: any[] = [];
  let sheetRecipeDetails: any[] = [];

  try {
    // 1. Try to fetch from Google Sheet
    ingredientsCSV = await fetchSheetCSV('Alapanyagok');
    settingsCSV = await fetchSheetCSV('Beállítások');
    recipesCSV = await fetchSheetCSV('Recept összesítő');
  } catch (error: any) {
    console.warn('Failed to load live Google Sheets, falling back to built-in offline datasets:', error.message);
    isDemoMode = true;
    ingredientsCSV = DEFAULT_INGREDIENTS_CSV;
    settingsCSV = DEFAULT_SETTINGS_CSV;
    recipesCSV = DEFAULT_RECIPE_SUMMARIES_CSV;
  }
  
  try {
    const sheetIngredients = parseIngredientsSheet(ingredientsCSV);
    const sheetSettings = parseSettingsSheet(settingsCSV);
    const sheetRecipes = parseRecipeSummaries(recipesCSV);

    if (!isDemoMode) {
      try {
        const detailedRecipesCSV = await fetchSheetCSV('Receptek');
        sheetRecipeIngredients = parseRecipeIngredients(detailedRecipesCSV);
      } catch (e) {
        console.warn('Detailed Receptek sheet empty, using offline fallback schema.');
      }
      try {
        const detailsCSV = await fetchSheetCSV('Recept részletek');
        sheetRecipeDetails = parseRecipeDetails(detailsCSV);
      } catch (e) {
        console.warn('Recept részletek sheet empty, using offline fallback.');
      }
    }

    if (sheetRecipeIngredients.length === 0) {
      sheetRecipeIngredients = parseRecipeIngredients(DEFAULT_RECIPE_INGREDIENTS_CSV);
    }
    if (sheetRecipeDetails.length === 0) {
      sheetRecipeDetails = parseRecipeDetails(DEFAULT_RECIPE_DETAILS_CSV);
    }

    // 2. Read locally added ingredients & recipes
    const localIngredients = readLocalData(LOCAL_INGREDIENTS_FILE, []);
    const localRecipes = readLocalData(LOCAL_RECIPES_FILE, []);

    // Merge sheet and local data
    const allIngredients = [...sheetIngredients, ...localIngredients];
    const allRecipes = [...sheetRecipes, ...localRecipes];

    res.json({
      ingredients: allIngredients,
      settings: sheetSettings,
      recipes: allRecipes,
      recipeIngredients: sheetRecipeIngredients.length > 0 ? sheetRecipeIngredients : FALLBACK_RECIPE_INGREDIENTS,
      recipeDetails: sheetRecipeDetails,
      spreadsheetId: SPREADSHEET_ID,
      isDemoMode: isDemoMode
    });
  } catch (parseError: any) {
    console.error('Failed to parse spreadsheet content:', parseError);
    // If parsing failed, return built-in template as an absolute fallback
    const fallbackIngredients = parseIngredientsSheet(DEFAULT_INGREDIENTS_CSV);
    const fallbackSettings = parseSettingsSheet(DEFAULT_SETTINGS_CSV);
    const fallbackRecipes = parseRecipeSummaries(DEFAULT_RECIPE_SUMMARIES_CSV);
    const fallbackRecipeIngredients = parseRecipeIngredients(DEFAULT_RECIPE_INGREDIENTS_CSV);
    const fallbackRecipeDetails = parseRecipeDetails(DEFAULT_RECIPE_DETAILS_CSV);

    res.json({
      ingredients: fallbackIngredients,
      settings: fallbackSettings,
      recipes: fallbackRecipes,
      recipeIngredients: fallbackRecipeIngredients,
      recipeDetails: fallbackRecipeDetails,
      spreadsheetId: SPREADSHEET_ID,
      isDemoMode: true
    });
  }
});

// Add a new ingredient
app.post('/api/add-ingredient', (req, res) => {
  try {
    const { id, name, kcalPer100g, proteinPer100g, carbPer100g, fatPer100g, packaging, packagingGram, store, source } = req.body;
    
    if (!id || !name) {
      return res.status(400).json({ error: 'Hiányzó Azonosító vagy Alapanyag név.' });
    }

    const localIngredients = readLocalData(LOCAL_INGREDIENTS_FILE, []);
    const newIng = {
      id,
      name,
      kcalPer100g: Number(kcalPer100g) || 0,
      proteinPer100g: Number(proteinPer100g) || 0,
      carbPer100g: Number(carbPer100g) || 0,
      fatPer100g: Number(fatPer100g) || 0,
      packaging: packaging || '',
      packagingGram: packagingGram ? Number(packagingGram) : null,
      store: store || 'Bármely',
      source: source || 'Kézi hozzáadás'
    };

    localIngredients.push(newIng);
    writeLocalData(LOCAL_INGREDIENTS_FILE, localIngredients);

    res.json({ success: true, ingredient: newIng });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new recipe
app.post('/api/add-recipe', (req, res) => {
  try {
    const { id, name, mealType, tags, kcal, protein, carb, fat } = req.body;

    if (!id || !name || !mealType) {
      return res.status(400).json({ error: 'Hiányzó Recept ID, Név vagy Étkezéstípus.' });
    }

    const localRecipes = readLocalData(LOCAL_RECIPES_FILE, []);
    const newRec = {
      id,
      name,
      mealType,
      tags: Array.isArray(tags) ? tags : String(tags).split(';').map(t => t.trim()).filter(Boolean),
      kcal: Math.round(Number(kcal)) || 0,
      protein: Math.round(Number(protein)) || 0,
      carb: Math.round(Number(carb)) || 0,
      fat: Math.round(Number(fat)) || 0
    };

    localRecipes.push(newRec);
    writeLocalData(LOCAL_RECIPES_FILE, localRecipes);

    res.json({ success: true, recipe: newRec });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Load saved weekly plans
app.get('/api/plans', (req, res) => {
  const plans = readLocalData(LOCAL_PLANS_FILE, {});
  res.json(plans);
});

// Save a weekly plan
app.post('/api/plans', (req, res) => {
  try {
    const { user, plan } = req.body;
    if (!user || !plan) {
      return res.status(400).json({ error: 'Hiányzó felhasználó vagy terv.' });
    }
    const plans = readLocalData(LOCAL_PLANS_FILE, {});
    plans[user] = plan;
    writeLocalData(LOCAL_PLANS_FILE, plans);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Step 1: Generate high level weekly meal outline (Váz) via Gemini API
app.post('/api/generate-outline', async (req, res) => {
  const cost = getAccumulatedCost();
  if (cost >= 10.0) {
    return res.status(403).json({ error: 'A havi költségplafon_elérve (~$10)! A generátor ideiglenesen leállt.' });
  }

  try {
    const { user, settings, recipes } = req.body;

    const availableRecipesDesc = recipes.map((r: any) => 
      `- ${r.name} (${r.mealType}, kcal: ${r.kcal}, F: ${r.protein}g)`
    ).slice(0, 25).join('\n'); // Give a representative sampling to fit context nicely

    const prompt = `Te egy profi magyar dietetikus vagy. 
Készíts egy inspiráló, heti étrend vázat (Hétfőtől Vasárnapig) a felhasználónak.
Felhasználó: ${user}
Cél kalória: ${settings.targetKcal} kcal (±5%)
Fehérje igény: ${settings.minProtein}g - ${settings.maxProtein}g

A váz minden napra írja le röviden (étkezéstípusonként), milyen jellegű étel kerüljön tányérra.
Étkezéstípusok naponta: Reggeli, Pre-workout, Ebéd, Snack, Vacsora.
Reggelihez kötelezően tartozzon protein kávé. Snacknél részesítsd előnyben az edamame babot.
Csoportosítsd a napokat, és válaszolj az alább megadott JSON formátumban.

Íme egy mintatár a választható receptekből ötletadónak:
${availableRecipesDesc}

Fontos: CSAK a megadott JSON formátumot küldd vissza.`;

    // Measure request tokens (rough estimate for tracking)
    const estInputTokens = Math.round(prompt.length / 4);
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['days', 'dietitianNotes'],
          properties: {
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['dayName', 'description', 'meals'],
                properties: {
                  dayName: { type: Type.STRING },
                  description: { type: Type.STRING, description: 'Pl. Tojásos nap, magas fehérjés reggelivel' },
                  meals: {
                    type: Type.OBJECT,
                    required: ['Reggeli', 'Pre-workout', 'Ebéd', 'Snack', 'Vacsora'],
                    properties: {
                      'Reggeli': { type: Type.STRING, description: 'Pl. magas fehérjés zabtál vagy skyr' },
                      'Pre-workout': { type: Type.STRING },
                      'Ebéd': { type: Type.STRING },
                      'Snack': { type: Type.STRING },
                      'Vacsora': { type: Type.STRING }
                    }
                  }
                }
              }
            },
            dietitianNotes: { type: Type.STRING, description: 'Dietetikusi tanácsok vagy motiváló üzenet magyarul.' }
          }
        }
      }
    });

    const text = response.text || '';
    const estOutputTokens = Math.round(text.length / 4);
    
    // Estimate cost: Input $0.000075/1k, Output $0.0003/1k
    const runCost = (estInputTokens / 1000) * 0.000075 + (estOutputTokens / 1000) * 0.0003;
    addCost(runCost);

    const result = JSON.parse(text);
    res.json(result);
  } catch (error: any) {
    console.error('Gemini error generating outline:', error);
    res.status(500).json({ error: 'Hiba történt az étrend váz generálása közben: ' + error.message });
  }
});

// Step 2: Algorithmic Solver with Macro Constraints
app.post('/api/generate-plan', (req, res) => {
  try {
    const { user, settings, recipes, ingredients, recipeIngredients } = req.body;
    
    if (!user || !settings || !recipes) {
      return res.status(400).json({ error: 'Hiányzó paraméterek a heti étrend kiszámolásához.' });
    }

    const solved = solveWeeklyPlan(recipes, recipeIngredients || [], ingredients || [], settings, user);
    res.json(solved);
  } catch (error: any) {
    res.status(500).json({ error: 'Nem sikerült kiszámolni az étrendet: ' + error.message });
  }
});

// Serve frontend react files
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !isVercel) {
    const viteModuleName = 'vite';
    const { createServer: createViteServer } = await import(viteModuleName);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;

if (!isVercel) {
  startServer();
}
