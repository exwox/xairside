import ExcelJS from 'exceljs';
import { prisma } from './db';

export async function generateInspectionExcel(inspectionId: string): Promise<Buffer> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: {
      inspector: true,
      supervisor: true,
      details: {
        include: {
          item: true,
        },
        orderBy: {
          item: {
            order: 'asc',
          },
        },
      },
    },
  });

  if (!inspection) {
    throw new Error('Inspection not found');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Airside Checklist System';
  workbook.lastModifiedBy = 'Airside Checklist System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Airside Inspection Report');

  // Page setup for printing
  worksheet.pageSetup = {
    orientation: 'portrait',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5, top: 0.5, bottom: 0.5,
      header: 0.3, footer: 0.3,
    },
  };

  // Set column widths
  worksheet.columns = [
    { key: 'no', width: 6 },
    { key: 'zone', width: 14 },
    { key: 'category', width: 22 },
    { key: 'itemName', width: 35 },
    { key: 'status', width: 12 },
    { key: 'remarks', width: 35 },
  ];

  // Header Title
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'LAPORAN CHECKLIST INSPEKSI AIRSIDE';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F4E79' }, // Dark Blue
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 40;

  worksheet.mergeCells('A2:F2');
  const subtitleCell = worksheet.getCell('A2');
  subtitleCell.value = 'RUNWAY, TAXIWAY & APRON INSPECTION';
  subtitleCell.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FFFFFF' } };
  subtitleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '2F5597' }, // Steel Blue
  };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 20;

  // Blank row
  worksheet.getRow(3).height = 10;

  // Metadata Card Info
  const formattedDate = new Date(inspection.date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Left metadata
  worksheet.getCell('A4').value = 'Tanggal Inspeksi';
  worksheet.getCell('B4').value = `: ${formattedDate}`;
  worksheet.getCell('A5').value = 'Petugas (Inspector)';
  worksheet.getCell('B5').value = `: ${inspection.inspector.name}`;
  
  // Right metadata
  worksheet.getCell('E4').value = 'Status Laporan';
  worksheet.getCell('F4').value = `: ${inspection.status}`;
  worksheet.getCell('E5').value = 'Penyelia (Supervisor)';
  worksheet.getCell('F5').value = `: ${inspection.supervisor?.name || '-'}`;

  // Style metadata labels
  ['A4', 'A5', 'E4', 'E5'].forEach((cellRef) => {
    const cell = worksheet.getCell(cellRef);
    cell.font = { name: 'Arial', size: 10, bold: true };
  });

  // Table Headers
  const headers = ['NO', 'ZONA', 'KATEGORI', 'ITEM PEMERIKSAAN', 'STATUS', 'CATATAN / REMARKS'];
  const headerRow = worksheet.getRow(7);
  headerRow.height = 28;

  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '418AB3' }, // Muted Blue
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' },
    };
  });

  // Fill checklist details
  let currentRowNum = 8;
  inspection.details.forEach((detail, index) => {
    const row = worksheet.getRow(currentRowNum);
    row.height = 22;

    const noCell = row.getCell(1);
    noCell.value = index + 1;
    noCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const zoneCell = row.getCell(2);
    zoneCell.value = detail.item.zone;
    zoneCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const catCell = row.getCell(3);
    catCell.value = detail.item.category;
    catCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const nameCell = row.getCell(4);
    nameCell.value = detail.item.name;
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };

    const statusCell = row.getCell(5);
    statusCell.value = detail.status;
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Format status background
    let statusColor = 'E2EFDA'; // Light Green for BAIK
    let statusTextColor = '375623';
    if (detail.status === 'RUSAK') {
      statusColor = 'FCE4D6'; // Light Red
      statusTextColor = 'C65911';
    } else if (detail.status === 'NA') {
      statusColor = 'FFF2CC'; // Light Yellow
      statusTextColor = '7F7F7F';
    }

    statusCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: statusColor },
    };
    statusCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: statusTextColor } };

    const remarksCell = row.getCell(6);
    remarksCell.value = detail.remarks || '-';
    remarksCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

    // Apply borders and fonts to all cells in the row
    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c);
      if (c !== 5) {
        cell.font = { name: 'Arial', size: 10 };
      }
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }

    currentRowNum++;
  });


  // Empty row before signature
  currentRowNum += 2;

  // Signature Block
  const sigRowStart = currentRowNum;
  worksheet.mergeCells(`A${sigRowStart}:B${sigRowStart}`);
  const inspectorLabel = worksheet.getCell(`A${sigRowStart}`);
  inspectorLabel.value = 'Dibuat Oleh (Petugas Lapangan):';
  inspectorLabel.font = { name: 'Arial', size: 10, bold: true };
  inspectorLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${sigRowStart}:F${sigRowStart}`);
  const supervisorLabel = worksheet.getCell(`E${sigRowStart}`);
  supervisorLabel.value = 'Disetujui Oleh (Penyelia):';
  supervisorLabel.font = { name: 'Arial', size: 10, bold: true };
  supervisorLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  // Leave rows for signature sign
  const sigRowName = sigRowStart + 4;
  
  worksheet.mergeCells(`A${sigRowName}:B${sigRowName}`);
  const inspectorNameCell = worksheet.getCell(`A${sigRowName}`);
  inspectorNameCell.value = inspection.inspector.name;
  inspectorNameCell.font = { name: 'Arial', size: 10, bold: true, underline: true };
  inspectorNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`E${sigRowName}:F${sigRowName}`);
  const supervisorNameCell = worksheet.getCell(`E${sigRowName}`);
  supervisorNameCell.value = inspection.supervisor?.name || '( Belum Disetujui )';
  supervisorNameCell.font = { name: 'Arial', size: 10, bold: true, underline: inspection.supervisor ? true : false };
  supervisorNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Handle embedded supervisor signature if available
  if (inspection.signature && inspection.status === 'APPROVED') {
    try {
      const base64Data = inspection.signature.replace(/^data:image\/\w+;base64,/, '');
      const imageId = workbook.addImage({
        base64: base64Data,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 4.2, row: sigRowStart + 0.8 }, // Positioning roughly in the E col
        ext: { width: 120, height: 60 },
      });
    } catch (err) {
      console.error('Failed to embed signature image in Excel:', err);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

