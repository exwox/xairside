import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

function colRefToIndex(colRef: string): number {
  let index = 0;
  for (let i = 0; i < colRef.length; i++) {
    index = index * 26 + colRef.charCodeAt(i) - 64;
  }
  return index;
}

function parseAddress(addr: string) {
  const match = addr.match(/^([A-Z]+)([0-9]+)$/);
  if (!match) return { row: 1, col: 1 };
  return {
    row: parseInt(match[2], 10),
    col: colRefToIndex(match[1]),
  };
}
async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../public/templates/runway.xlsx');
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('Runway') || workbook.worksheets[0];
  if (!sheet) {
    console.error('No sheet found');
    return;
  }

  const merges = sheet.model.merges || [];
  const mergeMap: Record<string, { rowSpan: number; colSpan: number; isMaster: boolean; masterAddress: string }> = {};

  for (const rangeStr of merges) {
    const parts = rangeStr.split(':');
    if (parts.length === 2) {
      const start = parseAddress(parts[0]);
      const end = parseAddress(parts[1]);
      const rowSpan = end.row - start.row + 1;
      const colSpan = end.col - start.col + 1;

      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          const colLetter = sheet.getRow(r).getCell(c).address.match(/^([A-Z]+)/)?.[1] || '';
          const cellAddr = `${colLetter}${r}`;
          const isMaster = r === start.row && c === start.col;
          mergeMap[cellAddr] = { rowSpan, colSpan, isMaster, masterAddress: parts[0] };
        }
      }
    }
  }

  const rowsData: any[] = [];
  const maxRow = 95;
  const maxCol = 30;

  for (let r = 1; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const rowCells: any[] = [];

    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      const addr = cell.address;
      const mergeInfo = mergeMap[addr];
      let rowSpan = 1;
      let colSpan = 1;
      let isMerged = false;
      let isMaster = true;

      if (mergeInfo) {
        rowSpan = mergeInfo.rowSpan;
        colSpan = mergeInfo.colSpan;
        isMerged = true;
        isMaster = mergeInfo.isMaster;
      }

      let value = cell.value;
      let formula = '';
      if (value && typeof value === 'object') {
        if ('formula' in value) {
          formula = value.formula || '';
          value = value.result !== undefined ? value.result : '';
        } else if ('richText' in value) {
          value = (value.richText as any).map((rt: any) => rt.text).join('');
        } else {
          value = JSON.stringify(value);
        }
      }

      if (value === null || value === undefined) {
        value = '';
      }

      const isBold = !!(cell.font && cell.font.bold);
      const isItalic = !!(cell.font && cell.font.italic);
      const fontSize = cell.font && cell.font.size ? cell.font.size : 10;
      const fontColor = cell.font && cell.font.color && typeof cell.font.color.argb === 'string' ? cell.font.color.argb : '';
      
      let bgColor = '';
      if (cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
        if (cell.fill.fgColor && typeof cell.fill.fgColor.argb === 'string') {
          bgColor = cell.fill.fgColor.argb;
        }
      }

      const alignH = cell.alignment && cell.alignment.horizontal ? cell.alignment.horizontal : 'left';
      const alignV = cell.alignment && cell.alignment.vertical ? cell.alignment.vertical : 'middle';

      let isEditable = false;
      let cellType = 'text';
      const strVal = String(value).trim();

      if (addr === 'F7' || addr === 'J7' || addr === 'F8' || addr === 'J8' || addr === 'F9' || addr === 'J9') {
        isEditable = true;
        if (addr === 'F8') cellType = 'date';
        else if (addr === 'F9' || addr === 'J9') cellType = 'time';
        else if (addr === 'J8') cellType = 'select';
        else cellType = 'text';
      }
      else if (typeof cell.value === 'boolean' || strVal === 'true' || strVal === 'false') {
        isEditable = true;
        cellType = 'checkbox';
      }
      else if (
        ((r >= 33 && r <= 44) && (c === 12 || c === 13 || c === 14)) ||
        ((r >= 47 && r <= 48) && (c === 12 || c === 13)) ||
        (r === 53 && (c === 18 || c === 19)) ||
        ((r >= 60 && r <= 62) && (c === 12 || c === 13 || c === 14)) ||
        ((r >= 63 && r <= 66) && (c === 12 || c === 13)) ||
        ((r >= 75 && r <= 77) && (c === 12 || c === 13 || c === 14)) ||
        ((r >= 78 && r <= 81) && (c === 12 || c === 13))
      ) {
        isEditable = true;
        cellType = 'checkbox';
      }
      else if (strVal.startsWith('<<') && strVal.endsWith('>>')) {
        isEditable = true;
        cellType = 'text';
      }
      else if (
        ((r === 34 || r === 35) && (c === 7 || c === 8 || c === 9)) ||
        ((r >= 33 && r <= 41) && (c === 15 || c === 16)) ||
        ((r >= 33 && r <= 45) && (c === 19 || c === 20)) ||
        ((r >= 33 && r <= 44) && (c === 22 || c === 24)) ||
        ((r >= 33 && r <= 44) && (c === 26 || c === 27 || c === 29 || c === 30)) ||
        ((r === 47 || r === 48) && (c === 10 || c === 14 || c === 15 || c === 16)) ||
        (r === 50 && (c === 16 || c === 18 || c === 19 || c === 20)) ||
        (r === 50 && (c === 21 || c === 22 || c === 23 || c === 24)) ||
        (r === 53 && (c === 3 || c === 4 || c === 5 || c === 7 || c === 8 || c === 9)) ||
        (r === 53 && (c === 10 || c === 12 || c === 14)) ||
        (r === 53 && c === 20) ||
        ((r === 60 || r === 61) && (c === 7 || c === 8 || c === 9)) ||
        ((r >= 60 && r <= 62) && (c === 15 || c === 16)) ||
        ((r >= 60 && r <= 66) && (c === 19 || c === 20)) ||
        ((r >= 60 && r <= 66) && c === 24) ||
        ((r === 67 || r === 68) && (c === 8 || c === 9 || c === 10 || c === 11)) ||
        ((r >= 64 && r <= 66) && (c === 10 || c === 14 || c === 15 || c === 16)) ||
        ((r === 75 || r === 76) && (c === 7 || c === 8 || c === 9)) ||
        ((r >= 75 && r <= 77) && (c === 15 || c === 16)) ||
        ((r >= 75 && r <= 81) && (c === 19 || c === 20)) ||
        ((r >= 75 && r <= 81) && c === 24) ||
        ((r === 82 || r === 83) && (c === 8 || c === 9 || c === 10 || c === 11)) ||
        ((r >= 79 && r <= 81) && (c === 10 || c === 14 || c === 15 || c === 16))
      ) {
        isEditable = true;
        cellType = 'text';
      }

      rowCells.push({
        address: addr,
        value,
        formula,
        rowSpan,
        colSpan,
        isMerged,
        isMaster,
        style: { isBold, isItalic, fontSize, fontColor, bgColor, alignH, alignV },
        isEditable,
        cellType
      });
    }
    rowsData.push(rowCells);
  }

  fs.mkdirSync(path.join(__dirname, '../public/templates'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, '../public/templates/runway_grid.json'),
    JSON.stringify(rowsData, null, 2)
  );

  console.log('Parsed runway.xlsx successfully');
}

main().catch(console.error);
