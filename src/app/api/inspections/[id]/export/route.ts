import { NextResponse } from 'next/server';
import { generateInspectionExcel } from '@/lib/excel-generator';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const excelBuffer = await generateInspectionExcel(id);

    const headers = new Headers();
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    headers.set('Content-Disposition', `attachment; filename="Laporan_Inspeksi_Airside_${id.substring(0, 8)}.xlsx"`);

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: headers,
    });
  } catch (error: unknown) {
    console.error('Error exporting inspection to Excel:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to export Excel', details: errorMessage },
      { status: 500 }
    );
  }
}
