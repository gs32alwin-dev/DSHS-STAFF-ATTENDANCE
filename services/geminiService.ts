import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  /**
   * Resizes a base64 image to reduce payload size and prevent 500/Rpc errors.
   */
  private async resizeImage(base64Str: string, maxWidth: number = 400): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      // Ensure base64 string is correctly formatted for Image src
      const src = base64Str.startsWith('data:') ? base64Str : `data:image/jpeg;base64,${base64Str}`;
      img.src = src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Return only the base64 part
          resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        } else {
          resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
        }
      };
      img.onerror = () => {
        // Fallback to original if resize fails, but strip header
        resolve(base64Str.includes(',') ? base64Str.split(',')[1] : base64Str);
      };
    });
  }

  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    if (!process.env.API_KEY) {
      throw new Error("API Key is missing. Please ensure your environment is configured.");
    }

    try {
      // Step 1: Optimize the probe image
      const optimizedProbe = await this.resizeImage(probeImageBase64, 480);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      // Step 2: Prepare reference database (max 4 for stability and token limits)
      const validStaff = staffList
        .filter(s => s.avatarUrl && s.avatarUrl.includes('base64,'))
        .slice(0, 4);

      if (validStaff.length === 0) {
        return {
          identified: false,
          confidence: 0,
          message: "No staff registered with photos found in the database."
        };
      }

      // Vision tasks perform significantly more reliably with Flash models to avoid 500/Internal errors
      const modelName = 'gemini-3-flash-preview';

      parts.push({ text: "SYSTEM: Biometric Recognition Mode. Compare the reference photos below to the probe image to identify the staff member." });

      // Step 3: Add optimized reference images
      for (const staff of validStaff) {
        const optimizedRef = await this.resizeImage(staff.avatarUrl, 320);
        parts.push({
          inlineData: { mimeType: 'image/jpeg', data: optimizedRef }
        });
        parts.push({ text: `REFERENCE_DATABASE: StaffID=${staff.id}, StaffName=${staff.name}` });
      }

      parts.push({
        text: `PROBE: Identify the person in this image by comparing to the database above. 
               Only provide a match if you are extremely confident (>0.9).
               JSON OUTPUT FORMAT: { "identified": boolean, "staffId": string, "staffName": string, "confidence": number, "message": string }`
      });

      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: optimizedProbe }
      });

      const response = await ai.models.generateContent({
        model: modelName,
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
      if (!text) throw new Error("The AI service returned an empty result.");
      return JSON.parse(text) as RecognitionResult;
    } catch (error: any) {
      console.error("Gemini Error:", error);
      if (error.message?.includes("500") || error.message?.includes("Rpc failed") || error.message?.includes("Internal Error")) {
        throw new Error("Service busy or payload too large. Try capturing with better lighting or reducing the number of registered staff.");
      }
      throw error;
    }
  }

  async generateSpeech(text: string): Promise<Uint8Array | null> {
    if (!process.env.API_KEY) return null;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) return this.decodeBase64(base64Audio);
      return null;
    } catch (error) {
      return null;
    }
  }

  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  async testConnection(url: string): Promise<{ success: boolean; message: string }> {
    if (!url || !url.startsWith('https://script.google.com')) {
      return { success: false, message: "URL must be a valid Google Apps Script endpoint." };
    }
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`, { 
        method: 'GET', mode: 'cors', cache: 'no-store'
      });
      return response.ok ? { success: true, message: "Connection successful!" } : { success: false, message: `Server error: ${response.status}` };
    } catch (err) {
      return { success: false, message: "Network error. Please check your internet and Apps Script settings." };
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
      throw error;
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
      throw error;
    }
  }

  async fetchCloudData(webhookUrl: string) {
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com')) return null;
    try {
      const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`, {
        method: 'GET', mode: 'cors', cache: 'no-store'
      });
      if (response.ok) return await response.json();
      return null;
    } catch (error) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();