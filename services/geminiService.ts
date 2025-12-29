
import { GoogleGenAI, Type } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    try {
      const parts: any[] = [];

      staffList.forEach((staff) => {
        if (staff.avatarUrl.startsWith('data:image')) {
          const base64Data = staff.avatarUrl.split(',')[1];
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          });
          parts.push({ text: `This person is ${staff.name} (ID: ${staff.id}). Role: ${staff.role}.` });
        }
      });

      parts.push({
        text: `
          TASK: Identify the person in the FINAL image provided below.
          Use the preceding images as reference.
          If the person in the final image matches one of the reference images, identify them.
          
          Return a JSON object with:
          - identified: boolean
          - staffId: string (if identified)
          - staffName: string (if identified)
          - confidence: number (0 to 1)
          - message: a short explanation.
        `
      });

      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: probeImageBase64
        }
      });

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              identified: { type: Type.BOOLEAN },
              staffId: { type: Type.STRING },
              staffName: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              message: { type: Type.STRING }
            },
            required: ["identified", "confidence", "message"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      return result as RecognitionResult;
    } catch (error) {
      console.error("Gemini Recognition Error:", error);
      throw error;
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl) {
      console.warn("No Webhook URL provided. Skipping remote sync.");
      return { success: false, message: "No Webhook URL configured" };
    }

    try {
      // Use no-cors mode if the Apps Script isn't configured for CORS, 
      // but standard POST is better for receiving data.
      const response = await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // Standard for simple Google Apps Script deployments
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(record),
      });

      console.log("Sync request sent to:", webhookUrl);
      return { success: true };
    } catch (error) {
      console.error("Failed to sync to Google Sheets:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
