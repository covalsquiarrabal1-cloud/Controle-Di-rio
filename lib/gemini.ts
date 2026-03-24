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
  if (!text || text.trim().length === 0) {
    console.warn("Empty text provided to parseExpenseFromVoice");
    return null;
  }

  try {
    const ai = getAI();
    const today = new Date().toISOString().split('T')[0];
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `Analise este texto de voz e extraia os dados da despesa: "${text}"` }] }],
      config: {
        systemInstruction: `Você é um assistente financeiro especializado em extrair dados de despesas a partir de transcrições de voz em Português.
        Sua tarefa é extrair:
        1. Descrição (o que foi comprado ou pago)
        2. Valor (o custo numérico)
        3. Data (no formato YYYY-MM-DD)

        Regras:
        - Se a data não for mencionada (ex: "hoje", "ontem", "segunda"), use a data de referência fornecida: ${today}.
        - Se o texto disser "ontem", calcule a data correta baseada em ${today}.
        - O valor deve ser um número puro (ex: 45.50).
        - A descrição deve ser curta e clara.
        - Se não houver informações suficientes para extrair pelo menos a descrição e o valor, retorne um objeto com valores nulos ou vazios.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { 
              type: Type.STRING,
              description: "Breve descrição da despesa"
            },
            amount: { 
              type: Type.NUMBER,
              description: "Valor numérico da despesa"
            },
            date: { 
              type: Type.STRING,
              description: "Data no formato YYYY-MM-DD"
            },
          },
          required: ["description", "amount", "date"],
        },
      },
    });

    if (!response.text) {
      console.error("Gemini returned an empty response");
      return null;
    }

    const result = JSON.parse(response.text);
    console.log("Gemini parsed result:", result);

    if (result.description && typeof result.amount === 'number' && result.amount > 0) {
      return {
        description: String(result.description),
        amount: result.amount,
        date: result.date || today
      };
    }
    
    console.warn("Gemini result missing required fields or invalid amount:", result);
    return null;
  } catch (error) {
    console.error("Error parsing expense with Gemini:", error);
    return null;
  }
}
