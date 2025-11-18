
import { GoogleGenAI, Type } from "@google/genai";
import { EXPENSE_CATEGORIES, Expense, Frequency } from "../types";

// Initialize Gemini Client
// Note: In a real production app, we would handle this more robustly, 
// but for this demo, we assume the env var is present as per instructions.
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const parseExpenseFromText = async (text: string): Promise<Partial<Expense & { frequency: Frequency }> | null> => {
  const ai = getAiClient();
  if (!ai) throw new Error("API Key not found");

  const prompt = `
    Extract expense details from the following text: "${text}".
    
    1. Map the category to one of these exact values: ${EXPENSE_CATEGORIES.join(', ')}. If unclear, use "Other".
    2. Return the date in YYYY-MM-DD format. If no date is mentioned, use today's date (${new Date().toISOString().split('T')[0]}).
    3. Check if the text implies a recurring payment (e.g., "monthly", "weekly", "subscription"). 
       Set frequency to one of: DAILY, WEEKLY, MONTHLY, YEARLY. If not recurring, use ONCE.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            category: { type: Type.STRING },
            description: { type: Type.STRING },
            date: { type: Type.STRING },
            frequency: { type: Type.STRING, enum: ["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] }
          },
          required: ["amount", "category", "description", "date", "frequency"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return null;
    
    const result = JSON.parse(jsonText);
    return {
        ...result,
        frequency: result.frequency as Frequency
    };
  } catch (error) {
    console.error("Gemini parsing error:", error);
    return null;
  }
};

export const predictCategory = async (description: string): Promise<string | null> => {
  const ai = getAiClient();
  if (!ai) return null;

  const prompt = `
    Classify the expense description "${description}" into the most appropriate category from the provided list.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: EXPENSE_CATEGORIES }
          }
        }
      }
    });
    
    const text = response.text;
    if (!text) return null;
    const json = JSON.parse(text);
    return json.category || null;
  } catch (error) {
    console.error("Gemini category prediction error:", error);
    return null;
  }
};

export const suggestDescription = async (category: string, amount: string, currencySymbol: string): Promise<string | null> => {
  const ai = getAiClient();
  if (!ai) return null;

  const prompt = `
    Generate a short, specific, and realistic description (max 5 words) for a personal expense based on these details:
    Category: ${category}
    Amount: ${amount} ${currencySymbol}
    
    Examples:
    Category: Food & Dining, Amount: 5 USD -> "Morning Coffee"
    Category: Travel, Amount: 500 USD -> "Flight to NYC"
    Category: Shopping, Amount: 50 USD -> "New Jeans"
    
    Return only the JSON object: { "description": "..." }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING }
          }
        }
      }
    });
    
    const text = response.text;
    if (!text) return null;
    const json = JSON.parse(text);
    return json.description || null;
  } catch (error) {
    console.error("Gemini description suggestion error:", error);
    return null;
  }
};

export const generateSpendingInsights = async (expenses: Expense[], currencyCode: string = 'USD'): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Please configure your API Key to get AI insights.";
  
  if (expenses.length === 0) return "No expenses recorded yet. Add some expenses to get insights!";

  // Summarize for context to save tokens
  const recentExpenses = expenses.slice(0, 50).map(e => `${e.date}: ${e.category} - ${e.amount} (${e.description})`).join('\n');
  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  const prompt = `
    Analyze the following recent expenses list for a user. 
    Total Spent so far: ${totalSpent} ${currencyCode}.
    The user's preferred currency is ${currencyCode}.
    
    Expenses Data:
    ${recentExpenses}

    Provide a concise, helpful, and friendly financial insight in 2-3 sentences. 
    Highlight largest spending categories or unusual trends if any. 
    Be encouraging about saving if possible.
    Format as plain text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Could not generate insights at this time.";
  } catch (error) {
    console.error("Gemini insight error:", error);
    return "Error generating insights. Please try again later.";
  }
};

export const generateFinancialReport = async (expenses: Expense[], currencyCode: string): Promise<string> => {
    const ai = getAiClient();
    if (!ai) return "Unable to access AI services.";

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    const threshold = sixMonthsAgo.toISOString().split('T')[0];

    // Filter and Aggregate Data
    // Structure: { "2023-10": { "Food": 500, "Travel": 200 }, ... }
    const aggregatedData: Record<string, Record<string, number>> = {};
    const totalsByCategory: Record<string, number> = {};

    expenses.forEach(e => {
        if (e.type === 'INCOME') return;
        if (e.date < threshold) return;

        const monthKey = e.date.substring(0, 7); // YYYY-MM
        
        if (!aggregatedData[monthKey]) aggregatedData[monthKey] = {};
        aggregatedData[monthKey][e.category] = (aggregatedData[monthKey][e.category] || 0) + e.amount;

        totalsByCategory[e.category] = (totalsByCategory[e.category] || 0) + e.amount;
    });

    if (Object.keys(aggregatedData).length === 0) {
        return "Not enough data from the last 6 months to generate a report.";
    }

    const prompt = `
        Act as a personal financial advisor.
        Analyze the user's spending data from the last 6 months.
        Currency: ${currencyCode}.

        aggregated_monthly_data: ${JSON.stringify(aggregatedData)}
        total_spending_by_category: ${JSON.stringify(totalsByCategory)}

        Please provide a structured analysis in Markdown format (do not use # h1, start with ## h2 or bold points):
        
        1. **Top Spending Categories**: Briefly breakdown where the most money goes.
        2. **Trend Analysis**: Identify specific trends (e.g., "Dining out increased by 20% in March compared to February").
        3. **Actionable Recommendations**: Provide exactly two specific, realistic tips to save money based on this data.

        Keep the tone professional yet conversational and encouraging.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text || "Analysis could not be generated.";
    } catch (error) {
        console.error("Report generation error:", error);
        return "Error generating financial report. Please try again.";
    }
};
