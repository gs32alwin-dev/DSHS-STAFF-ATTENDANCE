
import { GoogleGenAI, Type } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  private avatarCache: Map<string, string> = new Map();

  /**
   * Resizes a base64 image to reduce payload size for faster API transmission.
   */
  private async resizeImage(base64Str: string, maxWidth: number = 320): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      const src = base64Str.startsWith('data:') ? base64Str : `data:image/jpeg;base64,${base64Str}`;
      img.src = src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
        } else {
          resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
      };
    });
  }

  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    if (!process.env.API_KEY) {
      throw new Error("API Key is missing.");
    }

    try {
      const probePromise = this.resizeImage(probeImageBase64, 400);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      const validStaff = staffList
        .filter(s => s.avatarUrl && (s.avatarUrl.includes('base64,') || s.avatarUrl.startsWith('http')))
        .slice(0, 10); // Increased slightly for better coverage

      if (validStaff.length === 0) {
        return { identified: false, confidence: 0, message: "No registered staff found." };
      }

      parts.push({ text: "Task: Identify person in PROBE by matching against REFERENCE_DATABASE. High security biometric mode." });

      const staffPartsPromises = validStaff.map(async (staff) => {
        let optimizedRef = this.avatarCache.get(staff.id);
        if (!optimizedRef) {
          optimizedRef = await this.resizeImage(staff.avatarUrl, 256);
          this.avatarCache.set(staff.id, optimizedRef);
        }
        return [
          { inlineData: { mimeType: 'image/jpeg', data: optimizedRef } },
          { text: `REF_DATA: ID=${staff.id}, NAME=${staff.name}` }
        ];
      });

      const staffParts = (await Promise.all(staffPartsPromises)).flat();
      parts.push(...staffParts);

      const optimizedProbe = await probePromise;
      parts.push({
        text: `PROBE_IMAGE: Identify this person. Output strictly JSON.
               JSON Structure: { "identified": boolean, "staffId": string, "staffName": string, "confidence": number, "message": string }`
      });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedProbe } });

      const response = await ai.models.generateContent({
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

      return JSON.parse(response.text || '{}') as RecognitionResult;
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw new Error("Biometric scan failed. Please try again.");
    }
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string }> {
    if (!url || !url.startsWith('https://script.google.com')) {
      return { success: false, message: "Invalid Script URL." };
    }
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`, { 
        method: 'GET', mode: 'cors'
      });
      return response.ok ? { success: true, message: "Connected!" } : { success: false, message: "Server error." };
    } catch (err) {
      return { success: false, message: "Network error." };
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST', mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_record', data: record }),
      });
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  async syncStaffToCloud(staff: StaffMember, webhookUrl: string | null) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST', mode: 'no-cors', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_staff', data: staff }),
      });
      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }

  async fetchCloudData(webhookUrl: string) {
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com')) return null;
    try {
      const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`, {
        method: 'GET', mode: 'cors'
      });
      if (response.ok) return await response.json();
      return null;
    } catch (error) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
