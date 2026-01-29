
import { GoogleGenAI, Type } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  private avatarCache: Map<string, string> = new Map();

  /**
   * Resizes a base64 image to reduce payload size for faster API transmission.
   */
  private async resizeImage(base64Str: string, maxWidth: number = 768): Promise<string> {
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
            // Lower quality slightly for 100-staff capacity to stay within payload limits
            resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
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
      const probePromise = this.resizeImage(probeImageBase64, 768);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      // Increased capacity to 100 as requested
      const validStaff = staffList
        .filter(s => s.avatarUrl && (s.avatarUrl.includes('base64,') || s.avatarUrl.startsWith('http')))
        .slice(0, 100); 

      if (validStaff.length === 0) {
        return { identified: false, confidence: 0, message: "Authorized database empty." };
      }

      parts.push({ 
        text: `CRITICAL SECURITY PROTOCOL: Facial Identification System (Capacity: 100 Identities).
Compare the incoming PROBE_IMAGE against the LARGE REFERENCE_DATABASE below.

INSTRUCTIONS:
1. Examine facial geometry, distinctive features, and bone structure.
2. The database contains up to 100 profiles. Identify the best match.
3. Return identified:true only if confidence > 0.8.

REFERENCE DATABASE:`
      });

      const staffPartsPromises = validStaff.map(async (staff) => {
        let optimizedRef = this.avatarCache.get(staff.id);
        if (!optimizedRef) {
          // Keep reference images small (300px) to allow 100 profiles in one prompt payload
          optimizedRef = await this.resizeImage(staff.avatarUrl, 300);
          this.avatarCache.set(staff.id, optimizedRef);
        }
        return [
          { inlineData: { mimeType: 'image/jpeg', data: optimizedRef } },
          { text: `ID:${staff.id} NAME:${staff.name} ROLE:${staff.role}` }
        ];
      });

      const staffParts = (await Promise.all(staffPartsPromises)).flat();
      parts.push(...staffParts);

      const optimizedProbe = await probePromise;
      parts.push({
        text: `PROBE_IMAGE ATTACHED. Identify this user and provide the result in JSON format.`
      });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedProbe } });

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingBudget: 4000 },
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
      throw new Error("System processing error.");
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
