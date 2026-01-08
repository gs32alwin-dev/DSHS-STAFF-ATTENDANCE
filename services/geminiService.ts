
import { GoogleGenAI, Type } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  private avatarCache: Map<string, string> = new Map();

  /**
   * Resizes a base64 image to reduce payload size for faster API transmission.
   */
  private async resizeImage(base64Str: string, maxWidth: number = 320): Promise<string> {
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
            ctx.imageSmoothingQuality = 'medium';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
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
      const probePromise = this.resizeImage(probeImageBase64, 400);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      const validStaff = staffList
        .filter(s => s.avatarUrl && (s.avatarUrl.includes('base64,') || s.avatarUrl.startsWith('http')))
        .slice(0, 10); 

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

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text) as RecognitionResult;
    } catch (error: any) {
      console.error("Gemini Error:", error);
      throw new Error("Biometric scan failed. Check lighting and try again.");
    }
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string }> {
    if (!url || !url.startsWith('https://script.google.com') || !url.includes('/exec')) {
      return { success: false, message: "Invalid Script URL. Ensure it ends with /exec." };
    }
    if (url.includes('docs.google.com/forms')) {
      return { success: false, message: "This is a Google Form URL. You must use the Apps Script 'Web App' URL." };
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`, { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) return { success: false, message: `Server error ${response.status}` };
      const text = await response.text();
      return text.trim() === "OK" 
        ? { success: true, message: "Connected successfully!" } 
        : { success: false, message: "Invalid script response. Check Deployment settings." };
    } catch (err: any) {
      if (err.name === 'AbortError') return { success: false, message: "Connection timeout." };
      return { success: false, message: "Connection failed. Check your internet." };
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl || !webhookUrl.startsWith('http') || !webhookUrl.includes('/exec')) return { success: false };
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
    if (!webhookUrl || !webhookUrl.startsWith('http') || !webhookUrl.includes('/exec')) return { success: false };
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
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com') || !webhookUrl.includes('/exec')) return null;
    
    try {
      const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`, {
        method: 'GET'
      });
      
      const contentType = response.headers.get('content-type');
      // Google Scripts always return application/json if ContentService is used correctly.
      // If it's HTML, it's definitely an error page or a Form.
      if (!contentType || !contentType.includes('application/json')) {
        return null;
      }

      if (response.ok) {
        const text = await response.text();
        if (!text || text.length < 2) return null;
        
        try {
          const data = JSON.parse(text);
          if (data && typeof data === 'object') {
            return {
              history: Array.isArray(data.history) ? data.history : [],
              staff: Array.isArray(data.staff) ? data.staff : []
            };
          }
        } catch (e) {
          console.error("JSON Parse Error in Cloud Data", e);
          return null;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
