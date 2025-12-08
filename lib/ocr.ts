import Tesseract from 'tesseract.js';

/**
 * Run OCR on an image file and return extracted text
 */
export async function runOCR(file: File): Promise<string> {
  try {
    const { data: { text } } = await Tesseract.recognize(file, 'chi_sim+eng', {
      logger: m => {
        // Optional: log progress
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    return text.trim();
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('OCR 识别失败，请重试或直接输入文字');
  }
}

