import type { NextApiRequest, NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import { exportCache } from '@/lib/export-cache';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    // Get data from cache
    const cached = exportCache.get(token);
    
    if (!cached) {
      return res.status(404).json({ error: 'Export link expired or invalid' });
    }

    if (cached.expires < Date.now()) {
      exportCache.delete(token);
      return res.status(410).json({ error: 'Export link has expired' });
    }

    const matchData = cached.data;
    const { match, judges, contestants, scores } = matchData;
    const contestantNumbers = match.contestantNumbers || {};

    // Prepare data for Excel
    const data: any[][] = [];

    // Header row
    const headerRow = [
      "海选号",
      ...(Array.isArray(judges) ? judges : []),
      "总分",
    ];
    data.push(headerRow);

    // Helper function to get score
    const getScore = (contestant: string, judge: string): number | null => {
      const score = scores.find(
        (s: any) => s.contestant === contestant && s.judge === judge
      );
      return score?.value ?? null;
    };

    // Helper function to calculate total
    const calculateTotal = (contestant: string): number => {
      let sum = 0;
      let count = 0;
      judges.forEach((judge: string) => {
        const score = getScore(contestant, judge);
        if (score !== null && !isNaN(score) && isFinite(score)) {
          sum += score;
          count++;
        }
      });
      return count > 0 ? sum : 0;
    };

    // Sort contestants by number for consistent output
    const sortedContestants = [...contestants].sort((a, b) => {
      const aNum = contestantNumbers[a] || '';
      const bNum = contestantNumbers[b] || '';
      const aNumVal = parseInt(aNum, 10);
      const bNumVal = parseInt(bNum, 10);
      if (!isNaN(aNumVal) && !isNaN(bNumVal)) {
        return aNumVal - bNumVal;
      }
      return aNum.localeCompare(bNum);
    });

    // Data rows (no contestant name column, only number)
    sortedContestants.forEach((contestant) => {
      const safeContestant = String(contestant || "");
      const row = [
        contestantNumbers[safeContestant] || "",
      ];
      
      if (Array.isArray(judges)) {
        judges.forEach((judge: string) => {
          const score = getScore(safeContestant, judge);
          row.push(score !== null ? String(score) : "");
        });
      }
      
      row.push(calculateTotal(safeContestant).toFixed(2));
      data.push(row);
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "评分表");

    // Generate buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    const fileName = `比赛评分表_${match.name}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', excelBuffer.length);

    // Clean up cache after download
    exportCache.delete(token);

    // Send the file
    res.send(excelBuffer);
  } catch (error: any) {
    console.error('Error exporting Excel:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to export Excel' 
    });
  }
}

