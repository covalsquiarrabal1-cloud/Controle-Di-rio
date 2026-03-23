import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("NEXT_PUBLIC_GEMINI_API_KEY is not defined");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export interface ParsedExpense {
  description: string;
  amount: number;
  date: string; // ISO format YYYY-MM-DD
}

export async function parseExpenseFromVoice(text: string): Promise<ParsedExpense | null> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extraia as informações de despesa do seguinte texto: "${text}". 
      Retorne um JSON com os campos: description (string), amount (number), date (string no formato YYYY-MM-DD).
      Se a data não for mencionada, use a data de hoje: ${new Date().toISOString().split('T')[0]}.
      Se o valor não for claro, tente inferir ou retorne null se não for possível extrair nada útil.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            date: { type: Type.STRING },
          },
          required: ["description", "amount", "date"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    if (result.description && result.amount) {
      return result as ParsedExpense;
    }
    return null;
  } catch (error) {
    console.error("Error parsing expense:", error);
    return null;
  }
}
