import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    if (!process.env.API_KEY) {
      throw new Error("Missing Gemini API Key.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [];

      // Filter to only include staff with valid photo data
      const validStaff = staffList.filter(s => s.avatarUrl && s.avatarUrl.includes('base64,'));

      if (validStaff.length === 0) {
        return {
          identified: false,
          confidence: 0,
          message: "No registered staff found with reference photos."
        };
      }

      // We limit to the most recent/relevant staff if the list is huge to prevent XHR/Payload errors
      const limitedStaff = validStaff.slice(0, 10);

      parts.push({ text: "REFERENCE DATABASE: I am providing images of registered staff members followed by their details." });

      limitedStaff.forEach((staff) => {
        const mimeType = staff.avatarUrl.split(';')[0].split(':')[1] || 'image/jpeg';
        const base64Data = staff.avatarUrl.split(',')[1];
        
        parts.push({
          inlineData: { mimeType, data: base64Data }
        });
        parts.push({ text: `STAFF PROFILE -> ID: ${staff.id}, Name: ${staff.name}` });
      });

      parts.push({
        text: `PROBE IMAGE: Identify if the person in the following image matches any of the profiles above. 
               Only identify if confidence is above 0.85. 
               Return JSON format: { "identified": boolean, "staffId": string, "staffName": string, "confidence": number, "message": string }`
      });

      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: probeImageBase64 }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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
      if (!text) throw new Error("AI returned an empty response.");
      return JSON.parse(text) as RecognitionResult;
    } catch (error: any) {
      console.error("Gemini Recognition Error:", error);
      // Handle specific Proxy/XHR errors gracefully
      if (error.message?.includes("500") || error.message?.includes("Rpc failed")) {
        throw new Error("The AI service is currently overwhelmed or the image is too large. Please try again.");
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
      console.error("TTS Generation Error:", error);
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
      return { success: false, message: "Invalid URL. Must be a Google Apps Script 'exec' URL." };
    }
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`, { 
        method: 'GET', mode: 'cors', cache: 'no-store'
      });
      return response.ok ? { success: true, message: "Connected successfully!" } : { success: false, message: `Status: ${response.status}` };
    } catch (err) {
      return { success: false, message: "Connection failed. Ensure CORS is enabled and access is set to 'Anyone'." };
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_record', data: record }),
      });
      return { success: true };
    } catch (error) {
      console.error("Sheets sync error:", error);
      throw error;
    }
  }

  async syncStaffToCloud(staff: StaffMember, webhookUrl: string | null) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_staff', data: staff }),
      });
      return { success: true };
    } catch (error) {
      console.error("Staff cloud sync error:", error);
      throw error;
    }
  }

  async fetchCloudData(webhookUrl: string) {
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com')) return null;
    try {
      const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`, {
        method: 'GET', mode: 'cors', cache: 'no-store'
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      // Fail silently for background fetches to prevent UI spam
      return null;
    }
  }
}

export const geminiService = new GeminiService();
