
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RecognitionResult, StaffMember, AttendanceRecord } from "../types";

export class GeminiService {
  /**
   * Identifies a staff member from a probe image by comparing it against registered staff.
   * Uses gemini-3-pro-preview for complex reasoning across multiple images.
   */
  async identifyStaff(probeImageBase64: string, staffList: StaffMember[]): Promise<RecognitionResult> {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const parts: any[] = [];

      // Add reference images with their specific MIME types
      staffList.forEach((staff) => {
        if (staff.avatarUrl && staff.avatarUrl.includes('base64,')) {
          const mimeType = staff.avatarUrl.split(';')[0].split(':')[1] || 'image/jpeg';
          const base64Data = staff.avatarUrl.split(',')[1];
          
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          });
          parts.push({ text: `Name: ${staff.name}, ID: ${staff.id}, Role: ${staff.role}` });
        }
      });

      // Task instructions
      parts.push({
        text: `
          TASK: Compare the last image provided (the "probe") against the reference staff images provided above.
          Identify which staff member is in the probe image.
          
          CRITERIA:
          1. Only mark "identified": true if the confidence score is above 0.85.
          2. Consider facial structure, hair, and distinctive features.
          3. If the person is not in the reference list, mark "identified": false.

          Return exactly this JSON structure:
          {
            "identified": boolean,
            "staffId": "string or null",
            "staffName": "string or null",
            "confidence": number,
            "message": "string"
          }
        `
      });

      // The live probe image
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: probeImageBase64
        }
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
              staffId: { type: Type.STRING, nullable: true },
              staffName: { type: Type.STRING, nullable: true },
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
      console.error("Gemini Identification Error:", error);
      // Surface the error details for debugging
      throw new Error(error.message || "Internal AI Error during identification");
    }
  }

  /**
   * Generates spoken greeting using Gemini TTS
   */
  async generateSpeech(text: string): Promise<Uint8Array | null> {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
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
      if (base64Audio) {
        return this.decodeBase64(base64Audio);
      }
      return null;
    } catch (error) {
      console.error("TTS Error:", error);
      return null;
    }
  }

  private decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000,
    numChannels: number = 1,
  ): Promise<AudioBuffer> {
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
    if (!url) return { success: false, message: "URL is empty" };
    try {
      const testUrl = `${url}${url.includes('?') ? '&' : '?'}action=test&t=${Date.now()}`;
      const response = await fetch(testUrl, { 
        method: 'GET', 
        mode: 'cors',
        cache: 'no-store',
        redirect: 'follow'
      });
      if (response.ok) return { success: true, message: "Connected!" };
      return { success: false, message: `HTTP ${response.status}` };
    } catch (err) {
      return { success: false, message: "Network Error. Check Apps Script permissions." };
    }
  }

  async syncToGoogleSheets(record: AttendanceRecord, webhookUrl: string | null) {
    if (!webhookUrl) return { success: false };
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_record', data: record }),
      });
      return { success: true };
    } catch (error) {
      console.error("Sync Error:", error);
      throw error;
    }
  }

  async fetchCloudData(webhookUrl: string) {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return null;
    try {
      const fetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=get_data&t=${Date.now()}`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  async syncStaffToCloud(staff: StaffMember, webhookUrl: string) {
    if (!webhookUrl) return;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_staff', data: staff }),
      });
    } catch (error) {
      console.error("Staff Cloud Sync Error:", error);
    }
  }
}

export const geminiService = new GeminiService();
