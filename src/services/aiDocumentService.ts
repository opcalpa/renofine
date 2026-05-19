/**
 * AI Document Service
 * Handles extraction of rooms and tasks from uploaded documents using AI
 */

import { supabase } from '@/lib/supabaseClient';
import { AIDocumentExtractionResult } from './aiDocumentService.types';

const MAX_FILE_SIZE_MB = 10;
const SUPPORTED_TYPES = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

/**
 * Check if a file type is supported for AI document extraction
 */
export function isDocumentFile(fileName: string, mimeType: string): boolean {
  const extension = fileName.toLowerCase().split('.').pop();
  const supportedExtensions = ['pdf', 'txt', 'doc', 'docx'];

  return supportedExtensions.includes(extension || '') ||
         SUPPORTED_TYPES.some(type => mimeType.includes(type.split('/')[1]));
}

/**
 * Validate file before extraction
 */
function validateFile(fileName: string, mimeType: string, fileSize: number): void {
  if (!isDocumentFile(fileName, mimeType)) {
    throw new Error('Filtypen stöds ej. Använd PDF, DOC, DOCX eller TXT.');
  }

  const fileSizeMB = fileSize / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    throw new Error(`Filen är för stor (max ${MAX_FILE_SIZE_MB}MB). Nuvarande storlek: ${fileSizeMB.toFixed(1)}MB`);
  }
}

/**
 * Get public URL for a file in Supabase storage
 */
export function getFilePublicUrl(filePath: string): string {
  const { data } = supabase.storage
    .from('project-files')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/**
 * Extract rooms and tasks from a document using AI
 *
 * @param fileUrl - Public URL of the file in Supabase storage
 * @param fileType - MIME type of the file
 * @param fileName - Original file name
 * @param fileSize - File size in bytes
 * @returns Extracted rooms and tasks with confidence scores
 */
export async function extractFromDocument(
  fileUrl: string,
  fileType: string,
  fileName: string,
  fileSize: number = 0
): Promise<AIDocumentExtractionResult> {
  // Validate file
  validateFile(fileName, fileType, fileSize);

  // Call Supabase Edge Function. Unified extraction lives in
  // process-document-v2 (Anthropic, tool-use). mode:'scope' pins the
  // text/rooms-tasks path and keeps it off the receipt vision path.
  const { data, error } = await supabase.functions.invoke('process-document-v2', {
    body: {
      fileUrl,
      fileType,
      fileName,
      mode: 'scope',
    },
  });

  if (error) {
    console.error('Supabase Edge Function error:', error);
    throw new Error(`Dokumentanalys misslyckades: ${error.message}`);
  }

  // Validate response structure
  if (!data || typeof data !== 'object') {
    throw new Error('Ogiltigt svar från AI-tjänsten');
  }

  const result = data as AIDocumentExtractionResult;

  // Ensure arrays exist
  result.rooms = result.rooms || [];
  result.tasks = result.tasks || [];
  result.documentSummary = result.documentSummary || '';

  return result;
}

/**
 * Download file content as text (for TXT files)
 */
export async function downloadFileAsText(fileUrl: string): Promise<string> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error('Error downloading file:', error);
    throw new Error('Kunde inte ladda ner filen för analys');
  }
}
