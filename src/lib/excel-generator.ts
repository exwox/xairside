import ExcelJS from 'exceljs';
import { prisma } from './db';
import path from 'path';
import fsSync from 'fs';

export async function generateInspectionExcel(inspectionId: string): Promise<Buffer> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      inspector: true,
      supervisor: true,
    },
  });

  if (!inspection) {
    throw new Error('Inspection not found');
  }

  const matrixResults = inspection.matrixResults ? JSON.parse(inspection.matrixResults) : {};

  const templatePath = path.join(process.cwd(), 'public', 'templates', 'runway.xlsx');
  const workbook = new ExcelJS.Workbook();

  if (fsSync.existsSync(templatePath)) {
    await workbook.xlsx.readFile(templatePath);
  } else {
    throw new Error('Template file not found: ' + templatePath);
  }

  workbook.creator = 'Airside Checklist System';
  workbook.lastModifiedBy = 'Airside Checklist System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // The sheet in the new template is named 'Runway'
  const worksheet = workbook.getWorksheet('Runway');
  if (!worksheet) {
    throw new Error('Runway worksheet not found in template');
  }
  // 1. Loop through all matrixResults keys (cell coordinates) and write values
  for (const [cellCoord, val] of Object.entries(matrixResults)) {
    if (cellCoord === 'shift') continue; // skip legacy shift metadata key if any
    
    // Validate cellCoord is a valid excel coordinate (e.g. A1, Z99)
    if (!/^[A-Z]{1,2}[0-9]+$/.test(cellCoord)) {
      continue;
    }

    const cell = worksheet.getCell(cellCoord);
    
    if (typeof cell.value === 'boolean') {
      cell.value = (val === 'true' || val === true);
    } else {
      if (val === 'true' || val === true) {
        cell.value = '✓';
      } else if (val === 'false' || val === false) {
        cell.value = '';
      } else {
        cell.value = val as any;
      }
    }
  }

  // 2. Write inspector name
  worksheet.getCell('Z50').value = inspection.inspector.name;

  // 3. Write supervisor details and signature
  if (inspection.supervisor) {
    worksheet.getCell('AA91').value = inspection.supervisor.name;
  }

  if (inspection.signature && inspection.status === 'APPROVED') {
    try {
      const base64Data = inspection.signature.replace(/^data:image\/\w+;base64,/, '');
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'png',
      });
      // Place signature in AA88 area (AA is index 26, row 88 is index 87)
      worksheet.addImage(imageId, {
        tl: { col: 26.2, row: 87.2 },
        ext: { width: 140, height: 50 },
      });
    } catch (err) {
      console.error('Failed to embed signature image in Excel:', err);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
