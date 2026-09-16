import ExcelJS from 'exceljs';
import path from 'path';

async function main() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../public/templates/runway.xlsx');
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('Runway') || workbook.worksheets[0];
  if (!sheet) return;

  const row = sheet.getRow(60);
  console.log('\n--- Row 60 All Cells ---');
  for (let c = 1; c <= 30; c++) {
    const cell = row.getCell(c);
    if (cell.value !== null && cell.value !== undefined) {
      console.log(`Col ${c}: ${JSON.stringify(cell.value)} (master: ${cell.master.address})`);
    }
  }
}

main().catch(console.error);