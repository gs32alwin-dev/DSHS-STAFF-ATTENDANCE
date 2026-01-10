
import { GoogleGenAI, Type } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  private avatarCache: Map<string, string> = new Map();

  /**
   * Resizes a base64 image to reduce payload size for faster API transmission.
   */
  private async resizeImage(base64Str: string, maxWidth: number = 512): Promise<string> {
    return new Promise((resolve) => {
      try {
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
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
          } else {
            resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
          }
        };
        img.onerror = () => resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
      } catch (e) {
        resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
      }
    });
  }

  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    if (!process.env.API_KEY) {
      throw new Error("API Key is missing.");
    }

    try {
      const probePromise = this.resizeImage(probeImageBase64, 512);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      // Limit reference database to top 15 most likely matches to keep prompt small and fast
      const validStaff = staffList
        .filter(s => s.avatarUrl && (s.avatarUrl.includes('base64,') || s.avatarUrl.startsWith('http')))
        .slice(0, 15); 

      if (validStaff.length === 0) {
        return { identified: false, confidence: 0, message: "Authorized database empty." };
      }

      parts.push({ text: "Biometric Protocol: Cross-reference PROBE_IMAGE against the provided REFERENCE_DATABASE. Identify the individual if confidence > 0.85. Be extremely precise." });

      const staffPartsPromises = validStaff.map(async (staff) => {
        let optimizedRef = this.avatarCache.get(staff.id);
        if (!optimizedRef) {
          optimizedRef = await this.resizeImage(staff.avatarUrl, 320);
          this.avatarCache.set(staff.id, optimizedRef);
        }
        return [
          { inlineData: { mimeType: 'image/jpeg', data: optimizedRef } },
          { text: `IDENTITY_RECORD: ID=${staff.id}, NAME=${staff.name}` }
        ];
      });

      const staffParts = (await Promise.all(staffPartsPromises)).flat();
      parts.push(...staffParts);

      const optimizedProbe = await probePromise;
      parts.push({
        text: `PROBE_IMAGE INCOMING. Run recognition protocol. 
               Output strictly JSON format.
               Structure: { "identified": boolean, "staffId": string, "staffName": string, "confidence": number, "message": string }`
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

      const text = response.text;
      if (!text) throw new Error("Null recognition buffer.");
      return JSON.parse(text) as RecognitionResult;
    } catch (error: any) {
      console.error("Gemini Biometrics Error:", error);
      throw new Error("Identification logic failed. Check lighting conditions.");
    }
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string }> {
    if (!url || !url.startsWith('https://script.google.com') || !url.includes('/exec')) {
      return { success: false, message: "Invalid Script Protocol." };
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`, { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) return { success: false, message: `Status ${response.status}` };
      const text = await response.text();
      return text.trim() === "OK" 
        ? { success: true, message: "Link Established." } 
        : { success: false, message: "Malformed Script Response." };
    } catch (err: any) {
      return { success: false, message: "Handshake Failed." };
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
    if (!webhookUrl || !webhookUrl.includes('/exec')) return null;
    try {
      const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`, {
        method: 'GET'
      });
      if (response.ok) {
        const data = await response.json();
        return {
          history: Array.isArray(data.history) ? data.history : [],
          staff: Array.isArray(data.staff) ? data.staff : []
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
